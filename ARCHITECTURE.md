# 架构说明 · mhrise-skill

> 曙光技能图鉴（纯前端 PWA）的模块结构说明。
> 最后更新：v1.08（架构重构完成）

---

## 📌 一句话总览

```
数据文件  →  data.js  →  core/*（框架层）  →  sections/*（板块层）  →  render.js（主装配器）
```

**分层原则**：
- **`core/`**：与业务无关的通用设施（DOM、注册、桥、弹窗、引擎、UI）
- **`sections/`**：各业务板块，彼此独立，只通过 bridge 通信
- **`render.js`**：应用装配器 —— 负责「把板块组织成页面」的主流程

---

## 🗂 目录结构

```
mhrise-skill/
├── index.html              # 入口（含全部 <script> 加载顺序）
├── sw.js                   # Service Worker（预缓存清单 + 版本号 v110）
├── manifest.json           # PWA 清单
├── ARCHITECTURE.md         # 👈 本文
│
├── js/
│   ├── core/               # ═══ 框架层（8 个，通用设施）═══
│   │   ├── dom.js          # DOM 工具：el/append/clear/$/$$/escapeHtml/formatText…
│   │   ├── registry.js     # 板块注册中心：register/get/all/visible/audit
│   │   ├── bridge.js       # 跨板块调用桥：provide/call/has/list + NAMES(25 能力)
│   │   ├── modal.js        # 弹窗：open/close/push/goBack/updateBackBtn/depth
│   │   ├── renderer.js     # 通用渲染引擎：buildNav/buildSections/renderCards/search/boot
│   │   ├── catalog.js      # 通用「目录」渲染：render/groupBy/orderOf
│   │   ├── sticky.js       # 滚动吸顶兜底：attach(el, opts)
│   │   └── ui.js           # UI 设施：sectionCollapse/bindToggle
│   │
│   ├── sections/           # ═══ 板块层（7 个，各自独立）═══
│   │   ├── skill.js        # 技能（含详细版/原文版双模式）      order 10
│   │   ├── ram.js          # 百龙技能                          order 20
│   │   ├── deco.js         # 珠子（含「可用珠子」区块）         order 30
│   │   ├── ramdeco.js      # 百龙珠                            order 40
│   │   ├── monster.js      # 怪物（含肉质表/异常/掉落）         order 50
│   │   ├── material.js     # 素材（含明细/获得途径）            order 60
│   │   └── quest.js        # 任务（含切页式分类/弹窗）          order 70
│   │
│   ├── render.js           # ═══ 主装配器 ═══ 2542 行
│   ├── data.js             # 数据层接入（把数据挂到 MHRS.*）
│   ├── game_data.js        # 游戏常量（RANK_ORDER / WEAPON_NAMES 等）
│   └── *数据*.js            # 原始数据（skill_data / decoration / monsters / quests …）
│
└── 图标目录/                # monster-icons/ anomaly-icons/ ui-icons/ hit-icons/
```

---

## 🔗 加载顺序（index.html，**不能乱**）

```
① 数据文件（skill_data.js / decoration.js / monsters.js / quests.js …）
② game_data.js           ← 游戏常量
③ data.js                ← 数据接入（必须在 core 之前！）
④ core/dom.js
⑤ core/registry.js
⑥ core/bridge.js
⑦ core/modal.js
⑧ core/renderer.js
⑨ core/ui.js
⑩ sections/skill.js
⑪ sections/deco.js
⑫ sections/ramdeco.js
⑬ sections/ram.js
⑭ sections/monster.js
⑮ sections/material.js
⑯ sections/quest.js
⑰ render.js              ← 最后：主装配器
```

> ⚠️ **关键**：`core/*` 必须在 `data.js` **之后**、`sections/*` 必须在 `core/*` 之后。
> `data.js` 会「合并」到 `MHRS`（不能覆盖，否则会冲掉 core 挂的方法）。

---

## 🧱 一、框架层 `core/`

### `core/dom.js`（134 行）
通用 DOM 工具，**无业务依赖**。

| API | 说明 |
|---|---|
| `el(tag, attrs, children)` | 创建元素；attrs 支持 `class/text/html/style/dataset/on*` |
| `append(parent, ...nodes)` | 批量追加 |
| `clear(node)` / `replace(node, ...new)` | 清空 / 整体替换 |
| `$(sel, root)` / `$$(sel, root)` | 查询（⚠️ `$$` 才是数组） |
| `escapeHtml(s)` | HTML 转义 |
| `formatText(s)` | 文本格式化（换行等） |
| `searchKey(s)` | 生成搜索用的归一化 key |

