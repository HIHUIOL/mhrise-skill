// ============================================================
// core/sticky.js —— 滚动吸顶兜底
//
// 背景：页面 body 是 display:flex，部分浏览器下 `position: sticky`
//       对 flex 子元素会失效。所以用 JS 兜底：
//       当目标元素滚到视口顶部之上时，临时把它改成 position:fixed，
//       并用一个等高 placeholder 占位，避免布局跳动。
//
// 依赖：无
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};

  /**
   * 给元素加「滚动吸顶」兜底
   *
   * @param {HTMLElement} el     要吸顶的元素（如任务分类按钮条）
   * @param {Object}      [opts]
   *   @param {Function} [opts.isDisabled] () => boolean  返回 true 时不处理（如所在区块折叠/不可见）
   *   @param {HTMLElement} [opts.disabledBy] 若该元素 collapsed 或 offsetParent===null 时不处理
   *   @param {String}  [opts.fixedClass='is-fixed']  固定时加的 class
   *   @param {Number}  [opts.zIndex=50]
   * @returns {Function} detach —— 移除监听
   */
  function attach(el, opts) {
    if (!el || !root.document) return function () {};
    opts = opts || {};
    var doc = root.document;
    var fixedClass = opts.fixedClass || 'is-fixed';
    var zIndex = opts.zIndex == null ? 50 : opts.zIndex;
    var placeholder = null;

    function isDisabled() {
      if (typeof opts.isDisabled === 'function' && opts.isDisabled()) return true;
      var g = opts.disabledBy;
      if (g && (g.classList.contains('collapsed') || g.offsetParent === null)) return true;
      return false;
    }

    function ensurePlaceholder() {
      if (!placeholder) {
        placeholder = doc.createElement('div');
        placeholder.style.display = 'none';
        el.parentNode.insertBefore(placeholder, el);
      }
      return placeholder;
    }

    function reset() {
      if (el.style.position === 'fixed') {
        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
        el.style.zIndex = '';
        el.classList.remove(fixedClass);
        if (placeholder) placeholder.style.display = 'none';
      }
    }

    function onScroll() {
      if (isDisabled()) { reset(); return; }
      var rect = el.getBoundingClientRect();
      var ph = ensurePlaceholder();
      var phRect = ph.getBoundingClientRect();

      if (phRect.top < 0 && rect.top <= 0) {
        // 已滚过顶部 → 固定
        if (el.style.position !== 'fixed') {
          ph.style.display = 'block';
          ph.style.height = el.offsetHeight + 'px';
          el.style.position = 'fixed';
          el.style.top = '0';
          el.style.left = phRect.left + 'px';
          el.style.width = phRect.width + 'px';
          el.style.zIndex = String(zIndex);
          el.classList.add(fixedClass);
        } else {
          // 跟随宽度变化
          el.style.left = phRect.left + 'px';
          el.style.width = phRect.width + 'px';
        }
      } else {
        reset();
      }
    }

    function onResize() { reset(); onScroll(); }

    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('resize', onResize, { passive: true });

    return function detach() {
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('resize', onResize);
    };
  }

  M.sticky = { attach: attach };

})(typeof window !== 'undefined' ? window : this);