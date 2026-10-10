// mhrise-skill / render.js
// 渲染 + 搜索 + 武器差分
// -----------------------------------------------------------------------------
// 本文件的逻辑严格对照原版模组引擎 better_skill_descriptions.lua 重写，
// 修正了武器映射、远程武器判定、levels_by_index 覆盖语义、weapons 索引基准、
// 以及斩斧瓶类型（phials）等逻辑。数据来源：Nexus Mods mods/3872
// -----------------------------------------------------------------------------

(function () {
  'use strict';

  // ========================================================
  // 武器 ID → 名称映射（对照 lua WEAPON_NAMES，勿随意修改）
  // ========================================================
  const WEAPON_NAMES = {
    0: '大剑',
    1: '斩击斧',
    2: '太刀',
    3: '轻弩炮',
    4: '重弩炮',
    5: '大锤',
    6: '铳枪',
    7: '长枪',
    8: '单手剑',
    9: '双剑',
    10: '狩猎笛',
    11: '盾斧',
    12: '操虫棍',
    13: '弓'
  };
  // 远程武器 ID（对照 lua RANGED_WEAPONS = {3,4,13}）
  const RANGED_WEAPONS = { 3: true, 4: true, 13: true };

  // ========================================================
  // 珠子（装饰品）数据关联层
  // decoration.js：{ "id": { hex, slot, lv, dname, skip?, material:[{item,count}] } }
  // hex = 对应技能ID → 可用「技能 decId ↔ 珠子」双向关联
  // ========================================================
  const DECO = window.decoration_data || {};
  // hex(技能ID,大写2位) → [珠子条目, ...]
  const decoBySkillHex = {};
  // 珠子名 → 珠子条目
  const decoByName = {};
  Object.keys(DECO).forEach(function (id) {
    const d = DECO[id];
    if (!d || !d.dname) return;
    const entry = {
      id: Number(id),
      hex: d.hex,
      slot: d.slot,
      lv: d.lv || 1,
      dname: d.dname,
      skip: !!d.skip,
      material: Array.isArray(d.material) ? d.material : []
    };
    decoByName[d.dname] = entry;
    if (d.hex) {
      if (!decoBySkillHex[d.hex]) decoBySkillHex[d.hex] = [];
      decoBySkillHex[d.hex].push(entry);
    }
  });
  // 每个技能桶内按「等级 lv → 孔位 slot」排序
  Object.keys(decoBySkillHex).forEach(function (h) {
    decoBySkillHex[h].sort(function (a, b) {
      if (a.lv !== b.lv) return a.lv - b.lv;
      return a.slot - b.slot;
    });
  });

  // 罗马数字（珠子档位显示用）
  const ROMAN = { 1: '', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ', 5: 'Ⅴ' };

  // 弹窗函数桥接：openSkillModal 定义在 DOMContentLoaded 内，
  // 这里放一个顶层引用，供 openDecoModal（顶层）调用。
  let _openSkillModal = null;

  // 取某技能（十进制ID）可用的珠子列表
  function decosForSkill(decId) {
    const hex = decToHex(decId);
    return (hex && decoBySkillHex[hex]) ? decoBySkillHex[hex] : [];
  }

  // 构造「可用珠子」区块 DOM
  // opts.compact=true 时仅列名字；否则带孔位/等级
  function buildDecoSection(decId, opts) {
    opts = opts || {};
    const list = decosForSkill(decId);
    if (!list.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'deco-section';

    const head = document.createElement('div');
    head.className = 'deco-head';
    head.innerHTML = '<span class="deco-icon">🔮</span>可用珠子 ' +
      '<span class="deco-count">' + list.length + '</span>';
    wrap.appendChild(head);

    const items = document.createElement('div');
    items.className = 'deco-items';
    list.forEach(function (d) {
      const chip = document.createElement('button');
      chip.className = 'deco-chip';
      chip.setAttribute('data-deco-name', d.dname);
      let label = d.dname;
      // 名称已含【孔位】；附加 Lv 标记（若 lv>1）
      chip.innerHTML = escapeHtml(label) +
        (d.lv > 1 ? '<span class="deco-lv">Lv' + d.lv + '</span>' : '');
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        openDecoModal(d.id);
      });
      items.appendChild(chip);
    });
    wrap.appendChild(items);
    return wrap;
  }


  // 武器标签高亮色（对照 lua WEAPON_LABEL_COLOR）
  const WEAPON_LABEL_COLOR = 'FFC000';

  function weaponName(id) {
    return WEAPON_NAMES[id] || null;
  }

  function isRangedWeapon(id) {
    return id != null && RANGED_WEAPONS[id] === true;
  }

  // ========================================================
  // 通用工具
  // ========================================================

  // 颜色替换：<COLOR FFC000>…</COLOR> → <span class="color-highlight">…</span>
  // 使用通用十六进制颜色匹配，避免写死单一颜色值
  function formatText(text) {
    if (text == null) return '';
    if (typeof text !== 'string') text = String(text);
    return text
      .replace(/\\n/g, '\n')
      .replace(/<COLOR\s+[0-9a-fA-F]+>/gi, '<span class="color-highlight">')
      .replace(/<\/COLOR>/gi, '</span>')
      .replace(/\n/g, '<br>');
  }

  // 从「字符串」或「对象 {text:...}」中取文本（对照 lua 取 .text 的逻辑）
  function getLineText(item) {
    if (item == null) return null;
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item.text != null) return String(item.text);
    return null;
  }

  // 取行内定义的换行宽度（对象里的 wrap_width）
  function getLineWrapWidth(item) {
    if (item && typeof item === 'object') {
      const w = Number(item.wrap_width);
      if (!isNaN(w) && w > 0) return w;
    }
    return null;
  }

  // 模板替换 {key}（对照 lua expand_template_text）
  function expandTemplateText(text, values) {
    if (typeof text !== 'string') return text;
    if (!values || typeof values !== 'object') return text;
    return text.replace(/\{([\w_]+)\}/g, (m, key) =>
      values[key] !== undefined ? String(values[key]) : '{' + key + '}'
    );
  }

  function expandTemplateLines(lines, values) {
    if (!Array.isArray(lines)) return null;
    return lines.map((line) => expandTemplateText(line, values));
  }

  // 模板行是否含变量（对照 lua template_line_has_variable）
  function templateLineHasVariable(line) {
    let text = line;
    if (line && typeof line === 'object') text = line.text;
    return typeof text === 'string' && /\{[\w_]+\}/.test(text);
  }

  // 判断一个对象是否是「按索引存放的行表」（对照 lua is_indexed_line_table）
  // 关键：数组（数组形式）不算 indexed 表，对象（数字/字符串索引键）才算
  function isIndexedLineTable(lines) {
    if (!lines || typeof lines !== 'object' || Array.isArray(lines)) return false;
    for (const key of Object.keys(lines)) {
      if (/^\d+$/.test(key)) return true;
      if (/^[Ll]v\s*\d+$/.test(key) || /^[Ll]evel\s*\d+$/.test(key)) return true;
    }
    return false;
  }

  // 从 indexed 行表里按等级索引取行（对照 lua indexed_line）
  function indexedLine(lines, levelIndex) {
    if (!lines || typeof lines !== 'object' || levelIndex == null) return null;
    const cands = [
      lines[levelIndex],
      lines[String(levelIndex)],
      lines['Lv' + levelIndex],
      lines['lv' + levelIndex],
      lines['level' + levelIndex]
    ];
    for (const c of cands) if (c !== undefined) return c;
    return null;
  }

  // indexed 行表里最大等级（对照 lua indexed_line_count）
  function indexedLineCount(lines) {
    if (!lines || typeof lines !== 'object') return 0;
    let max = 0;
    for (const key of Object.keys(lines)) {
      let n = Number(key);
      if (isNaN(n)) {
        const m = key.match(/[Ll]v\s*(\d+)/) || key.match(/[Ll]evel\s*(\d+)/);
        n = m ? Number(m[1]) : NaN;
      }
      if (!isNaN(n) && n > max) max = n;
    }
    return max;
  }

  // 两个值是否相同（对照 lua same_value，按字符串比较）
  function sameValue(a, b) {
    if (a == null) a = '';
    if (b == null) b = '';
    return String(a) === String(b);
  }

  // ========================================================
  // 默认等级文本收集（处理 levels/default/levels_by_index/template）
  // 重要：levels_by_index / default_by_index 是「覆盖式」——
  //       只写被覆盖的等级，其余等级由游戏原文（此处以 null 表示）保留。
  // 返回 { textAt: {1-based idx: text}, maxIdx }
  // ========================================================
  function collectDefaultLevelTexts(entry) {
    const textAt = {};
    let maxIdx = 0;

    // 数组形式 levels
    if (Array.isArray(entry.levels)) {
      entry.levels.forEach((item, i) => {
        const t = getLineText(item);
        if (t != null) textAt[i + 1] = t;
        maxIdx = Math.max(maxIdx, i + 1);
      });
      return { textAt, maxIdx };
    }

    // 模板形式 template + values
    if (Array.isArray(entry.template)) {
      const values = entry.values || entry.default_values;
      if (values && typeof values === 'object') {
        entry.template.forEach((tpl, i) => {
          const t = expandTemplateText(tpl, values);
          if (t != null) textAt[i + 1] = t;
          maxIdx = Math.max(maxIdx, i + 1);
        });
        return { textAt, maxIdx };
      }
      if (Array.isArray(entry.default)) {
        entry.default.forEach((item, i) => {
          const t = getLineText(item);
          if (t != null) textAt[i + 1] = t;
          maxIdx = Math.max(maxIdx, i + 1);
        });
        return { textAt, maxIdx };
      }
    }

    // 数组形式 default
    if (Array.isArray(entry.default)) {
      entry.default.forEach((item, i) => {
        const t = getLineText(item);
        if (t != null) textAt[i + 1] = t;
        maxIdx = Math.max(maxIdx, i + 1);
      });
      return { textAt, maxIdx };
    }

    // 覆盖式：levels_by_index / default_by_index
    const byIndex = entry.default_by_index || entry.levels_by_index;
    if (byIndex && typeof byIndex === 'object' && !Array.isArray(byIndex)) {
      for (const key of Object.keys(byIndex)) {
        const idx = Number(key);
        if (isNaN(idx)) continue;
        const t = getLineText(byIndex[key]);
        if (t != null) textAt[idx] = t;
        maxIdx = Math.max(maxIdx, idx);
      }
    }

    return { textAt, maxIdx };
  }

  // ========================================================
  // 武器差分收集：对每种武器，算出「该武器独有的等级文本」
  // 返回 {
  //   diffs: { [1-based levelIdx]: Map<text, [weaponIds]> },   // 差异文本
  //   defaultWeapons: { [1-based levelIdx]: Set<weaponId> }    // 与默认文本相同（含未列出）的武器
  // }
  // 与原版一致：只有当武器文本与该等级「默认文本」不同时才算差分。
  // ========================================================
  function collectWeaponDiffs(entry, defaultTextAt) {
    const diffs = {};
    // 记录「模板技能」中，每个等级下，数值与默认一致的武器（用于给主文本补注武器名）
    const defaultWeapons = {};

    function pushDiff(levelIdx, text, weaponId) {
      if (text == null || isNaN(levelIdx)) return;
      const baseText = defaultTextAt[levelIdx];
      // 与默认文本相同 → 不算差分
      if (baseText != null && sameValue(text, baseText)) return;
      if (!diffs[levelIdx]) diffs[levelIdx] = new Map();
      const map = diffs[levelIdx];
      if (!map.has(text)) map.set(text, []);
      if (weaponId != null && !map.get(text).includes(weaponId)) {
        map.get(text).push(weaponId);
      }
    }

    // 专用于「template + weapon_values」技能：记录某等级下与默认值一致的武器
    function recordDefaultWeapon(levelIdx, text, weaponId) {
      if (text == null || isNaN(levelIdx) || weaponId == null) return;
      const baseText = defaultTextAt[levelIdx];
      if (baseText != null && sameValue(text, baseText)) {
        if (!defaultWeapons[levelIdx]) defaultWeapons[levelIdx] = new Set();
        defaultWeapons[levelIdx].add(weaponId);
      }
    }

    // ---- weapons_by_index: { weaponId: { levelIdx: text|{text} } }（1-based）----
    if (entry.weapons_by_index && typeof entry.weapons_by_index === 'object') {
      for (const widStr of Object.keys(entry.weapons_by_index)) {
        const wid = Number(widStr);
        const levelMap = entry.weapons_by_index[widStr];
        if (!levelMap || typeof levelMap !== 'object') continue;
        for (const idxStr of Object.keys(levelMap)) {
          const idx = Number(idxStr); // 1-based（对照 lua，武器 indexed 行按 1-based 索引）
          if (isNaN(idx)) continue;
          pushDiff(idx, getLineText(levelMap[idxStr]), wid);
        }
      }
    }

    // ---- weapons: { weaponId: [level1, level2, ...] }（数组，1-based）----
    if (entry.weapons && typeof entry.weapons === 'object') {
      for (const widStr of Object.keys(entry.weapons)) {
        const wid = Number(widStr);
        const arr = entry.weapons[widStr];
        if (Array.isArray(arr)) {
          arr.forEach((item, i) => pushDiff(i + 1, getLineText(item), wid));
        } else if (isIndexedLineTable(arr)) {
          for (const idxStr of Object.keys(arr)) {
            const idx = Number(idxStr);
            if (isNaN(idx)) continue;
            pushDiff(idx, getLineText(arr[idxStr]), wid);
          }
        }
      }
    }

    // ---- weapon_values: { weaponId: { key: value } }（配合 template）----
    if (Array.isArray(entry.template) && entry.weapon_values && typeof entry.weapon_values === 'object') {
      const values = entry.values || entry.default_values || {};
      for (const widStr of Object.keys(entry.weapon_values)) {
        const wid = Number(widStr);
        const wv = entry.weapon_values[widStr];
        if (!wv || typeof wv !== 'object') continue;
        entry.template.forEach((tpl, i) => {
          const text = expandTemplateText(tpl, Object.assign({}, values, wv));
          pushDiff(i + 1, text, wid);
          recordDefaultWeapon(i + 1, text, wid); // 记录"与默认值一致"的武器
        });
      }
    }

    // ---- ranged_by_index: { levelIdx: text|{text} }（按远程武器展开）----
    if (entry.ranged_by_index && typeof entry.ranged_by_index === 'object') {
      for (const idxStr of Object.keys(entry.ranged_by_index)) {
        const idx = Number(idxStr); // 1-based
        if (isNaN(idx)) continue;
        const text = getLineText(entry.ranged_by_index[idxStr]);
        if (text != null) {
          Object.keys(RANGED_WEAPONS).forEach((w) => pushDiff(idx, text, Number(w)));
        }
      }
    }

    // ---- ranged: [level1, level2, ...]（整数组对应远程）----
    if (Array.isArray(entry.ranged)) {
      entry.ranged.forEach((item, i) => {
        const text = getLineText(item);
        if (text != null) {
          Object.keys(RANGED_WEAPONS).forEach((w) => pushDiff(i + 1, text, Number(w)));
        }
      });
    }

    // ---- ranged_values: { key: value }（配合 template，按远程展开）----
    if (Array.isArray(entry.template) && entry.ranged_values && typeof entry.ranged_values === 'object') {
      const values = entry.values || entry.default_values || {};
      entry.template.forEach((tpl, i) => {
        const text = expandTemplateText(tpl, Object.assign({}, values, entry.ranged_values));
        if (text != null) {
          Object.keys(RANGED_WEAPONS).forEach((w) => pushDiff(i + 1, text, Number(w)));
        }
      });
    }

    // ---- 补齐「模板技能」中未列出的武器（它们使用默认值）----
    // 对于 template + weapon_values 技能，未被列出的武器 = 使用默认值，
    // 也应算作「默认文本对应的武器」，以便主文本补注武器名。
    if (Array.isArray(entry.template) && entry.weapon_values && typeof entry.weapon_values === 'object') {
      const listed = new Set(Object.keys(entry.weapon_values).map(Number));
      entry.template.forEach((tpl, i) => {
        const idx = i + 1;
        if (!defaultWeapons[idx]) defaultWeapons[idx] = new Set();
        for (let w = 0; w < 14; w++) {
          if (!listed.has(w)) defaultWeapons[idx].add(w);
        }
      });
    }

    return { diffs, defaultWeapons };
  }

  // 把武器 ID 数组转成「轻弩炮、重弩炮、弓」形式
  function weaponLabel(ids) {
    return ids.map((id) => WEAPON_NAMES[id] || `武器${id}`).join('、');
  }

  // 简单 HTML 转义
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ========================================================
  // 构建「详细版」内容（模组数据）
  // 返回一个文档片段容器
  // ========================================================
  function buildModContent(id, skill) {
    const wrap = document.createElement('div');
    wrap.className = 'card-body';

    const description = skill.description || skill.explain || '';
    const { textAt: defaultTextAt, maxIdx: defaultMax } = collectDefaultLevelTexts(skill);
    const { diffs, defaultWeapons } = collectWeaponDiffs(skill, defaultTextAt);

    // 描述
    if (description) {
      const descEl = document.createElement('div');
      descEl.className = 'skill-desc';
      descEl.innerHTML = formatText(description);
      wrap.appendChild(descEl);
    }

    // 等级列表
    const listEl = document.createElement('ul');
    listEl.className = 'levels-list';

    const diffMax = Object.keys(diffs).reduce((m, k) => Math.max(m, Number(k)), 0);
    const maxIdx = Math.max(defaultMax, diffMax);

    if (maxIdx === 0) {
      const empty = document.createElement('div');
      empty.className = 'level-item';
      empty.textContent = '（暂无等级说明）';
      wrap.appendChild(empty);
      return wrap;
    }

    for (let i = 1; i <= maxIdx; i++) {
      const mainText = defaultTextAt[i];
      const levelDiff = diffs[i];
      if (mainText == null && !levelDiff) continue;

      const li = document.createElement('li');
      li.className = 'level-item';

      let html = `<span class="level-tag">Lv${i}</span>`;
      if (mainText != null) {
        html += formatText(mainText);
        // 若该等级存在「默认值对应的武器」，且数量较少（≤7 把，即占少数），
        // 补注武器名，避免用户误解默认值归属；
        // 当默认武器 ≥8 把（占多数）时，默认已近似通用值，不再补注以免啰嗦。
        const dw = defaultWeapons[i];
        if (dw && dw.size && dw.size <= 7) {
          const names = weaponLabel(Array.from(dw).sort((a, b) => a - b));
          html += ` <span class="default-weapon-note">（${escapeHtml(names)}）</span>`;
        }
      } else if (!levelDiff) {
        html += '<span style="color:#7d8f9f;">（该等级沿用游戏原文）</span>';
      }
      li.innerHTML = html;

      // 武器差分
      if (levelDiff && levelDiff.size) {
        const diffWrap = document.createElement('div');
        diffWrap.className = 'weapon-diffs';
        levelDiff.forEach((weaponIds, text) => {
          const row = document.createElement('div');
          row.className = 'weapon-diff-row';
          row.innerHTML =
            `<span class="weapon-tag">⚔ ${escapeHtml(weaponLabel(weaponIds))}</span>` +
            formatText(text);
          diffWrap.appendChild(row);
        });
        li.appendChild(diffWrap);
      }

      listEl.appendChild(li);
    }

    if (!listEl.children.length) {
      const empty = document.createElement('div');
      empty.className = 'level-item';
      empty.textContent = '（暂无等级说明）';
      wrap.appendChild(empty);
    } else {
      wrap.appendChild(listEl);
    }

    return wrap;
  }

  // ========================================================
  // 构建「原文版」内容（游戏原文数据 gameEntry）
  // gameEntry: { desc, effect }
  // ========================================================
  function buildGameContent(gameEntry) {
    const wrap = document.createElement('div');
    wrap.className = 'card-body';

    // 功能介绍
    if (gameEntry.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'skill-desc';
      descEl.innerHTML = formatText(gameEntry.desc);
      wrap.appendChild(descEl);
    }

    // 等级说明
    const { levels } = parseGameEffect(gameEntry.effect);
    const levelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);

    if (levelKeys.length) {
      const listEl = document.createElement('ul');
      listEl.className = 'levels-list';
      levelKeys.forEach((lv) => {
        const li = document.createElement('li');
        li.className = 'level-item';
        li.innerHTML = `<span class="level-tag">Lv${lv}</span>` + formatText(levels[lv]);
        listEl.appendChild(li);
      });
      wrap.appendChild(listEl);
    } else if (gameEntry.effect) {
      const raw = document.createElement('div');
      raw.className = 'skill-desc';
      raw.innerHTML = formatText(String(gameEntry.effect).replace(/<[^>]+>/g, ' '));
      wrap.appendChild(raw);
    } else {
      const empty = document.createElement('div');
      empty.className = 'level-item';
      empty.textContent = '（该技能暂无游戏原文）';
      wrap.appendChild(empty);
    }

    return wrap;
  }

  // ========================================================
  // 渲染技能卡片
  // 三种情况：
  //   ① 有详细版 + 有原文版：显示切换按钮
  //   ② 仅有详细版：只显示详细版，无按钮
  //   ③ 仅有原文版（模组未收录的技能）：直接显示原文版，无按钮
  // 技能名：有详细版时用详细版名称，否则用游戏原文名称。
  // ========================================================
  function renderSkillCard(id, skill, gameEntry) {
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.setAttribute('data-skill-id', String(id)); // 供技能一览定位用

    // 决定显示名
    let displayName;
    if (skill) {
      const name = skill.name || `技能 ${id}`;
      displayName = skill.name_override || skill.title || skill.display_name || name;
    } else {
      displayName = (gameEntry && gameEntry.sname) || `技能 ${id}`;
    }

    const hasMod = !!skill;
    const hasGame = !!gameEntry;
    const both = hasMod && hasGame;

    // 标题（右侧：若两版都有则显示切换按钮）
    const titleEl = document.createElement('div');
    titleEl.className = 'skill-name';
    const titleLeft = document.createElement('span');
    titleLeft.className = 'skill-title-text';
    titleLeft.textContent = displayName;
    titleEl.appendChild(titleLeft);

    const titleRight = document.createElement('span');
    titleRight.className = 'skill-title-right';

    if (both) {
      const toggle = document.createElement('button');
      toggle.className = 'card-src-toggle';
      toggle.setAttribute('data-mode', 'mod');
      toggle.innerHTML = '<span class="src-label">📘 详细版</span>';
      titleRight.appendChild(toggle);
    } else if (!hasMod && hasGame) {
      // 仅原文版：加个小标记，说明该技能只有游戏原文
      const badge = document.createElement('span');
      badge.className = 'src-badge';
      badge.textContent = '🎮 原文';
      titleRight.appendChild(badge);
    }
    const idSpan = document.createElement('span');
    idSpan.className = 'skill-id';
    idSpan.textContent = '#' + String(id);
    titleRight.appendChild(idSpan);
    titleEl.appendChild(titleRight);
    card.appendChild(titleEl);

    // ---- 情况③：仅原文版 ----
    if (!hasMod && hasGame) {
      const gameContent = buildGameContent(gameEntry);
      gameContent.classList.add('src-game');
      card.appendChild(gameContent);
      // 可用珠子（挂在卡片最下方，不属于某版内容）
      const decoEl = buildDecoSection(id);
      if (decoEl) card.appendChild(decoEl);
      card._search = buildGameSearchText(id, gameEntry) + ' ' + buildDecoSearchText(id);
      return card;
    }

    // ---- 情况②/①：有详细版 ----
    const modContent = buildModContent(id, skill);
    modContent.classList.add('src-mod');
    card.appendChild(modContent);

    let gameContent = null;
    if (hasGame) {
      gameContent = buildGameContent(gameEntry);
      gameContent.classList.add('src-game');
      gameContent.style.display = 'none';
      card.appendChild(gameContent);
    }

    // 记录卡片搜索文本
    card._search = buildSearchText(id, skill) + (hasGame ? ' ' + buildGameSearchText(id, gameEntry) : '') + ' ' + buildDecoSearchText(id);

    // 可用珠子（挂在卡片最下方）
    const decoEl2 = buildDecoSection(id);
    if (decoEl2) card.appendChild(decoEl2);

    // 绑定卡片内切换（仅两版都有时）
    if (both) {
      card.dataset.hasToggle = '1';
      const btn = titleEl.querySelector('.card-src-toggle');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const toGame = btn.getAttribute('data-mode') === 'mod';
        if (toGame) {
          modContent.style.display = 'none';
          gameContent.style.display = '';
          btn.setAttribute('data-mode', 'game');
          btn.innerHTML = '<span class="src-label">🎮 原文版</span>';
        } else {
          modContent.style.display = '';
          gameContent.style.display = 'none';
          btn.setAttribute('data-mode', 'mod');
          btn.innerHTML = '<span class="src-label">📘 详细版</span>';
        }
      });
    }

    return card;
  }

  // ========================================================
  // 构建百龙技能内容（可复用于卡片与弹窗）
  // 结构：text / default / explain / description（字符串）
  //       + weapons / ranged / phials 差分
  // ========================================================
  function buildRampageContent(skill) {
    const wrap = document.createElement('div');
    wrap.className = 'card-body';

    // 基础文本
    let baseText = null;
    if (typeof skill.text === 'string') baseText = skill.text;
    else if (typeof skill.default === 'string') baseText = skill.default;
    else if (typeof skill.explain === 'string') baseText = skill.explain;
    else if (typeof skill.description === 'string') baseText = skill.description;

    // ---- 斩斧瓶类型差分（phials）----
    if (skill.phials && typeof skill.phials === 'object') {
      const nonSA = skill.non_switch_axe_text || skill.non_slash_axe_text;
      const headText = nonSA || baseText;
      if (headText) {
        const descEl = document.createElement('div');
        descEl.className = 'skill-desc';
        descEl.innerHTML = formatText(headText);
        wrap.appendChild(descEl);
      }

      const phialWrap = document.createElement('div');
      phialWrap.className = 'weapon-diffs';
      const labels = skill.phial_labels || {};
      Object.keys(skill.phials).forEach((phialKey) => {
        const text = skill.phials[phialKey];
        if (typeof text !== 'string') return;
        const row = document.createElement('div');
        row.className = 'weapon-diff-row';
        const label = labels[phialKey] || phialKey;
        row.innerHTML =
          `<span class="weapon-tag">⚗ ${escapeHtml(label)}</span>` + formatText(text);
        phialWrap.appendChild(row);
      });
      if (phialWrap.children.length) wrap.appendChild(phialWrap);
      return wrap;
    }

    // ---- 武器差分（weapons: { weaponId: "text" }）----
    if (skill.weapons && typeof skill.weapons === 'object') {
      if (baseText) {
        const descEl = document.createElement('div');
        descEl.className = 'skill-desc';
        descEl.innerHTML = formatText(baseText);
        wrap.appendChild(descEl);
      }
      const wWrap = document.createElement('div');
      wWrap.className = 'weapon-diffs';
      Object.keys(skill.weapons).forEach((widStr) => {
        const text = getLineText(skill.weapons[widStr]);
        if (text == null) return;
        const row = document.createElement('div');
        row.className = 'weapon-diff-row';
        row.innerHTML =
          `<span class="weapon-tag">⚔ ${escapeHtml(WEAPON_NAMES[Number(widStr)] || '武器' + widStr)}</span>` +
          formatText(text);
        wWrap.appendChild(row);
      });
      if (wWrap.children.length) wrap.appendChild(wWrap);
      return wrap;
    }

    // ---- 远程差分（ranged: "text"）----
    if (typeof skill.ranged === 'string') {
      if (baseText) {
        const descEl = document.createElement('div');
        descEl.className = 'skill-desc';
        descEl.innerHTML = formatText(baseText);
        wrap.appendChild(descEl);
      }
      const wWrap = document.createElement('div');
      wWrap.className = 'weapon-diffs';
      const row = document.createElement('div');
      row.className = 'weapon-diff-row';
      row.innerHTML =
        `<span class="weapon-tag">⚔ ${escapeHtml(weaponLabel([3, 4, 13]))}</span>` +
        formatText(skill.ranged);
      wWrap.appendChild(row);
      wrap.appendChild(wWrap);
      return wrap;
    }

    // ---- 普通文本 ----
    if (baseText != null) {
      const descEl = document.createElement('div');
      descEl.className = 'skill-desc';
      descEl.innerHTML = formatText(baseText);
      wrap.appendChild(descEl);
    }

    return wrap;
  }

  // ========================================================
  // 渲染百龙技能卡片
  // ========================================================
  function renderRampageCard(id, skill) {
    const displayName = skill.name_override || skill.title || skill.display_name || skill.name || `百龙技能 ${id}`;

    const card = document.createElement('div');
    card.className = 'skill-card rampage-card';
    card.setAttribute('data-rampage-id', String(id));

    const titleEl = document.createElement('div');
    titleEl.className = 'skill-name';
    titleEl.innerHTML =
      `<span>${escapeHtml(displayName)}</span>` +
      `<span class="skill-id">#${escapeHtml(String(id))}</span>`;
    card.appendChild(titleEl);

    card.appendChild(buildRampageContent(skill));
    card._search = buildSearchText(id, skill);
    return card;
  }

  // ========================================================
  // 渲染珠子卡片
  // ========================================================
  function renderDecoCard(d) {
    const card = document.createElement('div');
    card.className = 'skill-card deco-card';
    card.setAttribute('data-deco-id', String(d.id));

    // 标题行：珠子名 + 孔位/等级标记
    const titleEl = document.createElement('div');
    titleEl.className = 'skill-name';
    titleEl.innerHTML =
      '<span class="deco-title-text">' + escapeHtml(d.dname) + '</span>' +
      '<span class="skill-title-right">' +
        '<span class="deco-slot-badge">' + d.slot + '孔</span>' +
        (d.lv > 1 ? '<span class="deco-lv-badge">Lv' + d.lv + '</span>' : '') +
      '</span>';
    card.appendChild(titleEl);

    // 提供技能
    const gmeta = window.GAME_SKILL_DATA || {};
    const skEntry = d.hex ? gmeta[d.hex] : null;
    if (skEntry && skEntry.sname) {
      const skRow = document.createElement('div');
      skRow.className = 'deco-provide';
      skRow.innerHTML = '提供技能：<b>' + escapeHtml(skEntry.sname) + '</b>';
      card.appendChild(skRow);
    }

    // 必要素材
    if (d.material && d.material.length) {
      const matWrap = document.createElement('div');
      matWrap.className = 'deco-materials';
      const head = document.createElement('div');
      head.className = 'deco-mat-head';
      head.textContent = '必要素材';
      matWrap.appendChild(head);
      const ul = document.createElement('ul');
      ul.className = 'deco-mat-list';
      d.material.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'deco-mat-item';
        li.innerHTML = '<span class="deco-mat-name">' + escapeHtml(m.item) + '</span>' +
          '<span class="deco-mat-count">×' + m.count + '</span>';
        ul.appendChild(li);
      });
      matWrap.appendChild(ul);
      card.appendChild(matWrap);
    }

    card._search = buildSingleDecoSearchText(d);

    // 点击卡片 → 打开珠子弹窗
    card.addEventListener('click', function () { openDecoModal(d.id); });

    return card;
  }

  // ========================================================
  // 搜索索引
  // ========================================================
  function buildSearchText(id, skill) {
    const parts = [String(id), skill.name || ''];
    const push = (v) => {
      const t = getLineText(v);
      if (typeof t === 'string') parts.push(t);
    };

    ['description', 'text', 'explain'].forEach((k) => {
      if (typeof skill[k] === 'string') parts.push(skill[k]);
    });
    if (Array.isArray(skill.levels)) skill.levels.forEach(push);
    if (Array.isArray(skill.default)) skill.default.forEach(push);
    if (Array.isArray(skill.template)) skill.template.forEach((t) => parts.push(t));
    if (Array.isArray(skill.ranged)) skill.ranged.forEach(push);

    ['levels_by_index', 'default_by_index', 'ranged_by_index'].forEach((k) => {
      if (skill[k] && typeof skill[k] === 'object') Object.values(skill[k]).forEach(push);
    });
    ['weapons', 'weapons_by_index'].forEach((k) => {
      if (skill[k] && typeof skill[k] === 'object') {
        Object.values(skill[k]).forEach((v) => {
          if (Array.isArray(v)) v.forEach(push);
          else if (v && typeof v === 'object') Object.values(v).forEach(push);
          else push(v);
        });
      }
    });
    if (skill.phials && typeof skill.phials === 'object') {
      Object.values(skill.phials).forEach((t) => parts.push(t));
      if (skill.phial_labels) Object.values(skill.phial_labels).forEach((t) => parts.push(t));
      if (skill.non_switch_axe_text) parts.push(skill.non_switch_axe_text);
    }

    return parts.filter((p) => typeof p === 'string').join(' ').toLowerCase();
  }

  // ========================================================
  // 游戏原文版（skill_data.js）相关
  // ========================================================

  // 模组数据用「十进制 ID」，游戏原文用「2 位大写 HEX ID」。
  // 二者对应关系：hex = 十进制 → 16 进制（补零到 2 位，大写）。
  function decToHex(decId) {
    const n = Number(decId);
    if (isNaN(n)) return null;
    return n.toString(16).toUpperCase().padStart(2, '0');
  }

  // 从 <ul><li>LvN. xxx</li>…</ul> 中解析出各级文本
  // 返回 { levels: { 1: 'xxx', 2: 'yyy' }, raw: '原始HTML' }
  function parseGameEffect(effectHtml) {
    const levels = {};
    if (typeof effectHtml !== 'string') return { levels, raw: '' };
    const liRe = /<li>\s*Lv\s*(\d+)\s*[.、．]\s*([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(effectHtml)) !== null) {
      const lv = Number(m[1]);
      // 去掉内部残留标签、压缩空白
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) levels[lv] = text;
    }
    return { levels, raw: effectHtml };
  }

  // 构建游戏原文版的搜索文本
  function buildGameSearchText(decId, gameEntry) {
    const parts = [String(decId), decToHex(decId) || '', gameEntry.sname || '', gameEntry.desc || ''];
    const { levels } = parseGameEffect(gameEntry.effect);
    Object.values(levels).forEach((t) => parts.push(t));
    return parts.filter((x) => typeof x === 'string').join(' ').toLowerCase();
  }

  // ========================================================
  // 珠子相关：搜索文本 + 弹窗
  // ========================================================

  // 某技能可用的珠子 → 搜索文本（珠子名 + 素材名 + 孔位/等级）
  function buildDecoSearchText(decId) {
    const list = decosForSkill(decId);
    const parts = [];
    list.forEach((d) => {
      parts.push(d.dname);
      parts.push(String(d.slot) + '孔');
      parts.push('Lv' + d.lv);
      (d.material || []).forEach((m) => parts.push(m.item));
    });
    return parts.join(' ').toLowerCase();
  }

  // 单颗珠子的搜索文本
  function buildSingleDecoSearchText(d) {
    const parts = [String(d.id), d.dname, String(d.slot) + '孔', 'Lv' + d.lv];
    (d.material || []).forEach((m) => parts.push(m.item));
    return parts.join(' ').toLowerCase();
  }

  // 打开珠子详情弹窗：显示孔位 / 等级 / 提供技能 / 必要素材
  function openDecoModal(decoId) {
    const d = DECO[decoId];
    if (!d) return;
    const entry = decoByName[d.dname] || {
      id: Number(decoId), hex: d.hex, slot: d.slot, lv: d.lv || 1,
      dname: d.dname, skip: !!d.skip, material: Array.isArray(d.material) ? d.material : []
    };

    const overlay = document.getElementById('skillModal'); // 复用同一个弹窗容器
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    if (!overlay || !titleEl || !bodyEl) return;

    titleEl.innerHTML = escapeHtml(entry.dname) +
      '<span class="skill-id">🔮</span>';
    bodyEl.innerHTML = '';

    // 基本信息行
    const info = document.createElement('div');
    info.className = 'deco-modal-info';
    info.innerHTML =
      '<span class="deco-tag">孔位 ' + entry.slot + '</span>' +
      '<span class="deco-tag">等级 Lv' + entry.lv + '</span>';
    bodyEl.appendChild(info);

    // 提供的技能（hex → 技能名）—— 可点击跳转到技能详情
    const gmeta = window.GAME_SKILL_DATA || {};
    const skEntry = entry.hex ? gmeta[entry.hex] : null;
    if (skEntry) {
      const decId = parseInt(entry.hex, 16); // hex → 十进制技能ID
      const skRow = document.createElement('button');
      skRow.type = 'button';
      skRow.className = 'deco-modal-skill deco-skill-link';
      skRow.innerHTML = '提供技能：<b>' + escapeHtml(skEntry.sname || '') + '</b>' +
        ' <span class="deco-lv">Lv' + entry.lv + '</span>' +
        '<span class="deco-skill-go">查看技能 ▸</span>';
      skRow.addEventListener('click', function () {
        if (!isNaN(decId) && _openSkillModal) _openSkillModal(decId);
      });
      bodyEl.appendChild(skRow);
    }

    // 必要素材
    const matHead = document.createElement('div');
    matHead.className = 'deco-mat-head';
    matHead.textContent = '必要素材';
    bodyEl.appendChild(matHead);

    if (entry.material && entry.material.length) {
      const ul = document.createElement('ul');
      ul.className = 'deco-mat-list';
      entry.material.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'deco-mat-item';
        li.innerHTML = '<span class="deco-mat-name">' + escapeHtml(m.item) + '</span>' +
          '<span class="deco-mat-count">×' + m.count + '</span>';
        ul.appendChild(li);
      });
      bodyEl.appendChild(ul);
    } else {
      const empty = document.createElement('div');
      empty.className = 'level-item';
      empty.textContent = '（暂无素材数据）';
      bodyEl.appendChild(empty);
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ========================================================
  // 启动
  // ========================================================
  window.addEventListener('DOMContentLoaded', function () {
    if (!window.SKILL_DATA) {
      console.error('[mhrise-skill] 未找到 SKILL_DATA');
      const msg = '<div style="color:#f88;padding:1rem;">数据未加载，请检查 skillData.js</div>';
      document.getElementById('skillsContainer').innerHTML = msg;
      document.getElementById('rampageContainer').innerHTML = msg;
      return;
    }

    const data = window.SKILL_DATA;
    const skills = data.skills || {};
    const rampage = data.rampage_skills || {};

    const skillIds = Object.keys(skills).sort((a, b) => Number(a) - Number(b));
    const rampageIds = Object.keys(rampage).sort((a, b) => Number(a) - Number(b));

    const skillsContainer = document.getElementById('skillsContainer');
    const rampageContainer = document.getElementById('rampageContainer');

    // --------------------------------------------------------
    // 数据准备：模组详述版 + 游戏原文版（按 hex 关联）
    // 技能名统一使用详细版（模组数据）名称。
    // --------------------------------------------------------
    const hasGame = !!window.GAME_SKILL_DESC;
    const gameDesc = window.GAME_SKILL_DESC || {};

    // 每个普通技能：找到它对应的游戏原文（dec → hex）
    const skillCards = skillIds.map((id) => {
      const hex = decToHex(id);
      const gameEntry = (hasGame && hex && gameDesc[hex]) ? gameDesc[hex] : null;
      const el = renderSkillCard(id, skills[id], gameEntry);
      return { id, el, search: el._search || buildSearchText(id, skills[id]) };
    });

    // 补上「游戏原文有、但模组详述版没有」的技能（仅原文版卡片）
    const modDecSet = new Set(skillIds.map(Number));
    const gameOnlyCards = [];
    if (hasGame) {
      Object.keys(gameDesc)
        .map((hex) => ({ hex, dec: parseInt(hex, 16), entry: gameDesc[hex] }))
        .filter((g) => !isNaN(g.dec) && !modDecSet.has(g.dec))
        .sort((a, b) => a.dec - b.dec)
        .forEach((g) => {
          const id = String(g.dec);
          const el = renderSkillCard(id, null, g.entry);
          gameOnlyCards.push({ id, el, search: el._search || buildGameSearchText(id, g.entry) });
        });
    }

    const rampageCards = rampageIds.map((id) => ({
      id,
      el: renderRampageCard(id, rampage[id]),
      search: buildSearchText(id, rampage[id])
    }));

    // --------------------------------------------------------
    // 珠子卡片（decoration.js）
    // --------------------------------------------------------
    const decoContainer = document.getElementById('decoContainer');
    const decoIds = Object.keys(DECO).sort((a, b) => Number(a) - Number(b));
    const decoCards = decoIds.map((id) => {
      const d = decoByName[DECO[id].dname] || null;
      if (!d) return null;
      const el = renderDecoCard(d);
      return { id: String(id), el, search: el._search || '' };
    }).filter(Boolean);

    // 合并所有「普通技能」卡片，并按技能 ID 统一排序（详述版与仅原文版混排）
    const allSkillCards = skillCards.concat(gameOnlyCards)
      .sort((a, b) => Number(a.id) - Number(b.id));

    // 挂到 DOM
    allSkillCards.forEach((it) => skillsContainer.appendChild(it.el));
    rampageCards.forEach((it) => rampageContainer.appendChild(it.el));
    if (decoContainer) decoCards.forEach((it) => decoContainer.appendChild(it.el));

    // --------------------------------------------------------
    // 珠子区块折叠（默认折叠，避免页面过长）
    // --------------------------------------------------------
    const decoCollapseState = { collapsed: true };
    (function setupDecoCollapse() {
      const titleEl = document.getElementById('decoSectionTitle');
      const contEl = document.getElementById('decoContainer');
      const toggleEl = document.getElementById('decoSectionToggle');
      if (!titleEl || !contEl) return;
      function apply() {
        contEl.style.display = decoCollapseState.collapsed ? 'none' : '';
        if (toggleEl) toggleEl.textContent = decoCollapseState.collapsed ? '（点击展开 ▼）' : '（点击收起 ▲）';
      }
      titleEl.addEventListener('click', function () {
        decoCollapseState.collapsed = !decoCollapseState.collapsed;
        apply();
      });
      window.__applyDecoCollapse = apply;
      apply();
    })();

    // --------------------------------------------------------
    // 技能一览（按分类分组的目录）
    // --------------------------------------------------------
    (function buildCatalog() {
      const body = document.getElementById('catalogBody');
      const head = document.getElementById('catalogHead');
      const catalog = document.getElementById('catalog');
      if (!body || !head || !catalog) return;

      // 分类顺序（与游戏内大致一致）
      const CAT_ORDER = ['攻击', '会心', '属性', '异常', '锋利度', '远程',
        '身体性能', '防御', '回复', '拔纳', '特殊', '其他'];
      const UNTAGGED = '未分类';

      const gameMeta = window.GAME_SKILL_DATA || {};
      // 建立 decId -> { name, cats } 的映射
      const infoById = {};
      // 先放详述版技能名（优先详细版名称）
      allSkillCards.forEach((it) => {
        const id = Number(it.id);
        const sk = skills[it.id];
        let name = null;
        if (sk) name = sk.name_override || sk.title || sk.display_name || sk.name;
        if (!name) {
          const hex = decToHex(id);
          name = (hex && gameMeta[hex] && gameMeta[hex].sname) || ('技能 ' + id);
        }
        infoById[id] = { name: name, cats: [] };
      });
      // 补上分类（从 GAME_SKILL_DATA 的 tag 取）
      allSkillCards.forEach((it) => {
        const id = Number(it.id);
        const hex = decToHex(id);
        const meta = hex ? gameMeta[hex] : null;
        let cats = (meta && Array.isArray(meta.tag)) ? meta.tag.slice() : [];
        if (!cats.length) cats = [UNTAGGED];
        infoById[id].cats = cats;
      });

      // 按分类聚合
      const groups = {};
      Object.keys(infoById).forEach((idStr) => {
        const id = Number(idStr);
        const info = infoById[idStr];
        info.cats.forEach((c) => {
          if (!groups[c]) groups[c] = [];
          groups[c].push({ id: id, name: info.name });
        });
      });
      // 组内按 ID 排序
      Object.keys(groups).forEach((c) => groups[c].sort((a, b) => a.id - b.id));

      // 输出顺序：先按预设顺序，再补剩余的
      const finalOrder = CAT_ORDER.filter((c) => groups[c])
        .concat(Object.keys(groups).filter((c) => !CAT_ORDER.includes(c)));

      finalOrder.forEach((cat) => {
        const list = groups[cat];
        const groupEl = document.createElement('div');
        groupEl.className = 'catalog-group';

        const catEl = document.createElement('div');
        catEl.className = 'catalog-cat';
        catEl.innerHTML = `${escapeHtml(cat)} <span class="cat-count">${list.length}</span>`;
        groupEl.appendChild(catEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'catalog-items';
        list.forEach((item) => {
          const b = document.createElement('button');
          b.className = 'catalog-item';
          b.textContent = item.name;
          b.setAttribute('data-target', String(item.id));
          b.addEventListener('click', () => jumpToSkill(item.id));
          itemsEl.appendChild(b);
        });
        groupEl.appendChild(itemsEl);
        body.appendChild(groupEl);
      });

      // 折叠/展开
      head.addEventListener('click', () => {
        catalog.classList.toggle('collapsed');
      });
      // 默认展开，小屏（手机）默认折叠
      if (window.innerWidth < 600) catalog.classList.add('collapsed');
    })();

    // --------------------------------------------------------
    // 百龙技能一览（按名称特征分组的目录）
    // --------------------------------------------------------
    (function buildRamCatalog() {
      const body = document.getElementById('ramCatalogBody');
      const head = document.getElementById('ramCatalogHead');
      const catalog = document.getElementById('ramCatalog');
      if (!body || !head || !catalog) return;

      // 根据技能名归类
      function catOf(name) {
        if (/之魂$/.test(name)) return '龙之魂';
        if (/特效$/.test(name)) return '对怪物特效';
        if (/(打磨术|激化|演奏|强化|持续|变形|炮|蓄击|强走|一击|钻研|加倍|活性|防御重击)/.test(name)) {
          return '能力强化';
        }
        return '其他';
      }
      const CAT_ORDER = ['能力强化', '对怪物特效', '龙之魂', '其他'];

      const groups = {};
      rampageIds.forEach((id) => {
        const skill = rampage[id];
        const name = skill.name_override || skill.title || skill.display_name || skill.name || ('百龙技能 ' + id);
        const c = catOf(name);
        if (!groups[c]) groups[c] = [];
        groups[c].push({ id: id, name: name });
      });

      const finalOrder = CAT_ORDER.filter((c) => groups[c])
        .concat(Object.keys(groups).filter((c) => !CAT_ORDER.includes(c)));

      finalOrder.forEach((cat) => {
        const list = groups[cat];
        const groupEl = document.createElement('div');
        groupEl.className = 'catalog-group';

        const catEl = document.createElement('div');
        catEl.className = 'catalog-cat';
        catEl.innerHTML = `${escapeHtml(cat)} <span class="cat-count">${list.length}</span>`;
        groupEl.appendChild(catEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'catalog-items';
        list.forEach((item) => {
          const b = document.createElement('button');
          b.className = 'catalog-item';
          b.textContent = item.name;
          b.setAttribute('data-rampage-target', String(item.id));
          b.addEventListener('click', () => openRampageModal(item.id));
          itemsEl.appendChild(b);
        });
        groupEl.appendChild(itemsEl);
        body.appendChild(groupEl);
      });

      head.addEventListener('click', () => {
        catalog.classList.toggle('collapsed');
      });
      // 默认展开，小屏（手机）默认折叠
      if (window.innerWidth < 600) catalog.classList.add('collapsed');
    })();

    // --------------------------------------------------------
    // 珠子一览（按孔位分组的目录）
    // --------------------------------------------------------
    (function buildDecoCatalog() {
      const body = document.getElementById('decoCatalogBody');
      const head = document.getElementById('decoCatalogHead');
      const catalog = document.getElementById('decoCatalog');
      if (!body || !head || !catalog) return;

      const SLOT_ORDER = [1, 2, 3, 4];
      const groups = {};
      decoCards.forEach((it) => {
        const d = decoByName[DECO[it.id] && DECO[it.id].dname];
        if (!d) return;
        const c = d.slot + '孔';
        if (!groups[c]) groups[c] = [];
        groups[c].push({ id: d.id, name: d.dname, lv: d.lv });
      });

      SLOT_ORDER.forEach((slot) => {
        const key = slot + '孔';
        const list = groups[key];
        if (!list) return;
        list.sort((a, b) => (a.lv - b.lv) || (a.id - b.id));

        const groupEl = document.createElement('div');
        groupEl.className = 'catalog-group';

        const catEl = document.createElement('div');
        catEl.className = 'catalog-cat';
        catEl.innerHTML = `${escapeHtml(key)} <span class="cat-count">${list.length}</span>`;
        groupEl.appendChild(catEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'catalog-items';
        list.forEach((item) => {
          const b = document.createElement('button');
          b.className = 'catalog-item';
          b.textContent = item.name;
          b.setAttribute('data-deco-target', String(item.id));
          b.addEventListener('click', () => openDecoModal(item.id));
          itemsEl.appendChild(b);
        });
        groupEl.appendChild(itemsEl);
        body.appendChild(groupEl);
      });

      head.addEventListener('click', () => {
        catalog.classList.toggle('collapsed');
      });
      if (window.innerWidth < 600) catalog.classList.add('collapsed');
    })();

    // --------------------------------------------------------
    // 搜索
    // --------------------------------------------------------
    const searchInput = document.getElementById('searchInput');
    const searchCount = document.getElementById('searchCount');

    function applyFilter(keyword) {
      const kw = (keyword || '').trim().toLowerCase();
      let skillHits = 0;
      let rampageHits = 0;
      let decoHits = 0;

      allSkillCards.forEach((item) => {
        const hit = !kw || item.search.includes(kw);
        item.el.style.display = hit ? '' : 'none';
        if (hit) skillHits++;
      });
      rampageCards.forEach((item) => {
        const hit = !kw || item.search.includes(kw);
        item.el.style.display = hit ? '' : 'none';
        if (hit) rampageHits++;
      });
      decoCards.forEach((item) => {
        const hit = !kw || item.search.includes(kw);
        item.el.style.display = hit ? '' : 'none';
        if (hit) decoHits++;
      });

      // 搜索珠子时，自动展开珠子区块（方便看到结果）；清空时恢复折叠状态
      if (kw && decoHits > 0) {
        decoCollapseState.collapsed = false;
        if (window.__applyDecoCollapse) window.__applyDecoCollapse();
      } else if (!kw) {
        // 清空搜索 → 恢复默认折叠
        decoCollapseState.collapsed = true;
        if (window.__applyDecoCollapse) window.__applyDecoCollapse();
      }

      if (!kw) {
        searchCount.textContent = '';
      } else {
        searchCount.textContent = `普通 ${skillHits} · 百龙 ${rampageHits} · 珠子 ${decoHits}`;
      }

      document.querySelectorAll('.skill-section').forEach((sec) => {
        const hasVisible = sec.querySelector('.skill-card:not([style*="display: none"])');
        sec.style.display = hasVisible ? '' : 'none';
      });
    }

    // 点击技能一览里的技能 → 弹窗显示效果
    function jumpToSkill(id) {
      openSkillModal(id);
    }

    // 打开技能详情弹窗：显示该技能的「详细版 / 原文版」内容
    function openSkillModal(id) {
      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      const sk = skills[id];
      const hex = decToHex(id);
      const gameEntry = (hasGame && hex && gameDesc[hex]) ? gameDesc[hex] : null;

      // 标题（名称 + ID）
      let name;
      if (sk) {
        name = sk.name_override || sk.title || sk.display_name || sk.name || ('技能 ' + id);
      } else {
        name = (gameEntry && gameEntry.sname) || ('技能 ' + id);
      }
      titleEl.innerHTML = `${escapeHtml(name)}<span class="skill-id">#${escapeHtml(String(id))}</span>`;

      // 内容
      bodyEl.innerHTML = '';
      const hasMod = !!sk;
      const hasGameEntry = !!gameEntry;

      if (hasMod && hasGameEntry) {
        // 两版都有：加切换按钮
        const switchRow = document.createElement('div');
        switchRow.className = 'modal-switch';
        const btnMod = document.createElement('button');
        btnMod.textContent = '📘 详细版';
        btnMod.className = 'active';
        const btnGame = document.createElement('button');
        btnGame.textContent = '🎮 原文版';
        switchRow.appendChild(btnMod);
        switchRow.appendChild(btnGame);
        bodyEl.appendChild(switchRow);

        const modEl = buildModContent(id, sk);
        const gameEl = buildGameContent(gameEntry);
        gameEl.style.display = 'none';
        bodyEl.appendChild(modEl);
        bodyEl.appendChild(gameEl);

        btnMod.addEventListener('click', () => {
          modEl.style.display = '';
          gameEl.style.display = 'none';
          btnMod.classList.add('active');
          btnGame.classList.remove('active');
        });
        btnGame.addEventListener('click', () => {
          modEl.style.display = 'none';
          gameEl.style.display = '';
          btnGame.classList.add('active');
          btnMod.classList.remove('active');
        });
      } else if (hasMod) {
        bodyEl.appendChild(buildModContent(id, sk));
      } else if (hasGameEntry) {
        bodyEl.appendChild(buildGameContent(gameEntry));
      } else {
        const empty = document.createElement('div');
        empty.className = 'level-item';
        empty.textContent = '（暂无说明）';
        bodyEl.appendChild(empty);
      }

      // 可用珠子（弹窗底部，独立于详细版/原文版内容）
      const decoSec = buildDecoSection(id);
      if (decoSec) bodyEl.appendChild(decoSec);

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    // 桥接给顶层 openDecoModal 使用（珠子→技能跳转）
    _openSkillModal = openSkillModal;

    function closeSkillModal() {
      const overlay = document.getElementById('skillModal');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    // 打开百龙技能详情弹窗
    function openRampageModal(id) {
      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      const skill = rampage[id];
      if (!skill) return;
      const name = skill.name_override || skill.title || skill.display_name || skill.name || ('百龙技能 ' + id);

      titleEl.innerHTML =
        `<span class="modal-title-icon">🐉</span>` +
        `${escapeHtml(name)}<span class="skill-id">#${escapeHtml(String(id))}</span>`;

      bodyEl.innerHTML = '';
      bodyEl.appendChild(buildRampageContent(skill));

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    // 弹窗关闭：点关闭按钮 / 点遮罩 / 按 ESC
    (function bindModalClose() {
      const overlay = document.getElementById('skillModal');
      const closeBtn = document.getElementById('modalClose');
      if (closeBtn) closeBtn.addEventListener('click', closeSkillModal);
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeSkillModal();
        });
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSkillModal();
      });
    })();

    // --------------------------------------------------------
    // 回到顶部按钮
    // --------------------------------------------------------
    (function bindBackTop() {
      const btn = document.getElementById('backTop');
      if (!btn) return;
      btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      const onScroll = () => {
        if (window.scrollY > 300) btn.classList.add('show');
        else btn.classList.remove('show');
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    })();

    if (searchInput) {
      searchInput.addEventListener('input', (e) => applyFilter(e.target.value));
    }

    // 统计
    const toggleCount = skillCards.filter((it) => it.el.dataset.hasToggle === '1').length;

    console.log(
      '[mhrise-skill] 渲染完成 | 详述版技能:', skillCards.length,
      '(可切换原文:', toggleCount, ') | 仅原文版技能:', gameOnlyCards.length,
      '| 百龙技能:', rampageIds.length
    );
  });
})();