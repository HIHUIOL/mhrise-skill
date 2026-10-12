# 🌅 曙光技能图鉴 · mhrise-skill

一个用于查阅《怪物猎人崛起：曙光》(Monster Hunter Rise: Sunbreak) 资料的中文纯前端网页应用，已改造为可安装的 **PWA（渐进式网页应用）**。

涵盖 **技能 / 百龙技能 / 珠子 / 百龙珠 / 怪物肉质 / 素材掉落 / 任务数据** 七大板块，支持关键词搜索、分类浏览、双向跳转（怪物 ↔ 素材 ↔ 任务 ↔ 技能），可离线使用，也可添加到手机/桌面主屏幕。

> 当前版本：**v1.07**

---

## 📖 数据来源 / Attribution

### 📘 技能文本（详细版）
整理自 **Nexus Mods** 上的模组 **《Skill Descriptions》**。

- **原始模组页面**：<https://www.nexusmods.com/monsterhunterrise/mods/3872>
- **特点**：含**武器差分**（大剑 / 太刀 / 弓…）、**斩斧瓶类型**等细节，共 70 个普通技能 + 32 个百龙技能。

### 🎮 技能文本（原文版）
游戏内技能说明的**原始文本**（含各等级效果）。

> - 普通技能共 **147 个**（70 个有详细版 + 77 个仅原文版），按技能 ID 排序展示。
> - 有详细版的技能：卡片右上角可切换「📘 详细版 / 🎮 原文版」。
> - 仅原文版的技能：卡片右上角标记「🎮 原文」，直接显示游戏文本。
> - 百龙技能（32 个）暂无对应的游戏原文。
> - **技能名称统一采用详细版名称**（游戏原文的技能名可能有翻译差异，故不采用）。

### 🏹 怪物 / 素材 / 任务数据
抓取自 **Kiranico（MHRise 中文站）**：<https://mhrise.kiranico.com/zh>

- **怪物**：112 只（含官方图标、肉质表、素材掉落、出现任务）
- **素材**：1764 条（按网站 6 类分类：回复/辅助、素材、余料、弹药/瓶、交纳委托、变更房屋的设计）
- **任务**：698 条（9 个分类，含委托内容、主要目标、失败条件、各人数档 HP/攻击/部位/防御、补给箱）

本项目仅将上述数据用于**查阅展示**用途。模组文件、文本及其相关内容的版权归**原模组作者**所有。

《Monster Hunter Rise: Sunbreak》为 **CAPCOM** 的商标及版权作品。本项目为爱好者制作，
**与 CAPCOM、Nexus Mods 及 Kiranico 均无隶属或官方关联**。

如果原作者不希望本项目引用其内容，请通过 Issue 联系，我们会及时移除相关内容。

---

## ✨ 功能特性

- ⚔️ **技能**：147 个普通技能，双文本切换、技能等级说明、武器差分、（`<COLOR FFC000>` 高亮转彩色）
- 🐉 **百龙技能**：32 个，按名称特征分组
- 🔮 **珠子 / 百龙珠**：244 + 34 条，可点「提供技能」跳转到对应技能
- 👹 **怪物**：图标网格（大型 78 / 小型 34 分组），点开看肉质表、素材、任务
- 📦 **素材**：按网站 6 类分类，可折叠，点开看来源怪物与获得途径
- ✨ **道具效果**：回复药 / 鬼人药 / 怪力种子等 25 种道具，展示解包数值（回复量、攻防提升、持续时间）
- 🏹 **任务**：698 条按 9 类分组，卡片显示星级与出现怪物；弹窗含委托描述、人数档血量表、补给箱
- 🔗 **双向跳转**：怪物 ↔ 素材 ↔ 任务 ↔ 技能，全链路可点，「返回」保留历史栈
- 🔍 **实时搜索**：跨所有板块搜索，显示各板块命中数量
- 📑 **一览目录**：各板块底部有分类目录，点标题可展开/收起
- 📱 **PWA 支持**：可安装到主屏幕，离线可用（Service Worker 缓存）
- 🏷️ **版本号更新**：标题旁显示版本号，点击可检查并拉取最新版本
- 🌙 **深色主题**：适合长期查阅

---

## 🏷️ 版本号

页面标题旁有版本号徽标（如 `🏷️ v1.07`），**点击它会检查并更新**：

1. 清除旧缓存
2. 通知 Service Worker 拉取最新资源
3. 自动刷新页面

