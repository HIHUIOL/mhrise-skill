# 🌅 曙光技能图鉴 · mhrise-skill

一个用于查阅《怪物猎人崛起：曙光》(Monster Hunter Rise: Sunbreak) **普通技能**与**百龙技能**效果说明的纯前端网页应用，已改造为可安装的 **PWA（渐进式网页应用）**。

支持关键词搜索、技能等级说明、武器差分显示，可离线使用，也可添加到手机/桌面主屏幕。

---

## 📖 数据来源 / Attribution

> 本项目的技能文本数据整理自 **Nexus Mods** 上的模组 **《Skill Descriptions》**。
>
> - **原始模组页面**：<https://www.nexusmods.com/monsterhunterrise/mods/3872>
> - **平台**：Nexus Mods — Monster Hunter Rise
> - **游戏**：Monster Hunter Rise: Sunbreak

本项目仅将模组文本用于**技能查阅展示**用途。模组文件、文本及其相关内容的版权归**原模组作者**所有。

《Monster Hunter Rise: Sunbreak》为 **CAPCOM** 的商标及版权作品。本项目为爱好者制作，
**与 CAPCOM 及 Nexus Mods 均无隶属或官方关联**。

如果原作者不希望本项目引用其文本，请通过 Issue 联系，我们会及时移除相关内容。

---

## ✨ 功能特性

- 🔍 **实时搜索**：按技能名 / ID / 效果关键字过滤，并显示命中数量
- 📋 **技能等级说明**：区分普通技能与百龙技能，展示各等级文本
- ⚔️ **武器差分**：当技能对特定武器效果不同时单独列出（大剑 / 太刀 / 弓 …）
- 🎨 **游戏风格配色**：`<COLOR FFC000>` 高亮标记自动转换为彩色文本
- 📱 **PWA 支持**：可安装到主屏幕，离线可用（Service Worker 缓存）
- 🌙 **深色主题**：适合长期查阅

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

## 📁 目录结构

```
mhrise-skill/
├── index.html          # 主页面（含 PWA 配置、数据来源说明）
├── render.js           # 渲染 + 搜索 + 武器差分逻辑
├── skillData.js        # 技能数据（整理自 Nexus Mods 模组）
├── manifest.json       # PWA 清单文件
├── sw.js               # Service Worker（离线缓存）
├── 404.html            # GitHub Pages 404 页面
├── icon.svg            # 图标源文件
├── icon-192.png        # PWA 图标 192×192
├── icon-512.png        # PWA 图标 512×512
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