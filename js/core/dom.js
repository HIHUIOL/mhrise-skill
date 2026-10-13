// ============================================================
// core/dom.js —— DOM 工具函数（无依赖，最先加载）
//
// 把 render.js 里反复出现的 DOM 操作收敛到这里，避免每个板块
// 都重写一遍。
// ============================================================
(function (root) {
  'use strict';

  var doc = root.document;

  /**
   * 快速创建元素
   * @param {string} tag          标签名
   * @param {Object} [attrs]      属性 / 特殊键：
   *                                - class  → className
   *                                - text   → textContent
   *                                - html   → innerHTML
   *                                - style  → Object 或字符串
   *                                - on*    → 事件监听（如 onclick）
   *                                - dataset→ data-* 属性
   * @param {Array|Node|string} [children] 子节点
   */
  function el(tag, attrs, children) {
    var node = doc.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null) return;

        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style') {
          if (typeof v === 'string') node.style.cssText = v;
          else Object.keys(v).forEach(function (p) { node.style[p] = v[p]; });
        } else if (k === 'dataset') {
          Object.keys(v).forEach(function (p) { node.dataset[p] = v[p]; });
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          node.setAttribute(k, v);
        }
      });
    }

    appendChildren(node, children);
    return node;
  }

  /** 批量追加子节点 */
  function appendChildren(node, children) {
    if (children == null) return node;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (c) {
      if (c == null || c === false) return;
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(doc.createTextNode(String(c)));
      } else if (c.nodeType) {
        node.appendChild(c);
      }
    });
    return node;
  }

  /** 清空元素 */
  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** 用新内容替换元素内容 */
  function replace(node, children) {
    clear(node);
    return appendChildren(node, children);
  }

  /** $ = querySelector，$$ = querySelectorAll（数组） */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /** HTML 转义（所有用户可见文本都应经过它） */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 解析游戏文本里的 <COLOR FFC000>…</COLOR> 为彩色 span
   * （render.js 原有 formatText 的核心逻辑）
   */
  function formatText(str) {
    if (str == null) return '';
    var s = String(str);
    // 先转义，再把转义后的 &lt;COLOR xxxxxx&gt; 还原成 span
    s = escapeHtml(s);
    s = s.replace(/&lt;COLOR\s+([0-9A-Fa-f]{6})&gt;/g, function (_, hex) {
      return '<span class="hl" style="color:#' + hex + '">';
    });
    s = s.replace(/&lt;\/COLOR&gt;/g, '</span>');
    // 其他残留标签（<ul>/<li> 等）保留为文本
    return s;
  }

  /** 把文本转成「可搜索」的小写串 */
  function searchKey() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      else if (Array.isArray(v)) parts.push(searchKey.apply(null, v));
    }
    return parts.join(' ').toLowerCase();
  }

  root.MHRS = root.MHRS || {};
  root.MHRS.dom = {
    el: el,
    append: appendChildren,
    clear: clear,
    replace: replace,
    $: $,
    $$: $$,
    escapeHtml: escapeHtml,
    formatText: formatText,
    searchKey: searchKey,
  };

})(typeof window !== 'undefined' ? window : this);