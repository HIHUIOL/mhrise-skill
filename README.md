# 🌅 曙光技能图鉴 · mhrise-skill

一个用于查阅《怪物猎人崛起：曙光》(Monster Hunter Rise: Sunbreak) **普通技能**与**百龙技能**效果说明的纯前端网页应用，已改造为可安装的 **PWA（渐进式网页应用）**。

支持**技能卡内切换两套文本**（详细版 / 原文版）、关键词搜索、技能等级说明、武器差分显示，可离线使用，也可添加到手机/桌面主屏幕。

---

## 📖 数据来源 / Attribution

每张技能卡牌提供**两套文本**，点击卡片右上角按钮即可在卡内切换：

### 📘 详细版
整理自 **Nexus Mods** 上的模组 **《Skill Descriptions》**。

- **原始模组页面**：<https://www.nexusmods.com/monsterhunterrise/mods/3872>
- **平台**：Nexus Mods — Monster Hunter Rise
- **特点**：含**武器差分**（大剑 / 太刀 / 弓…）、**斩斧瓶类型**等细节，共 70 个普通技能 + 32 个百龙技能。

### 🎮 原文版
游戏内技能说明的**原始文本**（含各等级效果）。

- 数据为游戏内文本整理，用于与详细版对照查阅。
- **技能名称统一采用详细版名称**（游戏原文的技能名可能有翻译差异，故不采用）。

> - 普通技能共 **147 个**（70 个有详细版 + 77 个仅原文版），按技能 ID 排序展示。
> - 有详细版的技能：卡片右上角可切换「📘 详细版 / 🎮 原文版」。
> - 仅原文版的技能：卡片右上角标记「🎮 原文」，直接显示游戏文本。
> - 百龙技能（32 个）暂无对应的游戏原文。

本项目仅将上述文本用于**技能查阅展示**用途。模组文件、文本及其相关内容的版权归**原模组作者**所有。

《Monster Hunter Rise: Sunbreak》为 **CAPCOM** 的商标及版权作品。本项目为爱好者制作，
**与 CAPCOM 及 Nexus Mods 均无隶属或官方关联**。

如果原作者不希望本项目引用其文本，请通过 Issue 联系，我们会及时移除相关内容。

---

## ✨ 功能特性

- 📑 **技能一览**：按 12 个分类（攻击 / 会心 / 属性 / 防御…）分组列出所有技能，点击即可跳转并高亮对应卡片
- 🔄 **卡内文本切换**：每张技能卡可切换「详细版 ↔ 原文版」，方便对照
- 🔍 **实时搜索**：按技能名 / ID / 效果关键字过滤，并显示命中数量
- 📋 **技能等级说明**：区分普通技能与百龙技能，展示各等级文本
- ⚔️ **武器差分**：当技能对特定武器效果不同时单独列出（大剑 / 太刀 / 弓 …）
- 🎨 **游戏风格配色**：`<COLOR FFC000>` 高亮标记自动转换为彩色文本
- 📱 **PWA 支持**：可安装到主屏幕，离线可用（Service Worker 缓存）
- 🏷️ **版本号更新**：标题旁显示版本号，点击可检查并拉取最新版本
- 🌙 **深色主题**：适合长期查阅

---

## 🏷️ 版本号

页面标题旁有版本号徽标（如 `🏷️ v1.0`），**点击它会检查并更新**：

1. 清除旧缓存
2. 通知 Service Worker 拉取最新资源
3. 自动刷新页面

> 发布新版本时，只需修改两处版本号即可：
> - `index.html` 中的 `window.APP_VERSION = 'v1.0';`
> - `sw.js` 中的 `CACHE_NAME = 'mhrise-skill-vN';`（N 递增）

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

仓库内置了 `push.sh` 脚本，配合 **Termux** 即可在手机上一条命令完成 `add → commit → push`。

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
./push.sh "本次改动说明"      # 说明可省略，默认用时间戳
```

脚本会自动：检查仓库状态 → `git add -A` → 提交（无改动则跳过）→ 推送（首次自动设置上游分支）。

> ## 🐍 备用方案：纯 Python 推送（不需要 git）
>
> 若不想用 git，仓库内附带 `push.py`，走 GitHub API 直接上传：
>
> ```bash
> pkg install python
> pip install requests
> echo '你的PAT' > token.txt     # 只此一行
> python push.py "改动说明"
> ```
>
> - 自动建仓、增量上传、自动同步删除
> - token 从 `token.txt` 或环境变量 `GH_TOKEN` 读取，**不会写进代码**
> - 已加入 `.gitignore`，不会被误传

> 💡 **省事技巧**：在 Termux 里建个别名，
> 编辑 `~/.bashrc` 加入：
> ```bash
> alias mpush='cd /sdcard/000/PWA/mhrise-skill && ./push.sh'
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
├── index.html          # 主页面（含 PWA 配置、数据来源说明、数据源切换）
├── render.js           # 渲染 + 搜索 + 武器差分 + 双数据源切换逻辑
├── skillData.js        # 模组详述数据（整理自 Nexus Mods 模组）
├── skill_data.js       # 游戏原文数据（游戏内技能说明原始文本）
├── manifest.json       # PWA 清单文件
├── sw.js               # Service Worker（离线缓存）
├── 404.html            # GitHub Pages 404 页面
├── icon.svg            # 图标源文件
├── icon-192.png        # PWA 图标 192×192
├── icon-512.png        # PWA 图标 512×512
├── push.sh             # 安卓 Termux 一键推送脚本
├── .nojekyll           # 跳过 GitHub Pages 的 Jekyll 构建
├── .gitignore
└── README.md
```

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