// ============================================================
// core/modal.js —— 弹窗骨架（通用部分）
//
// 职责（只做「所有板块都一样」的事）：
//   · 打开 / 关闭弹窗
//   · 历史栈（返回上一级）
//   · 返回键显隐
//   · 点击遮罩关闭
//
// ⚠️ 不做的事（留给各板块自己）：
//   · 弹窗内容渲染（各板块 renderModal）
//   · 展开状态捕获（各板块自行实现，因为依赖各自 DOM 结构）
//
// 依赖：core/dom.js
// ============================================================
(function (root) {
  'use strict';

  var dom = root.MHRS && root.MHRS.dom;
  if (!dom) { console.error('[modal] 缺少 core/dom.js'); return; }

  // ---- 配置（可在 init 时覆盖）----
  var cfg = {
    overlayId: 'skillModal',
    titleId: 'modalTitle',
    bodyId: 'modalBody',
    backBtnId: 'modalBack',
  };

  var stack = [];        // 历史栈：[{ fn, state }]
  var onClose = null;    // 关闭时的回调（由 render.js 注入）

  // ---- 元素引用（懒取，避免加载顺序问题）----
  function overlay() { return document.getElementById(cfg.overlayId); }
  function titleEl() { return document.getElementById(cfg.titleId); }
  function bodyEl() { return document.getElementById(cfg.bodyId); }
  function backBtn() { return document.getElementById(cfg.backBtnId); }

  /** 注入配置（render.js 启动时调用一次） */
  function init(options) {
    if (options) Object.keys(options).forEach(function (k) { cfg[k] = options[k]; });
    if (typeof options.onClose === 'function') onClose = options.onClose;
    // 遮罩点击 → 关闭
    var ov = overlay();
    if (ov && !ov._modalBound) {
      ov._modalBound = true;
      ov.addEventListener('click', function (e) {
        if (e.target === ov) close();
      });
    }
    return api;
  }

  /**
   * 打开弹窗（通用流程）
   * @param {string} titleHtml 标题 HTML（含图标）
   * @param {Node}   bodyNode  正文节点
   * @param {Function} [restore] 从历史返回时的状态还原函数
   */
  function open(titleHtml, bodyNode, restore) {
    var ov = overlay(), t = titleEl(), b = bodyEl();
    if (!ov || !t || !b) {
      console.error('[modal] 找不到弹窗容器，检查 index.html');
      return;
    }
    t.innerHTML = titleHtml || '';
    dom.clear(b);
    if (bodyNode) b.appendChild(bodyNode);

    ov.classList.add('open');
    updateBackBtn();
    document.body.style.overflow = 'hidden';

    // 从历史返回 → 还原展开状态、滚动位置
    if (typeof restore === 'function') {
      try { restore(); } catch (e) { console.warn('[modal] restore 失败', e); }
    }
  }

  /** 关闭弹窗（并清空历史栈） */
  function close() {
    var ov = overlay();
    if (ov) ov.classList.remove('open');
    stack.length = 0;
    updateBackBtn();
    document.body.style.overflow = '';
    if (typeof onClose === 'function') {
      try { onClose(); } catch (e) { /* ignore */ }
    }
  }

  /** 是否已打开 */
  function isOpen() {
    var ov = overlay();
    return !!(ov && ov.classList.contains('open'));
  }

  /**
   * 记录一步历史（供「返回」使用）
   * @param {Function} fn     返回时调用的函数（重开上一级弹窗）
   * @param {*}        [state] 附加状态（各板块自己解释）
   */
  function push(fn, state) {
    if (typeof fn !== 'function') return;
    stack.push({ fn: fn, state: state === undefined ? null : state });
    updateBackBtn();
  }

  /** 返回上一级；已在最底层则关闭弹窗 */
  function goBack() {
    if (!stack.length) { close(); return; }
    var item = stack.pop();
    var fn = (item && item.fn) || item;   // 兼容旧格式（直接存函数）
    updateBackBtn();
    if (typeof fn === 'function') {
      try { fn(item && item.state); } catch (e) { console.error('[modal] 返回失败', e); }
    }
  }

  /** 更新返回键显隐（弹窗打开时始终显示，点了 = 关闭 or 上一级） */
  function updateBackBtn() {
    var btn = backBtn();
    if (!btn) return;
    btn.style.display = isOpen() ? '' : 'none';
  }

  /** 当前栈深（调试用） */
  function depth() { return stack.length; }

  var api = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    push: push,
    goBack: goBack,
    updateBackBtn: updateBackBtn,
    depth: depth,
    // 暴露配置（调试用）
    cfg: cfg,
  };

  root.MHRS = root.MHRS || {};
  root.MHRS.modal = api;

})(typeof window !== 'undefined' ? window : this);