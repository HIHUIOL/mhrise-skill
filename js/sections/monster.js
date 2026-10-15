// ============================================================
// sections/monster.js —— 怪物板块
//
// 数据：MHRS.monster.data（monster_data，112 条）
//       MHRS.monster.icons（monster_icons，名字 → 图标文件名）
//   { "丸鸟": { ailments:[[...]], hitzones:[[...]], materials:[{count,item}],
//               quests:[...], anomalyMaterials:[...] } }
//
// 图标：monster-icons/<file>（64×64 png）
//
// 排序：大型怪物（图标 em***）在前，小型怪物（ems***）在后
//
// 跨板块：
//   · openItem / openMonster（素材、怪物互跳）
//   · monstersForMaterial / ranksForMaterial（被素材/珠子板块调用）
//
// ⚠️ 分阶段迁移：
//   阶段1（本次）：卡片 + 图标 + 分组排序
//   阶段2：弹窗（肉质表 / 素材 / 任务，依赖素材+任务板块）
//
// 依赖：core/dom.js, core/registry.js, core/modal.js
// ============================================================
(function (root) {
  'use strict';
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom;
  if (!dom) { console.error('[monster] 缺少 core/dom.js'); return; }
  var BR = M.bridge || { call: function () {}, provide: function () {} };

  var ICON_DIR = 'monster-icons/';

  function data() { return (M.monster && M.monster.data) || {}; }
  function icons() { return (M.monster && M.monster.icons) || {}; }

  /** 图标文件名 */
  function iconOf(name) {
    var m = icons();
    return m[name] || null;
  }

  /** 是否小型怪物（图标以 ems 开头） */
  function isSmall(name) {
    return /^ems/i.test(iconOf(name) || '');
  }

  /** 全部怪物名（大型在前、小型在后，各自按名字排） */
  function list() {
    var names = Object.keys(data());
    var big = names.filter(function (n) { return !isSmall(n); }).sort();
    var small = names.filter(function (n) { return isSmall(n); }).sort();
    return big.concat(small).map(function (n) {
      return { name: n, mon: data()[n], small: isSmall(n) };
    });
  }

  /** 大型 / 小型 分组（供目录与分组标题） */
  function listGrouped() {
    var arr = list();
    var big = arr.filter(function (x) { return !x.small; });
    var small = arr.filter(function (x) { return x.small; });
    return { big: big, small: small, all: arr };
  }

  /** 搜索文本 */
  function searchText(item) {
    return item.name.toLowerCase();
  }

  /** 分类：大型 / 小型 */
  function groupBy(item) { return item.small ? '小型怪物' : '大型怪物'; }

  // ---------------- 图标元素 ----------------
  function buildIcon(name) {
    var f = iconOf(name);
    if (!f) {
      return dom.el('div', { class: 'mon-icon-img mon-icon-ph', text: '?' });
    }
    var im = dom.el('img', { class: 'mon-icon-img', alt: name, loading: 'lazy', decoding: 'async' });
    im.src = ICON_DIR + f;
    return im;
  }

  // ---------------- 卡片 ----------------
  function renderCard(item) {
    var name = item.name;
    var card = dom.el('div', { class: 'skill-card monster-card mon-icon-card' });
    card.setAttribute('data-monster-name', name);

    card.appendChild(buildIcon(name));

    var title = dom.el('div', { class: 'mon-icon-name', title: name, html:
      '<span class="deco-title-text">' + dom.escapeHtml(name) + '</span>' });
    card.appendChild(title);

    card._search = name.toLowerCase();

    card.addEventListener('click', function () {
      BR.call(BR.NAMES.OPEN_MONSTER, name);
    });

    return card;
  }

  // ---------------- 弹窗（阶段2 由 render.js 提供，这里转发）----------------
  // [C4] 弹窗（完整版）
  function openModal(monName, focusItem, restoreState) {
    return openModalFull(monName, focusItem, restoreState);
  }

  // ---------------- 目录 ----------------
  function buildCatalog(container) {
    if (!container) return;
    var g = listGrouped();
    var groups = [
      { key: '大型怪物', list: g.big },
      { key: '小型怪物', list: g.small },
    ];
    groups.forEach(function (grp) {
      if (!grp.list.length) return;
      var groupEl = dom.el('div', { class: 'catalog-group' });
      groupEl.appendChild(dom.el('div', { class: 'catalog-cat', html:
        dom.escapeHtml(grp.key) + ' <span class="cat-count">' + grp.list.length + '</span>' }));
      var itemsEl = dom.el('div', { class: 'catalog-items' });
      grp.list.forEach(function (it) {
        var b = dom.el('button', { class: 'catalog-item', text: it.name });
        b.addEventListener('click', function () { BR.call(BR.NAMES.OPEN_MONSTER, it.name); });
        itemsEl.appendChild(b);
      });
      groupEl.appendChild(itemsEl);
      container.appendChild(groupEl);
    });
  }


  // ---------------- 素材相关（本板块用）----------------
  function dropRows(monName, itemName) {
    var mon = data()[monName];
    if (!mon) return [];
    return (mon.materials || []).filter(function (m) { return m.item === itemName; });
  }

  /** 某怪物的素材按等级分组 → [{rank, items:[...]}, ...] */
  function materialsByRank(monName) {
    var mon = data()[monName];
    if (!mon) return [];
    var groups = {};
    (mon.materials || []).forEach(function (m) {
      if (!m.item || !m.rank) return;
      var rk = m.rank;
      if (!groups[rk]) groups[rk] = [];
      if (groups[rk].indexOf(m.item) < 0) groups[rk].push(m.item);
    });
    if (mon.anomalyMaterials && mon.anomalyMaterials.length) {
      var anomItems = groups["怪异"] || [];
      mon.anomalyMaterials.forEach(function (nm) {
        if (nm && anomItems.indexOf(nm) < 0) anomItems.push(nm);
      });
      var ord = mon.anomalyMaterials;
      anomItems.sort(function (a, b) {
        var ia = ord.indexOf(a), ib = ord.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      groups["怪异"] = anomItems;
    }
    var RANK_ORDER = (M.game && M.game.RANK_ORDER) || [];
    return RANK_ORDER.filter(function (r) { return groups[r] && groups[r].length; })
      .map(function (r) { return { rank: r, items: groups[r] }; });
  }

  // ---------------- 部位肉质表 ----------------
  function buildHitHead(COLS, firstColText) {
    var thead = dom.el("thead");
    var htr = dom.el("tr");
    htr.appendChild(dom.el("th", { class: "hit-part-th", text: firstColText || "部位" }));
    COLS.forEach(function (c) {
      var th = dom.el("th", { class: "hit-ico " + c.cls, title: c.label });
      th.appendChild(dom.el("img", { src: c.img, alt: c.label, class: "hit-ico-img" }));
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    return thead;
  }

  /**
   * 部位肉质表
   * 行结构: [部位, State, 斩击, 打击, 弹, 火, 水, 冰, 雷, 龙, 眩晕]
   */
  function buildHitzone(hz) {
    var wrap = dom.el("div", { class: "mon-hit" });
    var head = dom.el("div", { class: "mon-section-head" });
    head.appendChild(dom.el("span", { text: "部位肉质" }));
    wrap.appendChild(head);

    var COLS = (M.game && M.game.HITZONE_COLS) || [];

    function cellColor(v) {
      var n = parseInt(v, 10);
      if (!isFinite(n) || n <= 0) return "hit-none";
      if (n >= 60) return "hit-hi";
      if (n >= 40) return "hit-mid";
      if (n >= 25) return "hit-lo";
      return "hit-min";
    }

    var stateIds = [];
    hz.forEach(function (r) { if (stateIds.indexOf(r[1]) < 0) stateIds.push(r[1]); });
    stateIds.sort(function (a, b) { return Number(a) - Number(b); });
    var hasStates = stateIds.length > 1;

    function stateLabel(sv) {
      var n = (sv === undefined || sv === null || sv === "") ? 0 : Number(sv);
      if (n === 0) return "常态";
      return "状态 " + (isFinite(n) ? n + 1 : String(sv));
    }

    var byState = {};
    hz.forEach(function (r) { (byState[r[1]] = byState[r[1]] || []).push(r); });

    var tblWrap = dom.el("div");
    wrap.appendChild(tblWrap);
    var mode = "part";

    function makePartName(name) {
      return dom.el("span", { class: "hit-part-name", text: name || "" });
    }
    // 需要「左右微动」的部位名容器（挂载后测宽决定）
    var partScrolls = [];
    function makePartCell(name, stateText, stateCls) {
      var scroll = dom.el("div", { class: "hit-part-scroll" });
      scroll.appendChild(makePartName(name));
      if (stateText !== null && stateText !== undefined) {
        scroll.appendChild(dom.el("span", { class: "hit-state" + (stateCls || ""), text: stateText }));
      }
      partScrolls.push(scroll);
      return scroll;
    }
    function fillValueCells(tr, r) {
      COLS.forEach(function (c) {
        var v = r[c.i];
        tr.appendChild(dom.el("td", { class: cellColor(v), text: String(v) }));
      });
    }

    function renderTable() {
      dom.clear(tblWrap);
      partScrolls = []; // 重建表格 → 重置收集列表（旧元素已移除）
      var tbl = dom.el("table", { class: "mon-hit-table" });
      tbl.appendChild(buildHitHead(COLS, mode === "part" ? "部位 · 状态" : "状态 · 部位"));
      var tbody = dom.el("tbody");

      if (mode === "part") {
        var stateCol = hz.some(function (r) { return String(r[1]) !== "0"; });
        hz.forEach(function (r, idx) {
          var tr = dom.el("tr");
          var td0 = dom.el("td", { class: "hit-part" });
          var sameAsPrev = idx > 0 && hz[idx - 1][0] === r[0];
          if (!sameAsPrev) {
            td0.appendChild(makePartCell(r[0],
              stateCol ? stateLabel(r[1]) : null,
              (!r[1] || r[1] === "0") ? " hit-state-normal" : ""));
          } else {
            td0.classList.add("hit-part-cont");
            if (stateCol) {
              td0.appendChild(dom.el("span", {
                class: "hit-state" + ((!r[1] || r[1] === "0") ? " hit-state-normal" : ""),
                text: stateLabel(r[1]) }));
            }
          }
          tr.appendChild(td0);
          fillValueCells(tr, r);
          tbody.appendChild(tr);
        });
      } else {
        stateIds.forEach(function (sv) {
          byState[sv].forEach(function (r, i) {
            var tr = dom.el("tr");
            var td0 = dom.el("td", { class: "hit-part hit-part-group" });
            var scroll = dom.el("div", { class: "hit-part-scroll hit-part-scroll-state" });
            if (i === 0) {
              scroll.appendChild(dom.el("span", { class: "hit-part-name hit-state-name", text: stateLabel(sv) }));
            }
            scroll.appendChild(dom.el("span", { class: "hit-state hit-state-part", text: r[0] || "" }));
            td0.appendChild(scroll);
            tr.appendChild(td0);
            fillValueCells(tr, r);
            tbody.appendChild(tr);
          });
        });
      }
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      requestAnimationFrame(setupPartMarquee);
    }

    /**
     * 部位名「左右微动」：仅对溢出的部位名启用
     * （长的部位名如「胴_肉質(操竜受付用)」自动摆动露出全称）
     */
    function setupPartMarquee() {
      partScrolls.forEach(function (sc) {
        if (sc.classList.contains("hp-run")) return; // 已处理
        if (!sc.clientWidth) return;
        var cs = window.getComputedStyle(sc);
        var padL = parseFloat(cs.paddingLeft) || 0;
        var padR = parseFloat(cs.paddingRight) || 0;
        // 用 scrollWidth 量真实内容宽（子元素是 block，rect 会被父压缩）
        var contentW = sc.scrollWidth;
        var avail = sc.clientWidth; // scrollWidth/clientWidth 都含 padding，直接相减
        var overflow = Math.ceil(contentW - avail);
        if (overflow <= 3) return; // 不明显溢出就不动
        var shift = overflow + 2;
        sc.classList.add("hp-run");
        sc.style.setProperty("--hp-shift", (-shift) + "px");
        var dur = Math.max(2.6, (shift * 2) / 25);
        sc.style.setProperty("--hp-dur", dur.toFixed(2) + "s");
      });
    }

    // 切换按钮
    if (hasStates) {
      var sw = dom.el("div", { class: "hit-mode-switch" });
      var b1 = dom.el("button", { type: "button", class: "hit-mode-btn active", text: "按部位" });
      var b2 = dom.el("button", { type: "button", class: "hit-mode-btn", text: "按状态" });
      sw.appendChild(b1); sw.appendChild(b2);
      head.appendChild(sw);
      b1.addEventListener("click", function () {
        if (mode === "part") return;
        mode = "part"; b1.classList.add("active"); b2.classList.remove("active"); renderTable();
      });
      b2.addEventListener("click", function () {
        if (mode === "state") return;
        mode = "state"; b2.classList.add("active"); b1.classList.remove("active"); renderTable();
      });
    }

    renderTable();

    wrap.appendChild(dom.el("div", { class: "hit-legend", html:
      "<span class=\"hl-item\">数值越高伤害越高：</span>" +
      "<span class=\"hl-hit hit-min\">低</span>" +
      "<span class=\"hl-hit hit-lo\">中</span>" +
      "<span class=\"hl-hit hit-mid\">高</span>" +
      "<span class=\"hl-hit hit-hi\">很高</span>" }));

    return wrap;
  }

  /**
   * 异常耐性表（A+B+C）
   * 行结构: [异常名, 积蓄值, 衰减, 上限, 持续时间, 备注]
   *   · 可折叠（默认收起，避免怪物弹窗过长）
   *   · 备注列（BlastDamage/SubStamina）翻译成中文
   */
  function buildAilment(ail) {
    var wrap = dom.el("div", { class: "mon-ail" });

    // ---- 标题（点击折叠） ----
    var head = dom.el("div", { class: "mon-section-head mon-ail-head" });
    head.appendChild(dom.el("span", { text: "异常耐性" }));
    var hint = dom.el("span", { class: "mon-ail-hint", text: "（点击展开 ▼）" });
    head.appendChild(hint);
    wrap.appendChild(head);

    // ---- 内容容器（折叠开关 = .collapsed） ----
    var body = dom.el("div", { class: "mon-ail-body collapsed" });
    wrap.appendChild(body);

    // 备注翻译
    function transNote(note) {
      if (!note) return "";
      var s = String(note).trim();
      var m1 = s.match(/^BlastDamage:\s*(-?\d+)$/i);
      if (m1) return "爆破伤害 " + m1[1];
      var m2 = s.match(/^SubStamina:\s*(-?\d+)$/i);
      if (m2) return "减气值 " + m2[1];
      return s;
    }

    var tbl = dom.el("table", { class: "mon-ail-table" });
    var thead = dom.el("thead");
    var htr = dom.el("tr");
    ["异常状态", "积蓄值", "衰减", "上限", "持续时间", "备注"].forEach(function (t) {
      htr.appendChild(dom.el("th", { text: t }));
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);

    var tbody = dom.el("tbody");
    // 需要滚动的格子（等挂到 DOM 后再测宽度决定是否加动画）
    var mqCells = [];
    function cell(text, cls) {
      var td = dom.el("td", { class: (cls ? cls + " " : "") + "mq-cell" });
      var sp = dom.el("span", { class: "mq-inner", text: text });
      td.appendChild(sp);
      mqCells.push(td);
      return td;
    }
    ail.forEach(function (r) {
      var tr = dom.el("tr");
      tr.appendChild(cell(String(r[0] || ""), "mon-ail-name"));
      tr.appendChild(cell(String(r[1] || "")));
      tr.appendChild(cell(String(r[2] || "")));
      tr.appendChild(cell(String(r[3] || "")));
      tr.appendChild(cell(String(r[4] || "")));
      tr.appendChild(cell(transNote(r[5]), "mon-ail-note"));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    body.appendChild(tbl);

    // ---- 微动：挂到 DOM 后测宽，仅溢出者左右摆动 ----
    function setupMarquee() {
      mqCells.forEach(function (td) {
        if (td.classList.contains("mq-run")) return; // 已处理
        var inner = td.querySelector(".mq-inner");
        if (!inner) return;
        // 展开时才有布局尺寸；折叠中则跳过（下次展开再处理）
        var cellW = td.clientWidth;
        if (!cellW) return;
        // 精确计算：文字实宽 - 格子「内容区」宽（去掉左右 padding）
        //   不能用 scrollWidth-clientWidth（clientWidth 已含 padding，会少算）
        var cs = window.getComputedStyle(td);
        var padL = parseFloat(cs.paddingLeft) || 0;
        var padR = parseFloat(cs.paddingRight) || 0;
        var innerW = inner.getBoundingClientRect().width;
        var avail = cellW - padL - padR;
        var overflow = Math.ceil(innerW - avail);
        if (overflow <= 3) return; // 不明显溢出（≤3px）就不动，避免无意义微抖
        // 摆动距离 = 溢出量 + 一点点余量（避免边缘贴字）
        var shift = overflow + 2;
        td.classList.add("mq-run");
        td.style.setProperty("--mq-shift", (-shift) + "px");
        // 时长随距离变化，约 25px/s 往返
        var dur = Math.max(2.6, (shift * 2) / 25);
        td.style.setProperty("--mq-dur", dur.toFixed(2) + "s");
      });
    }

    // ---- 折叠绑定（用公共工具） ----
    var collapse = (M.ui && M.ui.sectionCollapse)
      ? M.ui.sectionCollapse({
          title: head,
          container: body,
          hint: hint,
          collapsed: true,
          expandText: "（点击展开 ▼）",
          collapseText: "（点击收起 ▲）",
        })
      : null;
    if (!collapse) {
      // 兜底：手写点击
      head.addEventListener("click", function () {
        var c = body.classList.toggle("collapsed");
        hint.textContent = c ? "（点击展开 ▼）" : "（点击收起 ▲）";
      });
    }
    // 展开时启动跑马灯（折叠状态量不到宽度）
    head.addEventListener("click", function () {
      if (!body.classList.contains("collapsed")) {
        requestAnimationFrame(function () { setupMarquee(); });
      }
    });
    // 若初始就是展开（防其它路径直接展开）
    if (!body.classList.contains("collapsed")) {
      requestAnimationFrame(function () { setupMarquee(); });
    }

    return wrap;
  }

  // ---------------- 怪物弹窗 ----------------
  function openModalFull(monName, focusItem, restoreState) {
    var mon = data()[monName];
    if (!mon) return;

    // 记录上下文（供「返回」精准重开）
    _ctx = { monName: monName, focusItem: focusItem || null };
    BR.call(BR.NAMES.SET_MON_CTX, monName, focusItem);

    var body = dom.el("div");

    // ① 点击的素材明细
    if (focusItem) {
      var rows = dropRows(monName, focusItem).slice();
      var md = BR.call(BR.NAMES.MAT_DETAIL_BUILD, monName, focusItem, rows, true);
      if (md) body.appendChild(md);
    }

    // ② 素材一览（按等级）
    var rankGroups = materialsByRank(monName);
    if (rankGroups.length) {
      body.appendChild(dom.el("div", { class: "mon-section-head", text: "素材一览" }));
      rankGroups.forEach(function (g) {
        var rk = BR.call(BR.NAMES.RANK_KEY, g.rank) || "master";
        var grp = dom.el("div", { class: "mon-mat-group rank-" + rk });
        grp.appendChild(dom.el("div", { class: "mon-mat-group-label", text: g.rank }));
        var box = dom.el("div", { class: "mon-mat-cloud" });
        g.items.forEach(function (it) {
          var btn = dom.el("button", { type: "button", class: "mon-mat-chip" + (it === focusItem ? " active" : ""), text: it });
          btn.addEventListener("click", function () { openModalFull(monName, it); });
          box.appendChild(btn);
        });
        grp.appendChild(box);
        body.appendChild(grp);
      });
    }

    // ③ 任务列表
    if (mon.quests && mon.quests.length) {
      var qb = BR.call(BR.NAMES.QUEST_BLOCK_BUILD, mon.quests, monName);
      if (qb) body.appendChild(qb);
    }

    // ④ 部位肉质
    if (mon.hitzones && mon.hitzones.length) {
      body.appendChild(buildHitzone(mon.hitzones));
    }
    // ⑤ 异常耐性（可折叠）
    if (mon.ailments && mon.ailments.length) {
      body.appendChild(buildAilment(mon.ailments));
    }

    // 标题
    var f = iconOf(monName);
    var title = f
      ? "<img class=\"modal-title-mon-img\" src=\"monster-icons/" + f + "\" alt=\"\">" + dom.escapeHtml(monName)
      : "<span class=\"modal-title-icon\">👹</span>" + dom.escapeHtml(monName);

    M.modal.open(title, body);
    M.modal.updateBackBtn();
    document.body.style.overflow = "hidden";
    if (focusItem && !restoreState) {
      var bd = document.getElementById("modalBody");
      if (bd) bd.scrollTop = 0;
    }
  }

  var _ctx = null;

  // ---------------- 注册 ----------------
  var def = {
    id: 'monster',
    label: '怪物',
    icon: '👹',
    order: 50,
    dataKey: 'monster_data',
    list: list,
    groupBy: groupBy,
    searchText: searchText,
    renderCard: renderCard,
    renderModal: openModal,
    buildCatalog: buildCatalog,
    _api: {
      renderCard: renderCard,
      openModal: openModal,
      iconOf: iconOf,
      isSmall: isSmall,
      list: list,
      listGrouped: listGrouped,
      searchText: searchText,
      buildIcon: buildIcon,
      openModalFull: openModalFull,
      buildHitzone: buildHitzone,
      materialsByRank: materialsByRank,
      dropRows: dropRows,
    },
  };

  M.register(def);
  M.monsterSection = def._api;

  BR.provide(BR.NAMES.OPEN_MONSTER, openModalFull);

})(typeof window !== 'undefined' ? window : this);