### `core/registry.js`（122 行）
板块注册中心 —— **加新板块只需要在这里注册 1 次**。

```js
MHRS.registry.register({
  id, label, icon, order, dataKey,   // 基本信息
  list, groupBy, searchText,          // 数据/分组/搜索
  renderCard, renderModal, buildCatalog,  // 渲染钩子
  hidden,                             // 是否隐藏
});
```

| API | 说明 |
|---|---|
| `register(def)` | 注册板块（自动按 order 排序，重名覆盖） |
| `get(id)` / `has(id)` | 取 / 判断 |
| `all()` | 全部板块（已排序） |
| `visible()` | 不含 hidden 的板块 |
| `audit()` | 自检（如「无数据」会报出来） |

### `core/bridge.js`（106 行）⭐ 核心解耦
跨板块调用桥 —— **板块之间不许直接调，必须走这里**。

```js
MHRS.bridge.provide('openSkill', fn);   // 提供能力
MHRS.bridge.call('openSkill', 123);     // 使用能力（缺了安全降级，不抛错）
```

**25 个标准能力（`NAMES`）**：

| 分组 | 能力 |
|---|---|
| **弹窗** | `openSkill` `openRamSkill` `openDeco` `openRamDeco` `openItem` `openMonster` `openQuest` |
| **弹窗栈** | `pushHistory` |
| **技能↔珠子** | `decosForSkill` `decosSearchText` `decosBuild` `ramDecosForSkill` `ramDecosBuild` |
| **素材↔怪物** | `monstersForMaterial` `ranksForMaterial` `matDetailBuild` `obtainBuild` |
| **任务** | `questByLabel` `questByName` `questByMon` `questParseArea` `questBlockBuild` |
| **怪物上下文** | `curMonCtx` `setMonCtx` |
| **工具** | `rankKey` |

> **依赖关系一眼看清**：`grep -r "bridge.call" js/` 即知谁依赖谁。
> **缺失安全**：能力没提供时 `call` 返回 `undefined`，**不崩溃**。

### `core/modal.js`（145 行）
统一弹窗 + **返回栈**。

| API | 说明 |
|---|---|
| `open(titleHtml, bodyNode, restore)` | 打开 |
| `close()` / `isOpen()` | 关闭 / 状态 |
| `push(fn, state)` / `goBack()` | 压栈 / 返回（**只在弹窗内记录历史**） |
| `updateBackBtn()` / `depth` | 更新返回按钮 / 栈深 |

固定元素 id：`skillModal` / `modalTitle` / `modalBody` / `modalBack`。点遮罩关闭。

### `core/renderer.js`（286 行）
通用渲染引擎（主要给「标准板块」用）。

| API | 说明 |
|---|---|
| `boot(opts)` | 启动（遍历 registry 渲染） |
| `buildNav(opts)` | 建导航条；传 `sections` 则内置联动显隐 |
| `buildSections(opts)` / `showSection(id)` | 建 / 切板块容器 |
| `renderCards(...)` / `groupItems(...)` | 渲染卡片 / 分组 |
| `buildCatalog(...)` | 建目录 |
| `search(kw)` / `getSectionData(id)` | 搜索 / 取板块数据 |

### `core/ui.js`（114 行）
| API | 说明 |
|---|---|
| `sectionCollapse(opts)` | 区块折叠 |
| `bindToggle(opts)` | 绑定折叠按钮 |

### `core/catalog.js`（140 行）⭐ 目录去重
统一 4 个「一览目录」的渲染（技能/百龙技能/珠子/百龙珠结构完全一样）。

| API | 说明 |
|---|---|
| `render(opts)` | 渲染一个目录（传 catalogId/bodyId/headId/order/groups/onItemClick…） |
| `groupBy(arr, keyOf)` | 按函数分组 |
| `orderOf(presets, groups)` | 算最终分类顺序（预设优先 + 补剩余） |

> 原来 4 段各写一遍（共 ~250 行），现在各板块只传「分组数据 + 点击回调」。

### `core/sticky.js`（102 行）
滚动吸顶兜底（`position:sticky` 在 flex 子元素下失效时的 JS 方案）。

| API | 说明 |
|---|---|
| `attach(el, opts)` | 给元素加吸顶；`opts.disabledBy` 折叠时跳过；返回 `detach()` |

---

## 🧩 二、板块层 `sections/`

**每个板块文件结构统一**（IIFE 封装）：

