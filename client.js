/**
 * dsh-plugin-hub — 浏览器半侧（统一入口面板）
 * ---------------------------------------------------------------------------
 * 手写 client-module bundle（无需构建）。注册 id 必须等于 package.json 的 name。
 *
 * 三件事：
 *   1. sidebar.panellist —— 侧边栏固定入口图标（id 与 main 的 key 相同才会联动）
 *   2. main              —— 主区域的「插件中心」整页面板
 *   3. 在 main 上声明两个子槽位，供所有自制插件接入：
 *        plugin-hub.usage     使用页面（list）
 *        plugin-hub.settings  设置页面（list）
 *
 * 插件接入方式（三行，装在插件自己的 client.js 里）：
 *
 *   ctx.slots.inject('plugin-hub.usage', () => ctx.slots.register(
 *     { name: 'plugin-hub.usage', id: 'dsh-git-publisher', order: 30, label: 'Git 发布' },
 *     UsagePage))
 *
 * 未安装本插件时 inject 回调永不执行，插件静默降级，不会报错。
 */
window.__ModuleLoader__.load({
  id: '@twtsg/dsh-plugin-hub',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var Children = React.Children

    var PANEL_ID = 'plugin-hub'
    var SLOT_USAGE = 'plugin-hub.usage'
    var SLOT_SETTINGS = 'plugin-hub.settings'
    var STORE_KEY = 'dsh-plugin-hub:view'
    var STYLE_ID = 'dsh-plugin-hub/panel.css'

    /* ── CSS ─────────────────────────────────────────────────────────────── */
    var CSS = [
      '.__hub_root{display:flex;height:100%;min-height:0;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary,#e6edf3)}',

      '.__hub_nav{width:196px;flex:none;display:flex;flex-direction:column;gap:2px;padding:10px 8px;overflow-y:auto;overflow-x:hidden;border-right:1px solid var(--dsw-alias-border-l2,#30363d);box-sizing:border-box}',
      '.__hub_navEmpty{padding:8px 9px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__hub_navItem{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa4b2);font:inherit;font-size:12.5px;line-height:1.35;text-align:left;cursor:pointer;box-sizing:border-box}',
      '.__hub_navItem:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));color:var(--dsw-alias-label-primary,#e6edf3)}',
      '.__hub_navItemOn,.__hub_navItemOn:hover{background:var(--dsw-alias-bg-layer-3,#1f242d);color:var(--dsw-alias-label-primary,#e6edf3)}',
      '.__hub_navAvatar{flex:none;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:rgba(57,100,254,.16);color:var(--dsw-alias-state-business-primary,#7c9cff)}',
      '.__hub_navAvatarThird{background:rgba(148,163,184,.18);color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.__hub_group{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}',
      '.__hub_groupTitle{padding:5px 9px 3px;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__hub_navLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      '.__hub_pane{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}',
      '.__hub_head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#30363d);box-sizing:border-box}',
      '.__hub_headText{flex:1;min-width:0}',
      '.__hub_title{margin:0;font-size:15px;font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.__hub_sub{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__hub_tabs{display:inline-flex;gap:2px;padding:2px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#30363d);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04))}',
      '.__hub_tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9aa4b2);font:inherit;font-size:12px;line-height:1.4;padding:4px 12px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.__hub_tab:hover{color:var(--dsw-alias-label-primary,#e6edf3)}',
      '.__hub_tabOn,.__hub_tabOn:hover{background:var(--dsw-alias-bg-layer-3,#1f242d);color:var(--dsw-alias-label-primary,#e6edf3)}',

      '.__hub_body{flex:1;min-height:0;overflow:auto;position:relative}',
      '.__hub_empty{max-width:440px;margin:48px auto 0;padding:0 20px;display:flex;flex-direction:column;gap:8px;text-align:center}',
      '.__hub_emptyTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#e6edf3)}',
      '.__hub_emptyText{font-size:12px;line-height:1.75;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__hub_code{font-family:ui-monospace,Consolas,monospace;font-size:11px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#1f242d);color:var(--dsw-alias-label-secondary,#9aa4b2)}',

      '@media (max-width:720px){',
      '.__hub_root{flex-direction:column}',
      '.__hub_nav{width:auto;flex-direction:row;gap:4px;padding:6px 8px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l2,#30363d)}',
      '.__hub_navItem{width:auto;flex:none;padding:6px 10px;font-size:12px}',
      '.__hub_navLabel{max-width:112px}',
      '.__hub_navEmpty{padding:6px 8px;white-space:nowrap}',
      '.__hub_group{flex-direction:row;align-items:center;gap:4px;margin-bottom:0}',
      '.__hub_groupTitle{flex:none;padding:0 6px 0 2px;font-size:10px;white-space:nowrap}',
      '.__hub_head{padding:10px 14px;gap:8px}',
      '.__hub_tabs{order:3;width:100%;justify-content:center}',
      '.__hub_tab{flex:1;text-align:center}',
      '.__hub_empty{margin-top:28px}',
      '}'
    ].join('')

    /* ── 样式注入（跟随插件生命周期） ─────────────────────────────────────── */
    function ensureStyle(ctx) {
      ctx.effect(function () {
        if (typeof document === 'undefined') return function () {}
        if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) {
          return function () {}
        }
        var tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-plugin-hub'
        tag.dataset.pluginCss = STYLE_ID
        tag.textContent = CSS
        document.head.appendChild(tag)
        return function () {
          if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
        }
      }, 'plugin-hub: styles')
    }

    /* ── 上次打开的插件与页签 ─────────────────────────────────────────────── */
    function readView() {
      try {
        var raw = window.localStorage.getItem(STORE_KEY)
        if (!raw) return { id: '', tab: 'usage' }
        var parsed = JSON.parse(raw)
        if (parsed && typeof parsed.id === 'string') {
          return { id: parsed.id, tab: parsed.tab === 'settings' ? 'settings' : 'usage' }
        }
      } catch (error) { /* 忽略损坏的存储 */ }
      return { id: '', tab: 'usage' }
    }

    function writeView(view) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify({ id: view.id, tab: view.tab }))
      } catch (error) { /* 存储不可用时只在本次会话生效 */ }
    }

    /* ── 注册表：把两个子槽位的注册项合并成一份插件列表 ────────────────────── */
    function slotEntries(ctx, key) {
      try {
        if (ctx.slots && typeof ctx.slots.entriesOfSlot === 'function') {
          return ctx.slots.entriesOfSlot(key) || []
        }
      } catch (error) { /* 槽位尚未声明 */ }
      return []
    }

    function slotSubscribe(ctx, key, listener) {
      try {
        if (ctx.slots && typeof ctx.slots.subscribe === 'function') {
          return ctx.slots.subscribe(key, listener)
        }
      } catch (error) { /* 忽略 */ }
      return function () {}
    }

    function labelOf(value) {
      if (typeof value === 'function') {
        try {
          var resolved = value()
          if (typeof resolved === 'string' && resolved !== '') return resolved
        } catch (error) { /* 本地化函数抛错时退回 id */ }
        return ''
      }
      return typeof value === 'string' ? value : ''
    }

    function createRegistry(ctx) {
      var listeners = []
      var items = []
      var version = 0

      function collect() {
        var byId = Object.create(null)
        var ids = []

        function absorb(entries, kind) {
          for (var i = 0; i < entries.length; i++) {
            var options = (entries[i] && entries[i].options) || {}
            var id = options.id
            if (typeof id !== 'string' || id === '') continue
            var entry = byId[id]
            if (!entry) {
              entry = { id: id, label: '', order: null, usage: false, settings: false }
              byId[id] = entry
              ids.push(id)
            }
            entry[kind] = true
            var text = labelOf(options.label)
            if (text !== '') entry.label = text
            var order = typeof options.order === 'number' ? options.order : null
            if (order !== null && (entry.order === null || order < entry.order)) entry.order = order
          }
        }

        absorb(slotEntries(ctx, SLOT_USAGE), 'usage')
        absorb(slotEntries(ctx, SLOT_SETTINGS), 'settings')

        var out = []
        for (var j = 0; j < ids.length; j++) {
          var item = byId[ids[j]]
          if (item.label === '') item.label = item.id
          out.push(item)
        }
        out.sort(function (left, right) {
          var a = left.order === null ? Number.MAX_SAFE_INTEGER : left.order
          var b = right.order === null ? Number.MAX_SAFE_INTEGER : right.order
          if (a !== b) return a - b
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
        })
        return out
      }

      function same(next) {
        if (items.length !== next.length) return false
        for (var i = 0; i < next.length; i++) {
          var a = items[i]
          var b = next[i]
          if (a.id !== b.id || a.label !== b.label || a.usage !== b.usage || a.settings !== b.settings) return false
        }
        return true
      }

      function sync() {
        var next = collect()
        if (same(next)) return
        items = next
        version += 1
        var snapshot = listeners.slice()
        for (var i = 0; i < snapshot.length; i++) {
          try { snapshot[i]() } catch (error) { /* 单个订阅者失败不影响其它 */ }
        }
      }

      return {
        get: function () { return { items: items, version: version } },
        subscribe: function (listener) {
          listeners.push(listener)
          return function () {
            var at = listeners.indexOf(listener)
            if (at >= 0) listeners.splice(at, 1)
          }
        },
        sync: sync
      }
    }

    function useRegistry(registry) {
      var state = useState(function () { return registry.get() })
      var snapshot = state[0]
      var setSnapshot = state[1]
      useEffect(function () {
        var off = registry.subscribe(function () { setSnapshot(registry.get()) })
        setSnapshot(registry.get())
        return off
      }, [registry])
      return snapshot
    }

    /* ── 组件 ─────────────────────────────────────────────────────────────── */
    function NavItem(props) {
      var item = props.item
      return h('button', {
        type: 'button',
        className: '__hub_navItem' + (props.active ? ' __hub_navItemOn' : ''),
        title: item.label,
        'aria-current': props.active ? 'page' : undefined,
        onClick: props.onSelect
      },
      h('span', { className: '__hub_navAvatar' + (props.third ? ' __hub_navAvatarThird' : ''), 'aria-hidden': 'true' }, item.label.slice(0, 1).toUpperCase()),
      h('span', { className: '__hub_navLabel' }, item.label)
      )
    }

    function TabBar(props) {
      return h('div', { className: '__hub_tabs', role: 'tablist' },
        props.tabs.map(function (tab) {
          var selected = props.active === tab.id
          return h('button', {
            key: tab.id,
            type: 'button',
            role: 'tab',
            'aria-selected': selected,
            className: '__hub_tab' + (selected ? ' __hub_tabOn' : ''),
            onClick: function () { props.onChange(tab.id) }
          }, tab.label)
        })
      )
    }

    function EmptyPane(props) {
      return h('div', { className: '__hub_empty' },
        h('div', { className: '__hub_emptyTitle' }, props.title),
        h('div', { className: '__hub_emptyText' }, props.text)
      )
    }

    /** 主区域的插件中心整页。 */
    function HubPanel(props) {
      var registry = props.registry
      var renderSlot = props.renderSlot
      var snapshot = useRegistry(registry)
      var items = snapshot.items

      var viewState = useState(readView)
      var view = viewState[0]
      var setView = viewState[1]

      var active = null
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === view.id) { active = items[i]; break }
      }
      if (active === null && items.length > 0) active = items[0]

      // 页签按插件实际提供的页面收敛，不改写状态（避免渲染期回写）。
      var tab = view.tab
      if (active !== null) {
        if (tab === 'usage' && !active.usage) tab = 'settings'
        if (tab === 'settings' && !active.settings) tab = 'usage'
      }

      var activeId = active === null ? '' : active.id
      useEffect(function () {
        if (activeId !== '') writeView({ id: activeId, tab: tab })
      }, [activeId, tab])

      function select(id) {
        var target = null
        for (var index = 0; index < items.length; index++) {
          if (items[index].id === id) { target = items[index]; break }
        }
        if (target === null) return
        setView({ id: id, tab: target.usage ? 'usage' : 'settings' })
      }

      function setTab(next) {
        if (active === null) return
        setView({ id: active.id, tab: next })
      }

      var tabs = []
      if (active !== null) {
        if (active.usage) tabs.push({ id: 'usage', label: '使用' })
        if (active.settings) tabs.push({ id: 'settings', label: '设置' })
      }

      // 分组：order ≥ 100 视为第三方插件（约定见 README）。
      function renderGroup(groupKey, title, list) {
        if (list.length === 0) return null
        return h('div', { key: groupKey, className: '__hub_group' },
          h('div', { className: '__hub_groupTitle' }, title),
          list.map(function (item) {
            return h(NavItem, {
              key: item.id,
              item: item,
              third: groupKey === 'third',
              active: active !== null && active.id === item.id,
              onSelect: function () { select(item.id) }
            })
          })
        )
      }

      var ownItems = []
      var thirdItems = []
      for (var groupIndex = 0; groupIndex < items.length; groupIndex++) {
        if (items[groupIndex].order !== null && items[groupIndex].order >= 100) thirdItems.push(items[groupIndex])
        else ownItems.push(items[groupIndex])
      }

      var body
      if (active === null) {
        body = items.length === 0
          ? h(EmptyPane, {
            title: '还没有插件接入',
            text: '自制插件在自己的 client.js 里把页面注册到 plugin-hub.usage 或 plugin-hub.settings，就会出现在这里。'
          })
          : h(EmptyPane, { title: '选择一个插件', text: '从左侧选择一个插件，查看它的使用页与设置页。' })
      } else if (tabs.length === 0) {
        body = h(EmptyPane, {
          title: active.label,
          text: '这个插件还没有提供使用页或设置页。'
        })
      } else {
        var slotKey = tab === 'settings' ? SLOT_SETTINGS : SLOT_USAGE
        var rendered = null
        try {
          rendered = renderSlot(slotKey, {}, { only: active.id })
        } catch (error) {
          rendered = null
        }
        body = Children.count(rendered) > 0
          ? rendered
          : h(EmptyPane, {
            title: active.label,
            text: '页面正在加载；若一直空白，说明该插件注册的页面组件渲染失败。'
          })
      }

      return h('div', { className: '__hub_root' },
        h('nav', { className: '__hub_nav', 'aria-label': '插件列表' },
          items.length === 0
            ? h('div', { className: '__hub_navEmpty' }, '暂无插件')
            : [
              renderGroup('own', '自制插件', ownItems),
              renderGroup('third', '第三方插件', thirdItems)
            ]
        ),
        h('section', { className: '__hub_pane' },
          h('header', { className: '__hub_head' },
            h('div', { className: '__hub_headText' },
              h('h1', { className: '__hub_title' }, active === null ? '插件中心' : active.label),
              h('div', { className: '__hub_sub' }, '自制与第三方插件统一入口')
            ),
            tabs.length > 1 ? h(TabBar, { tabs: tabs, active: tab, onChange: setTab }) : null
          ),
          h('div', { className: '__hub_body' }, body)
        )
      )
    }

    /** 侧边栏图标（slot 只渲染图标，文字标签由 sidebar 自己画）。 */
    function HubIcon(props) {
      var size = (props && props.size) || 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
      },
      h('rect', { x: 3, y: 3, width: 7.5, height: 7.5, rx: 1.7 }),
      h('rect', { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 1.7 }),
      h('rect', { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 1.7 }),
      h('rect', { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 1.7 })
      )
    }

    /* ── 注册 ─────────────────────────────────────────────────────────────── */
    function apply(ctx) {
      ensureStyle(ctx)

      var registry = createRegistry(ctx)

      // 主面板：注册的同时声明两个子槽位，插件随后就能 inject 进来。
      ctx.slots.inject('main', function () {
        var disposers = []

        disposers.push(ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          label: '插件中心',
          children: {
            'plugin-hub.usage': { kind: 'list', scope: 'root' },
            'plugin-hub.settings': { kind: 'list', scope: 'root' }
          },
          inject: function () { return { registry: registry } }
        }, HubPanel))

        // 子槽位此刻已存在，开始同步并跟随注册变化。
        registry.sync()
        disposers.push(slotSubscribe(ctx, SLOT_USAGE, registry.sync))
        disposers.push(slotSubscribe(ctx, SLOT_SETTINGS, registry.sync))

        // label 可以是跟随语言的 thunk，语言切换后重新取一次。
        var locale = ctx.get ? ctx.get('locale') : undefined
        if (locale && typeof locale.subscribe === 'function') {
          disposers.push(locale.subscribe(registry.sync))
        }

        return disposers
      })

      // 侧边栏固定入口：order 1，排在插件/市场等内置面板之前。
      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 1, label: '插件中心' },
          HubIcon
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  }
})
