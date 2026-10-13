// ============================================================
// sections/skill.js —— 技能板块（核心）
//
// 数据：MHRS.skill.mod（SKILL_DATA，{skills, rampage_skills}）
//       MHRS.skill.data（GAME_SKILL_DATA，147 条游戏原文）
//       MHRS.skill.attr（GAME_SKILL_ATTR，12 类）
//
// 卡片三种情况：
//   ① 有详细版 + 有原文版 → 显示切换按钮
//   ② 仅有详细版 → 只显示详细版
//   ③ 仅有原文版 → 直接显示原文版 + 🎮 标记
//
// 跨板块：珠子（decosForSkill）、百龙珠、素材
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[skill] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };
  var fmt = dom.formatText;

  function modSkills() { return (M.skill && M.skill.mod && M.skill.mod.skills) || {}; }
  function gameData() { return (M.skill && M.skill.data) || {}; }
  function game() { return M.game || {}; }

  // ---------------- 工具 ----------------
  function getLineText(item) {
    if (item == null) return null;
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item.text != null) return String(item.text);
    return null;
  }
  function decToHex(decId) {
    var n = Number(decId);
    if (isNaN(n)) return null;
    var h = n.toString(16).toUpperCase();
    return h.length < 2 ? ('0' + h) : h;
  }
  function expandTemplateText(text, values) {
    if (typeof text !== 'string') return text;
    if (!values || typeof values !== 'object') return text;
    return text.replace(/\{([\w_]+)\}/g, function (m, key) {
      return values[key] !== undefined ? String(values[key]) : '{' + key + '}';
    });
  }
  function isIndexedLineTable(lines) {
    if (!lines || typeof lines !== 'object' || Array.isArray(lines)) return false;
    var keys = Object.keys(lines);
    for (var i = 0; i < keys.length; i++) {
      if (/^\d+$/.test(keys[i])) return true;
      if (/^[Ll]v\s*\d+$/.test(keys[i]) || /^[Ll]evel\s*\d+$/.test(keys[i])) return true;
    }
    return false;
  }
  function sameValue(a, b) {
    if (a == null) a = '';
    if (b == null) b = '';
    return String(a) === String(b);
  }
  function weaponLabel(ids) {
    var WN = game().WEAPON_NAMES || {};
    return ids.map(function (id) { return WN[id] || ('武器' + id); }).join('、');
  }

  // ---------------- 默认等级文本收集 ----------------
  function collectDefaultLevelTexts(entry) {
    var textAt = {}, maxIdx = 0;
    function add(i, v) { var t = getLineText(v); if (t != null) textAt[i] = t; maxIdx = Math.max(maxIdx, i); }

    if (Array.isArray(entry.levels)) {
      entry.levels.forEach(function (it, i) { add(i + 1, it); });
      return { textAt: textAt, maxIdx: maxIdx };
    }
    if (Array.isArray(entry.template)) {
      var values = entry.values || entry.default_values;
      if (values && typeof values === 'object') {
        entry.template.forEach(function (tpl, i) { add(i + 1, expandTemplateText(tpl, values)); });
        return { textAt: textAt, maxIdx: maxIdx };
      }
      if (Array.isArray(entry.default)) {
        entry.default.forEach(function (it, i) { add(i + 1, it); });
        return { textAt: textAt, maxIdx: maxIdx };
      }
    }
    if (Array.isArray(entry.default)) {
      entry.default.forEach(function (it, i) { add(i + 1, it); });
      return { textAt: textAt, maxIdx: maxIdx };
    }
    var byIndex = entry.default_by_index || entry.levels_by_index;
    if (byIndex && typeof byIndex === 'object' && !Array.isArray(byIndex)) {
      Object.keys(byIndex).forEach(function (k) {
        var idx = Number(k);
        if (isNaN(idx)) return;
        add(idx, byIndex[k]);
      });
    }
    return { textAt: textAt, maxIdx: maxIdx };
  }

  // ---------------- 武器差分收集 ----------------
  function collectWeaponDiffs(entry, defaultTextAt) {
    var diffs = {}, defaultWeapons = {};
    var RANGED = game().RANGED_WEAPONS || {};

    function pushDiff(levelIdx, text, weaponId) {
      if (text == null || isNaN(levelIdx)) return;
      var baseText = defaultTextAt[levelIdx];
      if (baseText != null && sameValue(text, baseText)) return;
      if (!diffs[levelIdx]) diffs[levelIdx] = new Map();
      var map = diffs[levelIdx];
      if (!map.has(text)) map.set(text, []);
      if (weaponId != null && map.get(text).indexOf(weaponId) < 0) map.get(text).push(weaponId);
    }
    function recordDefaultWeapon(levelIdx, text, weaponId) {
      if (text == null || isNaN(levelIdx) || weaponId == null) return;
      var baseText = defaultTextAt[levelIdx];
      if (baseText != null && sameValue(text, baseText)) {
        if (!defaultWeapons[levelIdx]) defaultWeapons[levelIdx] = new Set();
        defaultWeapons[levelIdx].add(weaponId);
      }
    }

    // weapons_by_index
    if (entry.weapons_by_index && typeof entry.weapons_by_index === 'object') {
      Object.keys(entry.weapons_by_index).forEach(function (widStr) {
        var wid = Number(widStr);
        var levelMap = entry.weapons_by_index[widStr];
        if (!levelMap || typeof levelMap !== 'object') return;
        Object.keys(levelMap).forEach(function (idxStr) {
          var idx = Number(idxStr);
          if (isNaN(idx)) return;
          pushDiff(idx, getLineText(levelMap[idxStr]), wid);
        });
      });
    }
    // weapons
    if (entry.weapons && typeof entry.weapons === 'object') {
      Object.keys(entry.weapons).forEach(function (widStr) {
        var wid = Number(widStr);
        var arr = entry.weapons[widStr];
        if (Array.isArray(arr)) {
          arr.forEach(function (it, i) { pushDiff(i + 1, getLineText(it), wid); });
        } else if (isIndexedLineTable(arr)) {
          Object.keys(arr).forEach(function (idxStr) {
            var idx = Number(idxStr);
            if (isNaN(idx)) return;
            pushDiff(idx, getLineText(arr[idxStr]), wid);
          });
        }
      });
    }
    // weapon_values（配 template）
    if (Array.isArray(entry.template) && entry.weapon_values && typeof entry.weapon_values === 'object') {
      var values = entry.values || entry.default_values || {};
      Object.keys(entry.weapon_values).forEach(function (widStr) {
        var wid = Number(widStr);
        var wv = entry.weapon_values[widStr];
        if (!wv || typeof wv !== 'object') return;
        entry.template.forEach(function (tpl, i) {
          var merged = {};
          Object.keys(values).forEach(function (k) { merged[k] = values[k]; });
          Object.keys(wv).forEach(function (k) { merged[k] = wv[k]; });
          var text = expandTemplateText(tpl, merged);
          pushDiff(i + 1, text, wid);
          recordDefaultWeapon(i + 1, text, wid);
        });
      });
    }
    // ranged_by_index
    if (entry.ranged_by_index && typeof entry.ranged_by_index === 'object') {
      Object.keys(entry.ranged_by_index).forEach(function (idxStr) {
        var idx = Number(idxStr);
        if (isNaN(idx)) return;
        var text = getLineText(entry.ranged_by_index[idxStr]);
        if (text != null) Object.keys(RANGED).forEach(function (w) { pushDiff(idx, text, Number(w)); });
      });
    }
    // ranged（数组）
    if (Array.isArray(entry.ranged)) {
      entry.ranged.forEach(function (it, i) {
        var text = getLineText(it);
        if (text != null) Object.keys(RANGED).forEach(function (w) { pushDiff(i + 1, text, Number(w)); });
      });
    }
    // ranged_values（配 template）
    if (Array.isArray(entry.template) && entry.ranged_values && typeof entry.ranged_values === 'object') {
      var values2 = entry.values || entry.default_values || {};
      entry.template.forEach(function (tpl, i) {
        var merged2 = {};
        Object.keys(values2).forEach(function (k) { merged2[k] = values2[k]; });
        Object.keys(entry.ranged_values).forEach(function (k) { merged2[k] = entry.ranged_values[k]; });
        var text = expandTemplateText(tpl, merged2);
        if (text != null) Object.keys(RANGED).forEach(function (w) { pushDiff(i + 1, text, Number(w)); });
      });
    }
    // 补齐未列出的武器
    if (Array.isArray(entry.template) && entry.weapon_values && typeof entry.weapon_values === 'object') {
      var listed = {};
      Object.keys(entry.weapon_values).forEach(function (k) { listed[Number(k)] = true; });
      entry.template.forEach(function (tpl, i) {
        var idx = i + 1;
        if (!defaultWeapons[idx]) defaultWeapons[idx] = new Set();
        for (var w = 0; w < 14; w++) if (!listed[w]) defaultWeapons[idx].add(w);
      });
    }
    return { diffs: diffs, defaultWeapons: defaultWeapons };
  }

  // ---------------- 详细版内容 ----------------
  function buildModContent(id, skill) {
    var wrap = dom.el('div', { class: 'card-body' });
    var description = skill.description || skill.explain || '';
    var dl = collectDefaultLevelTexts(skill);
    var wd = collectWeaponDiffs(skill, dl.textAt);

    if (description) wrap.appendChild(dom.el('div', { class: 'skill-desc', html: fmt(description) }));

    var diffMax = Object.keys(wd.diffs).reduce(function (m, k) { return Math.max(m, Number(k)); }, 0);
    var maxIdx = Math.max(dl.maxIdx, diffMax);

    if (maxIdx === 0) {
      wrap.appendChild(dom.el('div', { class: 'level-item', text: '（暂无等级说明）' }));
      return wrap;
    }

    var listEl = dom.el('ul', { class: 'levels-list' });
    for (var i = 1; i <= maxIdx; i++) {
      var mainText = dl.textAt[i];
      var levelDiff = wd.diffs[i];
      if (mainText == null && !levelDiff) continue;

      var li = dom.el('li', { class: 'level-item' });
      var html = '<span class="level-tag">Lv' + i + '</span>';
      if (mainText != null) {
        html += fmt(mainText);
        var dw = wd.defaultWeapons[i];
        if (dw && dw.size && dw.size <= 7) {
          var names = weaponLabel(Array.from(dw).sort(function (a, b) { return a - b; }));
          html += ' <span class="default-weapon-note">（' + dom.escapeHtml(names) + '）</span>';
        }
      } else if (!levelDiff) {
        html += '<span style="color:#7d8f9f;">（该等级沿用游戏原文）</span>';
      }
      li.innerHTML = html;

      if (levelDiff && levelDiff.size) {
        var diffWrap = dom.el('div', { class: 'weapon-diffs' });
        levelDiff.forEach(function (weaponIds, text) {
          diffWrap.appendChild(dom.el('div', { class: 'weapon-diff-row', html:
            '<span class="weapon-tag">⚔ ' + dom.escapeHtml(weaponLabel(weaponIds)) + '</span>' +
            fmt(text) }));
        });
        li.appendChild(diffWrap);
      }
      listEl.appendChild(li);
    }

    if (!listEl.children.length) {
      wrap.appendChild(dom.el('div', { class: 'level-item', text: '（暂无等级说明）' }));
    } else {
      wrap.appendChild(listEl);
    }
    return wrap;
  }

  // ---------------- 原文版内容 ----------------
  function parseGameEffect(effectHtml) {
    var levels = {};
    if (typeof effectHtml !== 'string') return { levels: levels, raw: '' };
    var re = /<li>\s*Lv\s*(\d+)\s*[.、．]\s*([\s\S]*?)<\/li>/gi;
    var m;
    while ((m = re.exec(effectHtml)) !== null) {
      var lv = Number(m[1]);
      var text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) levels[lv] = text;
    }
    return { levels: levels, raw: effectHtml };
  }

  function buildGameContent(gameEntry) {
    var wrap = dom.el('div', { class: 'card-body' });
    if (gameEntry.desc) wrap.appendChild(dom.el('div', { class: 'skill-desc', html: fmt(gameEntry.desc) }));

    var pr = parseGameEffect(gameEntry.effect);
    var keys = Object.keys(pr.levels).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length) {
      var listEl = dom.el('ul', { class: 'levels-list' });
      keys.forEach(function (lv) {
        listEl.appendChild(dom.el('li', { class: 'level-item', html:
          '<span class="level-tag">Lv' + lv + '</span>' + fmt(pr.levels[lv]) }));
      });
      wrap.appendChild(listEl);
    } else if (gameEntry.effect) {
      wrap.appendChild(dom.el('div', { class: 'skill-desc', html:
        fmt(String(gameEntry.effect).replace(/<[^>]+>/g, ' ')) }));
    } else {
      wrap.appendChild(dom.el('div', { class: 'level-item', text: '（该技能暂无游戏原文）' }));
    }
    return wrap;
  }

  // ---------------- 搜索文本 ----------------
  function buildSearchText(id, skill) {
    var parts = [String(id), skill.name || ''];
    ['description', 'text', 'explain'].forEach(function (k) {
      if (typeof skill[k] === 'string') parts.push(skill[k]);
    });
    if (Array.isArray(skill.levels)) skill.levels.forEach(function (it) { var t = getLineText(it); if (t) parts.push(t); });
    if (Array.isArray(skill.default)) skill.default.forEach(function (it) { var t = getLineText(it); if (t) parts.push(t); });
    if (Array.isArray(skill.template)) skill.template.forEach(function (t) { parts.push(t); });
    if (Array.isArray(skill.ranged)) skill.ranged.forEach(function (it) { var t = getLineText(it); if (t) parts.push(t); });
    ['weapons', 'weapons_by_index'].forEach(function (k) {
      if (skill[k] && typeof skill[k] === 'object') {
        Object.keys(skill[k]).forEach(function (w) {
          var v = skill[k][w];
          if (Array.isArray(v)) v.forEach(function (it) { var t = getLineText(it); if (t) parts.push(t); });
          else if (v && typeof v === 'object') Object.keys(v).forEach(function (kk) { var t = getLineText(v[kk]); if (t) parts.push(t); });
          else { var t2 = getLineText(v); if (t2) parts.push(t2); }
        });
      }
    });
    return parts.filter(function (x) { return typeof x === 'string'; }).join(' ').toLowerCase();
  }

  function buildGameSearchText(id, gameEntry) {
    var pr = parseGameEffect(gameEntry.effect);
    var parts = [String(id), decToHex(id) || '', gameEntry.sname || '', gameEntry.desc || ''];
    Object.keys(pr.levels).forEach(function (k) { parts.push(pr.levels[k]); });
    return parts.filter(function (x) { return typeof x === 'string'; }).join(' ').toLowerCase();
  }

  // ---------------- 卡片 ----------------
  function buildCard(id, skill, gameEntry) {
    var card = dom.el('div', { class: 'skill-card', 'data-skill-id': String(id) });

    var displayName;
    if (skill) {
      var nm = skill.name || ('技能 ' + id);
      displayName = skill.name_override || skill.title || skill.display_name || nm;
    } else {
      displayName = (gameEntry && gameEntry.sname) || ('技能 ' + id);
    }
    var hasMod = !!skill, hasGame = !!gameEntry, both = hasMod && hasGame;

    var titleEl = dom.el('div', { class: 'skill-name' });
    titleEl.appendChild(dom.el('span', { class: 'skill-title-text', text: displayName }));
    var titleRight = dom.el('span', { class: 'skill-title-right' });

    if (both) {
      titleRight.appendChild(dom.el('button', {
        class: 'card-src-toggle', 'data-mode': 'mod',
        html: '<span class="src-label">📘 详细版</span>' }));
    } else if (!hasMod && hasGame) {
      titleRight.appendChild(dom.el('span', { class: 'src-badge', text: '🎮 原文' }));
    }
    titleRight.appendChild(dom.el('span', { class: 'skill-id', text: '#' + String(id) }));
    titleEl.appendChild(titleRight);
    card.appendChild(titleEl);

    var decoText = BR.call(BR.NAMES.DECOS_SEARCH_TEXT, id) || '';

    // 仅原文版
    if (!hasMod && hasGame) {
      var gc = buildGameContent(gameEntry);
      gc.classList.add('src-game');
      card.appendChild(gc);
      var d1 = BR.call(BR.NAMES.DECOS_BUILD, id, { noSkillHistory: true });
      if (d1) card.appendChild(d1);
      card._search = buildGameSearchText(id, gameEntry) + ' ' + decoText;
      return card;
    }

    // 有详细版
    var mc = buildModContent(id, skill);
    mc.classList.add('src-mod');
    card.appendChild(mc);

    var gc2 = null;
    if (hasGame) {
      gc2 = buildGameContent(gameEntry);
      gc2.classList.add('src-game');
      gc2.style.display = 'none';
      card.appendChild(gc2);
    }
    card._search = buildSearchText(id, skill) + (hasGame ? ' ' + buildGameSearchText(id, gameEntry) : '') + ' ' + decoText;

    var d2 = BR.call(BR.NAMES.DECOS_BUILD, id, { noSkillHistory: true });
    if (d2) card.appendChild(d2);

    if (both) {
      card.dataset.hasToggle = '1';
      var btn = titleEl.querySelector('.card-src-toggle');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var toGame = btn.getAttribute('data-mode') === 'mod';
        if (toGame) {
          mc.style.display = 'none'; gc2.style.display = '';
          btn.setAttribute('data-mode', 'game');
          btn.innerHTML = '<span class="src-label">🎮 原文版</span>';
        } else {
          mc.style.display = ''; gc2.style.display = 'none';
          btn.setAttribute('data-mode', 'mod');
          btn.innerHTML = '<span class="src-label">📘 详细版</span>';
        }
      });
    }
    return card;
  }

  // ---------------- 弹窗 ----------------
  function openModal(id) {
    var sk = modSkills()[id];
    var hex = decToHex(id);
    var gd = gameData();
    var gameEntry = (hex && gd[hex]) ? gd[hex] : null;

    var name;
    if (sk) name = sk.name_override || sk.title || sk.display_name || sk.name || ('技能 ' + id);
    else name = (gameEntry && gameEntry.sname) || ('技能 ' + id);

    var body = dom.el('div');
    var hasMod = !!sk, hasGameEntry = !!gameEntry;

    if (hasMod && hasGameEntry) {
      var switchRow = dom.el('div', { class: 'modal-switch' });
      var btnMod = dom.el('button', { class: 'active', text: '📘 详细版' });
      var btnGame = dom.el('button', { text: '🎮 原文版' });
      switchRow.appendChild(btnMod);
      switchRow.appendChild(btnGame);
      body.appendChild(switchRow);

      var modEl = buildModContent(id, sk);
      var gameEl = buildGameContent(gameEntry);
      gameEl.style.display = 'none';
      body.appendChild(modEl);
      body.appendChild(gameEl);
      btnMod.addEventListener('click', function () {
        modEl.style.display = ''; gameEl.style.display = 'none';
        btnMod.classList.add('active'); btnGame.classList.remove('active');
      });
      btnGame.addEventListener('click', function () {
        modEl.style.display = 'none'; gameEl.style.display = '';
        btnGame.classList.add('active'); btnMod.classList.remove('active');
      });
    } else if (hasMod) {
      body.appendChild(buildModContent(id, sk));
    } else if (hasGameEntry) {
      body.appendChild(buildGameContent(gameEntry));
    } else {
      body.appendChild(dom.el('div', { class: 'level-item', text: '（暂无说明）' }));
    }

    var decoSec = BR.call(BR.NAMES.DECOS_BUILD, id);
    if (decoSec) body.appendChild(decoSec);

    M.modal.open(dom.escapeHtml(name) + '<span class="skill-id">#' + dom.escapeHtml(String(id)) + '</span>', body);
    M.modal.updateBackBtn();
    document.body.style.overflow = 'hidden';
  }

  // ---------------- 列表 / 分组 ----------------
  function list() {
    var mod = modSkills();
    var gd = gameData();
    var out = [];
    // 详述版技能
    Object.keys(mod).forEach(function (id) {
      var hex = decToHex(id);
      out.push({ id: id, skill: mod[id], gameEntry: (hex && gd[hex]) ? gd[hex] : null, hasMod: true });
    });
    // 仅原文版技能（模组未收录）
    Object.keys(gd).forEach(function (hex) {
      var decId = parseInt(hex, 16);
      if (!mod[decId]) out.push({ id: String(decId), skill: null, gameEntry: gd[hex], hasMod: false });
    });
    out.sort(function (a, b) { return Number(a.id) - Number(b.id); });
    return out;
  }

  function searchText(item) {
    if (item.hasMod) return buildSearchText(item.id, item.skill);
    return buildGameSearchText(item.id, item.gameEntry);
  }

  function groupBy(item) {
    var hex = decToHex(item.id);
    var meta = hex ? gameData()[hex] : null;
    var tags = (meta && Array.isArray(meta.tag)) ? meta.tag : [];
    var UNTAGGED = game().SKILL_CAT_UNTAGGED || '其他';
    return tags.length ? tags[0] : UNTAGGED;
  }

  function renderCard(item) {
    return buildCard(item.id, item.skill, item.gameEntry);
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'skill',
    label: '技能',
    icon: '⚔️',
    order: 10,
    dataKey: 'SKILL_DATA',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    _api: {
      buildCard: buildCard,
      openModal: openModal,
      buildModContent: buildModContent,
      buildGameContent: buildGameContent,
      buildSearchText: buildSearchText,
      buildGameSearchText: buildGameSearchText,
      collectDefaultLevelTexts: collectDefaultLevelTexts,
      collectWeaponDiffs: collectWeaponDiffs,
      weaponLabel: weaponLabel,
      getLineText: getLineText,
      decToHex: decToHex,
      parseGameEffect: parseGameEffect,
      list: list,
      searchText: searchText,
      groupBy: groupBy,
    },
  };

  M.register(def);
  M.skillSection = def._api;

  BR.provide(BR.NAMES.OPEN_SKILL, openModal);

})(typeof window !== 'undefined' ? window : this);