```js
(function (root) {
  var M = root.MHRS = root.MHRS || {};
  var dom = M.dom, BR = M.bridge;

  // ① 内部实现（卡片 / 弹窗 / 搜索文本 / 目录）
  function renderCard(item) { … }
  function openModal(id) { … }

  // ② 注册到 registry
  var def = { id:'xxx', label:'…', order:10, dataKey:'…',
              list:…, renderCard:…, renderModal:…, buildCatalog:… };
  M.registry.register(def);

  // ③ 暴露 API（供 render.js / 内部调用）
  M.xxxSection = def._api = { renderCard, openModal, … };
})(window);
```

### 7 个板块

| 文件 | 行数 | id | order | 依赖数据 | 提供的能力 |
|---|---|---|---|---|---|
| `skill.js` | 535 | skill | 10 | `SKILL_DATA`/`GAME_SKILL_DATA` | `openSkill` `decosBuild`… |
| `ram.js` | 247 | ram | 20 | `SKILL_DATA.rampage_skills` | `openRamSkill` `ramDecosBuild` |
| `deco.js` | 316 | deco | 30 | `decoration_data` | `openDeco` `decosForSkill` `decosSearchText` `decosBuild` |
| `ramdeco.js` | 237 | ramdeco | 40 | `rampage_decorations` | `openRamDeco` `ramDecosForSkill` `ramDecosBuild` |
| `monster.js` | 417 | monster | 50 | `monster_data` | `openMonster` `monstersForMaterial` `ranksForMaterial` `setMonCtx` `curMonCtx` |
| `material.js` | 417 | material | 60 | `item_data` | `openItem` `matDetailBuild` `obtainBuild` |
| `quest.js` | 857 | quest | 70 | `quest_data` | `openQuest` `questByLabel` `questByName` `questByMon` `questParseArea` `questBlockBuild` |

> **`quest.js` 最大（857 行）**：含切页式分类 + 弹窗（25 字段）+ 怪物任务列表区块。

---

## 🏗 三、主装配器 `render.js`（2542 行）

⚠️ **这里仍是「应用层主流程」，不是残留垃圾**。结构：

### 3.1 转发壳（41 个，共 ~135 行）
已被迁移的函数保留**同名转发**，因为 **render.js 内部 / bridge 仍在调用**：

```js
function renderSkillCard(id) { return MHRS.skillSection.renderCard(id); }
function openMonsterModal(n) { return MHRS.monsterSection.openModal(n); }
```

### 3.2 真正的活逻辑（~2400 行）

| 分组 | 主要函数（真代码行） | 说明 |
|---|---|---|
| **🅰️ 导航/分类** | `catOf`(129) `applyCat`(103) `anyVisible`(100) `selectCat`(81+30) `renderCatItems`(28) `onScroll`(27) `updateTabCounts` `ensureRendered` `reset` `ensurePlaceholder` | 顶部「全部/技能/珠子…」8 按钮的**切页 + 显隐 + 吸顶** |
| **🅱️ 搜索** | `applyFilter`(96) `buildSearchText`(32) `buildGameSearchText` | 搜索框过滤（**深度绑定所有板块卡片数组**） |
| **🅲 skill 残留** | `recordDefaultWeapon`(87) `collectDefaultLevelTexts`(50) `openSkillModal`(63) | ⏳ 部分可继续迁（见 TODO） |
| **🅳 弹窗状态栈** | `pushModalHistory`(30) `captureModalState`(25) `applyModalState`(57) `modalGoBack` `updateModalBack` | 返回时**还原弹窗状态**（绑定各板块 DOM 类名） |
| **🅴 怪异探究** | `renderAnomalyTable`(101) | ⏳ 遗留功能 |
| **🅵 杂项** | `findQuestIdForMonster` `parseQuestArea` `isIndexedLineTable` `indexedLine` `decToHex` … | 文本解析辅助 |
| **主流程 IIFE** | `~800` | 装配：读 DOM 容器 → 建导航 → 建各区块 → 绑事件 |

### 3.3 为什么这些没抽走？

| 分组 | 原因 |
|---|---|
| 🅰️ 导航 | 涉及**页面级 DOM 结构 + 各板块容器联动**，属「应用装配」 |
| 🅱️ 搜索 | `applyFilter` 直接引用**所有板块的卡片数组**（闭包变量），抽了要改 6+ 处 |
| 🅳 弹窗状态 | 绑定各板块**内部 DOM 类名**（`.mon-quest-list` `.mon-hit-tab-btn`…） |
| 🅴 怪异探究 | **功能未完成**，等数据补齐再迁 |

