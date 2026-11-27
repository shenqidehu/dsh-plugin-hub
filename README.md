# 插件中心（dsh-plugin-hub）

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的自制插件一个固定入口：侧边栏一个图标，点开是一页「插件中心」——左侧列出所有接入的插件，右侧是它们的使用页与设置页。

电脑端 DSH 与手机端 DSH Go 共用同一份代码，窄屏自动适配。

## 它解决什么

- 自制插件原本散落在设置窗口、侧边栏、输入框各处，找起来靠记忆 → 统一到一个面板
- 每个插件可以提供「使用」和「设置」两页，面板自动生成左侧导航和顶部页签
- 已装的第三方插件不改一行代码也能进来（靠 `adapters/`）

## 快速开始

### 1. 安装主面板

```bash
# 从 npm（推荐）
plugin_manager install_bundle target="@twtsg/dsh-plugin-hub"

# 或直接从 GitHub
plugin_manager install_bundle target="github:shenqidehu/dsh-plugin-hub"

# 或先克隆再本地安装
git clone https://github.com/shenqidehu/dsh-plugin-hub.git
plugin_manager install_bundle target="link:<克隆路径>"
```

装完重启 DSH（或重载插件），侧边栏会出现「插件中心」，排在「插件」「市场」之前。

### 2. （可选）安装第三方适配器

让已经装好的第三方插件（任务看板、上下文、皮肤市场、壁纸引擎等）也出现在面板里。

```bash
# 从 npm
plugin_manager install_bundle target="dsh-hub-adapters"

# 或从克隆目录
plugin_manager install_bundle target="link:<克隆路径>/adapters"
```

### 3. （可选）安装开发规范 skill

```bash
cp -r <克隆路径>/skill/dsh-plugin-convention ~/.dsh/skills/
```

下次会话起生效，之后让 agent 写 DSH 插件时会自动按这套规范来。

## 插件怎么接进来

三行代码，加在自己插件的 `client.js` 里：

```js
ctx.slots.inject('plugin-hub.usage', function () {
  return ctx.slots.register(
    { name: 'plugin-hub.usage', id: 'my-plugin', order: 50, label: '我的插件' },
    UsagePage
  )
})
```

要设置页就把 `plugin-hub.usage` 换成 `plugin-hub.settings`。

约定：

| 约定 | 说明 |
|---|---|
| `id` | 必须等于插件 `package.json` 的 `name`；同一插件的两页用同一个 id，面板据此合并成「使用 / 设置」页签 |
| `order` | 导航排序。`< 100` 归「自制插件」分组，`>= 100` 归「第三方插件」分组 |
| `label` | 导航显示名，可传函数实现多语言 |
| 页面根元素 | 自带 `padding:16px 18px 28px`；不要写 `height:100%`、不要自带滚动容器 |
| 样式 | 只用 `--dsw-alias-*` 主题变量，类名加插件前缀 |
| 依赖 | 不要 `require` 任何 `@deepseek-ai/*` 包，React 只用 `require('react')` |

未安装插件中心时，`ctx.slots.inject` 的回调不会执行，插件静默降级、不报错。

详细规范（manifest、Host 路由契约、双端兼容、验证清单、常见坑）见 [`skill/dsh-plugin-convention/SKILL.md`](skill/dsh-plugin-convention/SKILL.md)。

## 第三方适配器怎么工作

`adapters/` 是一个独立的小 bundle。它从槽位账本里取出第三方插件**已经注册好的组件**，补上 owner props 后直接渲染进面板：

```js
ctx.slots.entriesOfSlot('settings.section')   // 找到 id 匹配的条目
entry.component                                // 原始组件
```

不修改第三方代码，第三方升级不受影响。依赖宿主上下文（会话数据、面板状态）的页面无法这样渲染，会显示一张带「打开原面板」按钮的降级卡片。

当前适配清单和扩展方法见 [`adapters/README.md`](adapters/README.md)。

## 目录结构

```
.
├── client.js            # 主面板（浏览器半侧）
├── index.js             # Host 半侧空壳
├── cordis.patch.yml     # bundle patch
├── locale/              # 插件显示名与描述
├── docs/DETAIL.md       # 插件详情页
├── icon.svg
├── adapters/            # 第三方适配器（独立 bundle，单独安装）
│   ├── client.js
│   ├── index.js
│   └── ...
└── skill/
    └── dsh-plugin-convention/
        └── SKILL.md     # 自制插件统一规范
```

## 兼容性

- 在 DSH `0.2.2-rc.1`（手机端 DSH Go）与 `0.2.2-rc.5`（桌面端）上验证
- 依赖 `sidebar.panellist`、`main`、`ctx.slots.entriesOfSlot` 等 0.2.x 公开槽位 API
- 窄屏（≤720px）左侧导航折成顶部横向条，页签整行居中

## 隐私

本仓库不含任何主机路径、内网地址、令牌或账号信息。适配器只读插件自己公开的槽位注册，不采集、不外发任何数据。

## License

[MIT](LICENSE)
