// ============================================================
// sections/material.js —— 素材板块
//
// 数据：MHRS.item.data（item_data，1764 条）
//       MHRS.item.categories（item_categories，分类）
//       MHRS.item.effects（item_effects，25 条使用效果）
//       MHRS.item.anomaly（anomaly_materials，怪异材料）
//   { "回复药": { desc, obtain:[...] } }
//
// 分类：切页式（7 类，来自 game_data.js 的 ITEM_CAT_ORDER）
//
// 跨板块：
//   · monstersForMaterial / ranksForMaterial / rankKey（通过 bridge）
//   · openMonster（点「来源怪物」跳怪物）
//
// ⚠️ 分阶段迁移：
//   阶段1（本次）：弹窗（openItemModal + buildMatDetail + buildObtainBlock + 使用效果）
//   阶段2：切页式分类区块（buildMaterialSection，155 行）
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[material] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  function items() { return (M.item && M.item.data) || {}; }
  function effects() { return (M.item && M.item.effects) || {}; }

  function info(name) { return items()[name] || null; }

  /** 全部素材名 */
  function list() { return Object.keys(items()).sort(); }

  /** 搜索文本 */
  function searchText(name) {
    var o = items()[name];
    return (name + ' ' + ((o && o.desc) || '')).toLowerCase();
  }

  // ---------------- 使用效果 ----------------
  function buildEffectEl(itemName) {
    var fx = effects()[itemName];
    if (!fx || !fx.text) return null;
    return dom.el('div', { class: 'mon-mat-effect' }, [
      dom.el('span', { class: 'mat-fx-label', text: '✨ 使用效果' }),
      dom.el('span', { class: 'mat-fx-text', html: fx.text }),
    ]);
  }

  // ---------------- 等级标签 ----------------
  function buildRankTags(itemName) {
    var ranks = BR.call(BR.NAMES.RANKS_FOR_MATERIAL, itemName) || [];
    if (!ranks.length) return null;
    var wrap = dom.el('span', { class: 'mon-mat-rank-tags' });
    ranks.forEach(function (r) {
      var k = BR.call(BR.NAMES.RANK_KEY, r) || 'master';
      wrap.appendChild(dom.el('span', { class: 'mat-rank-tag rank-' + k, text: r }));
    });
    return wrap;
  }

  // ---------------- 素材标题块（名字 + 等级 + 说明 + 效果）----------------
  function buildTitleBlock(itemName, o) {
    var box = dom.el('div', { class: 'mon-mat-detail highlight' });

    var nm = dom.el('div', { class: 'mon-mat-title' }, [itemName]);
    var rt = buildRankTags(itemName);
    if (rt) nm.appendChild(rt);
    box.appendChild(nm);

    if (o.desc) box.appendChild(dom.el('div', { class: 'mon-mat-desc', text: o.desc }));

    var fx = buildEffectEl(itemName);
    if (fx) box.appendChild(fx);

    // 来源怪物
    var mons = BR.call(BR.NAMES.MONSTERS_FOR_MATERIAL, itemName) || [];
    if (mons.length) {
      box.appendChild(dom.el('div', { class: 'mon-mat-none', text: '来源怪物（' + mons.length + '）：' }));
      var listEl = dom.el('div', { class: 'mat-mon-list' });
      mons.forEach(function (n) {
        var b = dom.el('button', { type: 'button', class: 'mat-mon-btn', text: n });
        b.addEventListener('click', function () {
          BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(itemName); });
          BR.call(BR.NAMES.OPEN_MONSTER, n, itemName);
        });
        listEl.appendChild(b);
      });
      box.appendChild(listEl);
    }
    return box;
  }

  // ---------------- 获得途径类型归一化 ----------------
  function obtainTypeInfo(t) {
    t = String(t || "").trim();
    if (!t) return { group: "zzz", label: "其他", icon: "•" };
    if (/^怪异探究/.test(t)) return { group: "explore", label: "怪异探究", icon: "🧭" };
    if (/^部位破坏/.test(t) || /^broken$/.test(t)) return { group: "part", label: "部位破坏", icon: "🦴" };
    if (/^剥取/.test(t) || /^carve$/.test(t)) return { group: "carve", label: "剥取", icon: "🎣" };
    if (/^掉落物/.test(t) || /^drop$/.test(t)) return { group: "drop", label: "掉落物", icon: "💧" };
    if (/^随从/.test(t)) return { group: "palico", label: "随从收集", icon: "🐱" };
    if (/^(大师等级|上位|下位)$/.test(t)) return { group: "rank", label: "等级报酬", icon: "⚔" };
    if (/^捕获/.test(t) || /^capture$/.test(t)) return { group: "quest", label: "任务报酬", icon: "📋" };
    if (/^(目标报酬|追加报酬|任务报酬|任务奖励|追加|additional|reward|add_target|quest|common|gather)$/.test(t))
      return { group: "quest", label: "任务报酬", icon: "📋" };
    return { group: "other", label: "其他", icon: "•" };
  }

  // ---------------- 渲染获得途径单行 ----------------
  function renderObtainRow(r, parent, itemName, backFn) {
    var line = dom.el("div", { class: "mon-obtain-row" + (r._g ? " og-" + r._g : "") });
    var qspan = dom.el("span", { class: "obtain-quest" });

    // 怪异探究行
    if (r.type === "怪异探究") {
      line.classList.add("og-explore");
      qspan.appendChild(dom.el("span", { class: "obtain-explore-name", text: "怪异探究" }));
      if (r.lv) qspan.appendChild(dom.el("span", { class: "obtain-explore-lv", text: "Lv" + r.lv }));
      if (r.reward) qspan.appendChild(dom.el("span", {
        class: "obtain-explore-reward" + (r.reward === "副奖励" ? " sub" : ""), text: r.reward }));
      if (r.mons) qspan.appendChild(dom.el("span", { class: "obtain-explore-mons", text: r.mons }));
      line.appendChild(qspan);
      var meta0 = dom.el("span", { class: "obtain-meta" });
      if (r.count) meta0.appendChild(dom.el("span", { class: "obtain-count", text: "x" + r.count }));
      if (r.rate) meta0.appendChild(dom.el("span", { class: "obtain-rate", text: r.rate }));
      line.appendChild(meta0);
      parent.appendChild(line);
      return;
    }

    // 怪物链接
    var monData = M.monster && M.monster.data;
    if (monData && monData[r.quest]) {
      var mb = dom.el("button", { type: "button", class: "obtain-mon-link", text: r.quest, title: "查看怪物：" + r.quest });
      mb.addEventListener("click", function (e) {
        e.stopPropagation();
        BR.call(BR.NAMES.PUSH_HISTORY, typeof backFn === "function" ? backFn : function () {
          if (itemName) openModal(itemName);
        });
        BR.call(BR.NAMES.OPEN_MONSTER, r.quest, itemName);
      });
      qspan.appendChild(mb);
    } else {
      // 任务链接
      var qid = BR.call(BR.NAMES.QUEST_BY_LABEL, r.quest);
      if (qid != null) {
        (function (id, q) {
          var qb = dom.el("button", { type: "button", class: "obtain-quest-link", text: q, title: "查看任务详情" });
          qb.addEventListener("click", function (e) {
            e.stopPropagation();
            BR.call(BR.NAMES.PUSH_HISTORY, typeof backFn === "function" ? backFn : function () {
              if (itemName) openModal(itemName);
            });
            BR.call(BR.NAMES.OPEN_QUEST, id);
          });
          qspan.appendChild(qb);
        })(qid, r.quest);
      } else {
        qspan.textContent = r.quest;
      }
    }

    // 来源剥取
    var carveTxt = r.carveSrc
      ? (r.carveSrc + (r.anomLv ? " Lv" + r.anomLv : "") + (r.part ? " " + r.part : ""))
      : "";
    if (carveTxt) qspan.appendChild(dom.el("span", { class: "obtain-carve-src", text: carveTxt }));
    line.appendChild(qspan);

    // 右：难度 + 数量 + 概率
    var meta = dom.el("span", { class: "obtain-meta" });
    if (r.rank) {
      var rk = BR.call(BR.NAMES.RANK_KEY, r.rank) || "master";
      meta.appendChild(dom.el("span", { class: "obtain-rank mat-rank-tag rank-" + rk, text: r.rank }));
    }
    if (r.count) meta.appendChild(dom.el("span", { class: "obtain-count", text: r.count }));
    var pct = parseInt(String(r.rate || "").replace(/[^\d]/g, ""), 10);
    if (!isNaN(pct)) meta.appendChild(dom.el("span", { class: "obtain-rate", text: r.rate }));
    line.appendChild(meta);

    // 概率条
    if (!isNaN(pct)) {
      var cls = "lv-low";
      if (pct >= 60) cls = "lv-high";
      else if (pct >= 30) cls = "lv-mid";
      var barWrap = dom.el("span", { class: "obtain-bar" });
      var bar = dom.el("span", { class: "obtain-bar-fill " + cls });
      bar.style.width = Math.max(2, Math.min(100, pct)) + "%";
      barWrap.appendChild(bar);
      line.appendChild(barWrap);
    }
    parent.appendChild(line);
  }

  // ---------------- 「其他获得途径」区块 ----------------
  function buildObtainBlockImpl(itemName, expanded, backFn) {
    var wrap = dom.el("div", { class: "mon-obtain" });
    var o = items()[itemName];
    var ob = (o && o.obtain) || [];
    if (!ob.length) return wrap;

    var seen = {}, rows = [];
    ob.forEach(function (x) {
      var q = x.quest || x.name || (typeof x === "string" ? x : "");
      var rank = x.rank || "";
      var key = [q, rank, x.type, x.count, x.rate, x.lv, x.reward].join("|");
      if (seen[key]) return;
      seen[key] = 1;
      rows.push({
        quest: q, rank: rank, type: x.type || "", count: x.count || "",
        rate: x.rate || "", lv: x.lv || "", mons: x.mons || "",
        reward: x.reward || "", carveSrc: x.carveSrc || "",
        anomLv: x.anomLv || "", part: x.part || "", way: x.way || "",
      });
    });
    if (!rows.length) return wrap;

    var GROUP_ORDER = (M.game && M.game.OBTAIN_GROUP_ORDER) || [];
    var groups = {};
    rows.forEach(function (r) {
      var ti = obtainTypeInfo(r.type);
      r._g = ti.group;
      if (!groups[ti.group]) groups[ti.group] = { label: ti.label, icon: ti.icon, rows: [] };
      groups[ti.group].rows.push(r);
    });
    var groupList = GROUP_ORDER.filter(function (g) { return groups[g]; })
      .map(function (g) { return groups[g]; });

    var h = dom.el("div", { class: "mon-obtain-head mon-obtain-toggle" });
    h.innerHTML = "其他获得途径（" + rows.length + "）" +
      "<span class=\"mon-obtain-arrow\">" + (expanded ? "▲" : "▼") + "</span>";
    wrap.appendChild(h);

    var list = dom.el("div", { class: "mon-obtain-list" + (expanded ? "" : " collapsed") });
    groupList.forEach(function (grp, gi) {
      var gBox = dom.el("div", { class: "obtain-group obtain-group-" + (gi % 2 ? "odd" : "even") });
      var showCnt = (grp.rows.length > 1) || grp.rows[0].type !== "怪异探究";
      gBox.appendChild(dom.el("div", { class: "obtain-group-head", html:
        "<span class=\"obtain-group-icon\">" + grp.icon + "</span>" +
        "<span class=\"obtain-group-name\">" + dom.escapeHtml(grp.label) + "</span>" +
        (showCnt ? "<span class=\"obtain-group-count\">" + grp.rows.length + "</span>" : "") }));
      var gBody = dom.el("div", { class: "obtain-group-body" });
      grp.rows.forEach(function (r) { renderObtainRow(r, gBody, itemName, backFn); });
      gBox.appendChild(gBody);
      list.appendChild(gBox);
    });
    wrap.appendChild(list);

    h.addEventListener("click", function () {
      list.classList.toggle("collapsed");
      var a = h.querySelector(".mon-obtain-arrow");
      if (a) a.textContent = list.classList.contains("collapsed") ? "▼" : "▲";
    });
    return wrap;
  }

  // ---------------- 部位名美化 ----------------
  function prettyPart(p) {
    var m = /^BodyPart\s+(\d+)$/.exec(p || "");
    return m ? ("部位" + m[1]) : (p || "");
  }

  // ---------------- 素材掉落明细（怪物弹窗内嵌）----------------
  function buildMatDetail(monName, itemName, rows, highlight) {
    var wrap = dom.el("div", { class: "mon-mat-detail" + (highlight ? " highlight" : "") });

    if (rows && rows.length > 1 && rows.some(function (r) { return r.anomLv; })) {
      var lvNum = function (s) {
        var m = String(s || "").match(/^(\d+)/);
        return m ? parseInt(m[1], 10) : 1e9;
      };
      rows.sort(function (a, b) { return lvNum(a.anomLv) - lvNum(b.anomLv); });
    }

    var G = M.game || {};
    var RANK_ORDER = G.RANK_ORDER || [];

    var nm = dom.el("div", { class: "mon-mat-title" }, [itemName]);
    var ranks = [];
    if (rows && rows.length) {
      var set = {};
      rows.forEach(function (r) { if (r.rank) set[r.rank] = true; });
      ranks = RANK_ORDER.filter(function (r) { return set[r]; });
    } else {
      ranks = BR.call(BR.NAMES.RANKS_FOR_MATERIAL, itemName) || [];
    }
    if (ranks.length) {
      var tw = dom.el("span", { class: "mon-mat-rank-tags" });
      ranks.forEach(function (r) {
        var k = BR.call(BR.NAMES.RANK_KEY, r) || "master";
        tw.appendChild(dom.el("span", { class: "mat-rank-tag rank-" + k, text: r }));
      });
      nm.appendChild(tw);
    }

    // 「查看素材详情」按钮
    if (items()[itemName]) {
      var iBtn = dom.el("button", { type: "button", class: "mat-detail-btn", text: "📦", title: "查看素材详情" });
      iBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        BR.call(BR.NAMES.PUSH_HISTORY, function () { BR.call(BR.NAMES.OPEN_MONSTER, monName, itemName); });
        openModal(itemName);
      });
      nm.appendChild(iBtn);
    }
    wrap.appendChild(nm);

    var info = items()[itemName];
    if (info && info.desc) wrap.appendChild(dom.el("div", { class: "mon-mat-desc", text: info.desc }));
    var fx = buildEffectEl(itemName);
    if (fx) wrap.appendChild(fx);

    var anyRow = false;
    (RANK_ORDER || []).forEach(function (rank) {
      var sub = (rows || []).filter(function (r) { return r.rank === rank; });
      if (!sub.length) return;
      anyRow = true;
      var rk = BR.call(BR.NAMES.RANK_KEY, rank) || "master";
      var grp = dom.el("div", { class: "mon-rank-group rank-" + rk });
      grp.appendChild(dom.el("div", { class: "mon-rank-head", text: "【" + rank + "】" }));

      sub.forEach(function (r) {
        var basePart = r.part ? prettyPart(r.part) : "";
        var partTxt = r.carveSrc ? (r.carveSrc + (basePart ? " " + basePart : "")) : basePart;
        if (!(!r.carveSrc && r.anomLv)) {
          grp.appendChild(dom.el("div", { class: "mon-drop-row", html:
            "<span class=\"drop-way\">" + dom.escapeHtml(r.way || "") + "</span>" +
            (partTxt ? "<span class=\"drop-part\">" + dom.escapeHtml(partTxt) + "</span>" : "") +
            "<span class=\"drop-count\">" + dom.escapeHtml(r.count || "") + "</span>" +
            "<span class=\"drop-rate\">" + dom.escapeHtml(r.rate || "") + "</span>" }));
        }
        if (r.anomLv) {
          var p2 = "怪异探究 Lv" + r.anomLv + (basePart ? " " + basePart : "");
          grp.appendChild(dom.el("div", { class: "mon-drop-row og-explore-drop", html:
            "<span class=\"drop-way\">" + dom.escapeHtml(r.way || "") + "</span>" +
            "<span class=\"drop-part drop-part-explore\">" + dom.escapeHtml(p2) + "</span>" +
            "<span class=\"drop-count\">" + dom.escapeHtml(r.count || "") + "</span>" +
            "<span class=\"drop-rate\">" + dom.escapeHtml(r.rate || "") + "</span>" }));
        }
      });
      wrap.appendChild(grp);
    });

    if (!anyRow) {
      wrap.appendChild(dom.el("div", { class: "mon-mat-none", text: "（本怪物无该素材的直接掉落记录）" }));
    }

    wrap.appendChild(buildObtainBlockImpl(itemName, false, function () {
      BR.call(BR.NAMES.OPEN_MONSTER, monName, itemName);
    }));
    return wrap;
  }

  // ---------------- 弹窗 ----------------
  function openModal(itemName) {
    var o = items()[itemName];
    if (!o) return;

    var body = dom.el('div');
    body.appendChild(buildTitleBlock(itemName, o));
    body.appendChild(buildObtainBlockImpl(itemName, true));

    M.modal.open('<span class="modal-title-icon">📦</span>' + dom.escapeHtml(itemName), body);
  }

  // ---------------- 素材明细（供怪物弹窗嵌入）----------------
  function buildDetail(itemName, highlight) {
    var o = items()[itemName];
    if (!o) return null;
    var box = dom.el('div', { class: 'mon-mat-detail' + (highlight ? ' highlight' : '') });

    var nm = dom.el('div', { class: 'mon-mat-title' }, [itemName]);
    var rt = buildRankTags(itemName);
    if (rt) nm.appendChild(rt);
    box.appendChild(nm);

    if (o.desc) box.appendChild(dom.el('div', { class: 'mon-mat-desc', text: o.desc }));
    var fx = buildEffectEl(itemName);
    if (fx) box.appendChild(fx);
    return box;
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'material',
    label: '素材',
    icon: '📦',
    order: 60,
    dataKey: 'item_data',
    list: list,
    searchText: searchText,
    renderCard: null,          // 素材走「切页式分类」，阶段2 实现
    renderModal: openModal,
    _api: {
      openModal: openModal,
      buildDetail: buildDetail,
      buildMatDetail: buildMatDetail,
      buildObtainBlock: buildObtainBlockImpl,
      obtainTypeInfo: obtainTypeInfo,
      renderObtainRow: renderObtainRow,
      buildEffectEl: buildEffectEl,
      info: info,
      list: list,
      searchText: searchText,
    },
  };

  M.register(def);
  M.materialSection = def._api;

  BR.provide(BR.NAMES.OPEN_ITEM, openModal);
  BR.provide(BR.NAMES.MAT_DETAIL_BUILD, buildMatDetail);

})(typeof window !== 'undefined' ? window : this);