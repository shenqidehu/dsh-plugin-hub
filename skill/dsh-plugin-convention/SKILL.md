---
name: dsh-plugin-convention
description: DeepSeek Harness 自制插件（bundle + client.js）的统一开发规范与插件中心接入约定。当你要新建一个 DSH 自制插件、给现有自制插件加浏览器页面、把插件页面接进「插件中心」（dsh-plugin-hub）、把第三方插件移植进统一面板、排查插件页面不显示/侧边栏没有入口/slot entry crashed，或要保证插件在电脑端 DSH 与手机端 DSH Go 上都能用时使用。包含 manifest 规范、client.js 手写 bundle 模板、槽位速查、主题与窄屏规范、验证清单。
---

# DSH 自制插件统一规范

这套规范来自本机已验证的实现（DSH 0.2.2-rc.5，desktop profile），不是推测。改插件前先按本文核对，不要凭记忆。

## 0. 三条铁律

1. **注册 id 必须等于 `package.json` 的 `name`**。`window.__ModuleLoader__.load({ id })` 的 `id`、槽位注册项的 `id`、包名，三者一致。
2. **浏览器半侧不 `require` 任何 `@deepseek-ai/*` 包**。只用 `require('react')`；按钮、开关、弹窗自己写。加载宿主 primitives 会在升级时静默炸掉你的整个 slot entry。
3. **资源用 `ctx.effect` / `ctx.on` 注册并返回清理函数**，不要往 `document.body` 追加东西，不要用 iframe 装宿主页面。

## 1. 一个 bundle 的最小结构

```
my-plugin/
├── package.json          # 声明 dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 往 profile 配置树插入一行
├── index.js              # Host 半侧：export function apply(ctx, config) {}
├── client.js             # 浏览器半侧：window.__ModuleLoader__.load({...})
├── locale/{zh,en}.json   # meta.title / meta.description / meta.detail
├── docs/DETAIL.md        # 插件详情页（可选，但推荐）
└── icon.svg              # 插件图标
```

`package.json` 关键字段：

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg",
    "./package.json": "./package.json"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "locale/*.json", "docs", "icon.svg", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true }
  }
}
```

- 没有 `dsh.client` → `client.js` 永远不会被浏览器加载。
- `immediately: true` 表示不等其它 client 插件，尽快激活（面板类插件需要）。
- 只有 Host 半侧时，`dsh.client` 可整段省略。

`cordis.patch.yml`：

```yaml
- insert:
    - id: my-plugin
      name: my-plugin
```

## 2. 浏览器半侧模板

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect

    function Page() { /* 用 h(...) 画 */ }

    function apply(ctx) {
      ctx.slots.inject('plugin-hub.usage', function () {
        return ctx.slots.register(
          { name: 'plugin-hub.usage', id: 'my-plugin', order: 50, label: '我的插件' },
          Page
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  }
})
```

- 用 `h()` 而不是 JSX：无需构建步骤，`node --check` 就能验证语法。
- `exports.inject = ['slots']` 是硬依赖；`locale` 之类用 `ctx.get('locale')` 判空后使用。
- 改完必须 `node --check client.js`。

## 3. Host 路由（浏览器页面取数据）

页面要显示主机状态（端口、IP、服务是否在跑），必须由 Host 半侧提供接口，不要在浏览器里猜。`ctx.webServer.register` 的真实契约是 **node 风格**，不是 fetch 风格：

```js
const webServer = ctx.get('webServer')
if (webServer && typeof webServer.register === 'function') {
  ctx.effect(() => webServer.register({
    kind: 'exact',                        // 必填：'exact' | 'prefix'
    path: '/my-plugin/status',
    handler: (req, res) => {              // (IncomingMessage, ServerResponse)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, data: { /* ... */ } }))
    },
  }), 'my-plugin: status route')
}
```

- **`kind` 是必填的**，缺了注册直接失败。
- 想返回 `Response` 对象必须用 `resource` 字段（`WebResourceRoute`），**不能**挂在 `handler` 上。
- 要鉴权就在 handler 开头用 `ctx.connection.requestRejection(req)` 判 401；不加则本机任意进程可读（Web 只监听 `127.0.0.1`）。
- 一定要判空 + try/catch：没有 `webServer` 的 profile（headless/SDK）里跳过注册，不要让插件加载失败。
- 前端 `fetch('/my-plugin/status')` 同源请求，自动带 cookie。

## 4. 槽位速查（本机已确认存在）

