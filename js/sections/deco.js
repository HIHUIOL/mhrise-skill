// ============================================================
// sections/deco.js —— 珠子板块
//
// 数据：MHRS.deco.data（decoration_data，244 条）
//       MHRS.deco.byName（decoration_by_name，按名字索引）
// 关联：MHRS.skill.data（hex → 技能名）
//       MHRS.item.data（素材）
//
// 跨板块调用（通过 MHRS.bridge，缺失时安全降级）：
//   · openSkill(skillId)              → 点「提供技能」跳技能详情
//   · pushHistory(fn)                 → 记录弹窗返回栈
//   · monstersForMaterial(itemName)   → 素材能否点进怪物
//   · ranksForMaterial(itemName)      → 素材等级标签
//
// 依赖：core/dom.js, core/registry.js, core/modal.js, core/renderer.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[deco] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  // ---------------- 数据 ----------------
  function data() { return (M.deco && M.deco.data) || {}; }
  function byName() { return (M.deco && M.deco.byName) || {}; }
  function game() { return M.game || {}; }

  /** 全部珠子 → 数组（按 id 数字序）
   *  ⚠️ decoration_data 的条目本身没有 id 字段，
   *     id 就是 Object 的 key。这里**补一个 id**（轻量拷贝外包一层，
   *     不改原对象，保证「同引用」不被破坏 → 用 getter 方式）。
   */
  var _listCache = null;
  function list() {
    if (_listCache) return _listCache;
    var d = data();
    _listCache = Object.keys(d)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (id) {
        var e = d[id];
        if (!e) return null;
        // 浅拷贝 + 注入 id（不改动原数据）
        var o = {};
        for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) o[k] = e[k]; }
        o.id = Number(id);
        return o;
      })
      .filter(Boolean);
    return _listCache;
  }

  /** 取珠子「提供的技能名」 */
  function skillName(entry) {
    if (!entry || !entry.hex) return '';
    var key = String(entry.hex).toUpperCase();
    // 1) 详细版（render.js 顶层缓存的 hex → 名字映射）
    if (root._skillNameByHex && root._skillNameByHex[key]) return root._skillNameByHex[key];
    // 2) 游戏原文
    var gd = (M.skill && M.skill.data) || {};
    if (gd[key] && gd[key].sname) return gd[key].sname;
    return '';
  }

  /** 搜索文本 */
  function searchText(entry) {
    var parts = [String(entry.id || ''), entry.dname || '', String(entry.slot) + '孔', 'Lv' + entry.lv];
    var sn = skillName(entry);
    if (sn) parts.push(sn);
    return parts.join(' ').toLowerCase();
  }

  /** 分类维度：孔位 */
  function groupBy(entry) { return entry.slot + '孔'; }

  // ---------------- 素材行 ----------------
  function buildMaterialList(entry, recordHistory, decoId) {
    var wrap = dom.el('div');
    var head = dom.el('div', { class: 'deco-mat-head', text: '必要素材' });
    wrap.appendChild(head);
    if (!entry.material || !entry.material.length) return wrap;

    var G = game();
    var RANK_SHORT = G.RANK_SHORT || {};
    var ul = dom.el('ul', { class: 'deco-mat-list' });
    entry.material.forEach(function (m) {
      var mons = BR.call(BR.NAMES.MONSTERS_FOR_MATERIAL, m.item) || [];
      var linkable = mons.length > 0;
      var mkRanks = BR.call(BR.NAMES.RANKS_FOR_MATERIAL, m.item) || [];

      var li = dom.el('li', { class: 'deco-mat-item' });
      var rankHtml = '';
      if (mkRanks.length) {
        rankHtml = '<span class="mat-rank-tags">' + mkRanks.map(function (r) {
          // rankKey：'下位'→low / '上位'→high / '大师等级'→master / '怪异'→anomaly
          var k = BR.call(BR.NAMES.RANK_KEY, r) || 'master';
          return '<span class="mat-rank-tag rank-' + k + '">' + (RANK_SHORT[r] || r) + '</span>';
        }).join('') + '</span>';
      }
      li.innerHTML = '<span class="deco-mat-name">' + dom.escapeHtml(m.item) + rankHtml +
        (linkable ? '<span class="mat-go">▸</span>' : '<span class="mat-go mat-go-item">ℹ</span>') +
        '</span><span class="deco-mat-count">×' + m.count + '</span>';

      if (linkable) {
        li.classList.add('deco-mat-link');
        li.addEventListener('click', function (e) {
          e.stopPropagation();
          if (recordHistory) BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(decoId); });
          BR.call(BR.NAMES.OPEN_ITEM, m.item);
        });
      }
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return wrap;
  }

  // ---------------- 详情体（卡片 & 弹窗共用）----------------
  function buildDetailBody(entry, decoId, recordHistory) {
    if (recordHistory === undefined) recordHistory = true;
    var body = dom.el('div', { class: 'deco-detail-body' });

    function recordBack() {
      if (recordHistory) {
        BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(decoId); });
      }
    }

    // 孔位 / 等级
    body.appendChild(dom.el('div', { class: 'deco-modal-info', html:
      '<span class="deco-tag">孔位 ' + entry.slot + '</span>' +
      '<span class="deco-tag">等级 Lv' + entry.lv + '</span>' }));

    // 提供技能（可点击）
    var gmeta = (M.skill && M.skill.data) || {};
    var skEntry = entry.hex ? gmeta[entry.hex] : null;
    if (skEntry) {
      var decId = parseInt(entry.hex, 16);
      var skRow = dom.el('button', {
        type: 'button',
        class: 'deco-modal-skill deco-skill-link',
        html: '提供技能：<b>' + dom.escapeHtml(skEntry.sname || '') + '</b>' +
          ' <span class="deco-lv">Lv' + entry.lv + '</span>' +
          '<span class="deco-skill-go">查看技能 ▸</span>',
      });
      skRow.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!isNaN(decId)) {
          recordBack();
          BR.call(BR.NAMES.OPEN_SKILL, decId);
        }
      });
      body.appendChild(skRow);
    }

    // 必要素材
    body.appendChild(buildMaterialList(entry, recordHistory, decoId));
    return body;
  }

  // ---------------- 卡片 ----------------
  function renderCard(entry) {
    var card = dom.el('div', { class: 'skill-card deco-card' });
    if (entry.id != null) card.setAttribute('data-deco-id', String(entry.id));

    card.appendChild(dom.el('div', { class: 'skill-name', html:
      '<span class="deco-title-text">' + dom.escapeHtml(entry.dname) + '</span>' +
      '<span class="skill-title-right">' +
        '<span class="deco-slot-badge">' + entry.slot + '孔</span>' +
        (entry.lv > 1 ? '<span class="deco-lv-badge">Lv' + entry.lv + '</span>' : '') +
      '</span>' }));

    card.appendChild(buildDetailBody(entry, entry.id, false));
    card._search = searchText(entry);
    return card;
  }

  // ---------------- 弹窗 ----------------
  function openModal(decoId) {
    var entry = data()[String(decoId)];
    if (!entry) return;
    var body = dom.el('div', { class: 'deco-detail-body-wrap' });
    body.appendChild(buildDetailBody(entry, decoId, true));
    M.modal.open('<span class="deco-title-text">' + dom.escapeHtml(entry.dname) + '</span>', body);
  }

  // ---------------- 目录 ----------------
  function buildCatalog(container) {
    if (!container) return;
    var G = game();
    var ORDER = G.DECO_SLOT_ORDER || [1, 2, 3, 4];
    var items = list();

    var groups = {};
    items.forEach(function (e) {
      var k = e.slot + '孔';
      (groups[k] = groups[k] || []).push(e);
    });

    ORDER.forEach(function (slot) {
      var key = slot + '孔';
      var g = groups[key];
      if (!g) return;
      g.sort(function (a, b) { return (a.lv - b.lv) || (Number(a.id) - Number(b.id)); });

      var groupEl = dom.el('div', { class: 'catalog-group' });
      groupEl.appendChild(dom.el('div', { class: 'catalog-cat', html:
        dom.escapeHtml(key) + ' <span class="cat-count">' + g.length + '</span>' }));

      var itemsEl = dom.el('div', { class: 'catalog-items' });
      g.forEach(function (e) {
        var b = dom.el('button', { class: 'catalog-item', text: e.dname, 'data-deco-target': String(e.id) });
        b.addEventListener('click', function () { openModal(e.id); });
        itemsEl.appendChild(b);
      });
      groupEl.appendChild(itemsEl);
      container.appendChild(groupEl);
    });
  }

  // ---------------- 「按技能查珠子」索引 ----------------
  //  decoBySkillHex: { '01': [珠子...], ... }
  var _bySkillHex = null;
  function bySkillHex() {
    if (_bySkillHex) return _bySkillHex;
    _bySkillHex = {};
    list().forEach(function (e) {
      var h = e.hex;
      if (!h) return;
      (_bySkillHex[h] = _bySkillHex[h] || []).push(e);
    });
    return _bySkillHex;
  }

  /** 取某技能（十进制 id）可用的珠子 */
  function decosForSkill(decId) {
    var hex = Number(decId).toString(16).toUpperCase();
    if (hex.length === 1) hex = '0' + hex;
    var m = bySkillHex();
    return m[hex] || [];
  }

  /** 可用珠子区块的搜索文本 */
  function decosSearchText(decId) {
    return decosForSkill(decId).map(function (d) {
      return d.dname + ' ' + d.slot + '孔 Lv' + d.lv;
    }).join(' ').toLowerCase();
  }

  /** 构造「可用珠子」chip 区块（供技能板块嵌入卡片/弹窗）
   *  @param decId  十进制技能 id
   *  @param opts   { noSkillHistory:boolean }
   */
  function buildDecoSection(decId, opts) {
    opts = opts || {};
    var arr = decosForSkill(decId);
    if (!arr.length) return null;

    var wrap = dom.el('div', { class: 'deco-section' });
    wrap.appendChild(dom.el('div', { class: 'deco-head', html:
      '<span class="deco-icon">🔮</span>可用珠子 ' +
      '<span class="deco-count">' + arr.length + '</span>' }));

    var items = dom.el('div', { class: 'deco-items' });
    arr.forEach(function (d) {
      var chip = dom.el('button', { class: 'deco-chip', 'data-deco-name': d.dname, html:
        dom.escapeHtml(d.dname) + (d.lv > 1 ? '<span class="deco-lv">Lv' + d.lv + '</span>' : '') });
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!opts.noSkillHistory) {
          BR.call(BR.NAMES.PUSH_HISTORY, function () { BR.call(BR.NAMES.OPEN_SKILL, Number(decId)); });
        }
        openModal(d.id);
      });
      items.appendChild(chip);
    });
    wrap.appendChild(items);
    return wrap;
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'deco',
    label: '珠子',
    icon: '🔮',
    order: 30,
    dataKey: 'decoration_data',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    buildCatalog: buildCatalog,
    // 暴露给老代码 / 其他板块
    _api: {
      renderCard: renderCard,
      openModal: openModal,
      skillName: skillName,
      searchText: searchText,
      list: list,
      decosForSkill: decosForSkill,
      decosSearchText: decosSearchText,
      buildDecoSection: buildDecoSection,
    },
  };

  M.register(def);
  // 老 render.js 可以通过这个找到新实现（渐进迁移）
  M.decoSection = def._api;

  // 提供能力（供技能板块嵌入/跳转用）
  BR.provide(BR.NAMES.OPEN_DECO, openModal);
  BR.provide(BR.NAMES.DECOS_FOR_SKILL, decosForSkill);
  BR.provide(BR.NAMES.DECOS_SEARCH_TEXT, decosSearchText);
  BR.provide(BR.NAMES.DECOS_BUILD, buildDecoSection);

})(typeof window !== 'undefined' ? window : this);