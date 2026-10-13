// ============================================================
// core/ui.js —— 公共 UI 设施
//
// 收纳「与业务无关、多个板块都用得上」的界面组件。
//
// 目前：
//   · sectionCollapse() —— 区块折叠（点标题展开/收起 + 提示文字切换）
//   · bindToggle()      —— 通用「展开/收起」按钮绑定
//
// ⚠️ 不收的：
//   · applyFilter（搜索）—— 依赖各板块实例，属应用层
//   · modalState（弹窗状态快照）—— 依赖各板块 DOM 结构，属应用层
//
// 依赖：core/dom.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[ui] 缺少 core/dom.js'); return; }

  /**
   * 区块折叠控制器
   * @param {Object} opts
   *   @param {string|Node} opts.title      标题元素（或 id）—— 点击它折叠/展开
   *   @param {string|Node} opts.container  内容容器（或 id）—— 切换 .collapsed
   *   @param {string|Node} [opts.hint]     提示文字元素（或 id）
   *   @param {boolean}     [opts.collapsed] 初始是否折叠
   *   @param {string}      [opts.expandText]  折叠时的提示文字
   *   @param {string}      [opts.collapseText]展开时的提示文字
   * @returns {Object|null} { state, apply, toggle }
   */
  function sectionCollapse(opts) {
    opts = opts || {};
    var titleEl = resolve(opts.title);
    var contEl = resolve(opts.container);
    var hintEl = resolve(opts.hint);
    if (!titleEl || !contEl) {
      console.warn('[ui] sectionCollapse: 缺少 title 或 container');
      return null;
    }

    var state = { collapsed: !!opts.collapsed };
    var expandText = opts.expandText || '';
    var collapseText = opts.collapseText || '';

    function apply() {
      contEl.classList.toggle('collapsed', state.collapsed);
      if (hintEl && (expandText || collapseText)) {
        hintEl.textContent = state.collapsed ? expandText : collapseText;
      }
    }
    function toggle(force) {
      state.collapsed = (force === undefined) ? !state.collapsed : !!force;
      apply();
    }

    titleEl.addEventListener('click', function () { toggle(); });
    apply();

    return { state: state, apply: apply, toggle: toggle };
  }

  /**
   * 通用「展开/收起」绑定（标题 + 列表 + 箭头）
   * @param {Object} opts
   *   @param {string|Node} opts.head      点击的标题元素
   *   @param {string|Node} opts.list      列表容器（切换 .collapsed）
   *   @param {string}      [opts.arrowSel] 箭头选择器（默认 .arrow）
   *   @param {boolean}     [opts.collapsed] 初始折叠
   *   @param {string}      [opts.openChar='▲'] 展开时箭头
   *   @param {string}      [opts.closeChar='▼'] 折叠时箭头
   * @returns {Object} { toggle, isOpen }
   */
  function bindToggle(opts) {
    opts = opts || {};
    var head = resolve(opts.head);
    var list = resolve(opts.list);
    if (!head || !list) return { toggle: function () {}, isOpen: function () { return false; } };

    var arrowSel = opts.arrowSel || '.arrow';
    var openChar = opts.openChar || '▲';
    var closeChar = opts.closeChar || '▼';

    function syncArrow() {
      var a = head.querySelector(arrowSel);
      if (a) a.textContent = list.classList.contains('collapsed') ? closeChar : openChar;
    }
    if (opts.collapsed) list.classList.add('collapsed');
    syncArrow();

    function toggle(force) {
      var willCollapse = (force === undefined) ? !list.classList.contains('collapsed') : !!force;
      list.classList.toggle('collapsed', willCollapse);
      syncArrow();
    }
    head.addEventListener('click', function () { toggle(); });

    return {
      toggle: toggle,
      isOpen: function () { return !list.classList.contains('collapsed'); },
    };
  }

  function resolve(node) {
    if (!node) return null;
    return typeof node === 'string' ? document.getElementById(node) : node;
  }

  root.MHRS.ui = {
    sectionCollapse: sectionCollapse,
    bindToggle: bindToggle,
  };

})(typeof window !== 'undefined' ? window : this);