// ============================================================
// core/renderer.js —— 通用渲染引擎
//
// 职责（样板代码全在这，板块只写「差异部分」）：
//   · buildNav()      根据 registry 生成顶部 tab 按钮
//   · buildSections() 根据 registry 生成板块容器 + 标题
//   · renderCards()   通用卡片列表渲染（含空态提示）
//   · buildCatalog()  通用目录（按 groupBy 分类 + 计数）
//   · search()        跨板块统一搜索
//
// ⚠️ 设计原则：**不碰现有 DOM**。引擎只操作「自己创建的」DOM
//    （挂在新容器里），或由板块显式指定的容器（config.mount）。
//
// 依赖：core/dom.js, core/registry.js
// ============================================================
(function (root) {
  'use strict';

  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[renderer] 缺少 core/dom.js'); return; }

  // ---------------- 配置 ----------------
  var cfg = {
    navMount: null,       // 导航挂载点（元素 或 id）
    sectionMount: null,   // 板块容器挂载点
    navClass: 'cat-btn',
    activeClass: 'active',
    hiddenClass: 'cat-hidden',
    onTabChange: null,    // (sectionId) => void
  };

  function resolve(node) {
    if (!node) return null;
    return typeof node === 'string' ? document.getElementById(node) : node;
  }

  function init(options) {
    if (options) Object.keys(options).forEach(function (k) { cfg[k] = options[k]; });
    return api;
  }

  // ---------------- 1. 导航 ----------------
  /**
   * 生成顶部 tab
   * @param {Object} [opts]
   *   @param {Node|string} [opts.mount]    挂载点（默认 cfg.navMount）
   *   @param {boolean}     [opts.withAll]  是否加「全部」按钮
   *   @param {Function}    [opts.onClick]  点击回调 (sectionId, def)
   * @returns {Array} 生成的按钮元素
   */
  function buildNav(opts) {
    opts = opts || {};
    var mount = resolve(opts.mount || cfg.navMount);
    if (!mount) { console.warn('[renderer] buildNav: 无挂载点'); return []; }

    var btns = [];
    var sections = opts.sections || null;   // 传入则自动联动显隐

    function mk(id, label, extra) {
      var b = dom.el('button', {
        class: (extra && extra.cls) || cfg.navClass,
        'data-cat': id,
        text: label,
      });
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove(cfg.activeClass); });
        b.classList.add(cfg.activeClass);
        // 内置默认行为：联动板块显隐
        if (sections) {
          Object.keys(sections).forEach(function (sid) {
            showSection(sid, id === 'all' ? false : sid === id, sections);
          });
        }
        var cb = opts.onClick || cfg.onTabChange;
        if (typeof cb === 'function') cb(id, M.registry.get(id));
      });
      btns.push(b);
      mount.appendChild(b);
      return b;
    }

    if (opts.withAll) mk('all', '全部', { cls: cfg.navClass + ' ' + cfg.activeClass });
    M.registry.visible().forEach(function (def) {
      mk(def.id, (def.icon ? def.icon + ' ' : '') + def.label);
    });
    return btns;
  }

  // ---------------- 2. 板块容器 ----------------
  /**
   * 为每个板块建容器（含标题），返回 { sectionId: element }
   */
  function buildSections(opts) {
    opts = opts || {};
    var mount = resolve(opts.mount || cfg.sectionMount);
    if (!mount) { console.warn('[renderer] buildSections: 无挂载点'); return {}; }

    var map = {};
    M.registry.visible().forEach(function (def) {
      var sec = dom.el('div', {
        class: 'skill-section ' + cfg.hiddenClass,
        id: opts.idPrefix ? opts.idPrefix + def.id : def.id + 'Section',
        'data-section': def.id,
      });
      var title = dom.el('div', {
        class: 'section-title section-toggle',
        id: (opts.idPrefix ? opts.idPrefix + def.id : def.id + 'SectionTitle'),
        text: (def.icon ? def.icon + ' ' : '') + def.label,
      });
      var body = dom.el('div', { class: 'section-body' });
      sec.appendChild(title);
      sec.appendChild(body);
      mount.appendChild(sec);
      map[def.id] = { root: sec, title: title, body: body, def: def };
    });
    return map;
  }

  /** 显示/隐藏板块（按 id） */
  function showSection(sectionId, on, sections) {
    var s = sections && sections[sectionId];
    var el = s ? s.root : document.getElementById(sectionId + 'Section');
    if (el) el.classList.toggle(cfg.hiddenClass, !on);
  }

  // ---------------- 3. 卡片列表 ----------------
  /**
   * 通用卡片列表渲染
   * @param {Array}  items    数据数组
   * @param {Node}   mount    容器
   * @param {Object} def      板块定义（用 renderCard）
   * @param {Object} [ctx]    传给 renderCard 的上下文
   */
  function renderCards(items, mount, def, ctx) {
    dom.clear(mount);
    if (!items || !items.length) {
      mount.appendChild(dom.el('div', { class: 'empty-hint', text: '没有内容' }));
      return 0;
    }
    var frag = document.createDocumentFragment();
    var n = 0;
    items.forEach(function (item, i) {
      var c = { index: i, def: def };
      if (ctx) { for (var k in ctx) { if (Object.prototype.hasOwnProperty.call(ctx, k)) c[k] = ctx[k]; } }
      var card = def.renderCard(item, c);
      if (card) { frag.appendChild(card); n++; }
    });
    mount.appendChild(frag);
    return n;
  }

  /**
   * 通用目录（按 groupBy 分组）
   * @param {Array}  items
   * @param {Node}   mount
   * @param {Object} def    板块定义（用 groupBy）
   * @param {Object} [opts] { order: [组名...] } 指定分组顺序
   * @returns {Object} { 组名: [items] }
   */
  function groupItems(items, def, opts) {
    opts = opts || {};
    var groups = {};
    var order = [];
    var orderList = opts.order || [];

    (items || []).forEach(function (it) {
      var g = typeof def.groupBy === 'function' ? def.groupBy(it) : '其他';
      if (g == null) g = '其他';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(it);
    });

    // 按指定顺序重排
    var sorted = [];
    orderList.forEach(function (g) {
      if (groups[g]) { sorted.push(g); }
    });
    order.forEach(function (g) {
      if (sorted.indexOf(g) === -1) sorted.push(g);
    });

    return { groups: groups, order: sorted };
  }

  /** 渲染目录（每组一个标题 + 计数） */
  function buildCatalog(items, mount, def, opts) {
    opts = opts || {};
    dom.clear(mount);
    var g = groupItems(items, def, opts);
    var onPick = opts.onPick;   // (组名, 该组 items) => void

    g.order.forEach(function (name) {
      var list = g.groups[name];
      var row = dom.el('div', { class: 'cat-row' }, [
        dom.el('span', { class: 'cat-name', text: name }),
        dom.el('span', { class: 'cat-count', text: String(list.length) }),
      ]);
      if (typeof onPick === 'function') {
        row.classList.add('clickable');
        row.addEventListener('click', function () { onPick(name, list); });
      }
      mount.appendChild(row);
    });
    return g;
  }

  // ---------------- 4. 搜索 ----------------
  /**
   * 跨板块搜索
   * @param {string} kw           关键词（空则返回空）
   * @param {Object} [opts]
   *   @param {Array<string>} [opts.sections] 限定板块 id
   * @returns {Object} { sectionId: [items] }
   */
  function search(kw, opts) {
    opts = opts || {};
    var q = String(kw || '').trim().toLowerCase();
    var out = {};
    if (!q) return out;

    var list = opts.sections
      ? opts.sections.map(function (id) { return M.registry.get(id); }).filter(Boolean)
      : M.registry.visible();

    list.forEach(function (def) {
      if (typeof def.searchText !== 'function') return;
      var data = getSectionData(def);
      if (!data) return;
      var hits = data.filter(function (it) {
        try { return def.searchText(it).indexOf(q) !== -1; }
        catch (e) { return false; }
      });
      if (hits.length) out[def.id] = hits;
    });
    return out;
  }

  /** 取某板块的数据数组（按 def.list 或 def.dataKey） */
  function getSectionData(def) {
    try {
      if (typeof def.list === 'function') return def.list();
      if (def.dataKey && root[def.dataKey]) {
        var d = root[def.dataKey];
        return Array.isArray(d) ? d : Object.keys(d).map(function (k) { return d[k]; });
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ---------------- 5. 一键启动 ----------------
  /**
   * 完整启动：建导航 + 建容器 + 绑定切换
   * @param {Object} opts { navMount, sectionMount, withAll, onTabChange }
   * @returns {Object} { nav, sections }
   */
  function boot(opts) {
    opts = opts || {};
    init(opts);

    var sections = buildSections({ mount: opts.sectionMount });
    var nav = buildNav({
      mount: opts.navMount,
      withAll: opts.withAll,
      sections: sections,
      onClick: typeof opts.onTabChange === 'function' ? opts.onTabChange : undefined,
    });
    return { nav: nav, sections: sections };
  }

  var api = {
    init: init,
    boot: boot,
    buildNav: buildNav,
    buildSections: buildSections,
    showSection: showSection,
    renderCards: renderCards,
    groupItems: groupItems,
    buildCatalog: buildCatalog,
    search: search,
    getSectionData: getSectionData,
    cfg: cfg,
  };

  root.MHRS.renderer = api;

})(typeof window !== 'undefined' ? window : this);