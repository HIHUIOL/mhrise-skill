// ============================================================
// sections/ram.js —— 百龙技能板块
//
// 数据：MHRS.skill.mod.rampage_skills
//   { "259": { name, text, wrap_width?, non_switch_axe_text?, phial_labels?, phials?, weapons? } }
//   32 条
//
// 分类：按名字正则（规则来自 game_data.js 的 RAMPAGE_CAT_ORDER）
//   · 龙之魂       /之魂$/
//   · 对怪物特效   /特效$/
//   · 能力强化     /打磨术|激化|演奏|强化|持续|变形|炮|蓄击|强走|一击|钻研|加倍|活性|防御重击/
//   · 其他
//
// 跨板块：嵌入「可用百龙珠」（bridge: ramDecosForSkill）
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[ram] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  function map() { return (M.skill && M.skill.mod && M.skill.mod.rampage_skills) || {}; }

  /** 取显示名 */
  function nameOf(skill, id) {
    return skill.name_override || skill.title || skill.display_name || skill.name || ('百龙技能 ' + id);
  }

  /** 全部 → 数组 [{ id, skill, name }] */
  function list() {
    var m = map();
    return Object.keys(m).map(function (id) {
      var s = m[id];
      return { id: id, skill: s, name: nameOf(s, id) };
    });
  }

  /** 按 id 取 */
  function byId(id) {
    var m = map();
    return m[String(id)] || null;
  }

  /** 搜索文本 */
  function searchText(item) {
    var id = item.id, skill = item.skill || {};
    var parts = [String(id), item.name || '', skill.name || ''];
    ['description', 'text', 'explain', 'default', 'non_switch_axe_text'].forEach(function (k) {
      if (typeof skill[k] === 'string') parts.push(skill[k]);
    });
    if (skill.phials && typeof skill.phials === 'object') {
      Object.keys(skill.phials).forEach(function (k) {
        if (typeof skill.phials[k] === 'string') parts.push(skill.phials[k]);
      });
    }
    if (skill.weapons && typeof skill.weapons === 'object') {
      Object.keys(skill.weapons).forEach(function (k) {
        var v = skill.weapons[k];
        if (typeof v === 'string') parts.push(v);
        else if (Array.isArray(v)) v.forEach(function (x) { if (typeof x === 'string') parts.push(x); });
      });
    }
    return parts.join(' ').toLowerCase();
  }

  // ---------------- 分类 ----------------
  function catOf(name) {
    if (/之魂$/.test(name)) return '龙之魂';
    if (/特效$/.test(name)) return '对怪物特效';
    if (/(打磨术|激化|演奏|强化|持续|变形|炮|蓄击|强走|一击|钻研|加倍|活性|防御重击)/.test(name)) {
      return '能力强化';
    }
    return '其他';
  }
  function groupBy(item) { return catOf(item.name); }

  // ---------------- 内容渲染（含斩斧瓶 / 武器差分）----------------
  function buildContent(skill) {
    var wrap = dom.el('div', { class: 'card-body' });

    var baseText = null;
    if (typeof skill.text === 'string') baseText = skill.text;
    else if (typeof skill.default === 'string') baseText = skill.default;
    else if (typeof skill.explain === 'string') baseText = skill.explain;
    else if (typeof skill.description === 'string') baseText = skill.description;

    // ---- 斩斧瓶类型差分 ----
    if (skill.phials && typeof skill.phials === 'object') {
      var nonSA = skill.non_switch_axe_text || skill.non_slash_axe_text;
      var headText = nonSA || baseText;
      if (headText) {
        wrap.appendChild(dom.el('div', { class: 'skill-desc', html: dom.formatText(headText) }));
      }
      var phialWrap = dom.el('div', { class: 'weapon-diffs' });
      var labels = skill.phial_labels || {};
      Object.keys(skill.phials).forEach(function (key) {
        var text = skill.phials[key];
        if (typeof text !== 'string') return;
        var row = dom.el('div', { class: 'weapon-diff-row', html:
          '<span class="weapon-tag">⚗ ' + dom.escapeHtml(labels[key] || key) + '</span>' +
          dom.formatText(text) });
        phialWrap.appendChild(row);
      });
      if (phialWrap.children.length) wrap.appendChild(phialWrap);
      return wrap;
    }

    // ---- 武器差分 ----
    if (skill.weapons && typeof skill.weapons === 'object') {
      if (baseText) wrap.appendChild(dom.el('div', { class: 'skill-desc', html: dom.formatText(baseText) }));
      var wWrap = dom.el('div', { class: 'weapon-diffs' });
      var WN = (M.game && M.game.WEAPON_NAMES) || {};
      Object.keys(skill.weapons).forEach(function (wid) {
        var v = skill.weapons[wid];
        var text = typeof v === 'string' ? v : (Array.isArray(v) ? v.join('') : null);
        if (text == null) return;
        wWrap.appendChild(dom.el('div', { class: 'weapon-diff-row', html:
          '<span class="weapon-tag">⚔ ' + dom.escapeHtml(WN[Number(wid)] || ('武器' + wid)) + '</span>' +
          dom.formatText(text) }));
      });
      if (wWrap.children.length) wrap.appendChild(wWrap);
      return wrap;
    }

    // ---- 普通文本 ----
    if (baseText) wrap.appendChild(dom.el('div', { class: 'skill-desc', html: dom.formatText(baseText) }));
    return wrap;
  }

  /** 「可用百龙珠」区块（通过 bridge 问 ramdeco 板块） */
  function ramDecoSection(name) {
    return BR.call(BR.NAMES.RAM_DECOS_BUILD, name, { noSkillHistory: true });
  }

  // ---------------- 卡片 ----------------
  function renderCard(item) {
    var id = item.id, skill = item.skill;
    var card = dom.el('div', { class: 'skill-card rampage-card' });
    card.setAttribute('data-rampage-id', String(id));
    card.appendChild(dom.el('div', { class: 'skill-name', html:
      '<span>' + dom.escapeHtml(item.name) + '</span>' +
      '<span class="skill-id">#' + dom.escapeHtml(String(id)) + '</span>' }));

    card.appendChild(buildContent(skill));

    var rd = ramDecoSection(item.name);
    if (rd) card.appendChild(rd);

    card._search = searchText(item);
    return card;
  }

  // ---------------- 弹窗 ----------------
  function openModal(id) {
    var skill = byId(id);
    if (!skill) return;
    var name = nameOf(skill, id);
    var body = dom.el('div');
    body.appendChild(buildContent(skill));
    var rd = ramDecoSection(name);
    if (rd) body.appendChild(rd);

    M.modal.open(
      '<span class="modal-title-icon">🐉</span>' + dom.escapeHtml(name) +
      '<span class="skill-id">#' + dom.escapeHtml(String(id)) + '</span>',
      body
    );
  }

  /** 按名字打开（供百龙珠反跳） */
  function openByName(name) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].name === name) { openModal(arr[i].id); return; }
    }
  }
  /** 按 id 或名字打开 */
  function openRampageById(key) {
    if (byId(key)) return openModal(key);
    return openByName(key);
  }

  // ---------------- 目录 ----------------
  function buildCatalog(container) {
    if (!container) return;
    var ORDER = (M.game && M.game.RAMPAGE_CAT_ORDER) || ['能力强化', '对怪物特效', '龙之魂', '其他'];
    var arr = list();
    var groups = {}, order = [];
    arr.forEach(function (it) {
      var c = catOf(it.name);
      if (!groups[c]) { groups[c] = []; order.push(c); }
      groups[c].push(it);
    });
    var finalOrder = ORDER.filter(function (c) { return groups[c]; })
      .concat(order.filter(function (c) { return ORDER.indexOf(c) === -1; }));

    finalOrder.forEach(function (cat) {
      var g = groups[cat];
      var groupEl = dom.el('div', { class: 'catalog-group' });
      groupEl.appendChild(dom.el('div', { class: 'catalog-cat', html:
        dom.escapeHtml(cat) + ' <span class="cat-count">' + g.length + '</span>' }));
      var itemsEl = dom.el('div', { class: 'catalog-items' });
      g.forEach(function (it) {
        var b = dom.el('button', { class: 'catalog-item', text: it.name, 'data-rampage-target': String(it.id) });
        b.addEventListener('click', function () { openModal(it.id); });
        itemsEl.appendChild(b);
      });
      groupEl.appendChild(itemsEl);
      container.appendChild(groupEl);
    });
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'ram',
    label: '百龙技能',
    icon: '🐉',
    order: 20,
    dataKey: 'SKILL_DATA',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    buildCatalog: buildCatalog,
    _api: {
      renderCard: renderCard,
      openModal: openModal,
      openByName: openByName,
      openRampageById: openRampageById,
      byId: byId,
      nameOf: nameOf,
      list: list,
      searchText: searchText,
      catOf: catOf,
      _buildContent: buildContent,
    },
  };

  M.register(def);
  M.ramSection = def._api;

  BR.provide(BR.NAMES.OPEN_RAM_SKILL, openRampageById);

})(typeof window !== 'undefined' ? window : this);