| 想做的事 | 槽位 | 类型 | 注册参数 |
|---|---|---|---|
| 侧边栏固定入口 | `sidebar.panellist` | list | `{ id, order, label }`，组件只画图标，收到 `{ size, active }` |
| 中央整页 | `main` | keyed | `{ key }`，**key 必须等于 panellist 的 id** |
| 设置页（原生设置窗口） | `settings.section` | list | `{ id, order, label }` |
| 插件中心使用页 | `plugin-hub.usage` | list | `{ id, order, label }` |
| 插件中心设置页 | `plugin-hub.settings` | list | `{ id, order, label }` |
| 输入框右侧按钮 | `conversation.input.right` | list | `{ id, order }` |
| 输入框左侧按钮 | `conversation.input.left` | list | `{ id, order }` |
| 浮层（全屏覆盖） | `shell.overlay` | list | `{ id, order }` |
| 对话顶部导航 | `conversation.header.leading` | single | 只能一个占用者，会替换现有内容 |

- **侧边栏入口与中央面板是配对的**：`sidebar.panellist` 的 `id` 与 `main` 的 `key` 相同，侧边栏自动生成按钮并接管点击（`ctx.layout.selectPanel(id)`），不需要自己写导航。
- 编程跳转：`ctx.layout.selectPanel(panelId)`。
- `ctx.slots.inject(key, callback)` 会等到该槽位被声明才执行；这是"可选依赖"的标准写法。
- 枚举某个 list 槽位已注册的条目：`ctx.slots.entriesOfSlot(key)`；订阅变化：`ctx.slots.subscribe(key, fn)`。
- 在组件里渲染同槽位的单个条目：`props.renderSlot(key, ownerProps, { only: id })`。

## 5. 接入插件中心（dsh-plugin-hub）

插件中心自己声明了两个子槽位，任何插件都可以往里注册，**零依赖**：

```js
ctx.slots.inject('plugin-hub.usage', function () {
  return ctx.slots.register(
    { name: 'plugin-hub.usage', id: 'my-plugin', order: 50, label: '我的插件' }, UsagePage)
})
ctx.slots.inject('plugin-hub.settings', function () {
  return ctx.slots.register(
    { name: 'plugin-hub.settings', id: 'my-plugin', order: 50, label: '我的插件' }, SettingsPage)
})
```

- 同一个插件的两页用**相同 id / 相同 order / 相同 label**，面板会把它们合并成「使用 / 设置」页签。
- 只提供一页时只写一段。
- 未安装插件中心 → 回调不执行 → 插件静默降级，不需要判空、不需要硬依赖。
- 迁移设置页时，**移除原来的 `settings.section` 注册**，否则设置窗口和面板里会各有一份。

### 不要试图用 `renderSlot` 渲染别人的槽位

`props.renderSlot(key, owner, opts)` 有两条硬限制（`dsh-client-ui-renderer/src/client/scoped-slots.tsx`）：

```js
// :624 —— 只有声明了 children 的注册项才拿到 renderSlot
if (entry.children !== undefined) { kit['renderSlot'] = boundRenderSlot(host, entry) }
// :80 —— 且只能渲染自己声明过的槽位
if (entry.children?.[key] === undefined) throw new SlotOwnershipError(...)
```

所以「在插件中心里渲染第三方插件注册在 `settings.section` / `main` 的页面」这条路走不通：没声明 children 的条目根本没有 `renderSlot`，声明了也会被 ownership 检查拦住。

想把别人的页面搬进自己的面板，只能从账本取组件本体：

```js
const entry = ctx.slots.entriesOfSlot('settings.section').find(e => e.options.id === 'third-party-id')
const Component = entry.component            // 原始 React 组件
h(Component, { close: () => {} })            // 自己补 owner props
```

代价是**拿不到宿主注入的标准 props**（`useSessions`、`usePanelInfo`、`renderSlot`、`t` 等），依赖它们的组件会抛错，必须用 `ErrorBoundary` 兜底并给一个跳转原入口的退路。

## 6. 页面样式规范

- **只用主题变量**：`--dsw-alias-label-primary`、`--dsw-alias-label-secondary`、`--dsw-alias-label-tertiary`、`--dsw-alias-border-l2`、`--dsw-alias-bg-layer-2`、`--dsw-alias-bg-layer-3`、`--dsw-alias-state-business-primary`，可带 fallback 颜色。写死深色会毁掉浅色主题。
- 类名加插件前缀（`.__gp_*`、`.__s302_*`），避免与宿主/其它插件冲突。
- 页面根元素自带内边距（`padding:16px 18px 28px; box-sizing:border-box`）。插件中心的内容区**不给内边距、不套滚动容器**。
- 在插件中心里**不要**写 `height:100%` 或外层 `overflow:auto`（那是 `main` 整页槽位才需要的）。
- 样式注入用 `ctx.effect` 管理一个 `<style data-plugin-css="...">`，卸载时移除；同 id 已存在就跳过，避免重复注入。