> 发布新版本时，需同步修改以下四处：
> - `index.html` 中的 `<span id="versionText">v1.07</span>`
> - `index.html` 中的 `window.APP_VERSION = 'v1.07';`
> - `manifest.json` 中的 `"version": "1.07"`
> - `sw.js` 中的 `CACHE_NAME = 'mhrise-skill-vN';`（N 递增，用于强制刷新缓存）

---

## 🚀 本地运行

由于使用了 Service Worker，请通过 **HTTP 服务器**访问（`file://` 直开会无法注册 SW）：

```bash
# 方式一：Python 自带服务器
python3 -m http.server 8080

# 方式二：Node.js (npx)
npx serve .
```

然后浏览器打开 <http://localhost:8080/>。

---

## 🌐 部署到 GitHub Pages

1. 将本仓库推送到 GitHub。
2. 进入仓库 **Settings → Pages**。
3. **Source** 选择 `Deploy from a branch`，分支选 `main`（或 `gh-pages`），目录选 `/ (root)`。
4. 保存后访问 `https://<你的用户名>.github.io/<仓库名>/`。

> ✅ 所有资源均使用**相对路径**（`./xxx`），可直接部署在仓库子路径下，无需额外配置。
> `.nojekyll` 文件已包含，用于跳过 Jekyll 处理。

---

## 📱 安卓一键推送（Termux）

仓库内置了 `tools/push.sh` 脚本，配合 **Termux** 即可在手机上一条命令完成 `add → commit → push`。

### 首次配置（只做一次）

```bash
# 1. 安装 git
pkg install git

# 2. 进入项目目录
cd /sdcard/000/PWA/mhrise-skill

# 3. 初始化仓库并关联远程
git init
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git

# 4. 配置身份（提交记录里显示的作者信息）
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱"
```

### 认证：使用 Personal Access Token

GitHub 已不支持账号密码推送，需用 **PAT（个人访问令牌）**：

1. 浏览器打开 GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. 点击 **Generate new token**，勾选 `repo` 权限，生成后**复制保存**（只显示一次）
3. 推送时：用户名填 GitHub 用户名，**密码处粘贴 token**

> 建议在 Termux 中开启凭据缓存，避免每次输入：
> ```bash
> git config --global credential.helper store
> ```
> （会把 token 明文存到 `~/.git-credentials`，仅限个人设备使用）

### 日常推送（一条命令）

```bash
cd /sdcard/000/PWA/mhrise-skill
./tools/push.sh "本次改动说明"      # 说明可省略，默认用时间戳
```

脚本会自动：检查仓库状态 → `git add -A` → 提交（无改动则跳过）→ 推送（首次自动设置上游分支）。

> ## 🐍 备用方案：纯 Python 推送（不需要 git）
>
> 若不想用 git，仓库内附带 `tools/push.py`，走 GitHub API 直接上传：
>
> ```bash
> pkg install python
> pip install requests
> echo '你的PAT' > tools/token.txt     # 只此一行
> python tools/push.py "改动说明"
> ```
>
> - 自动建仓、增量上传、自动同步删除
> - token 从 `tools/token.txt` 或环境变量 `GH_TOKEN` 读取，**不会写进代码**
> - 已加入 `.gitignore`，不会被误传

> 💡 **省事技巧**：在 Termux 里建个别名，
> 编辑 `~/.bashrc` 加入：
> ```bash
> alias mpush='cd /sdcard/000/PWA/mhrise-skill && ./tools/push.sh'
> ```
> 之后任意目录输入 `mpush "说明"` 即可一键推送。

### 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 提示密码错误 | 密码要用 **PAT**，不是 GitHub 账号密码 |
| `Updates were rejected` | 远程有新提交，先执行 `git pull --rebase` 再推 |
| 中文提交说明乱码 | 一般不影响，GitHub 网页显示正常 |
| 访问不到 `/sdcard` | Termux 先执行 `termux-setup-storage` 授权 |

---

## 📁 目录结构

