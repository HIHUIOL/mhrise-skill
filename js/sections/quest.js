// ============================================================
// sections/quest.js —— 任务板块
//
// 数据：MHRS.quest.data（quest_data，698 条）
//       MHRS.quest.maps（quest_maps，地图编号 → 名）
//   { "9062484": { name, cat, star, full, desc, goal, fail, hrp, mrp,
//                  mons:[{name, players:[{p,hp,atk,parts,def,ail,stun,stam,mount}]}],
//                  supply, money, timeLimit, mapNo, reward, ... } }
//
// 分类：切页式（9 类，game_data.js 的 QUEST_CAT_ORDER）
//
// ⚠️ 分阶段迁移：
//   C3a（本次）：辅助 + 卡片 + 分组
//   C3b：切页式区块（buildQuestSection）
//   C3c：弹窗（openQuestModal + buildQuestBlock）
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[quest] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  function data() { return (M.quest && M.quest.data) || {}; }
  function maps() { return (M.quest && M.quest.maps) || {}; }
  function game() { return M.game || {}; }

  // ---------------- 基础工具 ----------------
  /** 地图编号 → 名 */
  function mapName(mapNo) {
    var m = maps();
    var nm = m[mapNo] || m[String(mapNo)];
    return nm ? nm : 'Area ' + mapNo;
  }

  /** 清洗任务文本（去爬虫脏尾） */
  function cleanText(s) {
    return String(s == null ? '' : s)
      .replace(/\s*\(HRP:[^)]*\)/g, '')
      .replace(/\s*\(MRP:[^)]*\)/g, '')
      .trim();
  }

  /** 活动任务位阶（0 大师 / 1 上位 / 2 下位 / 3 百龙） */
  function actRankOrder(q) {
    if (!q) return 1;
    var name = String(q.name || '').trim();
    if (String(q.mapNo) === '7' || name.indexOf('百龙') >= 0) return 3;
    var mrp = Number(String(q.mrp == null ? '0' : q.mrp).replace(/,/g, ''));
    if (mrp > 0) return 0;
    return (Number(q.star) || 0) >= 4 ? 1 : 2;
  }

  /** 斗技大会系列（0 大师斗技 / 1 斗技 / 2 挑战 / 9 其他） */
  function arenaSeriesOrder(q) {
    var name = String((q && q.name) || '');
    if (name.indexOf('大师等级斗技大会') === 0) return 0;
    if (name.indexOf('斗技大会') === 0) return 1;
    if (name.indexOf('挑战任务') === 0) return 2;
    return 9;
  }

  /** 名字末尾数字（同系列内 01,02,03…） */
  function nameTailNum(name) {
    var m = String(name || '').match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 9999;
  }

  // ---------------- 任务名归一化（供「素材→任务」跳转）----------------
  function normalizeLabel(s) {
    if (!s) return '';
    var t = String(s);
    t = t.replace(/(\s*Area\s*\d+\s*\(\d+%\))+/g, '');
    t = t.replace(/(\s*\(\d+%\))+/g, '');
    t = t.replace(/^(活动任务|斗技大会任务|怪异调查|怪异任务|村庄|集会所|大师等级|盟友|训练|怪异|斗技大会)\s*/, '');
    t = t.replace(/^\d+\s*★\s*/, '');
    return t.replace(/\s+/g, '').trim();
  }

  var _byNorm = null;
  function normIndex() {
    if (_byNorm) return _byNorm;
    _byNorm = {};
    var d = data();
    Object.keys(d).forEach(function (qid) {
      var nm = String(d[qid].name || '').replace(/\s+/g, '');
      if (nm && !_byNorm[nm]) _byNorm[nm] = qid;
    });
    return _byNorm;
  }

  /** 由 monsters.js 的任务标签找 quests.js 的 id */
  function findIdByLabel(label) {
    var key = normalizeLabel(label);
    if (!key) return null;
    var idx = normIndex();
    if (idx[key]) return idx[key];
    var loose = key.replace(/^\d*★?/, '');
    if (idx[loose]) return idx[loose];
    return null;
  }

  // ---------------- 目标怪分析 ----------------
  var _QT_BOUNDARY = /[头只个和、与及或，,。（(0-9\s的了]/;

  function analyzeTargets(goalRaw, mons) {
    mons = mons || [];
    var goal = cleanText(goalRaw);
    var allTarget = /所有目标|全部目标/.test(goal);

    function appears(nm) {
      if (!nm) return -1;
      var from = 0;
      while (true) {
        var i = goal.indexOf(nm, from);
        if (i < 0) return -1;
        var before = i > 0 ? goal[i - 1] : '';
        if (!before || _QT_BOUNDARY.test(before)) return i;
        from = i + 1;
      }
    }
    var ALIAS = game().MONSTER_ALIAS || {};
    function appearsWithAlias(nm) {
      var pos = appears(nm);
      if (pos >= 0) return pos;
      var alts = ALIAS[nm];
      if (alts) {
        for (var k = 0; k < alts.length; k++) {
          var p = appears(alts[k]);
          if (p >= 0) return p;
        }
      }
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
    return {
      list: list,
      targetCount: targets.length,
      hasOthers: targets.length > 0 && targets.length < list.length,
      allTarget: allTarget,
    };
  }

  // ---------------- 分组 ----------------
  function groupByCat() {
    var QUESTS = data();
    var groups = {};
    Object.keys(QUESTS).forEach(function (qid) {
      var c = QUESTS[qid].cat || '其他';
      (groups[c] = groups[c] || []).push(qid);
    });
    Object.keys(groups).forEach(function (c) {
      var isAct = (c === '活动任务');
      var isArena = (c === '斗技大会任务');
      groups[c].sort(function (a, b) {
        if (isAct) {
          var ra = actRankOrder(QUESTS[a]), rb = actRankOrder(QUESTS[b]);
          if (ra !== rb) return ra - rb;
        }
        if (isArena) {
          var sa2 = arenaSeriesOrder(QUESTS[a]), sb2 = arenaSeriesOrder(QUESTS[b]);
          if (sa2 !== sb2) return sa2 - sb2;
          var na = nameTailNum(QUESTS[a].name), nb = nameTailNum(QUESTS[b].name);
          if (na !== nb) return na - nb;
          return 0;
        }
        var sa = QUESTS[a].star || 0, sb = QUESTS[b].star || 0;
        if (sa !== sb) return sb - sa;
        return String(QUESTS[a].full || '').localeCompare(String(QUESTS[b].full || ''), 'zh');
      });
    });
    var ORDER = game().QUEST_CAT_ORDER || [];
    var order = ORDER.filter(function (c) { return groups[c]; });
    Object.keys(groups).forEach(function (c) {
      if (order.indexOf(c) < 0) order.push(c);
    });
    return { groups: groups, order: order };
  }

  /** 全部任务 → 数组 */
  function list() {
    var d = data();
    return Object.keys(d).map(function (qid) {
      return { id: qid, q: d[qid], name: d[qid].name || d[qid].full || qid };
    });
  }

  /** 搜索文本 */
  function searchText(item) {
    var q = item.q;
    var mons = (q.mons || []).map(function (m) { return m.name || ''; });
    return [
      q.name || '', q.full || '', q.cat || '',
      q.mapNo ? mapName(q.mapNo) : '',
      mons.join(' '),
    ].join(' ').toLowerCase();
  }

  function groupBy(item) { return item.q.cat || '其他'; }

  // ---------------- 卡片 ----------------
  function renderCard(item) {
    var qid = item.id, q = item.q;
    var card = dom.el('div', { class: 'skill-card quest-card', 'data-qid': qid });

    // 顶部：名字 + 星级
    var top = dom.el('div', { class: 'quest-card-top' });
    top.appendChild(dom.el('div', { class: 'quest-card-name', text: q.name || q.full || qid }));
    var effStar = q.star || 0;
    if (effStar) {
      var st = dom.el('span', { class: 'quest-star', text: '★' + effStar });
      if ((q.cat || '') === '怪异任务') st.title = '怪异等级 ' + effStar;
      top.appendChild(st);
    }
    card.appendChild(top);

    // 分类 + 地图
    var catEl = dom.el('div', { class: 'quest-card-cat' });
    catEl.appendChild(dom.el('span', { class: 'quest-card-cat-name', text: q.cat || '' }));
    if ((q.cat || '') === '活动任务') {
      var rk = actRankOrder(q);
      var LABEL = game().ACT_RANK_LABEL || {};
      catEl.appendChild(dom.el('span', { class: 'quest-card-rank rank-' + rk, text: LABEL[rk] || '' }));
    }
    if (q.mapNo) catEl.appendChild(dom.el('span', { class: 'quest-card-map', text: '📍' + mapName(q.mapNo) }));
    card.appendChild(catEl);

    // 怪物（目标怪在前）
    var mons = q.mons || [];
    if (mons.length) {
      var mEl = dom.el('div', { class: 'quest-card-mons' });
      var icons = (M.monster && M.monster.icons) || {};
      var ordered = analyzeTargets(q.goal, mons).list;
      var multi = ordered.length > 1;
      var anyTarget = ordered.some(function (x) { return x.isTarget; });
      var targetCount = ordered.filter(function (x) { return multi && x.isTarget && anyTarget; }).length;
      var needGap = targetCount > 0 && targetCount < ordered.length;

      ordered.forEach(function (entry, idx) {
        var m = entry.m;
        var f = icons[m.name];
        var isTargetCell = multi && entry.isTarget && anyTarget;
        var cell = dom.el('span', { class: 'qmon' + (isTargetCell ? ' qmon-target' : '') });
        if (f) {
          var im = dom.el('img', { alt: m.name, loading: 'lazy', decoding: 'async' });
          im.title = m.name + (isTargetCell ? '（目标）' : '');
          im.src = 'monster-icons/' + f;
          cell.appendChild(im);
        } else {
          cell.classList.add('qmon-noicon');
          cell.textContent = m.name;
        }
        mEl.appendChild(cell);

        if (needGap && isTargetCell &&
            (idx + 1 >= ordered.length || !(multi && ordered[idx + 1].isTarget && anyTarget))) {
          mEl.appendChild(dom.el('span', { class: 'qmon-gap', 'aria-hidden': 'true' }));
        }
      });
      card.appendChild(mEl);
    }

    card._search = searchText(item);
    card._qid = qid;

    card.addEventListener('click', function () {
      BR.call(BR.NAMES.OPEN_QUEST, qid);
    });

    return card;
  }


  // ---------------- 切页式区块（顶部一排分类按钮）----------------
  /**
   * 构建任务区块
   * @param {Node} container 容器元素
   * @param {Object} [opts]  { collapsed:()=>boolean, onCard:fn }
   * @returns {Object} { select, updateCounts, state, groups, cards }
   */
  function buildSection(container, opts) {
    opts = opts || {};
    if (!container) return null;

    var GROUP = groupByCat();
    var state = { activeCat: null, groupEls: {}, cards: [], cardById: {} };

    // ① 按钮条
    var bar = dom.el("div", { class: "qcat-tabs" });
    // ② 面板
    var panel = dom.el("div", { class: "qcat-panel" });

    function ensureRendered(cat) {
      var st = state.groupEls[cat];
      if (!st || st.rendered) return;
      st.rendered = true;
      st.qids.forEach(function (qid) {
        var el = renderCard({ id: qid, q: data()[qid] });
        var obj = { id: "quest_" + qid, el: el, search: el._search || "" };
        state.cardById[qid] = obj;
        state.cards.push(obj);
        st.itemsEl.appendChild(el);
      });
    }

    function selectCat(cat) {
      state.activeCat = cat;
      dom.$$(".qcat-tab", bar).forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-cat") === cat);
      });
      dom.clear(panel);
      if (cat) {
        ensureRendered(cat);
        panel.appendChild(state.groupEls[cat].itemsEl);
      }
    }

    // 建分组
    GROUP.order.forEach(function (cat) {
      var itemsEl = dom.el("div", { class: "quest-grid quest-group-items" });
      state.groupEls[cat] = {
        itemsEl: itemsEl, qids: GROUP.groups[cat], rendered: false, collapsed: false,
        total: GROUP.groups[cat].length,
      };
      var b = dom.el("button", { type: "button", class: "qcat-tab", "data-cat": cat, html:
        dom.escapeHtml(cat) + " <span class=\"qcat-tab-count\">" + GROUP.groups[cat].length + "</span>" });
      b.addEventListener("click", function () {
        selectCat(state.activeCat === cat ? null : cat);
      });
      bar.appendChild(b);
    });

    /** 更新按钮计数（传 null 还原总数） */
    function updateCounts(counts) {
      GROUP.order.forEach(function (cat) {
        var st = state.groupEls[cat];
        var b = bar.querySelector(".qcat-tab[data-cat=\"" + cat + "\"]");
        if (!b) return;
        var span = b.querySelector(".qcat-tab-count");
        if (!span) return;
        if (!counts) {
          span.textContent = st.total;
          b.classList.remove("qcat-tab-empty");
        } else {
          var n = counts[cat] || 0;
          span.textContent = n;
          b.classList.toggle("qcat-tab-empty", n === 0);
        }
      });
    }

    container.appendChild(bar);
    container.appendChild(panel);

    if (GROUP.order.length) selectCat(GROUP.order[0]);

    // ---- 滚动吸顶兜底（body 是 flex，部分浏览器 sticky 失效）----
    (function stickyFallback() {
      var placeholder = null;
      function ensurePlaceholder() {
        if (!placeholder) {
          placeholder = dom.el("div");
          placeholder.style.display = "none";
          bar.parentNode.insertBefore(placeholder, bar);
        }
        return placeholder;
      }
      function reset() {
        if (bar.style.position === "fixed") {
          bar.style.position = "";
          bar.style.top = "";
          bar.style.left = "";
          bar.style.width = "";
          bar.style.zIndex = "";
          bar.classList.remove("qcat-tabs-fixed");
          if (placeholder) placeholder.style.display = "none";
        }
      }
      function onScroll() {
        var collapsed = (typeof opts.collapsed === "function") ? opts.collapsed() : false;
        if (collapsed || container.offsetParent === null) { reset(); return; }
        var rect = bar.getBoundingClientRect();
        var ph = ensurePlaceholder();
        var phRect = ph.getBoundingClientRect();
        if (phRect.top < 0 && rect.top <= 0) {
          if (bar.style.position !== "fixed") {
            ph.style.display = "block";
            ph.style.height = bar.offsetHeight + "px";
            bar.style.position = "fixed";
            bar.style.top = "0";
            bar.style.left = phRect.left + "px";
            bar.style.width = phRect.width + "px";
            bar.style.zIndex = "50";
            bar.classList.add("qcat-tabs-fixed");
          } else {
            bar.style.left = phRect.left + "px";
            bar.style.width = phRect.width + "px";
          }
        } else {
          reset();
        }
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", function () { reset(); onScroll(); }, { passive: true });
    })();

    return {
      select: selectCat,
      updateCounts: updateCounts,
      state: state,
      groups: GROUP,
      bar: bar,
      panel: panel,
    };
  }


  // ---------------- 失败条件美化 ----------------
  function splitFail(str) {
    if (!str) return "";
    var t = String(str).trim();
    if (t === "无条件") return t;
    t = t.replace(/时间耗尽/g, function (m, off) {
      return off === 0 ? m : " / " + m;
    });
    return t.replace(/\s*\/\s*\/\s*/g, " / ").trim();
  }

  // ---------------- 任务弹窗 ----------------
  function openModal(qid) {
    var q = data()[qid];
    if (!q) return;
    var ICO = (M.monster && M.monster.icons) || {};
    var body = dom.el("div");

    // ① 分类 + 星级
    body.appendChild(dom.el("div", { class: "quest-kv", html:
      "<span class=\"q-k\">" + dom.escapeHtml(q.cat || "") + "</span>" +
      "<span class=\"q-v\">" + (q.star ? "★" + q.star : "") +
        (q.hrp ? " &nbsp;·&nbsp; HRP " + dom.escapeHtml(String(q.hrp)) : "") +
        (q.mrp ? " &nbsp;·&nbsp; MRP " + dom.escapeHtml(String(q.mrp)) : "") +
      "</span>" }));

    // ①b 速览条
    var facts = [];
    if (q.timeLimit && q.timeLimit !== "0") facts.push(["⏱", q.timeLimit + " 分钟"]);
    if (q.questLife) facts.push(["💀", q.questLife + " 猫"]);
    if (q.money && q.money !== "0") facts.push(["💰", Number(q.money).toLocaleString() + " z"]);
    if (facts.length) {
      body.appendChild(dom.el("div", { class: "quest-facts", html: facts.map(function (f) {
        return "<span class=\"qf-item\"><i>" + f[0] + "</i>" + dom.escapeHtml(f[1]) + "</span>";
      }).join("") }));
    }

    // ② 主要目标
    if (q.goal) {
      body.appendChild(dom.el("div", { class: "quest-goal-box", html:
        "<span class=\"qgb-tag\">主要目标</span>" +
        "<span class=\"qgb-txt\">" + dom.escapeHtml(cleanText(q.goal)) + "</span>" }));
    }

    // ③ 委托内容
    if (q.desc) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "委托内容" }));
      body.appendChild(dom.el("div", { class: "mon-mat-desc", text: q.desc }));
    }

    // ④ 任务信息
    body.appendChild(dom.el("div", { class: "mon-section-head", text: "任务信息" }));
    function kv(k, v) {
      if (!v) return;
      body.appendChild(dom.el("div", { class: "quest-kv", html:
        "<span class=\"q-k\">" + dom.escapeHtml(k) + "</span>" +
        "<span class=\"q-v\">" + dom.escapeHtml(String(v)) + "</span>" }));
    }
    kv("失败条件", splitFail(q.fail));
    kv("报酬金额", q.money && q.money !== "0" ? Number(q.money).toLocaleString() + " z" : "");
    if (q.timeLimit && q.timeLimit !== "0") kv("时间限制", q.timeLimit + " 分钟");
    if (q.questLife) kv("力尽上限", q.questLife + " 次");
    if (q.mapNo) kv("地图", mapName(q.mapNo));
    if (q.points && q.points !== "0") kv("炎火点数", q.points);

    // ⑤ 出现怪物（可折叠 + 人数档）
    var mons = q.mons || [];
    if (mons.length) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "出现怪物（" + mons.length + "）" }));
      var orderedMons = analyzeTargets(q.goal, mons).list;
      var targetCount = orderedMons.filter(function (x) { return x.isTarget; }).length;
      var hasOthers = targetCount < orderedMons.length && targetCount > 0;
      if (targetCount > 0 && orderedMons.length > 1) {
        body.appendChild(dom.el("div", { class: "quest-mon-tip", text: hasOthers
          ? "🎯 目标怪已排到前面（含乱入怪 " + (orderedMons.length - targetCount) + " 只）"
          : "🎯 以下均为任务目标怪" }));
      }

      orderedMons.forEach(function (entry, mi) {
        var mon = entry.m;
        var block = dom.el("div", { class: "quest-mon-block qm-collapsed" + (entry.isTarget ? " qm-target" : "") });
        var pls = mon.players || [];
        var hp0 = (pls[0] && pls[0].hp) ? " " + pls[0].hp : "";
        var f = ICO[mon.name];

        var hd = dom.el("div", { class: "quest-mon-head", html:
          (orderedMons.length > 1 ? "<span class=\"qm-idx\">" + (mi + 1) + "</span>" : "") +
          (f ? "<img src=\"monster-icons/" + f + "\" alt=\"\">" : "<span class=\"qm-emoji\">👹</span>") +
          "<span class=\"qm-name-txt\">" + dom.escapeHtml(mon.name) + "</span>" +
          (entry.isTarget ? "<span class=\"qm-target-tag\">目标</span>" : "") +
          (hp0 ? "<span class=\"qm-hp\">" + dom.escapeHtml(hp0.replace(/\s*HP$/, "")) + " HP</span>" : "") +
          "<span class=\"qm-arrow\">▶</span>" });
        block.appendChild(hd);

        var bd = dom.el("div", { class: "quest-mon-body" });
        if (pls.length) {
          pls.forEach(function (p) {
            var row = dom.el("div", { class: "qm-row" });
            row.appendChild(dom.el("span", { class: "qm-players", text: p.p ? p.p + "人" : "—" }));
            var vals = dom.el("div", { class: "qm-vals" });
            [["HP", p.hp], ["攻击", p.atk], ["部位", p.parts], ["防御", p.def],
             ["异常", p.ail], ["眩晕", p.stun], ["耐力", p.stam], ["骑乘", p.mount]
            ].forEach(function (kvp) {
              if (!kvp[1]) return;
              vals.appendChild(dom.el("span", { class: "qm-kv", html:
                "<i>" + kvp[0] + "</i>" + dom.escapeHtml(String(kvp[1])) }));
            });
            row.appendChild(vals);
            bd.appendChild(row);
          });
        } else {
          bd.appendChild(dom.el("div", { class: "mon-mat-none", text: "（无人数档数据）" }));
        }
        block.appendChild(bd);

        hd.addEventListener("click", function (ev) {
          var nameTxt = ev.target && ev.target.closest && ev.target.closest(".qm-name-txt");
          if (nameTxt && (M.monster && M.monster.data[mon.name])) {
            BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(qid); });
            BR.call(BR.NAMES.OPEN_MONSTER, mon.name);
            return;
          }
          var collapsed = block.classList.toggle("qm-collapsed");
          var arrow = hd.querySelector(".qm-arrow");
          if (arrow) arrow.textContent = collapsed ? "▶" : "▼";
        });
        if (M.monster && M.monster.data[mon.name]) {
          var nt = hd.querySelector(".qm-name-txt");
          if (nt) nt.classList.add("qm-name-link");
        }
        body.appendChild(block);
      });
    }

    // ⑥ 补给箱
    var sups = q.supply || [];
    if (sups.length) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "补给箱（" + sups.length + "）" }));
      var cloud = dom.el("div", { class: "mon-mat-cloud" });
      sups.forEach(function (sp) {
        var cnt = sp.count ? String(sp.count) : "";
        var chip = dom.el("span", { class: "mon-mat-chip quest-sup-chip",
          text: sp.item + (cnt ? (/^x/i.test(cnt) ? " " + cnt : " x" + cnt) : "") });
        if (data()[0] || (M.item && M.item.data[sp.item])) {
          chip.style.cursor = "pointer";
          chip.addEventListener("click", function () {
            BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(qid); });
            BR.call(BR.NAMES.OPEN_ITEM, sp.item);
          });
        }
        cloud.appendChild(chip);
      });
      body.appendChild(cloud);
    }

    // ⑦ 任务报酬
    var rw = q.reward || {};
    var rwCommon = rw.common || [];
    var rwAdd = rw.additional || [];
    if (rwCommon.length || rwAdd.length) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "任务报酬（" + (rwCommon.length + rwAdd.length) + "）" }));
      function rewardGroup(title, list, cls) {
        if (!list.length) return;
        body.appendChild(dom.el("div", { class: "quest-reward-sub " + cls, text: title + "（" + list.length + "）" }));
        var wrap = dom.el("div", { class: "quest-reward-list" });
        list.forEach(function (it) {
          var pct = Math.max(0, Math.min(100, parseFloat(it.rate) || 0));
          var row = dom.el("div", { class: "quest-reward-item", html:
            "<span class=\"qr-name\">" + dom.escapeHtml(it.name) + "</span>" +
            "<span class=\"qr-bar\"><i style=\"width:" + pct + "%\"></i></span>" +
            "<span class=\"qr-count\">x" + dom.escapeHtml(String(it.count)) + "</span>" +
            "<span class=\"qr-rate\">" + dom.escapeHtml(it.rate) + "</span>" });
          if (M.item && M.item.data[it.name]) {
            row.classList.add("qr-clickable");
            row.addEventListener("click", function () {
              BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(qid); });
              BR.call(BR.NAMES.OPEN_ITEM, it.name);
            });
          }
          wrap.appendChild(row);
        });
        body.appendChild(wrap);
      }
      rewardGroup("基本报酬", rwCommon, "qr-common");
      rewardGroup("追加报酬", rwAdd, "qr-add");
    }

    // ⑧ 同系列任务导航
    var navs = [];
    if (q.prev) navs.push(["prev", "◀ 上一任务", q.prev]);
    if (q.next) navs.push(["next", "下一任务 ▶", q.next]);
    if (navs.length) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "同系列任务" }));
      var navWrap = dom.el("div", { class: "quest-nav" });
      navs.forEach(function (n) {
        var btn = dom.el("button", { type: "button", class: "quest-nav-btn " + (n[0] === "prev" ? "qn-prev" : "qn-next"), html:
          "<span class=\"qn-arrow\">" + dom.escapeHtml(n[1]) + "</span>" +
          "<span class=\"qn-name\">" + dom.escapeHtml(cleanText(n[2])) + "</span>" });
        btn.addEventListener("click", function () {
          var tid = BR.call(BR.NAMES.QUEST_BY_NAME, n[2]);
          if (tid && tid !== qid) {
            BR.call(BR.NAMES.PUSH_HISTORY, function () { openModal(qid); });
            openModal(tid);
          }
        });
        navWrap.appendChild(btn);
      });
      body.appendChild(navWrap);
    }

    M.modal.open("<span class=\"modal-title-icon\">🏹</span>" + dom.escapeHtml(q.name || qid), body);
    M.modal.updateBackBtn();
    document.body.style.overflow = "hidden";
  }

  // ---------------- 任务列表块（怪物弹窗内嵌）----------------
  function buildBlock(quests, monName) {
    quests = quests || [];
    var FIELD_LABEL = game().QUEST_FIELD_LABEL || {};
    var FIELD_ORDER = game().QUEST_FIELD_ORDER || [];
    var CAT_ORDER = game().QUEST_CAT_ORDER || [];

    var wrap = dom.el("div", { class: "mon-quest" });
    var head = dom.el("div", { class: "mon-section-head mon-quest-toggle", html:
      "任务列表（" + quests.length + "）<span class=\"mon-quest-arrow\">▼</span>" });
    wrap.appendChild(head);
    var listEl = dom.el("div", { class: "mon-quest-list collapsed" });

    // 解析每行
    var nameOccur = {};
    var parsed = quests.map(function (q) {
      var questName, fields;
      if (Array.isArray(q)) {
        questName = q[0];
        fields = q.slice(1).map(function (v, i) { return { key: FIELD_ORDER[i], val: v }; })
          .filter(function (x) { return x.val; });
      } else {
        questName = q.quest || "";
        fields = FIELD_ORDER.filter(function (k) { return q[k]; })
          .map(function (k) { return { key: k, val: q[k] }; });
      }
      var areaInfo = BR.call(BR.NAMES.QUEST_PARSE_AREA, questName) || { areas: [], name: questName };
      var pureName = areaInfo.name || questName;
      var pureKey = String(pureName).replace(/\s+/g, "");
      var occurIndex = nameOccur[pureKey] || 0;
      nameOccur[pureKey] = occurIndex + 1;
      var qid = BR.call(BR.NAMES.QUEST_BY_MON, pureName, monName, occurIndex);
      if (!qid) qid = findIdByLabel(pureName);
      if (!qid) qid = findIdByLabel(questName);
      var qd = qid ? data()[qid] : null;
      var mapNm = (qd && qd.mapNo) ? mapName(qd.mapNo) : "";
      var isTarget = false;
      if (qd && monName) {
        var info = analyzeTargets(qd.goal, qd.mons || []);
        isTarget = info.list.some(function (x) {
          if (!x.isTarget || !x.name) return false;
          var a = x.name.replace(/[（(].*?[)）]/g, "").trim();
          var b = String(monName).replace(/[（(].*?[)）]/g, "").trim();
          return x.name === monName || a === b || a === monName || x.name === b;
        });
      }
      return {
        name: pureName, rawName: questName, areas: areaInfo.areas || [],
        crownMini: areaInfo.crownMini, crownKing: areaInfo.crownKing,
        mapName: mapNm, fields: fields, qid: qid,
        cat: (qd && qd.cat) || "其他", star: (qd && qd.star) || 0, isTarget: isTarget,
      };
    });

    parsed.sort(function (a, b) {
      if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
      var sa = a.star || 0, sb = b.star || 0;
      if (sa !== sb) return sb - sa;
      var ca = CAT_ORDER.indexOf(a.cat), cb = CAT_ORDER.indexOf(b.cat);
      return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    });

    // 分类筛选条
    var catCount = {};
    parsed.forEach(function (it) { catCount[it.cat] = (catCount[it.cat] || 0) + 1; });
    var catList = CAT_ORDER.filter(function (c) { return catCount[c]; })
      .concat(Object.keys(catCount).filter(function (c) { return CAT_ORDER.indexOf(c) < 0; }));
    var rows = [];
    if (catList.length >= 2) {
      var filterBar = dom.el("div", { class: "mon-quest-filter" });
      var mk = function (label, val, count) {
        var b = dom.el("button", { type: "button", class: "mqf-btn" + (val === "" ? " active" : ""),
          "data-cat": val, text: label + (count != null ? " " + count : "") });
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          dom.$$(".mqf-btn", filterBar).forEach(function (x) { x.classList.toggle("active", x === b); });
          rows.forEach(function (r) { r.el.style.display = (!val || r.cat === val) ? "" : "none"; });
        });
        return b;
      };
      filterBar.appendChild(mk("全部", "", parsed.length));
      catList.forEach(function (c) { filterBar.appendChild(mk(c, c, catCount[c])); });
      listEl.appendChild(filterBar);
    }

    // 任务行
    parsed.forEach(function (it) {
      var row = dom.el("div", { class: "mon-quest-row" + (it.isTarget ? " mon-quest-target" : "") });
      row.appendChild(dom.el("div", { class: "mon-quest-name", html:
        (it.isTarget ? "<span class=\"mq-target-badge\">主要目标</span>" : "") +
        "<span class=\"mq-name-txt\">" + dom.escapeHtml(it.name) + "</span>" }));

      if (it.cat && it.cat !== "其他") {
        row.appendChild(dom.el("div", { class: "mon-quest-tags", html:
          "<span class=\"mq-cat\">" + dom.escapeHtml(it.cat) + "</span>" +
          (it.star ? "<span class=\"mq-star\">★" + it.star + "</span>" : "") }));
      }

      var hasArea = it.areas && it.areas.length;
      var hasCrown = it.crownMini || it.crownKing;
      if (hasArea || hasCrown) {
        var spawn = dom.el("div", { class: "mq-spawn" });
        if (hasArea) {
          var areaWrap = dom.el("div", { class: "mq-spawn-areas", html:
            (it.mapName ? "<span class=\"mq-map-name\">📍" + dom.escapeHtml(it.mapName) + "</span>" : "") +
            it.areas.map(function (a) {
              return "<span class=\"mq-area-chip\"><b>" + a.n + "区</b><i>" +
                dom.escapeHtml(String(a.rate)) + "%</i></span>";
            }).join("") });
          spawn.appendChild(areaWrap);
        }
        if (hasCrown) {
          var crownWrap = dom.el("div", { class: "mq-spawn-crowns" });
          if (it.crownMini) {
            crownWrap.innerHTML += "<span class=\"mq-crown-chip crown-mini\" title=\"小金冠概率\">" +
              "<img src=\"ui-icons/crown_mini.png\" alt=\"小金\">" +
              "<i>" + dom.escapeHtml(String(it.crownMini)) + "%</i></span>";
          }
          if (it.crownKing) {
            crownWrap.innerHTML += "<span class=\"mq-crown-chip crown-king\" title=\"大金冠概率\">" +
              "<img src=\"ui-icons/crown_king.png\" alt=\"大金\">" +
              "<i>" + dom.escapeHtml(String(it.crownKing)) + "%</i></span>";
          }
          spawn.appendChild(crownWrap);
        }
        row.appendChild(spawn);
      }

      var meta = dom.el("div", { class: "mon-quest-meta" });
      it.fields.forEach(function (f) {
        meta.appendChild(dom.el("span", { class: "qmeta", html:
          "<i>" + (FIELD_LABEL[f.key] || f.key) + "</i>" + dom.escapeHtml(String(f.val)) }));
      });
      row.appendChild(meta);

      if (it.qid) {
        row.classList.add("mon-quest-clickable");
        row.title = "点击查看任务详情";
        row.addEventListener("click", function (ev) {
          ev.stopPropagation();
          BR.call(BR.NAMES.PUSH_HISTORY, function () {
            var ctx = BR.call(BR.NAMES.CUR_MON_CTX);
            if (ctx && ctx.monName) BR.call(BR.NAMES.OPEN_MONSTER, ctx.monName, ctx.focusItem);
            else BR.call(BR.NAMES.OPEN_MONSTER, monName);
          });
          openModal(it.qid);
        });
      }
      rows.push({ el: row, cat: it.cat });
      listEl.appendChild(row);
    });

    wrap.appendChild(listEl);
    head.addEventListener("click", function () {
      listEl.classList.toggle("collapsed");
      var a = head.querySelector(".mon-quest-arrow");
      if (a) a.textContent = listEl.classList.contains("collapsed") ? "▼" : "▲";
    });
    return wrap;
  }

  // ---------------- 注册 ----------------
  var def = {
    id: 'quest',
    label: '任务',
    icon: '📋',
    order: 70,
    dataKey: 'quest_data',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    buildCatalog: buildSection,   // 切页式分类区块
    _api: {
      buildSection: buildSection,
      openModal: openModal,
      buildBlock: buildBlock,
      splitFail: splitFail,
      renderCard: renderCard,
      mapName: mapName,
      cleanText: cleanText,
      actRankOrder: actRankOrder,
      arenaSeriesOrder: arenaSeriesOrder,
      nameTailNum: nameTailNum,
      normalizeLabel: normalizeLabel,
      findIdByLabel: findIdByLabel,
      groupByCat: groupByCat,
      analyzeTargets: analyzeTargets,
      list: list,
      searchText: searchText,
    },
  };

  M.register(def);
  M.questSection = def._api;

  BR.provide(BR.NAMES.QUEST_BY_LABEL, findIdByLabel);
  BR.provide(BR.NAMES.OPEN_QUEST, openModal);

})(typeof window !== 'undefined' ? window : this);