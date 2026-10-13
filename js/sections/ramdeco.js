// ============================================================
// sections/ramdeco.js —— 百龙珠板块
//
// 数据：MHRS.deco.rampage（rampage_decorations，数组 34 条）
//   { name, skill, slot, desc, descTpl? }
//   注意：百龙珠**没有 ID 体系**，用「名字」当主键。
//
// 关联：百龙技能（按技能名匹配，无 ID）
//
// 跨板块调用：
//   · openRamSkill(技能名) → 点「提供技能」跳百龙技能
//   · pushHistory(fn)      → 弹窗返回栈
//   · rampageSkillName(id) → 反查技能名（可选）
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[ramdeco] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  function arr() { return (M.deco && M.deco.rampage) || []; }

  /** 按名字取 */
  function byName(name) {
    var a = arr();
    for (var i = 0; i < a.length; i++) if (a[i].name === name) return a[i];
    return null;
  }

  /** 全部（数组本身） */
  function list() { return arr(); }

  /** 搜索文本 */
  function searchText(d) {
    return [d.name, d.skill || '', String(d.slot) + '孔', d.desc || '']
      .join(' ').toLowerCase();
  }

  /** 分类：孔位 */
  function groupBy(d) { return d.slot + '孔'; }

  // ---------------- 详情体（卡片 & 弹窗共用的「提供技能 + 说明」）----------------
  function buildBody(d, recordHistory) {
    var body = dom.el('div', { class: 'ram-deco-body' });

    if (d.skill) {
      var skRow = dom.el('button', {
        type: 'button',
        class: 'deco-modal-skill deco-skill-link',
        html: '提供技能：<b>' + dom.escapeHtml(d.skill) + '</b>' +
          '<span class="deco-skill-go">查看技能 ▸</span>',
      });
      skRow.addEventListener('click', function (e) {
        e.stopPropagation();
        if (recordHistory) {
          BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(d.name); });
        }
        BR.call(BR.NAMES.OPEN_RAM_SKILL, d.skill);
      });
      body.appendChild(skRow);
    }

    if (d.desc) {
      body.appendChild(dom.el('div', { class: 'skill-desc ram-deco-desc', text: d.desc }));
    }
    if (d.descTpl) {
      body.appendChild(dom.el('div', { class: 'desc-tpl-note', text: '⚠️ 本条说明为格式套用，非游戏原文，待补充' }));
    }
    return body;
  }

  // ---------------- 卡片 ----------------
  function renderCard(d) {
    var card = dom.el('div', { class: 'skill-card rampage-card ram-deco-card' });
    card.setAttribute('data-ramdeco-name', d.name);

    card.appendChild(dom.el('div', { class: 'skill-name', html:
      '<span class="deco-title-text">' + dom.escapeHtml(d.name) + '</span>' +
      '<span class="skill-title-right">' +
        (d.descTpl ? '<span class="tpl-mark" title="说明为格式套用，非游戏原文">⚠️</span>' : '') +
        '<span class="deco-slot-badge">' + d.slot + '孔</span>' +
      '</span>' }));

    // 说明 + 提供技能（卡片内不记录返回历史 → 直接回卡片列表）
    if (d.skill) {
      var skRow = dom.el('button', {
        type: 'button',
        class: 'deco-provide deco-modal-skill deco-skill-link',
        html: '提供技能：<b>' + dom.escapeHtml(d.skill) + '</b>' +
          '<span class="deco-skill-go">查看技能 ▸</span>',
      });
      skRow.addEventListener('click', function (e) {
        e.stopPropagation();
        BR.call(BR.NAMES.OPEN_RAM_SKILL, d.skill);
      });
      card.appendChild(skRow);
    }
    if (d.desc) {
      card.appendChild(dom.el('div', { class: 'skill-desc ram-deco-desc', text: d.desc }));
    }
    if (d.descTpl) {
      card.appendChild(dom.el('div', { class: 'desc-tpl-note', text: '⚠️ 本条说明为格式套用，非游戏原文，待补充' }));
    }

    card._search = searchText(d);
    return card;
  }

  // ---------------- 弹窗 ----------------
  function openModal(name) {
    var d = byName(name);
    if (!d) return;
    var body = dom.el('div');
    body.appendChild(buildBody(d, true));
    M.modal.open(
      '<span class="modal-title-icon">🈶</span>' + dom.escapeHtml(d.name) +
      '<span class="deco-slot-badge" style="margin-left:0.4rem;">' + d.slot + '孔</span>',
      body
    );
  }

  // ---------------- 「按百龙技能名查百龙珠」 ----------------
  var _bySkill = null;
  function bySkillMap() {
    if (_bySkill) return _bySkill;
    _bySkill = {};
    arr().forEach(function (d) {
      if (!d.skill) return;
      (_bySkill[d.skill] = _bySkill[d.skill] || []).push(d);
    });
    return _bySkill;
  }

  /** 取某百龙技能名可用的百龙珠 */
  function ramDecosForSkill(skillName) {
    var m = bySkillMap();
    return (skillName && m[skillName]) ? m[skillName] : [];
  }

  /** 可用百龙珠区块的搜索文本 */
  function ramDecosSearchText(skillName) {
    return ramDecosForSkill(skillName).map(function (d) {
      return d.name + ' ' + d.slot + '孔';
    }).join(' ').toLowerCase();
  }

  /** 构造「可用百龙珠」chip 区块（供百龙技能板块嵌入） */
  function buildSection(skillName, opts) {
    opts = opts || {};
    var arr2 = ramDecosForSkill(skillName);
    if (!arr2.length) return null;

    var wrap = dom.el('div', { class: 'deco-section ram-deco-section' });
    wrap.appendChild(dom.el('div', { class: 'deco-head', html:
      '<span class="deco-icon">🈶</span>可用百龙珠 ' +
      '<span class="deco-count">' + arr2.length + '</span>' }));

    var items = dom.el('div', { class: 'deco-items' });
    arr2.forEach(function (d) {
      var chip = dom.el('button', { type: 'button', class: 'deco-chip ram-deco-chip', text: d.name });
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!opts.noSkillHistory) {
          BR.call(BR.NAMES.PUSH_HISTORY, function () { BR.call(BR.NAMES.OPEN_RAM_SKILL, skillName); });
        }
        openModal(d.name);
      });
      items.appendChild(chip);
    });
    wrap.appendChild(items);
    return wrap;
  }

  // ---------------- 目录（按孔位分组）----------------
  function buildCatalog(container) {
    if (!container) return;
    var ORDER = (M.game && M.game.RAM_DECO_SLOT_ORDER) || [1, 2, 3];
    var groups = {};
    list().forEach(function (d) {
      var k = d.slot + '孔';
      (groups[k] = groups[k] || []).push(d);
    });

    ORDER.forEach(function (slot) {
      var key = slot + '孔';
      var g = groups[key];
      if (!g) return;
      var groupEl = dom.el('div', { class: 'catalog-group' });
      groupEl.appendChild(dom.el('div', { class: 'catalog-cat', html:
        dom.escapeHtml(key) + ' <span class="cat-count">' + g.length + '</span>' }));

      var itemsEl = dom.el('div', { class: 'catalog-items' });
      g.forEach(function (d) {
        var b = dom.el('button', { class: 'catalog-item', text: d.name });
        b.addEventListener('click', function () { openModal(d.name); });
        itemsEl.appendChild(b);
      });
      groupEl.appendChild(itemsEl);
      container.appendChild(groupEl);
    });
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'ramdeco',
    label: '百龙珠',
    icon: '🈶',
    order: 40,
    dataKey: 'rampage_decorations',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    buildCatalog: buildCatalog,
    _api: {
      renderCard: renderCard,
      openModal: openModal,
      byName: byName,
      list: list,
      searchText: searchText,
      ramDecosForSkill: ramDecosForSkill,
      ramDecosSearchText: ramDecosSearchText,
      buildSection: buildSection,
    },
  };

  M.register(def);
  M.ramDecoSection = def._api;

  BR.provide(BR.NAMES.OPEN_RAM_DECO, openModal);
  BR.provide(BR.NAMES.RAMDECOS_FOR_SKILL, ramDecosForSkill);
  BR.provide(BR.NAMES.RAM_DECOS_BUILD, buildSection);

})(typeof window !== 'undefined' ? window : this);