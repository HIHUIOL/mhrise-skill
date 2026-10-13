// ============================================================
// game_data.js —— 游戏常量数据（与渲染逻辑分离）
//
// 这里放的是「游戏本身的固定常量 / 展示顺序 / 中文名映射」，
// 与「怎么渲染」（render.js）无关。改数据只需动本文件。
//
// 数据来源标注：
//   [lua]   —— 解包 lua 脚本中的常量（勿随意修改数值）
//   [site]  —— Kiranico 网站的展示顺序
//   [game]  —— 游戏内约定的顺序
// ============================================================
(function (root) {
  'use strict';

  var GAME_DATA = {

    // --------------------------------------------------------
    // 武器 ID → 名称（对照 lua WEAPON_NAMES，勿随意修改）[lua]
    // --------------------------------------------------------
    WEAPON_NAMES: {
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
      13: '弓',
    },

    // 远程武器 ID（对照 lua RANGED_WEAPONS = {3,4,13}）[lua]
    RANGED_WEAPONS: { 3: true, 4: true, 13: true },

    // --------------------------------------------------------
    // 难度等级 [game]
    // --------------------------------------------------------
    RANK_ORDER: ['下位', '上位', '大师等级', '怪异'],
    RANK_SHORT: { '下位': '下', '上位': '上', '大师等级': '大师', '怪异': '怪异' },

    // --------------------------------------------------------
    // 各板块的展示顺序 [site]
    // --------------------------------------------------------
    // 任务分类（Kiranico 网站顺序，下位→上位→大师→…）
    QUEST_CAT_ORDER: [
      '村庄任务',
      '集会所任务 下位',
      '集会所任务 上位',
      '集会所任务 大师',
      '怪异任务',
      '盟友任务',
      '活动任务',
      '斗技大会任务',
      '训练任务',
    ],

    // 活动任务的位阶小标签
    ACT_RANK_LABEL: ['大师', '上位', '下位', '百龙'],

    // 普通技能分类（与游戏内大致一致）
    SKILL_CAT_ORDER: ['攻击', '会心', '属性', '异常', '锋利度', '远程',
      '身体性能', '防御', '回复', '拔纳', '特殊', '其他'],
    SKILL_CAT_UNTAGGED: '未分类',

    // 百龙技能分类
    RAMPAGE_CAT_ORDER: ['能力强化', '对怪物特效', '龙之魂', '其他'],

    // 素材分类
    ITEM_CAT_ORDER: ['怪异材料', '回复/辅助', '素材', '余料', '弹药/瓶', '交纳委托', '变更房屋的设计'],

    // 珠子 / 百龙珠的孔位顺序
    DECO_SLOT_ORDER: [1, 2, 3, 4],
    RAM_DECO_SLOT_ORDER: [1, 2, 3],

    // 素材「其他获得途径」的分组顺序
    OBTAIN_GROUP_ORDER: ['explore', 'quest', 'carve', 'drop', 'part', 'palico', 'rank', 'other', 'zzz'],

    // --------------------------------------------------------
    // 任务详情：人数档字段 [site]
    // --------------------------------------------------------
    QUEST_FIELD_LABEL: {
      players: '人数', hp: 'HP', attack: '攻击', parts: '部位',
      defense: '防御', ailment: '异常', stun: '晕眩',
      stamina: '耐力', mount: '骑乘',
    },
    QUEST_FIELD_ORDER: ['players', 'hp', 'attack', 'parts', 'defense',
      'ailment', 'stun', 'stamina', 'mount'],

    // --------------------------------------------------------
    // 肉质表列定义（Kiranico 官方图标 + 中文提示）[site]
    // --------------------------------------------------------
    HITZONE_COLS: [
      { i: 2, img: 'hit-icons/hit_slash.png', label: '斩击', cls: 'physical' },
      { i: 3, img: 'hit-icons/hit_strike.png', label: '打击', cls: 'physical' },
      { i: 4, img: 'hit-icons/hit_shell.png', label: '弹（弹药）', cls: 'physical' },
      { i: 5, img: 'hit-icons/element_fire.png', label: '火属性', cls: 'elem' },
      { i: 6, img: 'hit-icons/element_water.png', label: '水属性', cls: 'elem' },
      { i: 7, img: 'hit-icons/element_ice.png', label: '冰属性', cls: 'elem' },
      { i: 8, img: 'hit-icons/element_thunder.png', label: '雷属性', cls: 'elem' },
      { i: 9, img: 'hit-icons/element_dragon.png', label: '龙属性', cls: 'elem' },
      { i: 10, img: 'hit-icons/element_stun.png', label: '眩晕', cls: 'stun' },
    ],

    // --------------------------------------------------------
    // 怪物名称别名（任务目标匹配用）[game]
    //   键 = 项目中使用的标准怪物名
    //   值 = 任务文本里可能出现的其他写法
    // --------------------------------------------------------
    MONSTER_ALIAS: {
      '怪异克服天彗龙': ['神秘红光天彗龙', '怪异克服神秘红光天彗龙'],
    },

    // --------------------------------------------------------
    // 技能属性分组 short → 中文（来自 skill_data.js 的 Attr）[game]
    // --------------------------------------------------------
    SKILL_ATTR_LABEL: {
      atk: '攻击', def: '防御', sd: '拔纳', cri: '会心', ele: '属性',
      abn: '异常', heal: '回复', body: '身体性能', sharp: '锋利度',
      gun: '远程', other: '其他', spec: '特殊',
    },
    // 展示顺序（按中文分类顺序：攻击/会心/属性/异常/锋利度/远程/身体性能/防御/回复/拔纳/特殊/其他）
    SKILL_ATTR_ORDER: ['atk', 'cri', 'ele', 'abn', 'sharp', 'gun', 'body', 'def', 'heal', 'sd', 'spec', 'other'],
  };

  root.GAME_DATA = GAME_DATA;
})(typeof window !== 'undefined' ? window : this);