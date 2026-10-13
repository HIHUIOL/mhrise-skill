// ============================================================
// core/catalog.js —— 通用「目录」渲染
//
// 各板块的「一览目录」结构完全一样：
//   .catalog
//     ├ .catalog-head        （点击折叠）
//     └ .catalog-body
//         └ .catalog-group  （一个分类）
//             ├ .catalog-cat     分类名 + 数量
//             └ .catalog-items
//                 └ .catalog-item （可点按钮）
//
// 本模块把这些重复逻辑收拢，各板块只需提供
// 「分了组的数据」+「点按钮干什么」。
//
// 依赖：dom.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};

  function getDom() { return M.dom || {}; }

  /**
   * 渲染一个「目录」
   *
   * @param {Object} opts
   *   @param {string}   opts.catalogId   目录根元素 id（如 'decoCatalog'）
   *   @param {string}   opts.bodyId      目录内容区 id（如 'decoCatalogBody'）
   *   @param {string}   opts.headId      目录标题 id（如 'decoCatalogHead'）
   *   @param {Array}    opts.order       分类顺序，如 ['1孔','2孔','3孔','4孔']
   *   @param {Object}   opts.groups      分组数据 { 分类: [ {id,name,...} ] }
   *   @param {Function} opts.onItemClick (item) => void   点某项时
   *   @param {String}   [opts.dataAttr]  按钮上的 data 属性名（如 'deco-target'）
   *   @param {String}   [opts.itemClass] 额外按钮 class（如 'ram-deco-cat-item'）
   *   @param {Function} [opts.labelOf]   (cat) => string  分类显示名（默认 cat 本身）
   *   @param {Function} [opts.sortItems] (list) => sorted 分组内排序
   *   @param {number}   [opts.mobileWidth=600] 小于此宽度默认折叠
   *
   * @returns {boolean} 是否渲染成功
   */
  function render(opts) {
    opts = opts || {};
    var doc = root.document;
    if (!doc) return false;

    var dom = getDom();
    var body = doc.getElementById(opts.bodyId);
    var head = doc.getElementById(opts.headId);
    var catalog = doc.getElementById(opts.catalogId);
    if (!body || !head || !catalog) return false;

    var esc = dom.escapeHtml || function (s) { return String(s); };
    var labelOf = opts.labelOf || function (c) { return c; };
    var groups = opts.groups || {};
    var rendered = 0;

    (opts.order || []).forEach(function (cat) {
      var list = groups[cat];
      if (!list || !list.length) return;
      if (typeof opts.sortItems === 'function') list = opts.sortItems(list.slice());
      rendered++;

      var groupEl = doc.createElement('div');
      groupEl.className = 'catalog-group';

      var catEl = doc.createElement('div');
      catEl.className = 'catalog-cat';
      catEl.innerHTML = esc(labelOf(cat)) + ' <span class="cat-count">' + list.length + '</span>';
      groupEl.appendChild(catEl);

      var itemsEl = doc.createElement('div');
      itemsEl.className = 'catalog-items';

      list.forEach(function (item) {
        var b = doc.createElement('button');
        b.className = 'catalog-item' + (opts.itemClass ? ' ' + opts.itemClass : '');
        b.textContent = item.name;
        if (opts.dataAttr) b.setAttribute('data-' + opts.dataAttr, String(item.id));
        if (typeof opts.onItemClick === 'function') {
          b.addEventListener('click', function () { opts.onItemClick(item); });
        }
        itemsEl.appendChild(b);
      });

      groupEl.appendChild(itemsEl);
      body.appendChild(groupEl);
    });

    // 折叠交互（只绑一次）
    if (!catalog._catalogBound) {
      head.addEventListener('click', function () {
        catalog.classList.toggle('collapsed');
      });
      catalog._catalogBound = true;
    }
    // 小屏默认折叠
    var mw = opts.mobileWidth == null ? 600 : opts.mobileWidth;
    if (root.innerWidth < mw) catalog.classList.add('collapsed');

    return rendered > 0;
  }

  /**
   * 按「分组函数」把一个数组分组
   * @param {Array}    arr
   * @param {Function} keyOf   (item) => 分类名
   * @returns {Object} { 分类: [item] }
   */
  function groupBy(arr, keyOf) {
    var groups = {};
    (arr || []).forEach(function (item) {
      var k = keyOf(item);
      if (k == null) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(item);
    });
    return groups;
  }

  /**
   * 计算最终分类顺序：先按预设顺序，再补「预设外的」
   * @param {Array}  presets  预设顺序
   * @param {Object} groups   分组数据
   * @returns {Array}
   */
  function orderOf(presets, groups) {
    var keys = Object.keys(groups || {});
    var pre = (presets || []).filter(function (c) { return groups && groups[c]; });
    var rest = keys.filter(function (c) { return (presets || []).indexOf(c) < 0; });
    return pre.concat(rest);
  }

  M.catalog = {
    render: render,
    groupBy: groupBy,
    orderOf: orderOf,
  };

})(typeof window !== 'undefined' ? window : this);