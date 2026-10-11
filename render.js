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
  // 同理：百龙珠详情弹窗（供 buildRamDecoSection 顶层调用）
  let _openRamDecoModal = null;
  // 怪物详情弹窗（供素材行点击调用）
  let _openMonsterModal = null;
  // 素材详情弹窗（供"无怪物掉落"的素材点击调用）
  let _openItemModal = null;
  // 任务详情弹窗（供任务卡片 / 怪物弹窗里的任务列表调用）
  let _openQuestModal = null;

  // 弹窗历史栈（支持"返回上一级"）
  const _modalStack = [];
  // 关闭整个弹窗时清栈用
  let _clearModalStack = null;
  // 顶层桥接：记录弹窗跳转（供顶层 openDecoModal 等调用）
  let _pushHist = null;
  // 顶层桥接：按百龙技能名打开弹窗（供顶层 buildRamDecoSection 用）
  let _openRampageById = null;
  // 当前打开的「怪物弹窗」上下文（返回时用来精准重开同一页）
  //   { monName, focusItem }
  let _curMonCtx = null;

  // ========================================================
  // items.js:     { "道具名": { desc, obtain:[{quest,type,count,rate}] } }
  // monsters.js:  { "怪物名": { materials:[{item,rank,way,part,count,rate}],
  //                            hitzones:[[...]], ailments:[[...]], quests:[[...]] } }
  // ========================================================
  const ITEMS = window.item_data || {};
  const MONSTERS = window.monster_data || {};
  // quests.js: { "任务id": {name,cat,star,full,desc,goal,fail,hrp,mrp,mons,supply} }
  const QUESTS = window.quest_data || {};
  // 任务分类顺序（Kiranico 网站顺序，下位→上位→大师→…）
  const QUEST_CAT_ORDER = [
    '村庄任务',
    '集会所任务 下位',
    '集会所任务 上位',
    '集会所任务 大师',
    '怪异任务',
    '盟友任务',
    '活动任务',
    '斗技大会任务',
    '训练任务',
  ];

  // 素材名 → [怪物名, ...]（按怪物→素材反向建索引）
  const monsterByMaterial = {};
  // 素材名 → { 怪物名: Set(等级) }（用于标记该素材在哪些难度可获得）
  const ranksByMaterial = {};
  Object.keys(MONSTERS).forEach(function (monName) {
    (MONSTERS[monName].materials || []).forEach(function (m) {
      if (!m.item) return;
      if (!monsterByMaterial[m.item]) monsterByMaterial[m.item] = [];
      if (monsterByMaterial[m.item].indexOf(monName) < 0) {
        monsterByMaterial[m.item].push(monName);
      }
      if (!ranksByMaterial[m.item]) ranksByMaterial[m.item] = {};
      if (!ranksByMaterial[m.item][monName]) ranksByMaterial[m.item][monName] = {};
      const _rk = normRank(m.rank, m.item);
      if (_rk) ranksByMaterial[m.item][monName][_rk] = true;
    });
  });

  // 等级排序 & 显示名
  const RANK_ORDER = ['下位', '上位', '大师等级', '怪异'];
  const RANK_SHORT = { '下位': '下', '上位': '上', '大师等级': '大师', '怪异': '怪异' };
  function rankKey(rank) {
    if (rank === '下位') return 'low';
    if (rank === '上位') return 'high';
    if (rank === '怪异') return 'anomaly';
    return 'master';
  }
  // 归一化等级：怪异素材名以「怪异化的」「破怪的」开头 → 归入「怪异」（原数据标的是「大师等级」）
  function normRank(rank, itemName) {
    if (/^(怪异化的|破怪的)/.test(String(itemName || ''))) return '怪异';
    return rank;
  }

  // 查某素材来自哪些怪物
  function monstersForMaterial(itemName) {
    return monsterByMaterial[itemName] || [];
  }

  // 查某素材（全局）可在哪些等级获得（合并所有怪物）
  function ranksForMaterial(itemName) {
    const per = ranksByMaterial[itemName];
    if (!per) return [];
    const set = {};
    Object.keys(per).forEach(function (n) {
      Object.keys(per[n]).forEach(function (r) { set[r] = true; });
    });
    return RANK_ORDER.filter(function (r) { return set[r]; });
  }

  // 查某怪物某素材的掉落明细（下位/上位/大师）
  function dropRows(monName, itemName) {
    const mon = MONSTERS[monName];
    if (!mon) return [];
    return (mon.materials || []).filter(function (m) {
      return m.item === itemName;
    });
  }

  // 某怪物的素材，按等级分组 → [{rank, items:[...]}, ...]
  function materialsByRank(monName) {
    const mon = MONSTERS[monName];
    if (!mon) return [];
    const groups = {};
    (mon.materials || []).forEach(function (m) {
      if (!m.item || !m.rank) return;
      const rk = normRank(m.rank, m.item);
      if (!groups[rk]) groups[rk] = [];
      if (groups[rk].indexOf(m.item) < 0) groups[rk].push(m.item);
    });
    return RANK_ORDER
      .filter(function (r) { return groups[r] && groups[r].length; })
      .map(function (r) { return { rank: r, items: groups[r] }; });
  }

  // 取某技能（十进制ID）可用的珠子列表
  function decosForSkill(decId) {
    const hex = decToHex(decId);
    return (hex && decoBySkillHex[hex]) ? decoBySkillHex[hex] : [];
  }

  // ========================================================
  // 百龙装饰品（百龙珠）关联层
  // rampage_decorations.js: [ { name, skill, slot, desc }, ... ]
  // 通过「百龙技能名」关联（无 ID 体系）
  // ========================================================
  const RAM_DECO = window.rampage_decorations || [];
  // 百龙技能名 → [百龙珠, ...]
  const ramDecoBySkill = {};
  RAM_DECO.forEach(function (d) {
    if (!d || !d.skill) return;
    if (!ramDecoBySkill[d.skill]) ramDecoBySkill[d.skill] = [];
    ramDecoBySkill[d.skill].push(d);
  });

  // 取某百龙技能名可用的百龙珠
  function ramDecosForSkill(skillName) {
    return (skillName && ramDecoBySkill[skillName]) ? ramDecoBySkill[skillName] : [];
  }

  // 构造「可用百龙珠」区块 DOM
  function buildRamDecoSection(skillName) {
    const list = ramDecosForSkill(skillName);
    if (!list.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'deco-section ram-deco-section';

    const head = document.createElement('div');
    head.className = 'deco-head';
    head.innerHTML = '<span class="deco-icon">🈶</span>可用百龙珠 ' +
      '<span class="deco-count">' + list.length + '</span>';
    wrap.appendChild(head);

    const items = document.createElement('div');
    items.className = 'deco-items';
    list.forEach(function (d) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'deco-chip ram-deco-chip';
      chip.textContent = d.name;
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        // 记录历史：返回时重开该百龙技能（按名称查 id）
        if (typeof _pushHist === 'function' && typeof _openRampageById === 'function') {
          _pushHist(function () { _openRampageById(skillName); });
        }
        if (_openRamDecoModal) _openRamDecoModal(d.name);
      });
      items.appendChild(chip);
    });
    wrap.appendChild(items);
    return wrap;
  }

  // 百龙珠的搜索文本
  function buildRamDecoSearchText(skillName) {
    const list = ramDecosForSkill(skillName);
    return list.map(function (d) { return d.name + ' ' + d.slot + '孔'; }).join(' ').toLowerCase();
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
        // 记录历史：返回时重开该技能
        if (typeof _pushHist === 'function' && _openSkillModal) {
          _pushHist(function () { _openSkillModal(Number(decId)); });
        }
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

    // 可用百龙珠（挂在卡片最下方）
    const ramDecoEl = buildRamDecoSection(displayName);
    if (ramDecoEl) card.appendChild(ramDecoEl);
    card._search += ' ' + buildRamDecoSearchText(displayName);

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
  // 渲染百龙珠卡片
  // ========================================================
  function renderRamDecoCard(d) {
    const card = document.createElement('div');
    card.className = 'skill-card rampage-card ram-deco-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'skill-name';
    titleEl.innerHTML =
      '<span class="deco-title-text">' + escapeHtml(d.name) + '</span>' +
      '<span class="skill-title-right">' +
        (d.descTpl ? '<span class="tpl-mark" title="说明为格式套用，非游戏原文">⚠️</span>' : '') +
        '<span class="deco-slot-badge">' + d.slot + '孔</span>' +
      '</span>';
    card.appendChild(titleEl);

    // 提供技能
    if (d.skill) {
      const skRow = document.createElement('div');
      skRow.className = 'deco-provide';
      skRow.innerHTML = '提供技能：<b>' + escapeHtml(d.skill) + '</b>';
      card.appendChild(skRow);
    }

    // 说明
    if (d.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'skill-desc ram-deco-desc';
      descEl.textContent = d.desc;
      card.appendChild(descEl);
    }

    card._search = (d.name + ' ' + (d.skill || '') + ' ' + d.slot + '孔 ' + (d.desc || '')).toLowerCase();

    // 点击卡片 → 打开百龙珠详情弹窗
    card.addEventListener('click', function () {
      if (_openRamDecoModal) _openRamDecoModal(d.name);
    });

    return card;
  }

  // ========================================================
  // 渲染怪物卡片（monsters.js）
  //   monName 怪物名, mon 数据
  // ========================================================
  function renderMonsterCard(monName, mon) {
    const card = document.createElement('div');
    card.className = 'skill-card monster-card mon-icon-card';

    // 图标（monster-icons/ 下的 64×64 png；由 monster_icons.js 提供映射）
    const iconMap = (typeof window !== 'undefined' && window.MONSTER_ICONS) || {};
    const iconFile = iconMap[monName];

    if (iconFile) {
      const im = document.createElement('img');
      im.className = 'mon-icon-img';
      im.loading = 'lazy';
      im.decoding = 'async';
      im.alt = monName;
      im.src = 'monster-icons/' + iconFile;
      card.appendChild(im);
    } else {
      // 没有图标时的兜底占位
      const ph = document.createElement('div');
      ph.className = 'mon-icon-img mon-icon-ph';
      ph.textContent = '?';
      card.appendChild(ph);
    }

    // 名字
    const titleEl = document.createElement('div');
    titleEl.className = 'mon-icon-name';
    titleEl.innerHTML = '<span class="deco-title-text">' + escapeHtml(monName) + '</span>';
    titleEl.title = monName;
    card.appendChild(titleEl);

    card._search = monName.toLowerCase();

    card.addEventListener('click', function () {
      if (_openMonsterModal) _openMonsterModal(monName);
    });

    return card;
  }

  // ========================================================
  // 任务卡片（quests.js）
  // ========================================================
  // 怪物名 → [任务id, ...]（任务里的怪物名和 monsters.js 基本一致）
  const questsByMonster = {};
  Object.keys(QUESTS).forEach(function (qid) {
    const q = QUESTS[qid];
    (q.mons || []).forEach(function (m) {
      if (!questsByMonster[m.name]) questsByMonster[m.name] = [];
      questsByMonster[m.name].push(qid);
    });
  });

  // monsters.js 里每个怪物的 quests[].quest 形如：
  //   "集会所 4★ 某夜，狩猎奇怪龙 Area 12 (60%) Area 2 (30%) (3%) (5%)"
  //   "活动任务 7★ 人鱼龙妖艳起舞 Area 7 (50%) ..."
  // 需要剥掉「分类前缀 + 星级」和「尾部区域/概率」，还原成 quests.js 里的任务名。
  function normalizeQuestLabel(s) {
    if (!s) return '';
    let t = String(s);
    // ① 尾部 "Area NN (NN%)"（可多个）
    t = t.replace(/(\s*Area\s*\d+\s*\(\d+%\))+/g, '');
    // ② 尾部孤立的 "(NN%)"（可多个）
    t = t.replace(/(\s*\(\d+%\))+/g, '');
    // ③ 前缀分类（注意 HTML 里可能出现「训 练」这种被插空格的写法）
    t = t.replace(/^(活动任务|斗技大会任务|怪异调查|怪异任务|村庄|集会所|大师等级|盟友|训练|怪异|斗技大会)\s*/, '');
    // ④ 残留星级 "7★ "
    t = t.replace(/^\d+\s*★\s*/, '');
    // ⑤ 去掉所有空白再比（兼容"训 练"这类插空格）
    return t.replace(/\s+/g, '').trim();
  }

  // 任务名 → id（同样去空白，保证匹配）
  const _questIdByNormName = {};
  Object.keys(QUESTS).forEach(function (qid) {
    const nm = (QUESTS[qid].name || '').replace(/\s+/g, '');
    if (nm && !_questIdByNormName[nm]) _questIdByNormName[nm] = qid;
  });

  // 由 monsters.js 的 quest 标签找出 quests.js 的 id
  function findQuestIdByLabel(label) {
    const key = normalizeQuestLabel(label);
    if (!key) return null;
    if (_questIdByNormName[key]) return _questIdByNormName[key];
    // 兜底：quests.js 里的名字可能带「村庄/集会所…」前缀，再宽松匹配一次
    const loose = key.replace(/^\d*★?/, '');
    if (_questIdByNormName[loose]) return _questIdByNormName[loose];
    return null;
  }

  // 由「任务名 + 本怪名 + 同名任务出现序号」找出 quests.js 的 id
  // 解决「同名任务多张地图」的歧义（如「来自彼方的凶星」有 水没林/熔岩洞/冰封群岛/沙原 4 场）
  //   ① 先取同名任务全部候选（按 ID 排序，与 Kiranico 页面顺序一致）
  //   ② 用「本怪是否在该候选任务的 mons 里」过滤
  //   ③ 若还多个 → 用序号（该怪 quests 里第几次出现）取对应候选
  const _questIdsByNormName = {};
  Object.keys(QUESTS).forEach(function (qid) {
    const nm = (QUESTS[qid].name || '').replace(/\s+/g, '');
    if (!nm) return;
    (_questIdsByNormName[nm] = _questIdsByNormName[nm] || []).push(qid);
  });

  function findQuestIdForMonster(label, monName, occurIndex) {
    const key = normalizeQuestLabel(label);
    if (!key) return null;

    let cands = _questIdsByNormName[key] || [];
    if (!cands.length) {
      const loose = key.replace(/^\d*★?/, '');
      cands = _questIdsByNormName[loose] || [];
    }
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];

    // ② 用「本怪是否在候选任务里」过滤（monName 可能是「怪异化」等形式，做宽松比对）
    let pool = cands;
    if (monName) {
      const base = function (s) { return String(s || '').replace(/[（(].*?[)）]/g, '').replace(/\s+/g, ''); };
      const bmon = base(monName);
      const filtered = cands.filter(function (qid) {
        const q = QUESTS[qid];
        if (!q || !q.mons) return false;
        return q.mons.some(function (m) {
          const b = base(m.name);
          return b === bmon || m.name === monName;
        });
      });
      if (filtered.length) pool = filtered;
    }
    if (pool.length === 1) return pool[0];

    // ③ 仍多个 → 用出现序号（该怪任务表里第几次遇到同名任务）
    if (typeof occurIndex === 'number' && occurIndex >= 0 && occurIndex < pool.length) {
      return pool[occurIndex];
    }
    return pool[0];
  }

  // 由「任务全名」（如「活动任务 7★ 影之迅龙」）找出 quests.js 的 id
  // 用于任务弹窗的「上一任务 / 下一任务」跳转
  function findQuestIdByName(fullName) {
    if (!fullName) return null;
    // ① 先用 full 字段精确匹配（含分类/星级前缀）
    const exact = String(fullName).replace(/\s+/g, '');
    let hit = null;
    Object.keys(QUESTS).forEach(function (qid) {
      if (hit) return;
      const f = (QUESTS[qid].full || '').replace(/\s+/g, '');
      if (f && f === exact) hit = qid;
    });
    if (hit) return hit;
    // ② 退一步：用 normalizeQuestLabel 剥前缀后按任务名匹配
    return findQuestIdByLabel(fullName);
  }

  // 地图编号 → 地图名（映射表见 quest_maps.js；未收录则回退「Area N」）
  function questMapName(mapNo) {
    const m = (typeof window !== 'undefined' && window.QUEST_MAPS) || {};
    const nm = m[mapNo] || m[String(mapNo)];
    return nm ? nm : 'Area ' + mapNo;
  }

  // 活动任务的「位阶」判定（Kiranico 不提供该字段，按游戏内规则推断）：
  //   ① 百龙夜行：地图为翡叶要塞（mapNo 7）或名称含「百龙」
  //   ② 大师：有 MRP（mrp > 0）
  //   ③ 上位：排除上面两类后，星级 ≥ 4（★4~★8）
  //   ④ 下位：其余（★1~★3）
  // 返回 0~3（用于排序，越小越靠前）：大师 0 → 上位 1 → 下位 2 → 百龙 3
  function actRankOrder(q) {
    if (!q) return 1;
    const name = String(q.name || '').trim();
    if (String(q.mapNo) === '7' || name.indexOf('百龙') >= 0) return 3; // 百龙夜行
    const mrp = Number(String(q.mrp == null ? '0' : q.mrp).replace(/,/g, ''));
    if (mrp > 0) return 0;                                             // 大师（有 MRP）
    return (Number(q.star) || 0) >= 4 ? 1 : 2;                         // 上位（★4~8）/ 下位（★1~3）
  }
  // 「活动任务」位阶中文名（用于卡片上显示的小标签）
  const ACT_RANK_LABEL = ['大师', '上位', '下位', '百龙'];

  // 斗技大会任务的「系列」判定（按名称前缀）：
  //   0 大师等级斗技大会 → 1 斗技大会 → 2 挑战任务 → 9 其他
  function arenaSeriesOrder(q) {
    const name = String((q && q.name) || '');
    if (name.indexOf('大师等级斗技大会') === 0) return 0;
    if (name.indexOf('斗技大会') === 0) return 1;
    if (name.indexOf('挑战任务') === 0) return 2;
    return 9;
  }
  // 取名称末尾的数字（用于同系列内升序：01, 02, 03…）
  function nameTailNum(name) {
    const m = String(name || '').match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 9999;
  }

  // 解析 monsters.js 的 quest 字符串尾部：
  //   "… Area 7 (60%) Area 8 (30%) Area 11 (10%) [小金冠] (6%) [大金冠] (10%)"
  // 返回 { name: 纯任务名, areas: [{n,rate}], crownMini, crownKing }
  function parseQuestArea(label) {
    let s = String(label || '');
    const areas = [];
    let crownMini = '', crownKing = '';

    // ① 区域概率：Area N (NN%)
    s = s.replace(/Area\s*(\d+)\s*\((\d+)%\)/g, function (m, n, r) {
      areas.push({ n: Number(n), rate: r });
      return '';
    });
    // ② 金冠概率（带图标标记）
    s = s.replace(/\[小金冠\]\s*\((\d+)%\)/g, function (m, r) { crownMini = r; return ''; });
    s = s.replace(/\[大金冠\]\s*\((\d+)%\)/g, function (m, r) { crownKing = r; return ''; });
    // ③ 兜底：旧的孤立百分比（无标记）按顺序当作 小金/大金
    const leftover = s.match(/\((\d+)%\)/g) || [];
    leftover.forEach(function (p, i) {
      const r = p.replace(/[()%]/g, '');
      if (i === 0 && !crownMini) crownMini = r;
      else if (i === 1 && !crownKing) crownKing = r;
    });
    s = s.replace(/\(\d+%\)/g, '');

    return {
      name: s.replace(/\s+/g, ' ').trim(),
      areas: areas,
      crownMini: crownMini,
      crownKing: crownKing,
    };
  }

  // 按分类分组（保持 QUEST_CAT_ORDER 顺序，未列出的分类追加在后）
  // 组内按星级降序（★ 高的在前）；同星级按任务名稳定排序
  function groupQuestsByCat() {
    const groups = {};
    Object.keys(QUESTS).forEach(function (qid) {
      const c = QUESTS[qid].cat || '其他';
      (groups[c] = groups[c] || []).push(qid);
    });
    Object.keys(groups).forEach(function (c) {
      const isAct = (c === '活动任务');
      const isArena = (c === '斗技大会任务');
      groups[c].sort(function (a, b) {
        // 活动任务：先按「位阶」分段（大师 → 上位 → 下位 → 百龙），再按星级降序
        if (isAct) {
          const ra = actRankOrder(QUESTS[a]), rb = actRankOrder(QUESTS[b]);
          if (ra !== rb) return ra - rb;
        }
        // 斗技大会任务：先按「系列」（大师等级斗技大会 → 斗技大会 → 挑战任务），
        //               再按名称末尾编号升序（01, 02, 03…）
        if (isArena) {
          const sa2 = arenaSeriesOrder(QUESTS[a]), sb2 = arenaSeriesOrder(QUESTS[b]);
          if (sa2 !== sb2) return sa2 - sb2;
          const na = nameTailNum(QUESTS[a].name), nb = nameTailNum(QUESTS[b].name);
          if (na !== nb) return na - nb;
          return 0;
        }
        const sa = QUESTS[a].star || 0, sb = QUESTS[b].star || 0;
        if (sa !== sb) return sb - sa;
        return String(QUESTS[a].full || '').localeCompare(String(QUESTS[b].full || ''), 'zh');
      });
    });
    const order = QUEST_CAT_ORDER.filter(function (c) { return groups[c]; });
    Object.keys(groups).forEach(function (c) {
      if (order.indexOf(c) < 0) order.push(c);
    });
    return { groups: groups, order: order };
  }

  // --------------------------------------------------------
  // 清洗任务文本：去掉爬虫混进来的 "(HRP: 5,760点数" / "(MRP: ..." 尾巴
  // （数据层已清理，这里做兜底，防止旧缓存/其它来源仍有脏数据）
  function cleanQuestText(s) {
    if (!s) return '';
    return String(s)
      .replace(/\s*\(?\s*(HRP|MRP)[:：\s][^)）]*([)）]|$)/gi, '')
      .replace(/\s*\(?\s*(HRP|MRP)[:：\s].*$/gi, '')
      .trim();
  }

  // 失败条件可能多条黏连在一起（数据源无分隔符），这里拆开加「/」分隔
  // 例：「报酬金额为零时间耗尽」→「报酬金额为零 / 时间耗尽」
  //     「报酬金额为零（1次力尽倒下）时间耗尽」→「报酬金额为零（1次力尽倒下） / 时间耗尽」
  //     「最终关口遭到破坏时间耗尽」→「最终关口遭到破坏 / 时间耗尽」
  function splitQuestFail(s) {
    if (!s) return '';
    var t = String(s).trim();
    if (t === '无条件') return t;
    // 在「时间耗尽」前断开（若它不在开头）—— 用 replace 回调避免后顾断言（兼容旧 Safari）
    t = t.replace(/时间耗尽/g, function (m, off) {
      return off === 0 ? m : ' / ' + m;
    });
    return t.replace(/\s*\/\s*\/\s*/g, ' / ').trim();
  }

  // 任务「主要目标怪」分析（多处共用：任务卡片 / 任务弹窗 / 怪物弹窗任务列表）
  //
  // 规则：
  //   ① goal 里有具体怪名（如「讨伐1头伞鸟」「狩猎1头雌火龙和1头天狗兽」）
  //      → 这些怪视为目标，排到最前（按 goal 中出现顺序）
  //   ② goal 为「狩猎所有目标 / 讨伐所有目标」→ 全部视为目标
  //   ③ 边界判定避免子串误伤（「天狗兽」≠「绯天狗兽」）
  //
  // 返回：{ list: [{ name, isTarget, m }], targetCount, hasOthers, allTarget }
  //   list 已按「目标怪在前 + goal 出现顺序」排好；m 为原始怪物对象（含 players 等）
  // --------------------------------------------------------
  var _QT_BOUNDARY = /[头只个和、与及或，,。（(0-9\s的了]/;

  function analyzeQuestTargets(goalRaw, mons) {
    mons = mons || [];
    var goal = cleanQuestText(goalRaw);
    var allTarget = /所有目标|全部目标/.test(goal);

    function appears(nm) {
      if (!nm) return -1;
      var from = 0;
      while (true) {
        var i = goal.indexOf(nm, from);
        if (i < 0) return -1;
        var before = i > 0 ? goal[i - 1] : '';
        if (!before || _QT_BOUNDARY.test(before)) return i;   // 命中位置
        from = i + 1;
      }
    }

    // 目标怪名与任务 goal 里的写法可能不一致，做一层别名容错：
    //   例：怪物列表写「怪异克服天彗龙」，goal 写「讨伐1头怪异克服神秘红光天彗龙」
    //   （怪异调查：神秘红光天彗龙）
    var _QT_ALIAS = {
      '怪异克服天彗龙': ['神秘红光天彗龙', '怪异克服神秘红光天彗龙'],
    };
    function appearsWithAlias(nm) {
      var pos = appears(nm);
      if (pos >= 0) return pos;
      var alts = _QT_ALIAS[nm];
      if (alts) {
        for (var k = 0; k < alts.length; k++) {
          var p = appears(alts[k]);
          if (p >= 0) return p;
        }
      }
      // 反向：怪物名可能是 goal 里名字的后缀（如 goal「怪异克服神秘红光天彗龙」含「天彗龙」）
      return -1;
    }

    var hitAt = {};
    mons.forEach(function (m) {
      var nm = m && m.name;
      if (!nm) return;
      if (hitAt[nm] == null) {
        var pos = appearsWithAlias(nm);
        if (pos >= 0) hitAt[nm] = pos;
      }
    });

    var targets = [], others = [];
    mons.forEach(function (m) {
      var isTarget = allTarget || (m && m.name && hitAt[m.name] != null);
      var item = { name: (m && m.name) || '', isTarget: !!isTarget, m: m };
      if (isTarget) targets.push(item); else others.push(item);
    });
    if (!allTarget && targets.length > 1) {
      targets.sort(function (a, b) {
        return (hitAt[a.name] == null ? 9999 : hitAt[a.name]) -
               (hitAt[b.name] == null ? 9999 : hitAt[b.name]);
      });
    }
    var list = targets.concat(others);
    var targetCount = targets.length;
    return {
      list: list,
      targetCount: targetCount,
      hasOthers: targetCount > 0 && targetCount < list.length,
      allTarget: allTarget,
    };
  }

  // 渲染任务卡片
  function renderQuestCard(qid) {
    const q = QUESTS[qid];
    const card = document.createElement('div');
    card.className = 'skill-card quest-card';
    card.setAttribute('data-qid', qid);

    // 顶部：名字 + 星级
    const top = document.createElement('div');
    top.className = 'quest-card-top';
    const nameEl = document.createElement('div');
    nameEl.className = 'quest-card-name';
    nameEl.textContent = q.name || q.full || qid;
    top.appendChild(nameEl);
    const _effStar = q.star || 0;
    if (_effStar) {
      const st = document.createElement('span');
      st.className = 'quest-star';
      st.textContent = '★' + _effStar;
      if ((q.cat || '') === '怪异任务') st.title = '怪异等级 ' + _effStar;
      top.appendChild(st);
    }
    card.appendChild(top);

    // 分类 + 地图（新）
    const catEl = document.createElement('div');
    catEl.className = 'quest-card-cat';
    const catName = document.createElement('span');
    catName.className = 'quest-card-cat-name';
    catName.textContent = q.cat || '';
    catEl.appendChild(catName);
    // 活动任务：额外显示「位阶」小标签（大师 / 上位 / 下位 / 百龙）
    if ((q.cat || '') === '活动任务') {
      const rk = actRankOrder(q);
      const rkTag = document.createElement('span');
      rkTag.className = 'quest-card-rank rank-' + rk;
      rkTag.textContent = ACT_RANK_LABEL[rk];
      catEl.appendChild(rkTag);
    }
    if (q.mapNo) {
      const mapTag = document.createElement('span');
      mapTag.className = 'quest-card-map';
      mapTag.textContent = '📍' + questMapName(q.mapNo);
      catEl.appendChild(mapTag);
    }
    card.appendChild(catEl);

    // 怪物（全部显示，换行排；目标怪排前面并加标记）
    const mons = q.mons || [];
    if (mons.length) {
      const mEl = document.createElement('div');
      mEl.className = 'quest-card-mons';
      const icons = (typeof window !== 'undefined' && window.MONSTER_ICONS) || {};
      const ordered = analyzeQuestTargets(q.goal, mons).list;
      const multi = ordered.length > 1;
      const anyTarget = ordered.some(function (x) { return x.isTarget; });
      // 目标怪与乱入怪之间插间隔（仅在「有目标 + 有乱入」时才有意义）
      const targetCount = ordered.filter(function (x) { return multi && x.isTarget && anyTarget; }).length;
      const needGap = targetCount > 0 && targetCount < ordered.length;

      ordered.forEach(function (entry, idx) {
        const m = entry.m;
        const f = icons[m.name];
        const isTargetCell = multi && entry.isTarget && anyTarget;
        const cell = document.createElement('span');
        cell.className = 'qmon';
        if (isTargetCell) cell.classList.add('qmon-target');
        if (f) {
          const im = document.createElement('img');
          im.loading = 'lazy';
          im.decoding = 'async';
          im.alt = m.name;
          im.title = m.name + (isTargetCell ? '（目标）' : '');
          im.src = 'monster-icons/' + f;
          cell.appendChild(im);
        } else {
          // 没有图标时退化显示名字
          cell.classList.add('qmon-noicon');
          cell.textContent = m.name;
        }
        mEl.appendChild(cell);

        // 最后一个「目标怪」之后 → 插一个间隔（约一个图标宽），分隔乱入怪
        if (needGap && isTargetCell && (idx + 1 >= ordered.length || !(multi && ordered[idx + 1].isTarget && anyTarget))) {
          const gap = document.createElement('span');
          gap.className = 'qmon-gap';
          gap.setAttribute('aria-hidden', 'true');
          mEl.appendChild(gap);
        }
      });
      card.appendChild(mEl);
    }

    // 搜索：任务名 + 完整标题 + 分类 + 地图 + 怪物名
    card._search = (
      (q.name || '') + ' ' + (q.full || '') + ' ' + (q.cat || '') + ' ' +
      (q.mapNo ? questMapName(q.mapNo) : '') + ' ' +
      mons.map(function (m) { return m.name; }).join(' ')
    ).toLowerCase();
    card._qid = qid;

    card.addEventListener('click', function () {
      if (_openQuestModal) _openQuestModal(qid);
    });

    return card;
  }

  // ========================================================
  // 通用：区块折叠
  // titleId/containerId/hintId + 状态对象
  // ========================================================
  function setupSectionCollapse(stateKey, titleId, containerId, hintId, defaultCollapsed, expandText, collapseText) {
    const titleEl = document.getElementById(titleId);
    const contEl = document.getElementById(containerId);
    const hintEl = document.getElementById(hintId);
    if (!titleEl || !contEl) return null;

    const state = { collapsed: !!defaultCollapsed };
    function apply() {
      contEl.classList.toggle('collapsed', state.collapsed);
      if (hintEl) hintEl.textContent = state.collapsed ? expandText : collapseText;
    }
    titleEl.addEventListener('click', function () {
      state.collapsed = !state.collapsed;
      apply();
    });
    apply();
    return { state: state, apply: apply };
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
    // 补上「提供技能名」（否则搜技能名找不到珠子）
    const sn = decoSkillName(d);
    if (sn) parts.push(sn);
    return parts.join(' ').toLowerCase();
  }

  // 取珠子「提供的技能名」（优先详细版名称，其次游戏原文名）
  function decoSkillName(d) {
    if (!d || !d.hex) return '';
    const key = String(d.hex).toUpperCase();
    // 1) 详细版（SKILL_DATA.skills，按十进制 id）——用顶层缓存的映射
    if (window._skillNameByHex && window._skillNameByHex[key]) {
      return window._skillNameByHex[key];
    }
    // 2) 游戏原文（GAME_SKILL_DATA，hex 键）
    const gd = window.GAME_SKILL_DATA || {};
    if (gd[key] && gd[key].sname) return gd[key].sname;
    return '';
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
        if (!isNaN(decId) && _openSkillModal) {
          // 记录：返回时重新打开当前珠子
          if (typeof _pushHist === 'function') _pushHist(function () { openDecoModal(decoId); });
          _openSkillModal(decId);
        }
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
        const mons = monstersForMaterial(m.item);
        const linkable = mons.length > 0;

        // 等级标签（下位/上位/大师）—— 用素材在怪物表中的掉落等级反查
        const mkRanks = ranksForMaterial(m.item);
        let rankHtml = '';
        if (mkRanks.length) {
          rankHtml = '<span class="mat-rank-tags">' +
            mkRanks.map(function (r) {
              return '<span class="mat-rank-tag rank-' + rankKey(r) + '">' +
                (RANK_SHORT[r] || r) + '</span>';
            }).join('') + '</span>';
        }

        li.innerHTML = '<span class="deco-mat-name">' + escapeHtml(m.item) +
          rankHtml +
          (linkable ? '<span class="mat-go">▸</span>' : '<span class="mat-go mat-go-item">ℹ</span>') + '</span>' +
          '<span class="deco-mat-count">×' + m.count + '</span>';
        if (linkable) {
          li.classList.add('deco-mat-link');
          li.addEventListener('click', function () {
            if (typeof _pushHist === 'function') _pushHist(function () { openDecoModal(decoId); });
            // 多个来源怪 → 走素材详情让用户选；单个 → 直接跳
            if (mons.length === 1 && _openMonsterModal) {
              _openMonsterModal(mons[0], m.item);
            } else if (_openItemModal) {
              _openItemModal(m.item);
            }
          });
        } else if (ITEMS[m.item]) {
          // 无怪物掉落，但有道具数据（说明/其他获得途径）→ 也可点
          li.classList.add('deco-mat-link', 'deco-mat-item-link');
          li.addEventListener('click', function () {
            if (typeof _pushHist === 'function') _pushHist(function () { openDecoModal(decoId); });
            if (_openItemModal) _openItemModal(m.item);
          });
        }
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

    // 建 hex → 技能名 映射（供珠子搜索「技能名」用；顶层函数 decoSkillName 读取）
    (function buildSkillNameByHex() {
      const map = {};
      Object.keys(skills).forEach((id) => {
        const sk = skills[id];
        if (!sk) return;
        const nm = sk.name_override || sk.title || sk.display_name || sk.name || '';
        const hx = decToHex(id);
        if (hx) map[String(hx).toUpperCase()] = nm;
      });
      window._skillNameByHex = map;
    })();

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

    // --------------------------------------------------------
    // 百龙珠卡片（rampage_decorations.js）
    // --------------------------------------------------------
    const ramDecoContainer = document.getElementById('ramDecoContainer');
    const ramDecoCards = RAM_DECO.map((d, i) => {
      const el = renderRamDecoCard(d);
      return { id: 'ramdeco' + i, el, search: el._search || '' };
    });

    // --------------------------------------------------------
    // 怪物卡片（monsters.js）
    // 排序：大型怪物（图标 em***）在前，小型怪物（ems***）在后
    // --------------------------------------------------------
    const monsterContainer = document.getElementById('monsterContainer');
    const _iconMap = (typeof window !== 'undefined' && window.MONSTER_ICONS) || {};
    function _isSmallMonster(nm) {
      return /^ems/i.test(_iconMap[nm] || '');
    }
    const _allMonNames = Object.keys(MONSTERS);
    const bigMonNames = _allMonNames.filter(function (n) { return !_isSmallMonster(n); }).sort();
    const smallMonNames = _allMonNames.filter(function (n) { return _isSmallMonster(n); }).sort();
    const monsterCards = bigMonNames.concat(smallMonNames).map((nm) => {
      const el = renderMonsterCard(nm, MONSTERS[nm]);
      return { id: 'mon_' + nm, el, search: el._search || '' };
    });
    // 名字 → 卡片对象（挂 DOM 时复用，保证搜索筛选作用于真实 DOM 元素）
    const _monCardMap = {};
    monsterCards.forEach(function (it) { _monCardMap[it.el.querySelector('.deco-title-text').textContent] = it; });

    // --------------------------------------------------------
    // 素材（items.js，1764 条）
    // 素材区块：切页式 —— 顶部一排分类按钮，点哪个只显示哪个分类的条目
    // --------------------------------------------------------
    const materialContainer = document.getElementById('materialContainer');
    const matNames = Object.keys(ITEMS).sort();
    let materialSectionSelect = null;  // 由 buildMaterialSection 赋值（搜索时用）
    let materialSectionUpdateCounts = null; // 更新分类按钮计数（搜索时用）
    let materialHitsByCat = null;      // (kw) => { cat: 命中数 }（搜索时用）
    let materialSectionSetKw = null;   // (kw) => 切换搜索状态（搜索时用）

    // --------------------------------------------------------
    // 任务（quests.js，698 条）
    // 任务区块：切页式 —— 顶部一排分类按钮，点哪个只显示哪个分类的卡片
    // 性能考虑：卡片「首次切到该类时才渲染」
    // --------------------------------------------------------
    const questContainer = document.getElementById('questContainer');
    const _qGroup = groupQuestsByCat();
    const questCards = [];          // 已渲染的卡片 { id, el, search }
    const _questCardById = {};      // qid → { id, el, search }
    const _questGroupEls = {};      // 分类 → { groupEl, itemsEl, qids, rendered }

    // 任务区块：切页控制器
    let questSectionSelect = null;      // 由 buildQuestSection 赋值（搜索时用）
    let questSectionUpdateCounts = null; // 更新分类按钮上的计数（搜索时用）
    let _activeQSectCat = null;         // 当前选中的分类（null = 收起）

    function buildQuestSection() {
      if (!questContainer) return;

      // ① 分类按钮条
      const bar = document.createElement('div');
      bar.className = 'qcat-tabs';

      // ② 面板（只挂载当前分类的卡片）
      const panel = document.createElement('div');
      panel.className = 'qcat-panel';

      function ensureRendered(cat) {
        const st = _questGroupEls[cat];
        if (!st || st.rendered) return;
        st.rendered = true;
        st.qids.forEach(function (qid) {
          const el = renderQuestCard(qid);
          const obj = { id: 'quest_' + qid, el: el, search: el._search || '' };
          _questCardById[qid] = obj;
          questCards.push(obj);
          st.itemsEl.appendChild(el);
        });
      }

      function selectCat(cat) {
        _activeQSectCat = cat;
        bar.querySelectorAll('.qcat-tab').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-cat') === cat);
        });
        panel.innerHTML = '';
        if (cat) {
          ensureRendered(cat);
          panel.appendChild(_questGroupEls[cat].itemsEl);
        }
      }
      questSectionSelect = selectCat;

      // 建分组 state（itemsEl 复用）
      _qGroup.order.forEach(function (cat) {
        const itemsEl = document.createElement('div');
        itemsEl.className = 'quest-grid quest-group-items';
        _questGroupEls[cat] = {
          itemsEl: itemsEl, qids: _qGroup.groups[cat], rendered: false, collapsed: false,
          total: _qGroup.groups[cat].length,   // 原始总数（清空搜索时还原）
        };

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qcat-tab';
        b.setAttribute('data-cat', cat);
        b.innerHTML = escapeHtml(cat) +
          ' <span class="qcat-tab-count">' + _qGroup.groups[cat].length + '</span>';
        b.addEventListener('click', function () {
          selectCat(_activeQSectCat === cat ? null : cat);
        });
        bar.appendChild(b);
      });

      // 更新按钮上的计数：counts[cat] 有值则显示该值（并标记"无命中"样式）
      // 传 null 表示还原为原始总数
      function updateTabCounts(counts) {
        _qGroup.order.forEach(function (cat) {
          const st = _questGroupEls[cat];
          const b = bar.querySelector('.qcat-tab[data-cat="' + cat + '"]');
          if (!b) return;
          const span = b.querySelector('.qcat-tab-count');
          if (!span) return;
          if (!counts) {
            span.textContent = st.total;
            b.classList.remove('qcat-tab-empty');
          } else {
            const n = counts[cat] || 0;
            span.textContent = n;
            b.classList.toggle('qcat-tab-empty', n === 0);
          }
        });
      }
      questSectionUpdateCounts = updateTabCounts;

      questContainer.appendChild(bar);
      questContainer.appendChild(panel);

      // 默认选中第一个分类
      if (_qGroup.order.length) selectCat(_qGroup.order[0]);

      // ---- 滚动吸顶兜底 ----
      // body 是 display:flex，部分浏览器下 sticky 会失效，
      // 所以用 JS 兜底：滚过按钮条时给它固定定位。
      (function stickyFallback() {
        let placeholder = null;

        function ensurePlaceholder() {
          if (!placeholder) {
            placeholder = document.createElement('div');
            // 高度随时同步
            placeholder.style.display = 'none';
            bar.parentNode.insertBefore(placeholder, bar);
          }
          return placeholder;
        }

        function onScroll() {
          // 区块不可见 / 折叠时不处理
          if (questContainer.classList.contains('collapsed') ||
              questContainer.offsetParent === null) {
            reset();
            return;
          }
          const rect = bar.getBoundingClientRect();
          const ph = ensurePlaceholder();
          const phRect = ph.getBoundingClientRect();

          if (phRect.top < 0 && rect.top <= 0) {
            // 按钮条已经滚到屏幕上方 → 固定
            if (bar.style.position !== 'fixed') {
              ph.style.display = 'block';
              ph.style.height = bar.offsetHeight + 'px';
              bar.style.position = 'fixed';
              bar.style.top = '0';
              bar.style.left = phRect.left + 'px';
              bar.style.width = phRect.width + 'px';
              bar.style.zIndex = '50';
              bar.classList.add('qcat-tabs-fixed');
            } else {
              // 跟随宽度变化
              bar.style.left = phRect.left + 'px';
              bar.style.width = phRect.width + 'px';
            }
          } else {
            reset();
          }
        }

        function reset() {
          if (bar.style.position === 'fixed') {
            bar.style.position = '';
            bar.style.top = '';
            bar.style.left = '';
            bar.style.width = '';
            bar.style.zIndex = '';
            bar.classList.remove('qcat-tabs-fixed');
            if (placeholder) placeholder.style.display = 'none';
          }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', function () { reset(); onScroll(); }, { passive: true });
      })();
    }
    buildQuestSection();

    // 兼容旧调用（搜索时用）
    function renderQuestGroupCards(cat) {
      const st = _questGroupEls[cat];
      if (!st || st.rendered) return;
      st.rendered = true;
      st.qids.forEach(function (qid) {
        const el = renderQuestCard(qid);
        const obj = { id: 'quest_' + qid, el: el, search: el._search || '' };
        _questCardById[qid] = obj;
        questCards.push(obj);
        st.itemsEl.appendChild(el);
      });
    }

    // 合并所有「普通技能」卡片，并按技能 ID 统一排序（详述版与仅原文版混排）
    const allSkillCards = skillCards.concat(gameOnlyCards)
      .sort((a, b) => Number(a.id) - Number(b.id));

    // 挂到 DOM
    allSkillCards.forEach((it) => skillsContainer.appendChild(it.el));
    rampageCards.forEach((it) => rampageContainer.appendChild(it.el));
    if (decoContainer) decoCards.forEach((it) => decoContainer.appendChild(it.el));
    if (ramDecoContainer) ramDecoCards.forEach((it) => ramDecoContainer.appendChild(it.el));
    if (monsterContainer) {
      // 大型怪物 / 小型怪物 分组标题（复用 monsterCards 里的真实 DOM 元素）
      const grpBig = document.createElement('div');
      grpBig.className = 'mon-grid-group-title';
      grpBig.textContent = '大型怪物（' + bigMonNames.length + '）';
      monsterContainer.appendChild(grpBig);
      bigMonNames.forEach(function (nm) {
        if (_monCardMap[nm]) monsterContainer.appendChild(_monCardMap[nm].el);
      });

      const grpSmall = document.createElement('div');
      grpSmall.className = 'mon-grid-group-title';
      grpSmall.textContent = '小型怪物（' + smallMonNames.length + '）';
      monsterContainer.appendChild(grpSmall);
      smallMonNames.forEach(function (nm) {
        if (_monCardMap[nm]) monsterContainer.appendChild(_monCardMap[nm].el);
      });
    }
    buildMaterialSection();

    // --------------------------------------------------------
    // 四个区块折叠（统一逻辑）
    // --------------------------------------------------------
    const expandTxt = '（点击展开 ▼）';
    const collapseTxt = '（点击收起 ▲）';
    const EX = expandTxt, CO = collapseTxt;
    // 五个区块全部默认折叠
    const skillCollapse = setupSectionCollapse('skill', 'skillSectionTitle', 'skillsContainer', 'skillSectionHint', true, EX, CO);
    const ramCollapse = setupSectionCollapse('ram', 'ramSectionTitle', 'rampageContainer', 'ramSectionHint', true, EX, CO);
    const decoCollapse = setupSectionCollapse('deco', 'decoSectionTitle', 'decoContainer', 'decoSectionHint', true, EX, CO);
    const ramDecoCollapse = setupSectionCollapse('ramdeco', 'ramDecoSectionTitle', 'ramDecoContainer', 'ramDecoSectionHint', true, EX, CO);
    const monsterCollapse = setupSectionCollapse('monster', 'monsterSectionTitle', 'monsterContainer', 'monsterSectionHint', true, EX, CO);
    const materialCollapse = setupSectionCollapse('material', 'materialSectionTitle', 'materialContainer', 'materialSectionHint', true, EX, CO);
    const questCollapse = setupSectionCollapse('quest', 'questSectionTitle', 'questContainer', 'questSectionHint', true, EX, CO);

    // --------------------------------------------------------
    // 分类筛选（全部 / 技能 / 百龙技能 / 珠子 / 百龙珠 / 怪物）
    // 逻辑：默认（全部）显示 5 个「一览」目录、隐藏 5 个区块；
    //       点具体分类时显示对应区块、隐藏所有目录；
    //       搜索时也自动按结果切区块。
    // --------------------------------------------------------
    (function setupCatFilter() {
      const wrap = document.getElementById('catFilter');
      if (!wrap) return;
      const btns = wrap.querySelectorAll('.cat-btn');

      // 分类 → 区块元素
      const SECTION_MAP = {
        skill: 'skillSection',
        ram: 'ramSection',
        deco: 'decoSection',
        ramdeco: 'ramDecoSection',
        monster: 'monsterSection',
        material: 'materialSection',
        quest: 'questSection',
      };
      // 5 个目录（怪物/任务用顶部分类即可，不再有目录）
      const CATALOGS = ['catalog', 'ramCatalog', 'decoCatalog',
        'ramDecoCatalog'];
      // 显示/隐藏某区块
      function showSection(key, on) {
        const sec = document.getElementById(SECTION_MAP[key]);
        if (sec) sec.classList.toggle('cat-hidden', !on);
      }

      // 区块折叠控制器（点分类时自动展开）
      const COLLAPSERS = {
        skill: function () { return skillCollapse; },
        ram: function () { return ramCollapse; },
        deco: function () { return decoCollapse; },
        ramdeco: function () { return ramDecoCollapse; },
        monster: function () { return monsterCollapse; },
        material: function () { return materialCollapse; },
        quest: function () { return questCollapse; },
      };

      // 应用分类
      function applyCat(cat, keepKeyword) {
        if (cat === 'all') {
          // 全部：隐藏所有区块，显示所有目录
          Object.keys(SECTION_MAP).forEach(function (k) { showSection(k, false); });
          CATALOGS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('cat-hidden');
          });
        } else {
          // 具体分类：只显示该类区块，隐藏所有目录
          Object.keys(SECTION_MAP).forEach(function (k) {
            showSection(k, k === cat);
          });
          CATALOGS.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.add('cat-hidden');
          });
          // 自动展开该区块，方便直接看内容
          if (COLLAPSERS[cat]) {
            const c = COLLAPSERS[cat]();
            if (c) { c.state.collapsed = false; c.apply(); }
          }
        }
        // keepKeyword=true 时不动搜索框（用于 applyFilter 回调，避免死循环）
        window._activeCat = cat;   // 先更新，供 applyFilter 判断范围
        if (!keepKeyword) {
          const si = document.getElementById('searchInput');
          // 保留搜索词，按新分类重新过滤（无词时等于刷新显示）
          if (si) si.dispatchEvent(new window.Event('input', { bubbles: true }));
        }
      }

      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          applyCat(b.getAttribute('data-cat'));
          // 点具体分类 → 进入紧凑模式
          document.body.classList.toggle('searching', b.getAttribute('data-cat') !== 'all');
        });
      });

      window._applyCat = applyCat;
      applyCat('all');
    }());

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
    // --------------------------------------------------------
    // 素材：按分类「切页式」（点分类只显示该类）
    // --------------------------------------------------------
    // --------------------------------------------------------
    // 怪异材料：表格式渲染
    //   每行 = 一个系列（三档材料横排） + 怪物图标
    //   同星级只在首行显示星级标签
    // --------------------------------------------------------
    function renderAnomalyTable(parent, kw) {
      const ANOM = window.ANOMALY_MATERIALS;
      if (!ANOM) return;
      kw = (kw || '').toLowerCase();

      // 外层表格容器
      const wrap = document.createElement('div');
      wrap.className = 'anom-wrap';

      // 预扫描：找最多怪物的一行（用来统一怪物列宽度）
      let maxMon = 0;
      ANOM.rows.forEach((r) => { if (r.mons.length > maxMon) maxMon = r.mons.length; });
      // 每个怪物单元 ≈ 2.4rem(图标 + 名字两行) + 0.2rem(gap) → 统一怪物列宽
      wrap.style.setProperty('--anom-mon-w', (maxMon * 2.6 + 0.3).toFixed(2) + 'rem');

      // 第一行：表头（低 / 中 / 高 / 出现怪物）
      const head = document.createElement('div');
      head.className = 'anom-head';
      head.innerHTML =
        '<span class="anom-cell anom-head-cell">低</span>' +
        '<span class="anom-cell anom-head-cell">中</span>' +
        '<span class="anom-cell anom-head-cell">高</span>' +
        '<span class="anom-mon-col anom-head-cell">出现怪物</span>';
      wrap.appendChild(head);

      // 逐系列渲染（同星级先插一行「★N + Lv区间」）
      let lastStar = null;
      let anyHit = false;
      ANOM.rows.forEach((row) => {
        // 搜索过滤：系列名 / 三档名 / 怪物名 命中任一
        const hay = [row.series]
          .concat(row.tiers.map((t) => t.name))
          .concat(row.mons)
          .join(' ').toLowerCase();
        if (kw && hay.indexOf(kw) < 0) return;
        anyHit = true;

        // —— 星级分隔行（该星级首行时插入）——
        //   三档 Lv（不含「Lv」前缀）分别对齐「低/中/高」三列；
        //   ★ 用重复符号表示星级（如 ★★★ = 3 星），放第 4 列
        if (row.star !== lastStar) {
          lastStar = row.star;
          const stars = '★'.repeat(row.star);
          const sep = document.createElement('div');
          sep.className = 'anom-star-row anom-star-row-' + row.star;
          sep.innerHTML =
            '<span class="anom-star-lv">' + row.tiers[0].lv + '</span>' +
            '<span class="anom-star-lv">' + row.tiers[1].lv + '</span>' +
            '<span class="anom-star-lv">' + row.tiers[2].lv + '</span>' +
            '<span class="anom-star-badge">' + stars + '</span>';
          wrap.appendChild(sep);
        }

        const line = document.createElement('div');
        line.className = 'anom-row anom-star-' + row.star;

        // 三档材料名（可点）—— 图标 + 简称
        row.tiers.forEach((t, ti) => {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'anom-cell anom-mat ' +
            ['tier-low', 'tier-mid', 'tier-high'][ti];
          cell.title = t.name + '（适用 Lv ' + t.lv + '）';

          // 图标
          const iconFile = (window.ANOMALY_ICONS || {})[t.name];
          if (iconFile) {
            const img = document.createElement('img');
            img.className = 'anom-mat-icon';
            img.src = 'anomaly-icons/' + iconFile;
            img.alt = t.name;
            img.loading = 'lazy';
            cell.appendChild(img);
          }
          // 简称：去掉「怪异化的」前缀
          //   「破怪的」保留（★8/★9，避免和 ★2 龙骨系重名）
          const short = t.name.replace(/^怪异化的/, '');
          const span = document.createElement('span');
          span.className = 'anom-mat-name';
          span.textContent = short;
          cell.appendChild(span);

          cell.addEventListener('click', () => {
            if (_openItemModal && ITEMS[t.name]) _openItemModal(t.name);
          });
          line.appendChild(cell);
        });

        // 怪物图标列
        const monCol = document.createElement('span');
        monCol.className = 'anom-mon-col';
        row.mons.forEach((mn) => {
          const mb = document.createElement('button');
          mb.type = 'button';
          mb.className = 'anom-mon';
          const iconFile = (window.MONSTER_ICONS || {})[mn];
          if (iconFile) {
            const img = document.createElement('img');
            img.src = 'monster-icons/' + iconFile;
            img.alt = mn;
            img.loading = 'lazy';
            mb.appendChild(img);
          }
          const nm = document.createElement('span');
          nm.className = 'anom-mon-name';
          nm.textContent = mn;
          mb.appendChild(nm);
          mb.title = '查看怪物：' + mn;
          mb.addEventListener('click', () => {
            if (_openMonsterModal && MONSTERS[mn]) _openMonsterModal(mn);
          });
          monCol.appendChild(mb);
        });
        line.appendChild(monCol);

        wrap.appendChild(line);
      });

      if (!anyHit) {
        const tip = document.createElement('div');
        tip.className = 'mcat-empty';
        tip.textContent = '该分类无匹配素材';
        wrap.appendChild(tip);
      }

      parent.appendChild(wrap);
      parent._count = anyHit ? 1 : 0;
    }

    function buildMaterialSection() {
      const container = document.getElementById('materialContainer');
      if (!container) return;

      // 按 Kiranico 网站分类（item_categories.js）
      //   回复/辅助 / 素材 / 余料 / 弹药·瓶 / 交纳委托 / 变更房屋的设计
      const CATS = (typeof window !== 'undefined' && window.ITEM_CATEGORIES) || {};
      const ORDER = ['怪异材料', '回复/辅助', '素材', '余料', '弹药/瓶', '交纳委托', '变更房屋的设计'];
      const groups = {};
      matNames.forEach((nm) => {
        const c = CATS[nm] || '其他';
        if (!groups[c]) groups[c] = [];
        groups[c].push(nm);
      });
      // 「怪异材料」特殊处理：从 ANOMALY_MATERIALS 取名字（不在 ITEM_CATEGORIES 里）
      const ANOM = (typeof window !== 'undefined' && window.ANOMALY_MATERIALS) || null;
      if (ANOM) {
        const anomNames = [];
        ANOM.rows.forEach((r) => r.tiers.forEach((t) => anomNames.push(t.name)));
        groups['怪异材料'] = anomNames;
      }
      const order = ORDER.filter((c) => groups[c])
        .concat(Object.keys(groups).filter((c) => ORDER.indexOf(c) < 0));

      // 分类按钮条（吸顶）
      const bar = document.createElement('div');
      bar.className = 'qcat-tabs mcat-tabs';
      // 内容面板（只挂当前分类的列表）
      const panel = document.createElement('div');
      panel.className = 'mcat-panel';

      const panels = {};   // cat → 该分类的列表容器（懒渲染）
      const catBtnByCat = {}; // cat → 分类按钮
      let activeCat = null;
      let curKw = '';      // 当前搜索词（'' = 无搜索）

      // 渲染某分类的条目列表（按 curKw 过滤）
      function renderCatItems(cat) {
        const itemsEl = document.createElement('div');
        itemsEl.className = 'mcat-items';
        // 「怪异材料」→ 用表格式渲染
        if (cat === '怪异材料' && ANOM) {
          renderAnomalyTable(itemsEl, curKw);
          return itemsEl;
        }
        let n = 0;
        groups[cat].slice().sort().forEach((nm) => {
          const nameLo = nm.toLowerCase();
          if (curKw && nameLo.indexOf(curKw) < 0) return;   // 搜索过滤
          const b = document.createElement('button');
          b.className = 'catalog-item';
          b.textContent = nm;
          b.addEventListener('click', () => {
            const mons = monstersForMaterial(nm);
            if (mons.length === 1 && _openMonsterModal) {
              _openMonsterModal(mons[0], nm);
            } else if (_openItemModal) {
              _openItemModal(nm);
            }
          });
          itemsEl.appendChild(b);
          n++;
        });
        itemsEl._count = n;
        return itemsEl;
      }

      function selectCat(cat) {
        activeCat = cat;
        bar.querySelectorAll('.qcat-tab').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-cat') === cat);
        });
        panel.innerHTML = '';
        if (cat) {
          if (!panels[cat]) panels[cat] = renderCatItems(cat);
          panel.appendChild(panels[cat]);
          // 搜索时：当前分类无命中 → 显示「无结果」提示
          if (curKw && panels[cat]._count === 0) {
            const tip = document.createElement('div');
            tip.className = 'mcat-empty';
            tip.textContent = '该分类无匹配素材';
            panel.appendChild(tip);
          }
        }
      }
      materialSectionSelect = selectCat;

      order.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qcat-tab';
        b.setAttribute('data-cat', c);
        b.innerHTML = escapeHtml(c) +
          ' <span class="qcat-tab-count">' + groups[c].length + '</span>';
        b.addEventListener('click', () => {
          selectCat(activeCat === c ? null : c);
        });
        catBtnByCat[c] = b;
        bar.appendChild(b);
      });

      // 更新按钮计数：counts 有值 → 显示命中数并灰化无命中的；null → 还原总数
      materialSectionUpdateCounts = function (counts) {
        order.forEach((c) => {
          const b = catBtnByCat[c];
          if (!b) return;
          const span = b.querySelector('.qcat-tab-count');
          if (!span) return;
          if (!counts) {
            span.textContent = groups[c].length;
            b.classList.remove('qcat-tab-empty');
          } else {
            const n = counts[c] || 0;
            span.textContent = n;
            b.classList.toggle('qcat-tab-empty', n === 0);
          }
        });
      };

      // 统计每个分类在当前关键词下的命中数
      materialHitsByCat = function (kw) {
        const res = {};
        order.forEach((c) => {
          let n = 0;
          groups[c].forEach((nm) => {
            if (nm.toLowerCase().indexOf(kw) >= 0) n++;
          });
          res[c] = n;
        });
        return res;
      };

      // 搜索状态切换：更新 curKw → 面板重建 + 计数更新 + 切到命中最多
      materialSectionSetKw = function (kw) {
        curKw = kw || '';
        // 面板若已渲染的，需要按新 kw 重建
        Object.keys(panels).forEach((c) => { delete panels[c]; });
        if (!curKw) {
          materialSectionUpdateCounts(null);
          selectCat(order[0] || null);
          return;
        }
        const counts = materialHitsByCat(curKw);
        materialSectionUpdateCounts(counts);
        let best = null, bn = 0;
        order.forEach((c) => { if (counts[c] > bn) { bn = counts[c]; best = c; } });
        selectCat(best);
      };

      container.appendChild(bar);
      container.appendChild(panel);

      // 默认选中第一个分类
      if (order.length) selectCat(order[0]);
    }

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
    // 百龙珠一览（按孔位分组的目录）
    // --------------------------------------------------------
    (function buildRamDecoCatalog() {
      const body = document.getElementById('ramDecoCatalogBody');
      const head = document.getElementById('ramDecoCatalogHead');
      const catalog = document.getElementById('ramDecoCatalog');
      if (!body || !head || !catalog) return;

      const SLOT_ORDER = [1, 2, 3];
      const groups = {};
      RAM_DECO.forEach((d) => {
        const key = d.slot + '孔';
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });

      SLOT_ORDER.forEach((slot) => {
        const key = slot + '孔';
        const list = groups[key];
        if (!list) return;

        const groupEl = document.createElement('div');
        groupEl.className = 'catalog-group';

        const catEl = document.createElement('div');
        catEl.className = 'catalog-cat';
        catEl.innerHTML = `${escapeHtml(key)} <span class="cat-count">${list.length}</span>`;
        groupEl.appendChild(catEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'catalog-items';
        list.forEach((d) => {
          const b = document.createElement('button');
          b.className = 'catalog-item ram-deco-cat-item';
          b.textContent = d.name;
          b.addEventListener('click', () => openRamDecoModal(d.name));
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
      let ramDecoHits = 0;
      let monHits = 0;
      let matHits = 0;
      let questHits = 0;

      // 当前分类（决定搜索范围）：all / skill / ram / deco / ramdeco / monster
      const cat = window._activeCat || 'all';
      const inScope = (key) => cat === 'all' || cat === key;

      allSkillCards.forEach((item) => {
        const hit = inScope('skill') && (!kw || item.search.includes(kw));
        item.el.style.display = hit ? '' : 'none';
        if (hit) skillHits++;
      });
      rampageCards.forEach((item) => {
        const hit = inScope('ram') && (!kw || item.search.includes(kw));
        item.el.style.display = hit ? '' : 'none';
        if (hit) rampageHits++;
      });
      decoCards.forEach((item) => {
        const hit = inScope('deco') && (!kw || item.search.includes(kw));
        item.el.style.display = hit ? '' : 'none';
        if (hit) decoHits++;
      });
      ramDecoCards.forEach((item) => {
        const hit = inScope('ramdeco') && (!kw || item.search.includes(kw));
        item.el.style.display = hit ? '' : 'none';
        if (hit) ramDecoHits++;
      });
      monsterCards.forEach((item) => {
        const hit = inScope('monster') && (!kw || item.search.includes(kw));
        item.el.style.display = hit ? '' : 'none';
        if (hit) monHits++;
      });
      // ---- 素材（切页式：更新计数 + 按命中切到最多的一类）----
      (function filterMaterials() {
        if (!inScope('material')) return;
        if (!materialSectionSetKw) return;
        materialSectionSetKw(kw);
        if (kw && materialHitsByCat) {
          const counts = materialHitsByCat(kw);
          Object.keys(counts).forEach(function (c) { matHits += counts[c]; });
        }
      })();

      // ---- 任务（懒渲染：先按数据判断命中，再确保命中的分类已渲染）----
      (function filterQuests() {
        const questOn = inScope('quest');
        if (!questOn) return;

        // 无关键词：恢复「切页」状态 + 还原按钮计数
        if (!kw) {
          questCards.forEach(function (item) { item.el.style.display = ''; });
          if (questSectionSelect) questSectionSelect(_activeQSectCat || null);
          if (questSectionUpdateCounts) questSectionUpdateCounts(null);
          return;
        }

        // 有搜索词：跨所有分类筛选，并统计每类命中数
        let total = 0;
        const hitCounts = {};     // cat → 命中数（用于更新按钮）
        _qGroup.order.forEach(function (cat) {
          const st = _questGroupEls[cat];
          if (!st) return;
          const hitIds = st.qids.filter(function (qid) {
            const q = QUESTS[qid];
            const hay = (
              (q.name || '') + ' ' + (q.full || '') + ' ' + (q.cat || '') + ' ' +
              (q.mons || []).map(function (m) { return m.name; }).join(' ') + ' ' +
              (q.goal || '')
            ).toLowerCase();
            return hay.indexOf(kw) >= 0;
          });
          total += hitIds.length;
          hitCounts[cat] = hitIds.length;
          // 确保渲染，并按命中过滤
          renderQuestGroupCards(cat);
          const hitSet = {};
          hitIds.forEach(function (id) { hitSet[id] = 1; });
          st.qids.forEach(function (qid) {
            const obj = _questCardById[qid];
            if (!obj) return;
            const show = !!hitSet[qid];
            obj.el.style.display = show ? '' : 'none';
            if (show) questHits++;
          });
        });
        // 按钮上的数字 → 改为各类命中数（无命中的置灰）
        if (questSectionUpdateCounts) questSectionUpdateCounts(hitCounts);
        // 搜索时：把当前分类切到"命中最多"的那个，方便直接看到结果
        if (_qGroup.order.length) {
          let bestCat = null, bestN = 0;
          _qGroup.order.forEach(function (cat) {
            const n = hitCounts[cat] || 0;
            if (n > bestN) { bestN = n; bestCat = cat; }
          });
          if (bestCat && questSectionSelect) questSectionSelect(bestCat);
        }
        if (!total) questHits = 0;
      })();

      // 怪物分组标题：某一组没有命中就隐藏标题
      (function syncMonGroupTitles() {
        if (!monsterContainer) return;
        const titles = monsterContainer.querySelectorAll('.mon-grid-group-title');
        if (titles.length < 2) return;
        function anyVisible(sel) {
          const start = titles[sel === 'big' ? 0 : 1];
          const end = titles[sel === 'big' ? 1 : null];
          let n = start.nextElementSibling;
          while (n && n !== end) {
            if (n.className.indexOf('mon-icon-card') >= 0 && n.style.display !== 'none') return true;
            n = n.nextElementSibling;
          }
          return false;
        }
        titles[0].style.display = anyVisible('big') ? '' : 'none';
        titles[1].style.display = anyVisible('small') ? '' : 'none';
      })();

      // 搜索时自动展开对应区块；清空时恢复默认（珠子/百龙珠/怪物默认折叠）
      if (decoCollapse) {
        decoCollapse.state.collapsed = kw ? (decoHits === 0) : true;
        decoCollapse.apply();
      }
      if (ramDecoCollapse) {
        ramDecoCollapse.state.collapsed = kw ? (ramDecoHits === 0) : true;
        ramDecoCollapse.apply();
      }
      if (monsterCollapse) {
        monsterCollapse.state.collapsed = kw ? (monHits === 0) : true;
        monsterCollapse.apply();
      }
      if (materialCollapse) {
        materialCollapse.state.collapsed = kw ? (matHits === 0) : true;
        materialCollapse.apply();
      }
      if (questCollapse) {
        questCollapse.state.collapsed = kw ? (questHits === 0) : true;
        questCollapse.apply();
      }

      if (!kw) {
        searchCount.textContent = '';
      } else {
        // 只列出「有结果」的类别，末尾给总数，避免太长
        const parts = [];
        if (skillHits) parts.push('技能 ' + skillHits);
        if (rampageHits) parts.push('百龙技能 ' + rampageHits);
        if (decoHits) parts.push('珠子 ' + decoHits);
        if (ramDecoHits) parts.push('百龙珠 ' + ramDecoHits);
        if (monHits) parts.push('怪物 ' + monHits);
        if (matHits) parts.push('素材 ' + matHits);
        if (questHits) parts.push('任务 ' + questHits);
        const total = skillHits + rampageHits + decoHits + ramDecoHits + monHits + matHits + questHits;
        const scopeName = { skill: '技能', ram: '百龙技能', deco: '珠子',
          ramdeco: '百龙珠', monster: '怪物', material: '素材', quest: '任务' }[cat];
        if (total) {
          searchCount.textContent = scopeName
            ? ('【' + scopeName + '】共 ' + total + ' 条')
            : ('共 ' + total + ' 条：' + parts.join(' · '));
        } else {
          searchCount.textContent = scopeName
            ? ('【' + scopeName + '】未找到结果')
            : '未找到结果';
        }
      }

      // ---- 搜索时：显示有结果的区块，隐藏无结果的区块与所有目录 ----
      const RESULT_MAP = {
        skillSection: skillHits,
        ramSection: rampageHits,
        decoSection: decoHits,
        ramDecoSection: ramDecoHits,
        monsterSection: monHits,
        materialSection: matHits,
        questSection: questHits,
      };
      Object.keys(RESULT_MAP).forEach(function (id) {
        const sec = document.getElementById(id);
        if (!sec) return;
        const on = kw ? RESULT_MAP[id] > 0 : false;   // 无搜索词时默认都隐藏
        sec.classList.toggle('cat-hidden', !on);
      });

      // ---- 搜索时，确保有结果的区块是展开的（否则卡片藏着看不见）----
      if (kw) {
        const CS = { skillSection: skillCollapse, ramSection: ramCollapse,
          decoSection: decoCollapse, ramDecoSection: ramDecoCollapse,
          monsterSection: monsterCollapse, materialSection: materialCollapse,
          questSection: questCollapse };
        Object.keys(CS).forEach(function (id) {
          if (RESULT_MAP[id] > 0 && CS[id]) {
            CS[id].state.collapsed = false;
            CS[id].apply();
          }
        });
      }

      // 目录：有搜索词时全部隐藏；无搜索词时按当前分类恢复
      const CATALOGS = ['catalog', 'ramCatalog', 'decoCatalog',
        'ramDecoCatalog'];
      CATALOGS.forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (kw) {
          el.classList.add('cat-hidden');
        } else if (window._activeCat === 'all') {
          el.classList.remove('cat-hidden');
        }
      });

      // 清空搜索时，恢复「全部」分类布局（显示目录、隐藏区块）
      // 注意：传 keepKeyword=true，避免与 applyCat 互相触发造成死循环
      if (!kw && typeof window._applyCat === 'function') {
        window._applyCat(window._activeCat || 'all', true);
      }

      // 搜索态 → 紧凑模式（隐藏数据来源说明、缩小标题）
      document.body.classList.toggle('searching', !!kw);
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
      // 关闭时清空历史栈
      _modalStack.length = 0;
      updateModalBack();
    }

    // 更新「返回」按钮显隐
    function updateModalBack() {
      const b = document.getElementById('modalBack');
      if (b) b.classList.toggle('show', _modalStack.length > 0);
    }

    // 记录一次弹窗跳转（在打开新弹窗前调用）
    // restoreFn: 可选。若不传，会「自动快照」当前弹窗的可恢复状态，
    //            返回时先重开上一页、再恢复折叠状态与滚动位置。
    function pushModalHistory(fn, restoreFn) {
      var state = restoreFn;
      if (!state) {
        try { state = captureModalState(); } catch (e) { state = null; }
      }
      _modalStack.push({ fn: fn, state: state });
      updateModalBack();
    }
    // 桥接给顶层函数（openDecoModal 等在顶层）
    _pushHist = pushModalHistory;

    // ---- 弹窗状态快照（用于「返回」时还原展开状态 + 滚动位置）----
    function captureModalState() {
      const bodyEl = document.getElementById('modalBody');
      const titleEl = document.getElementById('modalTitle');
      const st = {
        title: titleEl ? titleEl.textContent.trim() : '',
        scrollTop: bodyEl ? bodyEl.scrollTop : 0,
        // 记录每个「可折叠块」的展开态（按它们在 body 中的序号定位）
        collapsibles: [],
        hitzones: [],
      };
      if (!bodyEl) return st;
      // 任务列表（怪物弹窗）
      const qList = bodyEl.querySelector('.mon-quest-list');
      if (qList) st.questListOpen = !qList.classList.contains('collapsed');
      // 任务列表的分类筛选（哪个分类被选中）
      const mqfActive = bodyEl.querySelector('.mon-quest-filter .mqf-btn.active');
      if (mqfActive) st.mqfCat = mqfActive.getAttribute('data-cat') || '';
      // 其他获得途径（素材弹窗）
      const obList = bodyEl.querySelector('.mon-obtain-list');
      if (obList) st.obtainOpen = !obList.classList.contains('collapsed');
      // 出现怪物块（任务弹窗）：记录哪些展开
      st.questMonOpen = [];
      bodyEl.querySelectorAll('.quest-mon-block').forEach(function (b, i) {
        st.questMonOpen.push(!b.classList.contains('qm-collapsed'));
      });
      // 肉质表状态标签
      bodyEl.querySelectorAll('.mon-hit-tab-btn.active').forEach(function (b) {
        st.hitzones.push((b.getAttribute('data-tab') || '') + ':' + (b.getAttribute('data-idx') || ''));
      });
      return st;
    }

    function applyModalState(st) {
      if (!st) return;
      const bodyEl = document.getElementById('modalBody');
      if (!bodyEl) return;
      // 任务列表展开态
      if (st.questListOpen) {
        const qHead = bodyEl.querySelector('.mon-quest-toggle');
        const qList = bodyEl.querySelector('.mon-quest-list');
        if (qList && qList.classList.contains('collapsed')) {
          qList.classList.remove('collapsed');
          const a = qHead && qHead.querySelector('.mon-quest-arrow');
          if (a) a.textContent = '▲';
        }
      }
      // 任务列表分类筛选：恢复选中项 + 按该分类过滤行
      if (typeof st.mqfCat === 'string' && st.mqfCat) {
        const btn = bodyEl.querySelector('.mon-quest-filter .mqf-btn[data-cat="' + st.mqfCat + '"]');
        if (btn) {
          bodyEl.querySelectorAll('.mon-quest-filter .mqf-btn').forEach(function (x) {
            x.classList.toggle('active', x === btn);
          });
          bodyEl.querySelectorAll('.mon-quest-list .mon-quest-row').forEach(function (r) {
            const cat = r.querySelector('.mq-cat');
            const catTxt = cat ? cat.textContent : '';
            r.style.display = (!st.mqfCat || catTxt === st.mqfCat) ? '' : 'none';
          });
        }
      }
      // 其他获得途径展开态
      if (st.obtainOpen) {
        const obHead = bodyEl.querySelector('.mon-obtain-toggle');
        const obList = bodyEl.querySelector('.mon-obtain-list');
        if (obList && obList.classList.contains('collapsed')) {
          obList.classList.remove('collapsed');
          const a = obHead && obHead.querySelector('.mon-obtain-arrow');
          if (a) a.textContent = '▲';
        }
      }
      // 出现怪物块展开态
      if (st.questMonOpen && st.questMonOpen.length) {
        bodyEl.querySelectorAll('.quest-mon-block').forEach(function (b, i) {
          const open = !!st.questMonOpen[i];
          b.classList.toggle('qm-collapsed', !open);
          const ar = b.querySelector('.qm-arrow');
          if (ar) ar.textContent = open ? '▼' : '▶';
        });
      }
      // 滚动位置
      if (st.scrollTop) {
        bodyEl.scrollTop = st.scrollTop;
        // 内容渲染后可能还没到目标高度 → 下一帧再补一次
        requestAnimationFrame(function () { bodyEl.scrollTop = st.scrollTop; });
      }
    }

    // 桥接：按百龙技能「名称」找 id 并打开弹窗
    _openRampageById = function (skillName) {
      let fid = null;
      Object.keys(rampage).forEach(function (id) {
        const s = rampage[id];
        const n = s.name_override || s.title || s.display_name || s.name;
        if (n === skillName) fid = id;
      });
      if (fid != null) openRampageModal(fid);
    };

    // 返回上一级
    function modalGoBack() {
      if (!_modalStack.length) return;
      const item = _modalStack.pop();
      updateModalBack();
      const fn = (item && item.fn) || item;   // 兼容旧格式
      const state = item && item.state;
      try { fn(); } catch (e) { /* ignore */ }
      // 恢复上一页的展开状态 + 滚动位置
      if (state) {
        try { applyModalState(state); } catch (e) { /* ignore */ }
      }
    }

    // 打开百龙珠详情弹窗
    function openRamDecoModal(name) {
      const d = RAM_DECO.find(function (x) { return x.name === name; });
      if (!d) return;
      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      titleEl.innerHTML =
        '<span class="modal-title-icon">🈶</span>' +
        escapeHtml(d.name) +
        '<span class="deco-slot-badge" style="margin-left:0.4rem;">' + d.slot + '孔</span>';
      bodyEl.innerHTML = '';

      if (d.skill) {
        const skRow = document.createElement('div');
        skRow.className = 'deco-modal-skill deco-skill-link';
        skRow.innerHTML = '提供技能：<b>' + escapeHtml(d.skill) + '</b>' +
          '<span class="deco-skill-go">查看技能 ▸</span>';
        skRow.addEventListener('click', function () {
          // 找百龙技能 ID
          let foundId = null;
          Object.keys(rampage).forEach(function (id) {
            const s = rampage[id];
            const n = s.name_override || s.title || s.display_name || s.name;
            if (n === d.skill) foundId = id;
          });
          if (foundId != null) {
            if (typeof _pushHist === 'function') _pushHist(function () { openRamDecoModal(d.name); });
            openRampageModal(foundId);
          }
        });
        bodyEl.appendChild(skRow);
      }

      if (d.desc) {
        const descEl = document.createElement('div');
        descEl.className = 'skill-desc';
        descEl.style.marginTop = '0.5rem';
        descEl.textContent = d.desc;
        bodyEl.appendChild(descEl);
      }

      // 说明为模板套用（非游戏原文）时给出提示
      if (d.descTpl) {
        const tplEl = document.createElement('div');
        tplEl.className = 'desc-tpl-note';
        tplEl.textContent = '⚠️ 本条说明为格式套用，非游戏原文，待补充';
        bodyEl.appendChild(tplEl);
      }

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    // 桥接给顶层 buildRamDecoSection 使用
    _openRamDecoModal = openRamDecoModal;

    // ========================================================
    // 怪物详情弹窗
    //   monName  怪物名
    //   focusItem 可选：高亮的素材名（从素材点进来时）
    // ========================================================
    function openMonsterModal(monName, focusItem, restoreState) {
      const mon = MONSTERS[monName];
      if (!mon) return;

      // 记录当前上下文，供「返回」时精准重开
      _curMonCtx = { monName: monName, focusItem: focusItem || null };

      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      // 标题：有怪物图标就用图标，没有则退回 👹
      const _mi = (typeof window !== 'undefined' && window.MONSTER_ICONS) || {};
      const _mf = _mi[monName];
      titleEl.innerHTML = _mf
        ? '<img class="modal-title-mon-img" src="monster-icons/' + _mf + '" alt="">' + escapeHtml(monName)
        : '<span class="modal-title-icon">👹</span>' + escapeHtml(monName);

      bodyEl.innerHTML = '';

      // ① 点击的素材明细（无论有无掉落行，都展示；作为"当前选中"）
      if (focusItem) {
        const rows = dropRows(monName, focusItem).slice();
        bodyEl.appendChild(buildMatDetail(monName, focusItem, rows, true));
      }

      // ② 素材一览：按【下位 / 上位 / 大师等级】分区
      const rankGroups = materialsByRank(monName);
      // 若有选中的素材，也算进总览（不排除）
      if (rankGroups.length) {
        const head = document.createElement('div');
        head.className = 'mon-section-head';
        head.textContent = '素材一览';
        bodyEl.appendChild(head);

        rankGroups.forEach(function (g) {
          const grp = document.createElement('div');
          grp.className = 'mon-mat-group rank-' + rankKey(g.rank);

          const lab = document.createElement('div');
          lab.className = 'mon-mat-group-label';
          lab.textContent = g.rank;
          grp.appendChild(lab);

          const box = document.createElement('div');
          box.className = 'mon-mat-cloud';
          g.items.forEach(function (it) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mon-mat-chip';
            if (it === focusItem) btn.classList.add('active');
            btn.textContent = it;
            btn.addEventListener('click', function () {
              // 同页切换素材：不入历史栈（只是换高亮，属于同一页）
              openMonsterModal(monName, it);
            });
            box.appendChild(btn);
          });
          grp.appendChild(box);
          bodyEl.appendChild(grp);
        });
      }

      // ③ 任务列表（可折叠，避免太长）
      if (mon.quests && mon.quests.length) {
        bodyEl.appendChild(buildQuestBlock(mon.quests, monName));
      }

      // ④ 部位肉质（简要）
      if (mon.hitzones && mon.hitzones.length) {
        bodyEl.appendChild(buildHitzoneBlock(mon.hitzones));
      }

      // 滚动回顶部（切换素材时）
      if (focusItem && !restoreState) bodyEl.scrollTop = 0;

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      // 从「返回」进来 → 恢复展开状态与滚动位置
      if (restoreState) {
        try { applyModalState(restoreState); } catch (e) { /* ignore */ }
      }
    }

    // 素材详情弹窗（无怪物掉落时用）
    function openItemModal(itemName) {
      const info = ITEMS[itemName];
      if (!info) return;

      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      titleEl.innerHTML =
        '<span class="modal-title-icon">📦</span>' +
        escapeHtml(itemName);

      bodyEl.innerHTML = '';

      // 等级标签
      const ranks = ranksForMaterial(itemName);
      const box = document.createElement('div');
      box.className = 'mon-mat-detail highlight';

      const nm = document.createElement('div');
      nm.className = 'mon-mat-title';
      nm.appendChild(document.createTextNode(itemName));
      if (ranks.length) {
        const tw = document.createElement('span');
        tw.className = 'mon-mat-rank-tags';
        ranks.forEach(function (r) {
          const t = document.createElement('span');
          t.className = 'mat-rank-tag rank-' + rankKey(r);
          t.textContent = r;
          tw.appendChild(t);
        });
        nm.appendChild(tw);
      }
      box.appendChild(nm);

      // 说明
      if (info.desc) {
        const d = document.createElement('div');
        d.className = 'mon-mat-desc';
        d.textContent = info.desc;
        box.appendChild(d);
      }

      // 来源怪物（若有）——列出所有能获得的怪物
      const mons = monstersForMaterial(itemName);
      if (mons.length) {
        const mlabel = document.createElement('div');
        mlabel.className = 'mon-mat-none';
        mlabel.textContent = '来源怪物（' + mons.length + '）：';
        box.appendChild(mlabel);

        const listEl = document.createElement('div');
        listEl.className = 'mat-mon-list';
        mons.forEach(function (n) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mat-mon-btn';
          b.textContent = n;
          b.addEventListener('click', function () {
            // 记录历史：返回时回到本素材详情
            if (typeof _pushHist === 'function') _pushHist(function () { openItemModal(itemName); });
            if (_openMonsterModal) _openMonsterModal(n, itemName);
          });
          listEl.appendChild(b);
        });
        box.appendChild(listEl);
      }

      bodyEl.appendChild(box);

      // 其他获得途径
      bodyEl.appendChild(buildObtainBlock(itemName, true));

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    _openItemModal = openItemModal;

    // ========================================================
    // 任务详情弹窗
    // ========================================================
    function openQuestModal(qid) {
      const q = QUESTS[qid];
      if (!q) return;

      const overlay = document.getElementById('skillModal');
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      if (!overlay || !titleEl || !bodyEl) return;

      titleEl.innerHTML =
        '<span class="modal-title-icon">🏹</span>' +
        escapeHtml(q.name || qid);

      bodyEl.innerHTML = '';
      bodyEl.scrollTop = 0;

      // ① 分类 + 星级
      const metaLine = document.createElement('div');
      metaLine.className = 'quest-kv';
      metaLine.innerHTML =
        '<span class="q-k">' + escapeHtml(q.cat || '') + '</span>' +
        '<span class="q-v">' + (q.star ? '★' + q.star : '') +
          (q.hrp ? ' &nbsp;·&nbsp; HRP ' + escapeHtml(String(q.hrp)) : '') +
          (q.mrp ? ' &nbsp;·&nbsp; MRP ' + escapeHtml(String(q.mrp)) : '') +
        '</span>';
      bodyEl.appendChild(metaLine);

      // ①b 速览条：时间 / 猫车 / 报酬金额（新抓取的数据）
      const facts = [];
      if (q.timeLimit && q.timeLimit !== '0') facts.push(['⏱', q.timeLimit + ' 分钟']);
      if (q.questLife) facts.push(['💀', q.questLife + ' 猫']);
      if (q.money && q.money !== '0') facts.push(['💰', Number(q.money).toLocaleString() + ' z']);
      if (facts.length) {
        const bar = document.createElement('div');
        bar.className = 'quest-facts';
        bar.innerHTML = facts.map(function (f) {
          return '<span class="qf-item"><i>' + f[0] + '</i>' + escapeHtml(f[1]) + '</span>';
        }).join('');
        bodyEl.appendChild(bar);
      }

      // ② 主要目标（置顶高亮，最先看到）
      if (q.goal) {
        const goalBox = document.createElement('div');
        goalBox.className = 'quest-goal-box';
        goalBox.innerHTML =
          '<span class="qgb-tag">主要目标</span>' +
          '<span class="qgb-txt">' + escapeHtml(cleanQuestText(q.goal)) + '</span>';
        bodyEl.appendChild(goalBox);
      }

      // ③ 委托内容
      if (q.desc) {
        const head = document.createElement('div');
        head.className = 'mon-section-head';
        head.textContent = '委托内容';
        bodyEl.appendChild(head);
        const d = document.createElement('div');
        d.className = 'mon-mat-desc';
        d.textContent = q.desc;
        bodyEl.appendChild(d);
      }

      // ④ 失败条件 / 报酬
      const kvHead = document.createElement('div');
      kvHead.className = 'mon-section-head';
      kvHead.textContent = '任务信息';
      bodyEl.appendChild(kvHead);

      function kv(k, v) {
        if (!v) return;
        const row = document.createElement('div');
        row.className = 'quest-kv';
        row.innerHTML = '<span class="q-k">' + escapeHtml(k) + '</span>' +
          '<span class="q-v">' + escapeHtml(String(v)) + '</span>';
        bodyEl.appendChild(row);
      }
      kv('失败条件', splitQuestFail(q.fail));
      kv('报酬金额', q.money && q.money !== '0' ? Number(q.money).toLocaleString() + ' z' : '');
      if (q.timeLimit && q.timeLimit !== '0') kv('时间限制', q.timeLimit + ' 分钟');
      if (q.questLife) kv('力尽上限', q.questLife + ' 次');
      if (q.mapNo) kv('地图', questMapName(q.mapNo));
      if (q.points && q.points !== '0') kv('炎火点数', q.points);

      // ⑤ 怪物（可折叠，含各人数 HP 表；怪物名可点开怪物弹窗）
      const mons = q.mons || [];
      if (mons.length) {
        const mHead = document.createElement('div');
        mHead.className = 'mon-section-head';
        mHead.textContent = '出现怪物（' + mons.length + '）';
        bodyEl.appendChild(mHead);

        const icons = (typeof window !== 'undefined' && window.MONSTER_ICONS) || {};

        // ---- 让「任务主要目标怪」排在前面并标记（共用 analyzeQuestTargets）----
        const orderedMons = analyzeQuestTargets(q.goal, mons).list;

        // 若存在非目标怪 → 说明有乱入怪，加一行说明
        const targetCount = orderedMons.filter(function (x) { return x.isTarget; }).length;
        const hasOthers = targetCount < orderedMons.length && targetCount > 0;
        if (targetCount > 0 && orderedMons.length > 1) {
          const tip = document.createElement('div');
          tip.className = 'quest-mon-tip';
          tip.textContent = hasOthers
            ? '🎯 目标怪已排到前面（含乱入怪 ' + (orderedMons.length - targetCount) + ' 只）'
            : '🎯 以下均为任务目标怪';
          bodyEl.appendChild(tip);
        }

        orderedMons.forEach(function (entry, mi) {
          const m = entry.m;
          const block = document.createElement('div');
          block.className = 'quest-mon-block qm-collapsed';   // 默认折叠
          if (entry.isTarget) block.classList.add('qm-target');

          const pls = m.players || [];
          // 标题右侧显示「1人档 HP」概要，不展开也能看到关键信息
          const hp0 = (pls[0] && pls[0].hp) ? ' ' + pls[0].hp : '';

          const hd = document.createElement('div');
          hd.className = 'quest-mon-head';
          const f = icons[m.name];
          hd.innerHTML =
            (orderedMons.length > 1 ? '<span class="qm-idx">' + (mi + 1) + '</span>' : '') +
            (f ? '<img src="monster-icons/' + f + '" alt="">' : '<span class="qm-emoji">👹</span>') +
            '<span class="qm-name-txt">' + escapeHtml(m.name) + '</span>' +
            (entry.isTarget ? '<span class="qm-target-tag">目标</span>' : '') +
            (hp0 ? '<span class="qm-hp">' + escapeHtml(hp0.replace(/\s*HP$/, '')) + ' HP</span>' : '') +
            '<span class="qm-arrow">▶</span>';
          block.appendChild(hd);

          const bd = document.createElement('div');
          bd.className = 'quest-mon-body';

          if (pls.length) {
            // 每档人数一块（手机上比 9 列表格好读）
            pls.forEach(function (p) {
              const row = document.createElement('div');
              row.className = 'qm-row';

              const tag = document.createElement('span');
              tag.className = 'qm-players';
              tag.textContent = (p.p ? p.p + '人' : '—');
              row.appendChild(tag);

              const vals = document.createElement('div');
              vals.className = 'qm-vals';
              [
                ['HP', p.hp], ['攻击', p.atk], ['部位', p.parts], ['防御', p.def],
                ['异常', p.ail], ['眩晕', p.stun], ['耐力', p.stam], ['骑乘', p.mount],
              ].forEach(function (kv) {
                if (!kv[1]) return;
                const s = document.createElement('span');
                s.className = 'qm-kv';
                s.innerHTML = '<i>' + kv[0] + '</i>' + escapeHtml(String(kv[1]));
                vals.appendChild(s);
              });
              row.appendChild(vals);
              bd.appendChild(row);
            });
          } else {
            const none = document.createElement('div');
            none.className = 'mon-mat-none';
            none.textContent = '（无人数档数据）';
            bd.appendChild(none);
          }

          block.appendChild(bd);

          // 点标题 → 折叠；点怪物名 → 打开怪物弹窗
          hd.addEventListener('click', function (ev) {
            const nameTxt = ev.target && ev.target.closest && ev.target.closest('.qm-name-txt');
            if (nameTxt && MONSTERS[m.name] && _openMonsterModal) {
              // 记录历史：返回时回到本任务
              if (typeof _pushHist === 'function') _pushHist(function () { openQuestModal(qid); });
              _openMonsterModal(m.name);
              return;
            }
            const collapsed = block.classList.toggle('qm-collapsed');
            const arrow = hd.querySelector('.qm-arrow');
            if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
          });

          // 为了联动顺畅：怪物名加下划线提示可点
          if (MONSTERS[m.name] && _openMonsterModal) {
            hd.querySelector('.qm-name-txt').classList.add('qm-name-link');
          }

          bodyEl.appendChild(block);
        });
      }

      // ⑤ 补给箱
      const sups = q.supply || [];
      if (sups.length) {
        const sHead = document.createElement('div');
        sHead.className = 'mon-section-head';
        sHead.textContent = '补给箱（' + sups.length + '）';
        bodyEl.appendChild(sHead);

        const cloud = document.createElement('div');
        cloud.className = 'mon-mat-cloud';
        sups.forEach(function (s) {
          const chip = document.createElement('span');
          chip.className = 'mon-mat-chip quest-sup-chip';
          // count 数据形如 "x4"，已含 x 前缀 → 有 x 就直接拼，没有才补
          const _cnt = s.count ? String(s.count) : '';
          chip.textContent = s.item + (_cnt ? (/^x/i.test(_cnt) ? ' ' + _cnt : ' x' + _cnt) : '');
          // 素材名能对上 → 点开素材详情
          if (ITEMS[s.item] && _openItemModal) {
            chip.style.cursor = 'pointer';
            chip.addEventListener('click', function () {
              if (typeof _pushHist === 'function') _pushHist(function () { openQuestModal(qid); });
              _openItemModal(s.item);
            });
          }
          cloud.appendChild(chip);
        });
        bodyEl.appendChild(cloud);
      }

      // ⑥ 任务报酬（报酬金余额表：素材 + 数量 + 概率；common/additional 分组）
      const rw = q.reward || {};
      const rwCommon = rw.common || [];
      const rwAdd = rw.additional || [];
      if (rwCommon.length || rwAdd.length) {
        const rHead = document.createElement('div');
        rHead.className = 'mon-section-head';
        rHead.textContent = '任务报酬（' + (rwCommon.length + rwAdd.length) + '）';
        bodyEl.appendChild(rHead);

        function renderRewardGroup(title, list, cls) {
          if (!list.length) return;
          const sub = document.createElement('div');
          sub.className = 'quest-reward-sub ' + cls;
          sub.textContent = title + '（' + list.length + '）';
          bodyEl.appendChild(sub);

          const wrap = document.createElement('div');
          wrap.className = 'quest-reward-list';
          list.forEach(function (it) {
            const row = document.createElement('div');
            row.className = 'quest-reward-item';
            // 概率条宽度（0~100%）
            const pct = Math.max(0, Math.min(100, parseFloat(it.rate) || 0));
            row.innerHTML =
              '<span class="qr-name">' + escapeHtml(it.name) + '</span>' +
              '<span class="qr-bar"><i style="width:' + pct + '%"></i></span>' +
              '<span class="qr-count">x' + escapeHtml(String(it.count)) + '</span>' +
              '<span class="qr-rate">' + escapeHtml(it.rate) + '</span>';
            // 素材名能对上 → 可点跳素材详情
            if (ITEMS[it.name] && _openItemModal) {
              row.classList.add('qr-clickable');
              row.addEventListener('click', function () {
                if (typeof _pushHist === 'function') _pushHist(function () { openQuestModal(qid); });
                _openItemModal(it.name);
              });
            }
            wrap.appendChild(row);
          });
          bodyEl.appendChild(wrap);
        }
        renderRewardGroup('基本报酬', rwCommon, 'qr-common');
        renderRewardGroup('追加报酬', rwAdd, 'qr-add');
      }

      // ⑦ 上一任务 / 下一任务（同系列导航）
      const navs = [];
      if (q.prev) navs.push(['prev', '◀ 上一任务', q.prev]);
      if (q.next) navs.push(['next', '下一任务 ▶', q.next]);
      if (navs.length) {
        const nHead = document.createElement('div');
        nHead.className = 'mon-section-head';
        nHead.textContent = '同系列任务';
        bodyEl.appendChild(nHead);

        const navWrap = document.createElement('div');
        navWrap.className = 'quest-nav';
        navs.forEach(function (n) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quest-nav-btn ' + (n[0] === 'prev' ? 'qn-prev' : 'qn-next');
          btn.innerHTML = '<span class="qn-arrow">' + escapeHtml(n[1]) + '</span>' +
            '<span class="qn-name">' + escapeHtml(cleanQuestText(n[2])) + '</span>';
          // 找同名任务 → 可直接跳转
          btn.addEventListener('click', function () {
            const targetId = findQuestIdByName(n[2]);
            if (targetId && targetId !== qid) {
              if (typeof _pushHist === 'function') _pushHist(function () { openQuestModal(qid); });
              openQuestModal(targetId);
            }
          });
          navWrap.appendChild(btn);
        });
        bodyEl.appendChild(navWrap);
      }

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    _openQuestModal = openQuestModal;

    // 任务列表块（默认折叠，点标题展开）
    // monName：所属怪物名（用于「返回」历史栈）
    function buildQuestBlock(quests, monName) {
      const wrap = document.createElement('div');
      wrap.className = 'mon-quest';

      const head = document.createElement('div');
      head.className = 'mon-section-head mon-quest-toggle';
      head.innerHTML = '任务列表（' + quests.length + '）' +
        '<span class="mon-quest-arrow">▼</span>';
      wrap.appendChild(head);

      const listEl = document.createElement('div');
      listEl.className = 'mon-quest-list collapsed';

      // 常见字段：quest/players/hp/attack/parts/defense/ailment/stun/stamina/mount
      const FIELD_LABEL = {
        players: '人数', hp: 'HP', attack: '攻击', parts: '部位',
        defense: '防御', ailment: '异常', stun: '晕眩',
        stamina: '耐力', mount: '骑乘',
      };
      const FIELD_ORDER = ['players', 'hp', 'attack', 'parts', 'defense',
        'ailment', 'stun', 'stamina', 'mount'];

      // 先解析每行（顺带识别分类 + 判断「本怪是否为该任务目标」）
      // 同名任务计数器：记录每个「纯任务名」在本怪任务表里第几次出现
      // （用于解决「来自彼方的凶星」等同名多地图任务的歧义）
      const _nameOccur = {};
      const parsed = quests.map(function (q) {
        let questName, fields;
        if (Array.isArray(q)) {
          questName = q[0];
          fields = q.slice(1);
          fields = FIELD_ORDER.map(function (k, i) {
            return { key: k, val: fields[i] };
          }).filter(function (x) { return x.val; });
        } else {
          questName = q.quest || '';
          fields = FIELD_ORDER
            .filter(function (k) { return q[k]; })
            .map(function (k) { return { key: k, val: q[k] }; });
        }

        // 拆出「任务名 / 出生区域 / 金冠概率」（旧数据可能是裸任务名）
        const areaInfo = parseQuestArea(questName);
        const pureName = areaInfo.name || questName;

        // 本怪任务表里，该任务名第几次出现（0 起）
        const pureKey = pureName.replace(/\s+/g, '');
        const occurIndex = _nameOccur[pureKey] || 0;
        _nameOccur[pureKey] = occurIndex + 1;

        // 用「纯任务名 + 本怪名 + 出现序号」匹配 quests.js
        // （带区域/金冠的原始串会匹配失败；同名多地图任务需靠怪名+序号区分）
        let qid = findQuestIdForMonster(pureName, monName, occurIndex);
        if (!qid) qid = findQuestIdByLabel(pureName);
        if (!qid) qid = findQuestIdByLabel(questName);
        const qd = qid ? QUESTS[qid] : null;

        // 地图名（由任务的地图编号反查）
        const mapName = (qd && qd.mapNo) ? questMapName(qd.mapNo) : '';

        // 本怪是否是该任务的「主要目标怪」？
        // 注意：任务弹窗里怪物名可能是「怪异化」等带括号形式，做宽松匹配
        let isTarget = false;
        if (qd && monName) {
          const info = analyzeQuestTargets(qd.goal, qd.mons || []);
          isTarget = info.list.some(function (x) {
            if (!x.isTarget || !x.name) return false;
            const a = x.name.replace(/[（(].*?[)）]/g, '').trim();
            const b = String(monName).replace(/[（(].*?[)）]/g, '').trim();
            return x.name === monName || a === b || a === monName || x.name === b;
          });
        }

        return {
          name: pureName,
          rawName: questName,
          areas: areaInfo.areas,
          crownMini: areaInfo.crownMini,
          crownKing: areaInfo.crownKing,
          mapName: mapName,
          fields: fields,
          qid: qid,
          cat: (qd && qd.cat) || '其他',
          star: (qd && qd.star) || 0,
          isTarget: isTarget,
        };
      });

      // 排序：① 本怪是「主要目标」的任务 → 靠前
      //       ② 星级降序（★ 高的在前）
      //       ③ 同星级再按 分类顺序
      parsed.sort(function (a, b) {
        if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
        const sa = a.star || 0, sb = b.star || 0;
        if (sa !== sb) return sb - sa;   // 星级降序
        const ca = QUEST_CAT_ORDER.indexOf(a.cat);
        const cb = QUEST_CAT_ORDER.indexOf(b.cat);
        return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
      });

      // ---- 分类筛选条（≥2 类才显示）----
      const catCount = {};
      parsed.forEach(function (it) { catCount[it.cat] = (catCount[it.cat] || 0) + 1; });
      const catList = QUEST_CAT_ORDER.filter(function (c) { return catCount[c]; })
        .concat(Object.keys(catCount).filter(function (c) { return QUEST_CAT_ORDER.indexOf(c) < 0; }));

      let filterBar = null;
      const rows = [];      // { el, cat }
      let activeCat = '';

      if (catList.length >= 2) {
        filterBar = document.createElement('div');
        filterBar.className = 'mon-quest-filter';
        const mk = function (label, val, count) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mqf-btn' + (val === '' ? ' active' : '');
          b.setAttribute('data-cat', val);
          b.textContent = label + (count != null ? ' ' + count : '');
          b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            activeCat = val;
            filterBar.querySelectorAll('.mqf-btn').forEach(function (x) {
              x.classList.toggle('active', x === b);
            });
            rows.forEach(function (r) {
              r.el.style.display = (!val || r.cat === val) ? '' : 'none';
            });
          });
          return b;
        };
        filterBar.appendChild(mk('全部', '', parsed.length));
        catList.forEach(function (c) { filterBar.appendChild(mk(c, c, catCount[c])); });
        listEl.appendChild(filterBar);
      }

      // ---- 任务行 ----
      parsed.forEach(function (it) {
        const row = document.createElement('div');
        row.className = 'mon-quest-row';
        if (it.isTarget) row.classList.add('mon-quest-target');

        // 任务名行：指标记 + 名字
        const nm = document.createElement('div');
        nm.className = 'mon-quest-name';
        nm.innerHTML =
          (it.isTarget ? '<span class="mq-target-badge">主要目标</span>' : '') +
          '<span class="mq-name-txt">' + escapeHtml(it.name) + '</span>';
        row.appendChild(nm);

        // 分类 / 星级：小标签，增加层次
        if (it.cat && it.cat !== '其他') {
          const tag = document.createElement('div');
          tag.className = 'mon-quest-tags';
          tag.innerHTML =
            '<span class="mq-cat">' + escapeHtml(it.cat) + '</span>' +
            (it.star ? '<span class="mq-star">★' + it.star + '</span>' : '');
          row.appendChild(tag);
        }

        // 出生区域 + 金冠概率（来自 monsters.js 的 quest 尾部数据）
        const hasArea = it.areas && it.areas.length;
        const hasCrown = it.crownMini || it.crownKing;
        if (hasArea || hasCrown) {
          const spawn = document.createElement('div');
          spawn.className = 'mq-spawn';

          // 区域：📍 地图名 7区 60% · 8区 30%
          if (hasArea) {
            const areaWrap = document.createElement('div');
            areaWrap.className = 'mq-spawn-areas';
            const mapTag = it.mapName
              ? '<span class="mq-map-name">📍' + escapeHtml(it.mapName) + '</span>'
              : '';
            const chips = it.areas.map(function (a) {
              return '<span class="mq-area-chip">' +
                '<b>' + a.n + '区</b><i>' + escapeHtml(String(a.rate)) + '%</i>' +
                '</span>';
            }).join('');
            areaWrap.innerHTML = mapTag + chips;
            spawn.appendChild(areaWrap);
          }

          // 金冠：👑小金 6% / 👑大金 10%（用刚抓的图标）
          if (hasCrown) {
            const crownWrap = document.createElement('div');
            crownWrap.className = 'mq-spawn-crowns';
            if (it.crownMini) {
              crownWrap.innerHTML +=
                '<span class="mq-crown-chip crown-mini" title="小金冠概率">' +
                '<img src="ui-icons/crown_mini.png" alt="小金">' +
                '<i>' + escapeHtml(String(it.crownMini)) + '%</i></span>';
            }
            if (it.crownKing) {
              crownWrap.innerHTML +=
                '<span class="mq-crown-chip crown-king" title="大金冠概率">' +
                '<img src="ui-icons/crown_king.png" alt="大金">' +
                '<i>' + escapeHtml(String(it.crownKing)) + '%</i></span>';
            }
            spawn.appendChild(crownWrap);
          }

          row.appendChild(spawn);
        }

        const meta = document.createElement('div');
        meta.className = 'mon-quest-meta';
        it.fields.forEach(function (f) {
          const s = document.createElement('span');
          s.className = 'qmeta';
          s.innerHTML = '<i>' + (FIELD_LABEL[f.key] || f.key) + '</i>' +
            escapeHtml(String(f.val));
          meta.appendChild(s);
        });
        row.appendChild(meta);

        // 能对上 quests.js 里的任务 → 可点击看详情
        if (it.qid && _openQuestModal) {
          row.classList.add('mon-quest-clickable');
          row.title = '点击查看任务详情';
          row.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (typeof _pushHist === 'function') {
              // 记住当前怪物弹窗的完整上下文（怪名 + 高亮素材），返回时精准还原
              const ctx = _curMonCtx;
              _pushHist(function () {
                if (ctx && ctx.monName) openMonsterModal(ctx.monName, ctx.focusItem);
                else openMonsterModal(monName);
              });
            }
            _openQuestModal(it.qid);
          });
        }

        rows.push({ el: row, cat: it.cat });
        listEl.appendChild(row);
      });

      wrap.appendChild(listEl);

      head.addEventListener('click', function () {
        listEl.classList.toggle('collapsed');
        const arrow = head.querySelector('.mon-quest-arrow');
        if (arrow) arrow.textContent =
          listEl.classList.contains('collapsed') ? '▼' : '▲';
      });

      return wrap;
    }

    // 素材掉落明细（按 下位/上位/大师 分组）
    function buildMatDetail(monName, itemName, rows, highlight) {
      const wrap = document.createElement('div');
      wrap.className = 'mon-mat-detail' + (highlight ? ' highlight' : '');

      // 素材名 + 等级标签
      const nm = document.createElement('div');
      nm.className = 'mon-mat-title';
      nm.appendChild(document.createTextNode(itemName));

      // 等级标签（来自该素材在此怪物的掉落等级，取不到就用明细行的等级）
      let ranks = [];
      if (rows.length) {
        const set = {};
        rows.forEach(function (r) { if (r.rank) set[normRank(r.rank, r.item)] = true; });
        ranks = RANK_ORDER.filter(function (r) { return set[r]; });
      } else {
        // 无掉落行（例如采集类），用全局反查
        ranks = ranksForMaterial(itemName);
      }
      if (ranks.length) {
        const tagWrap = document.createElement('span');
        tagWrap.className = 'mon-mat-rank-tags';
        ranks.forEach(function (r) {
          const t = document.createElement('span');
          t.className = 'mat-rank-tag rank-' + rankKey(r);
          t.textContent = r;
          tagWrap.appendChild(t);
        });
        nm.appendChild(tagWrap);
      }
      // 「查看素材详情」按钮（打开素材详情弹窗，可返回）
      if (ITEMS[itemName] && typeof openItemModal === 'function') {
        const iBtn = document.createElement('button');
        iBtn.type = 'button';
        iBtn.className = 'mat-detail-btn';
        iBtn.textContent = '📦';
        iBtn.title = '查看素材详情';
        iBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (typeof pushModalHistory === 'function') {
            pushModalHistory(function () { openMonsterModal(monName, itemName); });
          }
          openItemModal(itemName);
        });
        nm.appendChild(iBtn);
      }
      wrap.appendChild(nm);

      const info = ITEMS[itemName];
      if (info && info.desc) {
        const d = document.createElement('div');
        d.className = 'mon-mat-desc';
        d.textContent = info.desc;
        wrap.appendChild(d);
      }

      // 按等级分组
      const order = RANK_ORDER;
      let anyRow = false;
      order.forEach(function (rank) {
        const sub = rows.filter(function (r) { return normRank(r.rank, r.item) === rank; });
        if (!sub.length) return;
        anyRow = true;

        const grp = document.createElement('div');
        grp.className = 'mon-rank-group rank-' + rankKey(rank);

        const h = document.createElement('div');
        h.className = 'mon-rank-head';
        h.textContent = '【' + rank + '】';
        grp.appendChild(h);

        sub.forEach(function (r) {
          const line = document.createElement('div');
          line.className = 'mon-drop-row';
          // 怪异素材：在部位前加「怪异调查」前缀（如「本体」→「怪异调查 本体」）
          const _isAnom = /^(怪异化的|破怪的)/.test(String(itemName || ''));
          const _partTxt = r.part
            ? (_isAnom ? '怪异调查 ' + prettyPart(r.part) : prettyPart(r.part))
            : '';
          line.innerHTML =
            '<span class="drop-way">' + escapeHtml(r.way) + '</span>' +
            (_partTxt ? '<span class="drop-part">' + escapeHtml(_partTxt) + '</span>' : '') +
            '<span class="drop-count">' + escapeHtml(r.count) + '</span>' +
            '<span class="drop-rate">' + escapeHtml(r.rate) + '</span>';
          grp.appendChild(line);
        });
        wrap.appendChild(grp);
      });

      // 该怪物没有此素材的掉落记录
      if (!anyRow) {
        const none = document.createElement('div');
        none.className = 'mon-mat-none';
        none.textContent = '（本怪物无该素材的直接掉落记录）';
        wrap.appendChild(none);
      }

      // 无论是否有怪物掉落，都补充「其他获得途径」（来自 items.js）
      // 返回时回到「当前怪物页（高亮该素材）」
      wrap.appendChild(buildObtainBlock(itemName, false, function () {
        openMonsterModal(monName, itemName);
      }));

      return wrap;
    }

    // 其他获得途径（来自 items.js 的 obtain 列表）
    // backFn: 点怪物后，按「返回」时回到哪里（默认回素材详情）
    // 获得途径类型归一化 → {group, label, icon}
    // 原始 type 有 ~29 种，归成 6 个大组
    function obtainTypeInfo(t) {
      t = String(t || '').trim();
      if (!t) return { group: 'zzz', label: '其他', icon: '•' };
      if (/^部位破坏/.test(t) || /^broken$/.test(t))
        return { group: 'part', label: '部位破坏', icon: '🦴' };
      if (/^剥取/.test(t) || /^carve$/.test(t))
        return { group: 'carve', label: '剥取', icon: '🎣' };
      if (/^掉落物/.test(t) || /^drop$/.test(t))
        return { group: 'drop', label: '掉落物', icon: '💧' };
      if (/^随从/.test(t))
        return { group: 'palico', label: '随从收集', icon: '🐱' };
      if (/^(大师等级|上位|下位)$/.test(t))
        return { group: 'rank', label: '等级报酬', icon: '⚔' };
      if (/^捕获/.test(t) || /^capture$/.test(t))
        return { group: 'quest', label: '任务报酬', icon: '📋' };
      if (/^(目标报酬|追加报酬|任务报酬|任务奖励|追加|additional|reward|add_target|quest|common|gather)$/.test(t))
        return { group: 'quest', label: '任务报酬', icon: '📋' };
      return { group: 'other', label: '其他', icon: '•' };
    }

    // 渲染「其他获得途径」单行（带概率条）
    // r: {quest, rank, type, count, rate, _g, _glabel, _gicon}
    function renderObtainRow(r, parent, itemName, backFn) {
      const line = document.createElement('div');
      line.className = 'mon-obtain-row' + (r._g ? ' og-' + r._g : '');

      // 左：来源名（怪物名/任务名/地名）
      const qspan = document.createElement('span');
      qspan.className = 'obtain-quest';
      const _qid = (typeof findQuestIdByLabel === 'function')
        ? findQuestIdByLabel(r.quest) : null;
      if (MONSTERS[r.quest]) {
        const mb = document.createElement('button');
        mb.type = 'button';
        mb.className = 'obtain-mon-link';
        mb.textContent = r.quest;
        mb.title = '查看怪物：' + r.quest;
        mb.addEventListener('click', function (e) {
          e.stopPropagation();
          if (typeof pushModalHistory === 'function') {
            if (typeof backFn === 'function') {
              pushModalHistory(backFn);
            } else {
              pushModalHistory(function () {
                if (itemName && ITEMS[itemName]) openItemModal(itemName);
              });
            }
          }
          openMonsterModal(r.quest, itemName);
        });
        qspan.appendChild(mb);
      } else if (_qid && typeof _openQuestModal === 'function') {
        const qb = document.createElement('button');
        qb.type = 'button';
        qb.className = 'obtain-quest-link';
        qb.textContent = r.quest;
        qb.title = '查看任务详情';
        qb.addEventListener('click', function (e) {
          e.stopPropagation();
          if (typeof pushModalHistory === 'function') {
            if (typeof backFn === 'function') {
              pushModalHistory(backFn);
            } else {
              pushModalHistory(function () {
                if (itemName && ITEMS[itemName]) openItemModal(itemName);
              });
            }
          }
          _openQuestModal(_qid);
        });
        qspan.appendChild(qb);
      } else {
        qspan.textContent = r.quest;
      }
      line.appendChild(qspan);

      // 右：难度 + 数量 + 概率
      const meta = document.createElement('span');
      meta.className = 'obtain-meta';
      const _rk = r.rank ? normRank(r.rank, itemName) : '';
      if (_rk) {
        const ks = document.createElement('span');
        ks.className = 'obtain-rank mat-rank-tag rank-' + rankKey(_rk);
        ks.textContent = _rk;
        meta.appendChild(ks);
      }
      if (r.count) {
        const cs = document.createElement('span');
        cs.className = 'obtain-count';
        cs.textContent = r.count;
        meta.appendChild(cs);
      }
      // 概率数字 + 条
      const pct = parseInt(String(r.rate || '').replace(/[^\d]/g, ''), 10);
      if (!isNaN(pct)) {
        const rs = document.createElement('span');
        rs.className = 'obtain-rate';
        rs.textContent = r.rate;
        meta.appendChild(rs);
      }
      line.appendChild(meta);

      // 概率条（第二行，铺满）
      if (!isNaN(pct)) {
        const barWrap = document.createElement('span');
        barWrap.className = 'obtain-bar';
        const bar = document.createElement('span');
        bar.className = 'obtain-bar-fill';
        // 概率→颜色：低(蓝) → 中(青绿) → 高(金)
        let cls = 'lv-low';
        if (pct >= 60) cls = 'lv-high';
        else if (pct >= 30) cls = 'lv-mid';
        bar.classList.add(cls);
        bar.style.width = Math.max(2, Math.min(100, pct)) + '%';
        barWrap.appendChild(bar);
        line.appendChild(barWrap);
      }
      parent.appendChild(line);
    }

    function buildObtainBlock(itemName, expanded, backFn) {
      const wrap = document.createElement('div');
      wrap.className = 'mon-obtain';

      const info = ITEMS[itemName];
      const ob = info && info.obtain ? info.obtain : [];
      if (!ob.length) return wrap;

      // 去重（同 quest+rank+type+count+rate 视为一条）
      const seen = {};
      const rows = [];
      ob.forEach(function (o) {
        const q = o.quest || o.name || (typeof o === 'string' ? o : '');
        const rank = o.rank || '';
        const key = [q, rank, o.type, o.count, o.rate].join('|');
        if (seen[key]) return;
        seen[key] = 1;
        rows.push({
          quest: q,
          rank: rank,
          type: o.type || '',
          count: o.count || '',
          rate: o.rate || '',
        });
      });
      if (!rows.length) return wrap;
      // ---- 按类型分组（组内保持原顺序，组按固定次序）----
      const GROUP_ORDER = ['quest', 'carve', 'drop', 'part', 'palico', 'rank', 'other', 'zzz'];
      const groups = {};
      rows.forEach(function (r) {
        const ti = obtainTypeInfo(r.type);
        r._g = ti.group;
        r._glabel = ti.label;
        r._gicon = ti.icon;
        if (!groups[ti.group]) groups[ti.group] = { label: ti.label, icon: ti.icon, rows: [] };
        groups[ti.group].rows.push(r);
      });
      const groupList = GROUP_ORDER.filter(function (g) { return groups[g]; })
        .map(function (g) { return groups[g]; });
      const h = document.createElement('div');
      h.className = 'mon-obtain-head';
      h.textContent = '其他获得途径（' + rows.length + '）';
      wrap.appendChild(h);
      const list = document.createElement('div');
      list.className = 'mon-obtain-list';
      if (!expanded) list.classList.add('collapsed');   // 非素材弹窗时默认折叠

      // ---- 逐组渲染 ----
      groupList.forEach(function (grp, gi) {
        const gBox = document.createElement('div');
        gBox.className = 'obtain-group obtain-group-' + (gi % 2 ? 'odd' : 'even');
        const gHead = document.createElement('div');
        gHead.className = 'obtain-group-head';
        gHead.innerHTML = '<span class="obtain-group-icon">' + grp.icon + '</span>' +
          '<span class="obtain-group-name">' + escapeHtml(grp.label) + '</span>' +
          '<span class="obtain-group-count">' + grp.rows.length + '</span>';
        gBox.appendChild(gHead);
        const gBody = document.createElement('div');
        gBody.className = 'obtain-group-body';
        grp.rows.forEach(function (r) {
          renderObtainRow(r, gBody, itemName, backFn);
        });
        gBox.appendChild(gBody);
        list.appendChild(gBox);
      });
      wrap.appendChild(list);

      // 点标题展开/收起
      h.classList.add('mon-obtain-toggle');
      h.innerHTML = h.textContent + '<span class="mon-obtain-arrow">' +
        (expanded ? '▲' : '▼') + '</span>';
      h.addEventListener('click', function () {
        list.classList.toggle('collapsed');
        const a = h.querySelector('.mon-obtain-arrow');
        if (a) a.textContent = list.classList.contains('collapsed') ? '▼' : '▲';
      });

      return wrap;
    }

    // 部位破坏的 BodyPart N → 中文（粗略映射，取不到就原样）
    function prettyPart(p) {
      var m = /^BodyPart\s+(\d+)$/.exec(p);
      if (!m) return p;
      return '部位' + m[1];
    }

    // 肉质表表头（主表 / 状态表共用）
    function buildHitHead(COLS, firstColText) {
      const thead = document.createElement('thead');
      const htr = document.createElement('tr');
      const th0 = document.createElement('th');
      th0.className = 'hit-part-th';
      th0.textContent = firstColText || '部位';
      htr.appendChild(th0);
      COLS.forEach(function (c) {
        const th = document.createElement('th');
        th.className = 'hit-ico ' + c.cls;
        th.title = c.label;
        const im = document.createElement('img');
        im.src = c.img;
        im.alt = c.label;
        im.className = 'hit-ico-img';
        th.appendChild(im);
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      return thead;
    }

    // 部位肉质表
    // 行结构: [部位, State, 斩击, 打击, 弹, 火, 水, 冰, 雷, 龙, 眩晕]
    function buildHitzoneBlock(hz) {
      const wrap = document.createElement('div');
      wrap.className = 'mon-hit';

      const head = document.createElement('div');
      head.className = 'mon-section-head';
      const ht = document.createElement('span');
      ht.textContent = '部位肉质';
      head.appendChild(ht);
      wrap.appendChild(head);

      // 列定义（Kiranico 官方图标 + 中文提示）
      const COLS = [
        { i: 2, img: 'hit-icons/hit_slash.png', label: '斩击', cls: 'physical' },
        { i: 3, img: 'hit-icons/hit_strike.png', label: '打击', cls: 'physical' },
        { i: 4, img: 'hit-icons/hit_shell.png', label: '弹（弹药）', cls: 'physical' },
        { i: 5, img: 'hit-icons/element_fire.png', label: '火属性', cls: 'elem' },
        { i: 6, img: 'hit-icons/element_water.png', label: '水属性', cls: 'elem' },
        { i: 7, img: 'hit-icons/element_ice.png', label: '冰属性', cls: 'elem' },
        { i: 8, img: 'hit-icons/element_thunder.png', label: '雷属性', cls: 'elem' },
        { i: 9, img: 'hit-icons/element_dragon.png', label: '龙属性', cls: 'elem' },
        { i: 10, img: 'hit-icons/element_stun.png', label: '眩晕', cls: 'stun' },
      ];

      // 数值 → 色阶（0=灰，越高越红/亮）
      function cellColor(v) {
        const n = parseInt(v, 10);
        if (!isFinite(n) || n <= 0) return 'hit-none';
        if (n >= 60) return 'hit-hi';
        if (n >= 40) return 'hit-mid';
        if (n >= 25) return 'hit-lo';
        return 'hit-min';
      }

      // 有哪些状态（0=常态）
      const stateIds = [];
      hz.forEach(function (r) {
        if (stateIds.indexOf(r[1]) < 0) stateIds.push(r[1]);
      });
      stateIds.sort(function (a, b) { return Number(a) - Number(b); });
      const hasStates = stateIds.length > 1;

      // 数据里的 State 从 0 开始，展示时 +1；0 用「常态」表示
      function stateLabel(s) {
        const n = (s === undefined || s === null || s === '') ? 0 : Number(s);
        if (n === 0) return '常态';
        return '状态 ' + (isFinite(n) ? n + 1 : String(s));
      }

      // ---- 分组数据 ----
      // 按状态：{ 状态: [行...] }
      const byState = {};
      hz.forEach(function (r) {
        const s = r[1];
        (byState[s] = byState[s] || []).push(r);
      });

      // ---- 表格容器（可切换） ----
      const tblWrap = document.createElement('div');
      wrap.appendChild(tblWrap);

      let mode = 'part';   // 'part' | 'state'

      // 部位名展示（和 Kiranico 网站保持一致，空就空着）
      // 名字过长时：本格内部可左右滑动（不影响其他列、不影响整页）
      function makePartName(name) {
        const el = document.createElement('span');
        el.className = 'hit-part-name';
        el.textContent = name || '';
        return el;
      }

      // 把部位名 + 状态 包成「本格可横滑」的容器
      function makePartCell(name, stateText, stateCls) {
        const scroll = document.createElement('div');
        scroll.className = 'hit-part-scroll';
        scroll.appendChild(makePartName(name));
        if (stateText !== null && stateText !== undefined) {
          const sp = document.createElement('span');
          sp.className = 'hit-state' + (stateCls || '');
          sp.textContent = stateText;
          scroll.appendChild(sp);
        }
        return scroll;
      }

      function renderTable() {
        tblWrap.innerHTML = '';
        const tbl = document.createElement('table');
        tbl.className = 'mon-hit-table';
        tbl.appendChild(buildHitHead(COLS, mode === 'part' ? '部位 · 状态' : '状态 · 部位'));
        const tbody = document.createElement('tbody');

        if (mode === 'part') {
          // 按部位：把「连续的相同部位名」合并（视觉上只显示一次部位名）
          // 例：头部×4状态 → 合并；但 爪…(其他)…爪 → 不合并（中间隔了别的部位）
          const stateCol = hz.some(function (r) { return String(r[1]) !== '0'; });
          hz.forEach(function (r, idx) {
            const tr = document.createElement('tr');
            const td0 = document.createElement('td');
            td0.className = 'hit-part';
            // 和上一行同名 → 不重复显示部位名（靠 border 连成一组）
            const sameAsPrev = idx > 0 && hz[idx - 1][0] === r[0];
            if (!sameAsPrev) {
              td0.appendChild(makePartCell(r[0],
                stateCol ? stateLabel(r[1]) : null,
                (!r[1] || r[1] === '0') ? ' hit-state-normal' : ''));
            } else {
              td0.className += ' hit-part-cont';
              if (stateCol) {
                const sp = document.createElement('span');
                sp.className = 'hit-state' + ((!r[1] || r[1] === '0') ? ' hit-state-normal' : '');
                sp.textContent = stateLabel(r[1]);
                td0.appendChild(sp);
              }
            }
            tr.appendChild(td0);
            COLS.forEach(function (c) {
              const td = document.createElement('td');
              const v = r[c.i];
              td.className = cellColor(v);
              td.textContent = v;
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
        } else {
          // 按状态分组：状态名 cell 只在第一行显示；部位名放本格可横滑容器里
          stateIds.forEach(function (s) {
            const rows = byState[s];
            rows.forEach(function (r, i) {
              const tr = document.createElement('tr');
              const td0 = document.createElement('td');
              td0.className = 'hit-part hit-part-group';
              const scroll = document.createElement('div');
              scroll.className = 'hit-part-scroll hit-part-scroll-state';
              if (i === 0) {
                const nm = document.createElement('span');
                nm.className = 'hit-part-name hit-state-name';
                nm.textContent = stateLabel(s);
                scroll.appendChild(nm);
              }
              const sp = document.createElement('span');
              sp.className = 'hit-state hit-state-part';
              sp.textContent = r[0] || '';
              scroll.appendChild(sp);
              td0.appendChild(scroll);
              tr.appendChild(td0);
              COLS.forEach(function (c) {
                const td = document.createElement('td');
                const v = r[c.i];
                td.className = cellColor(v);
                td.textContent = v;
                tr.appendChild(td);
              });
              tbody.appendChild(tr);
            });
          });
        }
        tbl.appendChild(tbody);
        tblWrap.appendChild(tbl);
      }

      // ---- 切换按钮（仅当有多种状态时才有意义） ----
      if (hasStates) {
        const sw = document.createElement('div');
        sw.className = 'hit-mode-switch';
        const b1 = document.createElement('button');
        b1.type = 'button';
        b1.className = 'hit-mode-btn active';
        b1.textContent = '按部位';
        const b2 = document.createElement('button');
        b2.type = 'button';
        b2.className = 'hit-mode-btn';
        b2.textContent = '按状态';
        sw.appendChild(b1);
        sw.appendChild(b2);
        // 放在标题行右侧
        head.appendChild(sw);

        b1.addEventListener('click', function () {
          if (mode === 'part') return;
          mode = 'part';
          b1.classList.add('active');
          b2.classList.remove('active');
          renderTable();
        });
        b2.addEventListener('click', function () {
          if (mode === 'state') return;
          mode = 'state';
          b2.classList.add('active');
          b1.classList.remove('active');
          renderTable();
        });
      }

      renderTable();

      // 图例
      const lg = document.createElement('div');
      lg.className = 'hit-legend';
      lg.innerHTML =
        '<span class="hl-item">数值越高伤害越高：</span>' +
        '<span class="hl-hit hit-min">低</span>' +
        '<span class="hl-hit hit-lo">中</span>' +
        '<span class="hl-hit hit-mid">高</span>' +
        '<span class="hl-hit hit-hi">很高</span>';
      wrap.appendChild(lg);

      return wrap;
    }

    // 桥接给顶层
    _openMonsterModal = openMonsterModal;

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

      // 可用百龙珠
      const ramDecoEl = buildRamDecoSection(name);
      if (ramDecoEl) bodyEl.appendChild(ramDecoEl);

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    // 弹窗关闭：点关闭按钮 / 点遮罩 / 按 ESC
    (function bindModalClose() {
      const overlay = document.getElementById('skillModal');
      const closeBtn = document.getElementById('modalClose');
      const backBtn = document.getElementById('modalBack');
      if (closeBtn) closeBtn.addEventListener('click', closeSkillModal);
      if (backBtn) backBtn.addEventListener('click', modalGoBack);
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

    // 搜索框清除按钮
    (function bindSearchClear() {
      const btn = document.getElementById('searchClear');
      const input = document.getElementById('searchInput');
      if (!btn || !input) return;
      // 根据有无内容显隐
      const sync = () => {
        btn.classList.toggle('show', !!input.value);
      };
      input.addEventListener('input', sync);
      sync();
      btn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        input.focus();
      });
    })();

    // 统计
    const toggleCount = skillCards.filter((it) => it.el.dataset.hasToggle === '1').length;

    console.log(
      '[mhrise-skill] 渲染完成 | 详述版技能:', skillCards.length,
      '(可切换原文:', toggleCount, ') | 仅原文版技能:', gameOnlyCards.length,
      '| 百龙技能:', rampageIds.length
    );
  });
})();