// ============================================================
// core/bridge.js —— 跨板块调用桥
//
// 板块之间不能直接互相调用（否则又变成一团乱麻）。
// 所有「跨板块动作」都通过这里注册/获取：
//
//   MHRS.bridge.provide('openSkill', fn)   // 技能板块提供能力
//   MHRS.bridge.call('openSkill', 123)     // 珠子板块使用能力
//
// 好处：
//   · 板块可以独立加载/缺失（缺了只是功能降级，不会崩）
//   · 依赖关系显式化（grep 'bridge.call' 就知道谁依赖谁）
//
// 依赖：无
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};

  var providers = {};   // name → fn
  var mockLog = [];     // 未提供时的调用记录（调试用）

  /**
   * 注册一个能力
   * @param {string} name
   * @param {Function} fn
   */
  function provide(name, fn) {
    if (typeof fn !== 'function') {
      console.warn('[bridge] provide 需要函数：' + name);
      return;
    }
    if (providers[name] && providers[name] !== fn && root.console) {
      console.warn('[bridge] 能力被覆盖：' + name);
    }
    providers[name] = fn;
  }

  /**
   * 调用能力（不存在时安全降级，不抛错）
   * @param {string} name
   * @param {...*} args
   * @returns {*} 返回值；未提供时返回 undefined
   */
  function call(name) {
    var fn = providers[name];
    if (!fn) {
      if (root.console && root.console.debug) {
        mockLog.push({ name: name, at: Date.now() });
        console.debug('[bridge] 能力未提供（已忽略）：' + name);
      }
      return undefined;
    }
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      return fn.apply(null, args);
    } catch (e) {
      console.error('[bridge] 调用失败：' + name, e);
      return undefined;
    }
  }

  /** 是否已提供 */
  function has(name) { return typeof providers[name] === 'function'; }

  /** 列出所有已提供的能力 */
  function list() { return Object.keys(providers); }

  // 标准能力名（约定，避免拼错）
  var NAMES = {
    OPEN_SKILL: 'openSkill',         // (skillId) 打开技能弹窗
    OPEN_RAM_SKILL: 'openRamSkill',  // (id) 打开百龙技能弹窗
    OPEN_DECO: 'openDeco',           // (decoId) 打开珠子弹窗
    PUSH_HISTORY: 'pushHistory',     // (fn) 压入弹窗返回栈
    MONSTERS_FOR_MATERIAL: 'monstersForMaterial',  // (itemName) → [怪物名]
    RANKS_FOR_MATERIAL: 'ranksForMaterial',        // (itemName) → [等级]
    OPEN_ITEM: 'openItem',           // (itemName) 打开素材弹窗
    OPEN_MONSTER: 'openMonster',     // (monsterName) 打开怪物弹窗
    RANK_KEY: 'rankKey',             // (等级名) → CSS 后缀 low/high/master/anomaly
    DECOS_FOR_SKILL: 'decosForSkill',      // (十进制技能id) → [珠子]
    DECOS_SEARCH_TEXT: 'decosSearchText',  // (十进制技能id) → 珠子搜索文本
    DECOS_BUILD: 'decosBuild',             // (十进制技能id, opts) → 「可用珠子」区块 DOM
    RAMDECOS_FOR_SKILL: 'ramDecosForSkill',// (百龙技能名) → [百龙珠]
    OPEN_RAM_DECO: 'openRamDeco',          // (名字) 打开百龙珠弹窗
    RAM_DECOS_BUILD: 'ramDecosBuild',      // (百龙技能名, opts) → 「可用百龙珠」区块 DOM
    OBTAIN_BUILD: 'obtainBuild',           // (素材名, expanded, backFn) → 「其他获得途径」区块 DOM
    MAT_DETAIL_BUILD: 'matDetailBuild',    // (怪物名, 素材名, rows, highlight) → 素材掉落明细 DOM
    QUEST_BY_LABEL: 'questByLabel',        // (任务名) → 任务 id 或 null
    QUEST_BY_NAME: 'questByName',          // (完整任务名) → 任务 id 或 null
    QUEST_BY_MON: 'questByMon',            // (任务名, 怪物名, 出现序号) → 任务 id 或 null
    QUEST_PARSE_AREA: 'questParseArea',    // (任务原始串) → { name, areas, crownMini, crownKing }
    CUR_MON_CTX: 'curMonCtx',              // () → 当前怪物弹窗上下文 { monName, focusItem }
    SET_MON_CTX: 'setMonCtx',              // (monName, focusItem) 记录怪物弹窗上下文
    QUEST_BLOCK_BUILD: 'questBlockBuild',  // (quests, monName) → 「任务列表」区块 DOM
    OPEN_QUEST: 'openQuest',               // (任务 id) 打开任务弹窗
  };

  root.MHRS.bridge = {
    provide: provide,
    call: call,
    has: has,
    list: list,
    NAMES: NAMES,
    _mockLog: mockLog,
  };

})(typeof window !== 'undefined' ? window : this);