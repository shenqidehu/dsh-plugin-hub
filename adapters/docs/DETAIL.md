# 插件中心适配器（dsh-hub-adapters）

把**已安装的第三方插件**页面搬进「插件中心」，不改动它们一行代码。

## 做法

第三方插件已经把页面注册在公开槽位上：

- 整页面板 → `main` 槽位的某个 key（如 `dsh-context`、`task-board`）
- 设置页 → `settings.section` 槽位的某个 id（如 `skin-market`、`wallpaper-engine`）

适配器从槽位账本（`ctx.slots.entriesOfSlot`）里取出这些条目的**原始组件**，补上 owner props 后直接渲染到插件中心的页里：

- `settings.section` 类：`h(Component, { close: () => {} })`
- `main` 类（keyed）：`h(Component, {})`

第三方插件升级不受影响，因为适配器只依赖它的槽位 id。

## 为什么不用 renderSlot

DSH 渲染器规定：

1. `renderSlot` 只注入给声明了 `children` 的注册项（`scoped-slots.tsx:624`）；
2. 且只允许渲染该条目自己声明的槽位，否则抛 `SlotOwnershipError`（`:80`）。

所以「让插件中心渲染别人声明的槽位」这条路被安全模型挡住了，只能直接渲染组件本体。

## 当前接入

| 插件 | 插件中心显示 | 来源 |
|---|---|---|
| `dsh-context` | 上下文（使用） | `main` → `dsh-context` |
| `task-board` | 任务看板（使用） | `main` → `task-board` |
| `dsh-talk-map` | 对话地图（使用 + 设置） | `main` → `talk-map`；`settings.section` → `talk-map-remote` |
| `dsh-market` | 插件市场（使用） | `main` → `dsh-market` |
| `dsh-skin-market` | 皮肤市场（设置） | `settings.section` → `skin-market` |
| `wallpaper-engine` | 壁纸引擎（设置） | `settings.section` → `wallpaper-engine` |
| `dsh-startup-secret` | 启动界面（设置） | `settings.section` → `startup-screen` |

第三方插件的原入口保持不变，适配器只是在插件中心里多给一个入口。

## 失败时的行为

1. 找不到组件（插件被禁用、升级后改了槽位 id）→ 降级页写明原因。
2. 组件依赖宿主注入的标准 props（`useSessions`、`usePanelInfo`、`renderSlot`、`t` 等）→ 渲染时抛错，被 `ErrorBoundary` 捕获，只让这一页显示降级，不影响其它页和整个面板。
3. 降级页提供「打开原面板」按钮（`ctx.layout.selectPanel`）；设置类没有面板可跳，提示去「设置」里搜索。

## 已知限制

- **不是所有第三方页面都能这样渲染**：依赖宿主上下文（会话数据、面板状态、locale 座位）的组件会抛错，看到的就是降级页。
- `settings.section` 的 ownerProps 要求一个 `close` 回调，适配器传空函数；第三方若依赖它"关闭设置面板"来收尾，那个动作不会发生。
- 适配器不代理数据：页面里的读写仍走第三方插件自己的 Host 路由，需要登录态的路由同样要 cookie。
- 第三方插件若改了槽位 id 或 key，需要在 `client.js` 的 `ENTRIES` 里同步。
- 插件中心按 `order ≥ 100` 把条目归到「第三方插件」分组，新增第三方条目请遵守这个约定。