---

## ➕ 四、怎么加一个新板块？（重点）

**只需 1 个文件 + 2 处小改**（改造前要改 6 处）：

1. **建 `js/sections/xxx.js`**，照抄现有板块结构：
   - 内部实现 `renderCard` / `openModal` / `buildCatalog`
   - `MHRS.registry.register({...})`
   - `M.xxxSection = def._api`
   - 如需跨板块，用 `MHRS.bridge.provide(...)`
2. **`index.html`**：加一行 `<script src="js/sections/xxx.js">`（放在 render.js **之前**）
3. **`sw.js`**：预缓存清单加路径 + **升版本号**

> 若用「标准板块」（无定制 DOM 容器），`renderer.boot()` 会自动接管导航/卡片/目录/搜索。
> 若需定制（像 quest 的切页式），在 render.js 主流程里单独装配。

---

## 💾 五、缓存与部署

- **`sw.js`**：`CACHE_NAME = 'mhrise-skill-v110'` —— **每次改动必须升版本号**，否则用户看到旧版。
- **只上传运行必备文件**：`.backup/`（Operit 聊天备份）、`.cache/`、`tools/`、`docs/` **不上传**。
- **部署**：`python3 tools/push.py "提交说明"` → GitHub Pages。
- **线上**：https://hihuiol.github.io/mhrise-skill/
- **仓库**：https://github.com/HIHUIOL/mhrise-skill

---

## 📊 六、重构成果（v90 → v1.08）

| 指标 | 重构前 | 重构后 |
|---|---|---|
| `render.js` | 4825 行 | **2096 行（-57%）** |
| 最大单文件 | 4825 行 | **857 行（quest，-82%）** |
| 板块组织 | 1 个巨型文件 | **7 个独立文件** |
| 框架层 | 无 | **8 个 core 文件** |
| 跨板块调用 | 直接/全局 | **bridge 解耦（25 能力）** |
| 全局污染 | 15+ | **1（`MHRS`）** |
| 加新板块改动点 | 6 处 | **1~3 处** |

### 本轮追加优化（v1.08 → v1.08+）
| 动作 | 结果 |
|---|---|
| 删死代码（重复文本解析工具） | **-261 行** |
| 抽 `core/catalog.js`（4 个目录去重） | **-127 行** |
| 抽 `core/sticky.js`（吸顶兜底） | **-55 行** |
| `escapeHtml` 统一到 `core/dom.js` | **-4 行**（且更安全） |
| 🐛 修 `skill.js` 数据源混淆 bug + 删重复 `openSkillModal` | **-73 行**（消除隐患） |

> **数据源说明（重要）**：
> - `MHRS.skill.mod` — 模组详细版（70 条，`{skills, rampage_skills}`）
> - `MHRS.skill.desc` — 游戏原文（147 条，`{sname, desc, effect}`）← 弹窗「原文版」用
> - `MHRS.skill.data` — 技能元数据（147 条，`{tag, cost, max, lvType}`）← 分类 tag 用
>
> ⚠️ `desc` 与 `data` 是**两个不同数据集**，别混用！（曾因此产生 bug）

---

## 📝 七、TODO（待办）

### 功能遗留
- [ ] 珠子 Lv2 效果数据
- [ ] 百龙珠 `descTpl` 完整补全
- [ ] 肉质表日文名
- [ ] 素材大类展开性能
- [ ] 怪异探究任务（LV1~300）完整功能 → 完成后可迁 `renderAnomalyTable`
- [ ] maskable 图标（专门做）
- [ ] 微信分享缓存（需清）

### 架构可继续优化（低优先，YAGNI）
- [ ] 搜索（🅱️ `applyFilter`）→ `core/search.js`（**高风险**，深度绑定所有板块卡片数组）
- [ ] 弹窗状态栈（🅳 `captureModalState/applyModalState`）→ `core/modal.js`（**高风险**，绑定各板块 DOM 类名）
- [ ] 导航（🅰️ `catOf/applyCat/selectCat`）→ 保持现状（**它必须知道所有板块，是应用装配的正当职责**）

> **判断原则**：能「去重」的抽（catalog/sticky/escapeHtml ✅ 已做）；
> 「必须知道所有板块」的**不硬拆**（导航/搜索/弹窗状态）—— 硬拆要注入 20+ 依赖，反而更难维护。

---

*文档随代码演进，改架构时请同步更新。*