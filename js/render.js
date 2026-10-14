// mhrise-skill / render.js
// 渲染 + 搜索 + 武器差分
// -----------------------------------------------------------------------------
// 本文件的逻辑严格对照原版模组引擎 better_skill_descriptions.lua 重写，
// 修正了武器映射、远程武器判定、levels_by_index 覆盖语义、weapons 索引基准、
// 以及斩斧瓶类型（phials）等逻辑。数据来源：Nexus Mods mods/3872
// -----------------------------------------------------------------------------

(function () {
  'use strict';
  // escapeHtml 统一用 core/dom.js 的实现（多转义引号，更安全）
  var escapeHtml = MHRS.dom.escapeHtml;

  // ========================================================
  // 武器 ID → 名称映射（对照 lua WEAPON_NAMES，勿随意修改）
  // ========================================================
  // 武器 ID → 名称映射（数据见 js/game_data.js）
  const WEAPON_NAMES = MHRS.game.WEAPON_NAMES;
  // 远程武器 ID（对照 lua RANGED_WEAPONS = {3,4,13}）
  const RANGED_WEAPONS = MHRS.game.RANGED_WEAPONS;

  // ========================================================
  // 珠子（装饰品）数据关联层
  // decoration.js：{ "id": { hex, slot, lv, dname, skip?, material:[{item,count}] } }
  // hex = 对应技能ID → 可用「技能 decId ↔ 珠子」双向关联
  // ========================================================
  const DECO = MHRS.deco.data || {};
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
  // 顶层桥接：刷新「返回」按钮显隐（弹窗打开时始终显示）
  let _updateModalBack = null;
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
  const ITEMS = MHRS.item.data || {};
  const MONSTERS = MHRS.monster.data || {};
  // quests.js: { "任务id": {name,cat,star,full,desc,goal,fail,hrp,mrp,mons,supply} }
  const QUESTS = MHRS.quest.data || {};
  // 任务分类顺序（数据见 js/game_data.js）
  const QUEST_CAT_ORDER = MHRS.game.QUEST_CAT_ORDER;

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
      const _rk = m.rank;
      if (_rk) ranksByMaterial[m.item][monName][_rk] = true;
    });
  });

  // 等级排序 & 显示名（数据见 js/game_data.js）
  const RANK_ORDER = MHRS.game.RANK_ORDER;
  const RANK_SHORT = MHRS.game.RANK_SHORT;
  function rankKey(rank) {
    if (rank === '下位') return 'low';
    if (rank === '上位') return 'high';
    if (rank === '怪异') return 'anomaly';
    return 'master';
  }

  // 查某素材来自哪些怪物
  function monstersForMaterial(itemName) {
    return monsterByMaterial[itemName] || [];
  }

  // 构建「使用效果」DOM（item_effects.js）
  // 无效果数据时返回 null
  // [B4] 转发（material 板块）
  function buildItemEffectEl(itemName) {
    return MHRS.materialSection.buildEffectEl(itemName);
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
  // [C4] 转发
  function dropRows(monName, itemName) {
    return MHRS.monsterSection.dropRows(monName, itemName);
  }

  // 某怪物的素材，按等级分组 → [{rank, items:[...]}, ...]
  // [C4] 转发
  function materialsByRank(monName) {
    return MHRS.monsterSection.materialsByRank(monName);
  }

  // 取某技能（十进制ID）可用的珠子列表
  // [B3] 转发
  function decosForSkill(decId) {
    return MHRS.decoSection.decosForSkill(decId);
  }

  // ========================================================
  // 百龙装饰品（百龙珠）关联层
  // rampage_decorations.js: [ { name, skill, slot, desc }, ... ]
  // 通过「百龙技能名」关联（无 ID 体系）
  // ========================================================
  const RAM_DECO = MHRS.deco.rampage || [];   // [B4] 索引已迁到 sections/ramdeco.js

  // 取某百龙技能名可用的百龙珠
  // [B4] 转发
  function ramDecosForSkill(skillName) {
    return MHRS.ramDecoSection.ramDecosForSkill(skillName);
  }

  // 构造「可用百龙珠」区块 DOM
  // opts.noSkillHistory=true 时：点百龙珠 chip 不记录「返回后重开百龙技能弹窗」
  //   - 百龙技能卡片内使用 → true（返回时直接回卡片列表）
  //   - 百龙技能弹窗内使用 → false（返回时回到百龙技能弹窗）
  // [B4] 转发
  function buildRamDecoSection(skillName, opts) {
    return MHRS.ramDecoSection.buildSection(skillName, opts);
  }

  // 百龙珠的搜索文本
  // [B4] 转发
  function buildRamDecoSearchText(skillName) {
    return MHRS.ramDecoSection.ramDecosSearchText(skillName);
  }

  // 构造「可用珠子」区块 DOM
  // opts.compact=true 时仅列名字；否则带孔位/等级
  // opts.noSkillHistory=true 时：点珠子 chip 不记录「返回后重开技能弹窗」
  //   - 技能卡片内使用 → true（返回时直接回卡片列表，不再弹技能弹窗）
  //   - 技能弹窗内使用 → false（返回时回到技能弹窗）
  // [B3] 已迁移到 js/sections/deco.js —— 此处转发（供技能卡片嵌入）
  function buildDecoSection(decId, opts) {
    return MHRS.decoSection.buildDecoSection(decId, opts);
  }


  // 武器标签高亮色（对照 lua WEAPON_LABEL_COLOR）
  const WEAPON_LABEL_COLOR = 'FFC000';

  // 从「字符串」或「对象 {text:...}」中取文本（对照 lua 取 .text 的逻辑）
  function getLineText(item) {
    if (item == null) return null;
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item.text != null) return String(item.text);
    return null;
  }

  // 把武器 ID 数组转成「轻弩炮、重弩炮、弓」形式
  function weaponLabel(ids) {
    return ids.map((id) => WEAPON_NAMES[id] || `武器${id}`).join('、');
  }

  // 简单 HTML 转义

  // ========================================================
  // 构建「详细版」内容（模组数据）
  // 返回一个文档片段容器
  // ========================================================
  // [C6] 转发
  function buildModContent(id, skill) {
    return MHRS.skillSection.buildModContent(id, skill);
  }

  // ========================================================
  // 构建「原文版」内容（游戏原文数据 gameEntry）
  // gameEntry: { desc, effect }
  // ========================================================
  // [C6] 转发
  function buildGameContent(gameEntry) {
    return MHRS.skillSection.buildGameContent(gameEntry);
  }

  // ========================================================
  // 渲染技能卡片
  // 三种情况：
  //   ① 有详细版 + 有原文版：显示切换按钮
  //   ② 仅有详细版：只显示详细版，无按钮
  //   ③ 仅有原文版（模组未收录的技能）：直接显示原文版，无按钮
  // 技能名：有详细版时用详细版名称，否则用游戏原文名称。
  // ========================================================
  // [C6] 转发（skill 板块）
  function renderSkillCard(id, skill, gameEntry) {
    return MHRS.skillSection.buildCard(id, skill, gameEntry);
  }

  // ========================================================
  // 构建百龙技能内容（可复用于卡片与弹窗）
  // 结构：text / default / explain / description（字符串）
  //       + weapons / ranged / phials 差分
  // ========================================================
  // [B4] 转发
  function buildRampageContent(skill) {
    return MHRS.ramSection._buildContent(skill);
  }

  // ========================================================
  // 渲染百龙技能卡片
  // ========================================================
  // [B4] 转发（注意：新板块接收 {id, skill, name} 对象）
  function renderRampageCard(id, skill) {
    return MHRS.ramSection.renderCard({ id: String(id), skill: skill, name: MHRS.ramSection.nameOf(skill, id) });
  }

  // ========================================================
  // 渲染珠子卡片
  // ========================================================
  // [B3] 已迁移到 js/sections/deco.js —— 此处转发（保留兼容）
  function renderDecoCard(d) {
    return MHRS.decoSection.renderCard(d);
  }

  // ========================================================
  // 渲染百龙珠卡片
  // ========================================================
  // [B4] 转发
  function renderRamDecoCard(d) {
    return MHRS.ramDecoSection.renderCard(d);
  }

  // ========================================================
  // 渲染怪物卡片（monsters.js）
  //   monName 怪物名, mon 数据
  // ========================================================
  // [B4] 转发（monster 板块）
  function renderMonsterCard(monName, mon) {
    return MHRS.monsterSection.renderCard({ name: monName, mon: mon, small: MHRS.monsterSection.isSmall(monName) });
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
  // [C3a] 转发
  function normalizeQuestLabel(s) {
    return MHRS.questSection.normalizeLabel(s);
  }

  // 任务名 → id（同样去空白，保证匹配）
  const _questIdByNormName = {};
  Object.keys(QUESTS).forEach(function (qid) {
    const nm = (QUESTS[qid].name || '').replace(/\s+/g, '');
    if (nm && !_questIdByNormName[nm]) _questIdByNormName[nm] = qid;
  });

  // 由 monsters.js 的 quest 标签找出 quests.js 的 id
  // [C3a] 转发
  function findQuestIdByLabel(label) {
    return MHRS.questSection.findIdByLabel(label);
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
  // [C3a] 转发（quest 板块）
  function questMapName(mapNo) {
    return MHRS.questSection.mapName(mapNo);
  }

  // 活动任务的「位阶」判定（Kiranico 不提供该字段，按游戏内规则推断）：
  //   ① 百龙夜行：地图为翡叶要塞（mapNo 7）或名称含「百龙」
  //   ② 大师：有 MRP（mrp > 0）
  //   ③ 上位：排除上面两类后，星级 ≥ 4（★4~★8）
  //   ④ 下位：其余（★1~★3）
  // 返回 0~3（用于排序，越小越靠前）：大师 0 → 上位 1 → 下位 2 → 百龙 3
  // [C3a] 转发
  function actRankOrder(q) {
    return MHRS.questSection.actRankOrder(q);
  }
  // 「活动任务」位阶中文名（数据见 js/game_data.js）
  const ACT_RANK_LABEL = MHRS.game.ACT_RANK_LABEL;

  // 斗技大会任务的「系列」判定（按名称前缀）：
  //   0 大师等级斗技大会 → 1 斗技大会 → 2 挑战任务 → 9 其他
  // [C3a] 转发
  function arenaSeriesOrder(q) {
    return MHRS.questSection.arenaSeriesOrder(q);
  }
  // 取名称末尾的数字（用于同系列内升序：01, 02, 03…）
  // [C3a] 转发
  function nameTailNum(name) {
    return MHRS.questSection.nameTailNum(name);
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
  // [C3a] 转发
  function groupQuestsByCat() {
    return MHRS.questSection.groupByCat();
  }

  // --------------------------------------------------------
  // 清洗任务文本：去掉爬虫混进来的 "(HRP: 5,760点数" / "(MRP: ..." 尾巴
  // （数据层已清理，这里做兜底，防止旧缓存/其它来源仍有脏数据）
  // [C3a] 转发
  function cleanQuestText(s) {
    return MHRS.questSection.cleanText(s);
  }

  // 失败条件可能多条黏连在一起（数据源无分隔符），这里拆开加「/」分隔
  // 例：「报酬金额为零时间耗尽」→「报酬金额为零 / 时间耗尽」
  //     「报酬金额为零（1次力尽倒下）时间耗尽」→「报酬金额为零（1次力尽倒下） / 时间耗尽」
  //     「最终关口遭到破坏时间耗尽」→「最终关口遭到破坏 / 时间耗尽」
  // [C3c] 转发
  function splitQuestFail(s) {
    return MHRS.questSection.splitFail(s);
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

  // [C3a] 转发
  function analyzeQuestTargets(goalRaw, mons) {
    return MHRS.questSection.analyzeTargets(goalRaw, mons);
  }

  // 渲染任务卡片
  // [C3a] 转发（quest 板块）
  function renderQuestCard(qid) {
    return MHRS.questSection.renderCard({ id: qid, q: MHRS.quest.data[qid] });
  }

  // ========================================================
  // 通用：区块折叠
  // titleId/containerId/hintId + 状态对象
  // ========================================================
  // [C1] 转发（core/ui.js）
  function setupSectionCollapse(stateKey, titleId, containerId, hintId, defaultCollapsed, expandText, collapseText) {
    return MHRS.ui.sectionCollapse({
      title: titleId, container: containerId, hint: hintId,
      collapsed: defaultCollapsed,
      expandText: expandText, collapseText: collapseText,
    });
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

  // 某技能可用的珠子 → 搜索文本（珠子名 + 孔位/等级）
  // 注意：不含珠子所需素材名（避免「搜素材」时命中珠子）
  // [B3] 转发
  function buildDecoSearchText(decId) {
    return MHRS.decoSection.decosSearchText(decId);
  }

  // 单颗珠子的搜索文本
  // [B3] 转发
  function buildSingleDecoSearchText(d) {
    return MHRS.decoSection.searchText(d);
  }

  // 取珠子「提供的技能名」（优先详细版名称，其次游戏原文名）
  // [B3] 转发
  function decoSkillName(d) {
    return MHRS.decoSection.skillName(d);
  }

  // 构建珠子详情内容（孔位/等级/提供技能/必要素材）——卡片和弹窗共用
  // decoId: 用于「返回时重新打开珠子」的历史记录
  // recordHistory: 子元素点击时，是否记录「返回后重新打开珠子弹窗」
  //   - 弹窗内使用 → true（返回时回到珠子弹窗）
  //   - 珠子一览卡片内使用 → false（返回时直接回到卡片列表，不再弹珠子弹窗）
  // [B3] 已迁移到 js/sections/deco.js（内部实现）

  // 打开珠子详情弹窗（供「从别处跳转过来」时使用）
  // [B3] 转发
  function openDecoModal(decoId) {
    return MHRS.decoSection.openModal(decoId);
  }

  // ========================================================
  // 启动
  // ========================================================
  window.addEventListener('DOMContentLoaded', function () {
    if (!MHRS.skill.mod) {
      console.error('[mhrise-skill] 未找到 SKILL_DATA');
      const msg = '<div style="color:#f88;padding:1rem;">数据未加载，请检查 skillData.js</div>';
      document.getElementById('skillsContainer').innerHTML = msg;
      document.getElementById('rampageContainer').innerHTML = msg;
      return;
    }


    // ---- [B3] 把「跨板块能力」注册到 bridge ----
    // ⚠️ 必须【最先】执行：珠子/怪物等卡片渲染时就会用到这些能力
// ---- [B3] 把「跨板块能力」注册到 bridge ----
    (function provideToBridge() {
      var BR = MHRS.bridge;
      if (!BR) return;
      BR.provide(BR.NAMES.PUSH_HISTORY, function (fn) { pushModalHistory(fn); });
      BR.provide(BR.NAMES.OPEN_SKILL, function (id) { openSkillModal(id); });
      BR.provide(BR.NAMES.MONSTERS_FOR_MATERIAL, function (n) { return monstersForMaterial(n); });
      BR.provide(BR.NAMES.RANKS_FOR_MATERIAL, function (n) { return ranksForMaterial(n); });
      BR.provide(BR.NAMES.RANK_KEY, function (r) { return rankKey(r); });
      BR.provide(BR.NAMES.OPEN_ITEM, function (n) { if (_openItemModal) _openItemModal(n); });
      BR.provide(BR.NAMES.OPEN_MONSTER, function (n) { if (_openMonsterModal) _openMonsterModal(n); });
      BR.provide(BR.NAMES.OPEN_RAM_SKILL, function (n) { if (typeof _openRampageById === 'function') _openRampageById(n); });
      BR.provide(BR.NAMES.OBTAIN_BUILD, function (n, ex, bf) { return buildObtainBlock(n, ex, bf); });
      BR.provide(BR.NAMES.MAT_DETAIL_BUILD, function (mn, it, rows, hl) { return buildMatDetail(mn, it, rows, hl); });
      BR.provide(BR.NAMES.QUEST_BY_NAME, function (nm) { return findQuestIdByName(nm); });
      BR.provide(BR.NAMES.QUEST_BY_MON, function (n, mn, oi) { return findQuestIdForMonster(n, mn, oi); });
      BR.provide(BR.NAMES.QUEST_PARSE_AREA, function (q) { return parseQuestArea(q); });
      BR.provide(BR.NAMES.CUR_MON_CTX, function () { return _curMonCtx; });
      BR.provide(BR.NAMES.SET_MON_CTX, function (mn, fi) { _curMonCtx = { monName: mn, focusItem: fi || null }; });
      BR.provide(BR.NAMES.QUEST_BLOCK_BUILD, function (qs, mn) { return MHRS.questSection.buildBlock(qs, mn); });
    })();

    const data = MHRS.skill.mod;
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
    const hasGame = !!MHRS.skill.desc;
    const gameDesc = MHRS.skill.desc || {};

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
    const _iconMap = (MHRS.monster.icons) || {};
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
      MHRS.sticky.attach(bar, {
        disabledBy: questContainer,
        fixedClass: 'qcat-tabs-fixed',
        zIndex: 50,
      });
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

      const CAT_ORDER = MHRS.game.SKILL_CAT_ORDER;
      const UNTAGGED = MHRS.game.SKILL_CAT_UNTAGGED;
      const gameMeta = MHRS.skill.data || {};

      // 建立 decId -> { name, cats }
      const infoById = {};
      allSkillCards.forEach((it) => {
        const id = Number(it.id);
        const sk = skills[it.id];
        let name = null;
        if (sk) name = sk.name_override || sk.title || sk.display_name || sk.name;
        if (!name) {
          const hex = decToHex(id);
          name = (hex && gameMeta[hex] && gameMeta[hex].sname) || ('技能 ' + id);
        }
        const hex = decToHex(id);
        const meta = hex ? gameMeta[hex] : null;
        let cats = (meta && Array.isArray(meta.tag)) ? meta.tag.slice() : [];
        if (!cats.length) cats = [UNTAGGED];
        infoById[id] = { name: name, cats: cats };
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

      MHRS.catalog.render({
        catalogId: 'catalog', bodyId: 'catalogBody', headId: 'catalogHead',
        order: MHRS.catalog.orderOf(CAT_ORDER, groups),
        groups: groups,
        sortItems: (list) => list.sort((a, b) => a.id - b.id),
        dataAttr: 'target',
        onItemClick: (item) => jumpToSkill(item.id),
      });
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
      const ANOM = MHRS.item.anomaly;
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
          const iconFile = (MHRS.item.anomalyIcons || {})[t.name];
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
          const iconFile = (MHRS.monster.icons || {})[mn];
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
      const CATS = (MHRS.item.categories) || {};
      const ORDER = MHRS.game.ITEM_CAT_ORDER;   // 分类顺序（数据见 js/game_data.js）
      const groups = {};
      matNames.forEach((nm) => {
        const c = CATS[nm] || '其他';
        if (!groups[c]) groups[c] = [];
        groups[c].push(nm);
      });
      // 「怪异材料」特殊处理：从 ANOMALY_MATERIALS 取名字（不在 ITEM_CATEGORIES 里）
      const ANOM = (MHRS.item.anomaly) || null;
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
      // 根据技能名归类
      function catOf(name) {
        if (/之魂$/.test(name)) return '龙之魂';
        if (/特效$/.test(name)) return '对怪物特效';
        if (/(打磨术|激化|演奏|强化|持续|变形|炮|蓄击|强走|一击|钻研|加倍|活性|防御重击)/.test(name)) {
          return '能力强化';
        }
        return '其他';
      }
      const CAT_ORDER = MHRS.game.RAMPAGE_CAT_ORDER;

      const groups = {};
      rampageIds.forEach((id) => {
        const skill = rampage[id];
        const name = skill.name_override || skill.title || skill.display_name || skill.name || ('百龙技能 ' + id);
        const c = catOf(name);
        if (!groups[c]) groups[c] = [];
        groups[c].push({ id: id, name: name });
      });

      MHRS.catalog.render({
        catalogId: 'ramCatalog', bodyId: 'ramCatalogBody', headId: 'ramCatalogHead',
        order: MHRS.catalog.orderOf(CAT_ORDER, groups),
        groups: groups,
        dataAttr: 'rampage-target',
        onItemClick: (item) => openRampageModal(item.id),
      });
    })();

    // --------------------------------------------------------
    // 珠子一览（按孔位分组的目录）
    // --------------------------------------------------------
    (function buildDecoCatalog() {
      const SLOT_ORDER = MHRS.game.DECO_SLOT_ORDER;
      const groups = {};
      decoCards.forEach((it) => {
        const d = decoByName[DECO[it.id] && DECO[it.id].dname];
        if (!d) return;
        const c = d.slot + '孔';
        if (!groups[c]) groups[c] = [];
        groups[c].push({ id: d.id, name: d.dname, lv: d.lv });
      });

      MHRS.catalog.render({
        catalogId: 'decoCatalog', bodyId: 'decoCatalogBody', headId: 'decoCatalogHead',
        order: SLOT_ORDER.map((s) => s + '孔'),
        groups: groups,
        sortItems: (list) => list.sort((a, b) => (a.lv - b.lv) || (a.id - b.id)),
        dataAttr: 'deco-target',
        onItemClick: (item) => openDecoModal(item.id),
      });
    })();

    // --------------------------------------------------------
    // 百龙珠一览（按孔位分组的目录）
    // --------------------------------------------------------
    (function buildRamDecoCatalog() {
      const SLOT_ORDER = MHRS.game.RAM_DECO_SLOT_ORDER;
      const groups = MHRS.catalog.groupBy(RAM_DECO, (d) => d.slot + '孔');

      MHRS.catalog.render({
        catalogId: 'ramDecoCatalog', bodyId: 'ramDecoCatalogBody', headId: 'ramDecoCatalogHead',
        order: SLOT_ORDER.map((s) => s + '孔'),
        groups: groups,
        itemClass: 'ram-deco-cat-item',
        onItemClick: (item) => openRamDecoModal(item.name),
      });
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
    // [C] 已迁移到 js/sections/skill.js（转发）
    function jumpToSkill(id) {
      return MHRS.skillSection.openModal(id);
    }
    function openSkillModal(id) {
      return MHRS.skillSection.openModal(id);
    }
    _openSkillModal = openSkillModal;

    function closeSkillModal() {
      const overlay = document.getElementById('skillModal');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
      // 关闭时清空历史栈
      _modalStack.length = 0;
      updateModalBack();
    }

    // 更新「返回」按钮显隐：弹窗打开时始终显示（在最底层时点击 = 关闭弹窗）
    // ⚠️ 统一委托给 core/modal.js，避免「两套控制」（class 与 style.display 打架）
    function updateModalBack() {
      if (MHRS.modal && MHRS.modal.updateBackBtn) MHRS.modal.updateBackBtn();
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
    _updateModalBack = updateModalBack;


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

    // 返回上一级（若已在最底层，则关闭弹窗）
    function modalGoBack() {
      if (!_modalStack.length) { closeSkillModal(); return; }
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
    // [B4] 转发
    function openRamDecoModal(name) {
      return MHRS.ramDecoSection.openModal(name);
    }

    // 桥接给顶层 buildRamDecoSection 使用
    _openRamDecoModal = openRamDecoModal;

    // ========================================================
    // 怪物详情弹窗
    //   monName  怪物名
    //   focusItem 可选：高亮的素材名（从素材点进来时）
    // ========================================================
    // [C4] 转发（monster 板块）
    function openMonsterModal(monName, focusItem, restoreState) {
      return MHRS.monsterSection.openModalFull(monName, focusItem, restoreState);
    }

    // 素材详情弹窗（无怪物掉落时用）
    // [B4] 转发（material 板块）
    function openItemModal(itemName) {
      return MHRS.materialSection.openModal(itemName);
    }
    _openItemModal = openItemModal;

    // ========================================================
    // 任务详情弹窗
    // ========================================================
    // [C3c] 转发（quest 板块）
    function openQuestModal(qid) {
      return MHRS.questSection.openModal(qid);
    }
    _openQuestModal = openQuestModal;

    // 任务列表块（默认折叠，点标题展开）
    // monName：所属怪物名（用于「返回」历史栈）
    // [C3c] 转发
    function buildQuestBlock(quests, monName) {
      return MHRS.questSection.buildBlock(quests, monName);
    }

    // 素材掉落明细（按 下位/上位/大师 分组）
    // [C2] 转发（material 板块）
    function buildMatDetail(monName, itemName, rows, highlight) {
      return MHRS.materialSection.buildMatDetail(monName, itemName, rows, highlight);
    }

    // 其他获得途径（来自 items.js 的 obtain 列表）
    // backFn: 点怪物后，按「返回」时回到哪里（默认回素材详情）
    // 获得途径类型归一化 → {group, label, icon}
    // 原始 type 有 ~29 种，归成 6 个大组
    // [C2] 转发（material 板块）
    function obtainTypeInfo(t) {
      return MHRS.materialSection.obtainTypeInfo(t);
    }

    // 渲染「其他获得途径」单行（带概率条）
    // r: {quest, rank, type, count, rate, _g, _glabel, _gicon}
    // [C2] 转发（material 板块）
    function renderObtainRow(r, parent, itemName, backFn) {
      return MHRS.materialSection.renderObtainRow(r, parent, itemName, backFn);
    }

    // [C2] 转发（material 板块）
    function buildObtainBlock(itemName, expanded, backFn) {
      return MHRS.materialSection.buildObtainBlock(itemName, expanded, backFn);
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
    // [C4] 转发
    function buildHitzoneBlock(hz) {
      return MHRS.monsterSection.buildHitzone(hz);
    }

    // 桥接给顶层
    _openMonsterModal = openMonsterModal;

    // 打开百龙技能详情弹窗
    // [B4] 转发
    function openRampageModal(id) {
      return MHRS.ramSection.openModal(id);
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