## 7. 双端兼容（电脑端 DSH + 手机端 DSH Go）

两端跑的是同一套 Web 前端与同一套 slot 机制，所以**一份代码两端通用**，但要注意：

- 手机端侧边栏是**抽屉**（`drawer` 模式），折叠成 56px rail 时图标仍然渲染（size 18）。用户要先展开抽屉才能看到入口。
- 窄屏（≤720px）必须可用：按钮高度 ≥32px、不要 hover-only 交互、横向内容允许换行、表格用 `grid-template-columns: repeat(auto-fit, minmax(...))`。
- 不要调用 Electron 专属 API、不要假设有 `process`、不要假设文件系统可直读（手机是 proot Linux，路径 `/sdcard/Download`）。
- 需要主机信息（IP、端口、服务状态）时，**从 Host 路由取**，不要在浏览器里猜。
- 手机端安装方式：把目录传到手机（`remote_upload_file` 或局域网文件服务），解压后 `plugin_manager` 用 `link:/sdcard/Download/my-plugin` 安装。`link:` 只能指向该机器上的路径，不能指电脑路径。

## 8. 验证清单

1. `node --check client.js`（和 `index.js`）通过。
2. 查槽位：`cordis_inspect_query`（platform=client, provider=Slots, method=listSubTree, input=`{ "root": "sidebar.panellist" }`）能看到你的 `id`；换成 `plugin-hub.usage` 也一样。
3. **哪些改动需要重启**：只改已存在 `client.js` 的内容 → HMR 热替换，刷新页面即可；**新增 `client.js` 文件、改 `package.json` 的 `dsh.client`/`exports`、改 Host `index.js` → 必须重启 DSH 进程**（清单在启动时扫描，Host 代码不热加载）。
4. 侧边栏能看到入口 → 点开 → 页面正常 → 控制台没有 `slot entry crashed in '<slot>'`。
5. 缩窄到 <720px 复测。
6. 禁用插件中心后，你的插件仍能正常加载（只是面板入口消失）。

## 9. 常见故障

| 现象 | 原因 |
|---|---|
| 侧边栏没图标 | `sidebar.panellist` 没注册，或 `id` 与 `main` 的 `key` 不一致 |
| 有图标点开空白 | `main` 的 key 写错，或页面组件抛错（看控制台 `slot entry crashed`） |
| 插件中心里没有我的插件 | 注册到了 `settings.section` 而不是 `plugin-hub.*`；或 hub 未安装/未启用 |
| 设置页出现两份 | 迁移时没移除旧的 `settings.section` 注册 |
| 改了 client.js 没变化 | 只热替换了模块；`package.json` 改动或新增文件需要重装 bundle |
| 新增页面在面板里不出现 | 没重启 DSH：新增 `client.js` 或改 `package.json` 不会热扫描 |
| Host 路由 404 | **最常见**：`inject` 没声明 `webServer`，`ctx.get('webServer')` 返回 `undefined`，路由被静默跳过。修法：`ctx.inject(['webServer'], (scope) => registerRoutes(scope))`，或 `export const inject = ['webServer']`。其次：Host `index.js` 改动没重载；或 `register` 缺 `kind` |
| Host 路由裸 curl 401 | 路由里用了 `connection.requestRejection`：浏览器同源请求带 cookie 会放行，命令行请求会 401。这是正常现象，不是没注册 |
| 页面显示 401/需要登录 | 路由用了 `connection.requestRejection` 而请求没带会话 cookie；或反向代理丢了 cookie |
| 手机上排版错乱 | 用了固定宽度、hover 交互、或 `height:100%` |

## 10. 参考实现

真实样本（改之前先读，别凭空写）：

- 本仓库 `client.js` —— 面板容器、子槽位声明、枚举注册项、窄屏布局
- 本仓库 `adapters/client.js` —— 从槽位账本取第三方组件、错误边界兜底、可选服务注入
- 「侧边栏图标 + 主面板 + 设置页三处共用一套 UI」—— 按本文第 2 节的模板和第 4 节的槽位表组合
- 「Host 路由 + 表单页 + 双页签」—— 按本文第 3 节的路由契约和第 5 节的接入方式组合