```
mhrise-skill/
├── index.html              # 主页面（含 PWA 配置、内联 CSS、数据来源说明）
├── manifest.json           # PWA 清单文件
├── sw.js                   # Service Worker（离线缓存）
├── 404.html                # GitHub Pages 404 页面
├── .nojekyll               # 跳过 GitHub Pages 的 Jekyll 构建
├── .gitignore
├── README.md
├── icon.svg                # 图标源文件
├── icon-192.png            # PWA 图标 192×192
├── icon-512.png            # PWA 图标 512×512
│
├── js/                     # 📜 网站脚本（全部前端 JS）
│   ├── render.js           #   渲染 + 搜索 + 弹窗 + 武器差分 + 细节逻辑
│   ├── skillData.js        #   模组详述数据（SKILL_DATA，整理自 Nexus Mods 模组）
│   ├── skill_data.js       #   游戏原文数据（游戏内技能说明原始文本）
│   ├── decoration.js       #   珠子数据
│   ├── rampage_decorations.js  # 百龙珠数据
│   ├── items.js            #   素材数据（1764 条）
│   ├── item_effects.js     #   道具使用效果（解包数值）
│   ├── item_categories.js  #   素材分类
│   ├── anomaly_materials.js    # 怪异材料
│   ├── anomaly_icons.js    #   怪异材料图标映射
│   ├── monsters.js         #   怪物数据（112 只，含肉质/掉落）
│   ├── monster_icons.js    #   怪物图标映射
│   ├── quests.js           #   任务数据（698 条）
│   └── quest_maps.js       #   任务地图
│
├── monster-icons/          # 🖼 怪物图标（176 张 PNG）
├── anomaly-icons/          # 🖼 怪异材料图标
├── hit-icons/              # 🖼 肉质表图标（斩击/打击/弹/属性…）
├── ui-icons/               # 🖼 界面小图标
│
├── tools/                  # 🔧 开发工具（不参与网站运行）
│   ├── push.py             #   GitHub API 推送脚本（纯 Python，无需 git）
│   ├── push.sh             #   Termux git 一键推送脚本
│   ├── token.txt           #   ⚠️ 你的 PAT（已 gitignore）
│   ├── scrape/             #   数据抓取脚本（Kiranico → js/）
│   │   ├── scrape_items.py         # 素材
│   │   ├── scrape_monsters.py      # 怪物
│   │   ├── scrape_quests.py        # 任务
│   │   ├── scrape_quest_details.py # 任务详情
│   │   ├── scrape_decorations.py   # 珠子素材
│   │   ├── scrape_ramdeco.py       # 百龙珠
│   │   ├── scrape_item_cats.py     # 素材分类
│   │   ├── scrape_monster_icons.py # 怪物图标
│   │   ├── scrape_anomaly_icons.py # 怪异材料图标
│   │   └── *.sh                    # 便捷启动脚本
│   └── fix/                #   一次性数据修复脚本
│
├── .cache/                 # 💾 爬虫断点缓存（gitignore）
└── docs/                   # 📚 本地资料 / 笔记 / 原始数据（gitignore）
```

> 💡 **路径约定**：所有爬虫脚本位于 `tools/scrape/`，会自动将输出写入项目根的 `js/`，
> 缓存写入 `.cache/`，图标写入根目录的 `*-icons/`（以脚本上两级为项目根）。

---

## 🧩 数据格式简述

`skillData.js` 导出的 `SKILL_DATA` 对象包含：

| 字段 | 说明 |
| --- | --- |
| `skills` | 普通技能，键为游戏内部技能 ID |
| `rampage_skills` | 百龙技能 |
| `levels` / `default` / `levels_by_index` | 各等级说明文本 |
| `template` / `values` / `weapon_values` | 模板化文本与武器变量替换 |
| `weapons` / `weapons_by_index` | 武器差分文本 |
| `ranged` / `ranged_by_index` | 远程武器（轻弩/重弩/弓）差分 |

> 文本中的 `<COLOR FFC000>…</COLOR>` 会在渲染时高亮显示。

`js/item_effects.js` 导出的 `item_effects` 对象（道具使用效果，来自游戏解包数值）：

| 字段 | 说明 |
| --- | --- |
| `type` | 分类（回复 / 斩味 / 攻击 / 防御 / 耐力） |
| `text` | 效果说明文本，数值用 `<b>…</b>` 高亮；时长单位为**秒** |

> 共收录 25 种道具（回复药 / 生命粉尘 / 砥石 / 鬼人药系列 / 怪力种子 / 硬化药系列 / 忍耐种子 / 力量之护符 / 守护之护符 / 全熟肉 / 强走药 等）。

---

## ⚖️ 免责声明

- 本项目为**非官方**爱好者工具，仅供学习与游戏查阅用途。
- 游戏相关名称、商标及版权归 **CAPCOM** 所有。
- 技能文本数据来源于 **Nexus Mods 模组《Skill Descriptions》**，版权归原作者所有。
- 请勿将本项目用于任何商业用途。

---

## 📜 License

本仓库的**代码**部分可自由使用、修改与分发（建议注明来源）。
但**游戏文本数据**的版权归属原模组作者与 CAPCOM，不在本仓库授权范围内。