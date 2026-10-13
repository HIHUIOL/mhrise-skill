// ============================================================
// core/registry.js —— 板块注册中心（Section Registry）
//
// 职责：收集所有「板块定义」，统一管理。新增板块只需调用
//       MHRS.register({ id, label, ... })，无需改动引擎代码。
//
// 一个「板块定义」长这样：
//   {
//     id:        'weapon',          // 唯一 ID（用于 DOM id / 路由 / 搜索）
//     label:     '武器',             // 显示名（tab 按钮文字）
//     icon:      '⚔️',               // 图标
//     order:     10,                // 排序（小的在前）
//     dataPath:  'weapon',          // MHRS.weapon.*
//     dataKey:   'weapon_data',     // window.weapon_data
//     shapes:    { keyType:'id' },  // 数据结构声明（可选，用于自检）
//     groupBy:   fn(item) -> str,   // 分类维度（可选）
//     renderCard:  fn(item, ctx),   // 怎么画卡片（必需）
//     renderModal: fn(item, ctx),   // 怎么画弹窗（可选）
//     searchText:  fn(item) -> str, // 搜索文本（可选）
//   }
//
// 依赖：无（最先加载）
// ============================================================
(function (root) {
  'use strict';

  var DEBUG = true;

  var sections = [];      // 有序数组
  var byId = {};          // id → section（O(1) 查找）

  /**
   * 注册一个板块
   * @param {Object} def 板块定义
   * @returns {Object} 传入的 def（便于链式）
   */
  function register(def) {
    if (!def || !def.id) {
      console.error('[registry] 注册失败：缺少 id', def);
      return null;
    }
    if (byId[def.id]) {
      console.warn('[registry] 重复注册，已覆盖：' + def.id);
      // 先移除旧的
      var i = sections.findIndex(function (s) { return s.id === def.id; });
      if (i >= 0) sections.splice(i, 1);
    }

    // 默认值
    def.order = def.order == null ? 100 : def.order;
    def.icon = def.icon || '';
    def.label = def.label || def.id;

    // 自检：必需字段
    if (typeof def.renderCard !== 'function' && DEBUG) {
      console.warn('[registry] 板块「' + def.id + '」缺少 renderCard，将无法渲染卡片');
    }

    sections.push(def);
    byId[def.id] = def;

    // 保持按 order 排序（order 相同按注册顺序）
    sections.sort(function (a, b) {
      return (a.order - b.order) || 0;
    });

    return def;
  }

  /** 取某个板块定义 */
  function get(id) {
    return byId[id] || null;
  }

  /** 取全部板块（已排序，返回副本，避免外部误改） */
  function all() {
    return sections.slice();
  }

  /** 只取「可见」的板块（未声明 hidden 的） */
  function visible() {
    return sections.filter(function (s) { return !s.hidden; });
  }

  /** 是否已注册 */
  function has(id) {
    return !!byId[id];
  }

  /** 自检：打印所有板块状态 */
  function audit() {
    var report = sections.map(function (s) {
      var hasData = false;
      if (s.dataKey && root[s.dataKey] !== undefined) hasData = true;
      return {
        id: s.id,
        label: s.label,
        order: s.order,
        dataKey: s.dataKey || '(无)',
        dataLoaded: hasData,
        hasRenderCard: typeof s.renderCard === 'function',
        hasRenderModal: typeof s.renderModal === 'function',
        hasGroupBy: typeof s.groupBy === 'function',
      };
    });
    if (root.console && console.table) console.table(report);
    return report;
  }

  // 挂到 MHRS
  root.MHRS = root.MHRS || {};
  root.MHRS.registry = {
    register: register,
    get: get,
    all: all,
    visible: visible,
    has: has,
    audit: audit,
    // 便捷别名：MHRS.register({...})
  };
  root.MHRS.register = register;

})(typeof window !== 'undefined' ? window : this);