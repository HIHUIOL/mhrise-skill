// ============================================================
// data.js —— 统一数据入口（Data Access Layer）
//
// 目的：把「散落各处的全局变量」收敛到一个命名空间 MHRS，
//       让 render.js 只依赖 MHRS.xxx，而不用记住十几个全局名。
//
// ⚠️ 本文件「只做映射，不改数据」：
//      - 所有真实数据仍由各 js/*.js 提供（向后兼容，双轨并存）
//      - 引用的是同一份对象（浅引用，不复制，不占内存）
//
// 数据来源标注：
//   [mod]      —— Nexus Mods 模组《Skill Descriptions》
//   [kiranico] —— Kiranico（MHRise 中文站）
//   [unpack]   —— 游戏解包 / lua 常量
//   [local]    —— 本项目自行整理
//
// 加载顺序：必须在所有「数据文件」之后、render.js 之前加载。
// ============================================================
(function (root) {
  'use strict';

  var w = root;

  // 安全取值：全局不存在时返回「空占位」，避免 render.js 报错
  function pick(name, fallback) {
    var v = w[name];
    if (v === undefined || v === null) return fallback;
    return v;
  }

  var MHRS = {

    // ========================================================
    // ⚔️ 技能
    // ========================================================
    skill: {
      // 📘 模组详细版（含武器差分、瓶类型）[mod]
      //   结构：{ skills: {id:...}, rampage_skills: {id:...}, ... }
      mod: pick('SKILL_DATA', {}),

      // 🎮 游戏原文版 [kiranico/unpack]
      data: pick('GAME_SKILL_DATA', {}),   // 基础信息（tag/hex/max…）
      desc: pick('GAME_SKILL_DESC', {}),   // 名称 + 描述 + 各等级效果
      attr: pick('GAME_SKILL_ATTR', {}),   // 属性分组 short → 中文
    },

    // ========================================================
    // 🔮 珠子 / 百龙珠
    // ========================================================
    deco: {
      // 普通珠子（244）[kiranico]
      //   按 ID 索引：{ 1: {hex,slot,lv,dname,material[][]} }
      data: pick('decoration_data', {}),
      // 按名字索引（同一份数据的反向映射）
      byName: pick('decoration_by_name', {}),

      // 百龙珠（34）[kiranico]
      //   结构：[ {name, skill, slot, desc} ]
      rampage: pick('rampage_decorations', []),
    },

    // ========================================================
    // 👹 怪物
    // ========================================================
    monster: {
      // 怪物数据（112 只，含肉质/素材/任务/异常）[kiranico]
      data: pick('monster_data', {}),
      // 图标映射：怪物名 → 图标文件名 [localhost]
      icons: pick('MONSTER_ICONS', {}),
      // 名称别名表 → 见 GAME_DATA.MONSTER_ALIAS
    },

    // ========================================================
    // 📦 素材 / 道具
    // ========================================================
    item: {
      // 素材数据（1764 条：desc + obtain）[kiranico]
      data: pick('item_data', {}),
      // 素材分类（素材名 → 分类名）[kiranico]
      categories: pick('ITEM_CATEGORIES', {}),
      // 道具使用效果（25 条，解包数值）[unpack]
      effects: pick('item_effects', {}),
      // 怪异材料表（tiers + rows）[kiranico]
      anomaly: pick('ANOMALY_MATERIALS', null),
      // 怪异材料图标 [localhost]
      anomalyIcons: pick('ANOMALY_ICONS', {}),
    },

    // ========================================================
    // 🏹 任务
    // ========================================================
    quest: {
      // 任务数据（698 条）[kiranico]
      data: pick('quest_data', {}),
      // 地图 ID → 名称 [kiranico]
      maps: pick('QUEST_MAPS', {}),
    },

    // ========================================================
    // 📊 游戏常量（见 js/game_data.js）[unpack/site]
    // ========================================================
    game: pick('GAME_DATA', {}),

    // ========================================================
    // 🔧 内部：诊断信息（开发时用）
    // ========================================================
    _stats: function () {
      return {
        skill_mod: Object.keys(this.skill.mod.skills || {}).length,
        skill_rampage: Object.keys(this.skill.mod.rampage_skills || {}).length,
        skill_game: Object.keys(this.skill.data).length,
        deco: Object.keys(this.deco.data).length,
        rampage_deco: this.deco.rampage.length,
        monster: Object.keys(this.monster.data).length,
        item: Object.keys(this.item.data).length,
        item_effect: Object.keys(this.item.effects).length,
        quest: Object.keys(this.quest.data).length,
        game_const: Object.keys(this.game).length,
      };
    },
  };

  // 合并到已有 MHRS（避免覆盖 core/ 挂上的方法）
  root.MHRS = root.MHRS || {};
  Object.keys(MHRS).forEach(function (k) { root.MHRS[k] = MHRS[k]; });

})(typeof window !== 'undefined' ? window : this);