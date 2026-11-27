# dsh-hub-adapters

把已安装第三方插件的页面搬进「插件中心」（`dsh-plugin-hub`），**零改动第三方代码**。

## 为什么不能用 `renderSlot` 搬

第一版试过在插件中心里 `props.renderSlot('settings.section', {}, { only: id })`，全部降级。查源码后确认这条路在 DSH 的安全模型下走不通：

```js
// @deepseek-ai/dsh-client-ui-renderer/src/client/scoped-slots.tsx:624
if (entry.children !== undefined) {
  kit['renderSlot'] = boundRenderSlot(host, entry)
}
// :80
const declared = entry.children?.[key]
if (declared === undefined) {
  throw new SlotOwnershipError(`slot '${key}' is not declared by this entry's children`)
}
```

两条硬约束：

1. **只有声明了 `children` 的注册项才拿到 `renderSlot`** —— 适配器的条目没声明 children，`props.renderSlot` 直接是 `undefined`。
2. **即使拿到了，也只能渲染自己声明过的槽位** —— 想渲染 `settings.section` / `main` 这种别人声明的槽位会抛 `SlotOwnershipError`。

## 实际做法：直接渲染组件本体

槽位账本里存着第三方插件注册的原始组件：

```js
ctx.slots.entriesOfSlot('settings.section')   // → StoredEntry[]
// 找到 options.id === 'skin-market' 的那条
entry.component                                // 原始 React 组件
```

适配器取出它，补上 owner props 直接渲染：

- `settings.section` 类 → `h(Component, { close: () => {} })`（该槽位 ownerProps 契约要求 `close`）
- `main` 类（keyed）→ `h(Component, {})`

代价：**宿主不再替它注入标准 props**（`useSessions`、`useWorkspaces`、`usePanelInfo`、`renderSlot`、`t` 等）。不依赖这些的页面能正常显示；依赖的会在渲染时抛错，被 `ErrorBoundary` 捕获后显示降级页（带「打开原面板」按钮）。

## 当前接入

| 插件 | 插件中心显示 | 来源 |
|---|---|---|
| `dsh-context` | 上下文（使用） | `main` → `dsh-context` |
| `@linxin666/dsh-client-ui-task-board` | 任务看板（使用） | `main` → `task-board` |
| `dsh-talk-map` | 对话地图（使用 + 设置） | `main` → `talk-map`；`settings.section` → `talk-map-remote` |
| `@dsh-market/plugin` | 插件市场（使用） | `main` → `dsh-market` |
| `dsh-skin-market` | 皮肤市场（设置） | `settings.section` → `skin-market` |
| `dsh-plugin-wallpaper-engine` | 壁纸引擎（设置） | `settings.section` → `wallpaper-engine` |
| `dsh-startup-secret` | 启动界面（设置） | `settings.section` → `startup-screen` |

`order ≥ 100` 的条目会被插件中心归到「第三方插件」分组；自制插件是 10-71。

第三方插件的**原入口保持不变**（侧边栏图标、设置页都还在）。

## 加一个第三方插件

在 `client.js` 的 `ENTRIES` 里加一条：

```js
{
  id: '第三方包名',
  label: '显示名',
  order: 110,                                  // ≥100 进第三方分组
  usage: { slot: 'main', only: '<main 的 key>', label: '显示名' },
  settings: { slot: 'settings.section', only: '<section 的 id>', label: '显示名' }
}
```

两个字段都可选。查目标 id：

```
cordis_inspect_query(platform=client, provider=Slots, method=listSubTree, input={"root":"main"})
cordis_inspect_query(platform=client, provider=Slots, method=listSubTree, input={"root":"settings.section"})
```

看返回的 `selected.occupants`：`key`（main）或 `id`（settings.section）。

## 兜底

| 风险 | 兜底 |
|---|---|
| 找不到组件（插件禁用/改了 id） | 降级页 + 原因 |
| 组件依赖宿主注入的 props | `ErrorBoundary` → 降级页，不影响其它页 |
| 组件假设自己有整页高度 | `main` 类包 `height:100%` 的 flex 宿主 |
| 设置页原本由 shell 提供内边距 | 适配器补 `padding:16px 18px 28px` |

降级页给「打开原面板」按钮（`ctx.layout.selectPanel`），设置类提示去「设置」里搜插件名。

## 安装

```bash
plugin_manager install_bundle target="link:<克隆路径>/adapters"
```

改 `client.js` 内容刷新页面即可（HMR 热替换）；新增文件或改 `package.json` 需要重装。
