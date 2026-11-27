/**
 * dsh-hub-adapters — 把第三方插件页面搬进插件中心（浏览器半侧）
 * ---------------------------------------------------------------------------
 * 为什么不用 renderSlot 搬运：
 *   renderer 的安全模型规定 renderSlot 只注入给「声明了 children」的条目，
 *   且只允许渲染该条目自己声明的槽位
 *   （scoped-slots.tsx:624 `if (entry.children !== undefined) kit.renderSlot = ...`
 *     :80 `if (entry.children?.[key] === undefined) throw new SlotOwnershipError`）。
 *   所以跨声明域搬运第三方页面这条路走不通。
 *
 * 实际做法：从槽位账本里取出第三方插件注册的原始组件（entriesOfSlot 的
 * entry.component），直接渲染它，并补上它需要的 owner props。
 * 组件若依赖宿主注入的标准 props（useSessions 等）会抛错，由 ErrorBoundary
 * 捕获并显示带「打开原面板」的降级页。
 *
 * 注册 id 必须等于 package.json 的 name。
 */
window.__ModuleLoader__.load({
  id: 'dsh-hub-adapters',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var h = React.createElement

    var STYLE_ID = 'dsh-hub-adapters/panel.css'

    function noop() {}

    /* ── CSS ─────────────────────────────────────────────────────────────── */
    var CSS = [
      '.__ad_hostMain{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
      '.__ad_hostMain > *{flex:1;min-height:0}',
      '.__ad_hostSettings{padding:16px 18px 28px;box-sizing:border-box}',

      '.__ad_page{padding:16px 18px 28px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#e6edf3)}',
      '.__ad_note{max-width:600px;margin-bottom:12px;font-size:12px;line-height:1.75;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__ad_card{max-width:600px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2,#30363d);border-radius:10px;padding:14px 16px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.02))}',
      '.__ad_title{font-size:14px;font-weight:600;line-height:1.4}',
      '.__ad_avatar{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;background:rgba(148,163,184,.18);color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.__ad_details{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b949e)}',
      '.__ad_summary{cursor:pointer;user-select:none;padding:2px 0;color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.__ad_text{font-size:12px;line-height:1.75;color:var(--dsw-alias-label-tertiary,#8b949e);word-break:break-word}',
      '.__ad_mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#1f242d);color:var(--dsw-alias-label-secondary,#9aa4b2)}',
      '.__ad_error{font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.6;color:#fca5a5;word-break:break-word;white-space:pre-wrap}',
      '.__ad_btn{align-self:flex-start;border:1px solid var(--dsw-alias-border-l2,#30363d);background:var(--dsw-alias-bg-layer-3,#1f242d);color:var(--dsw-alias-label-primary,#e6edf3);border-radius:8px;padding:6px 13px;font:inherit;font-size:12px;line-height:1.3;cursor:pointer;min-height:32px}',
      '.__ad_btn:hover{border-color:var(--dsw-alias-state-business-primary,#3964fe)}',
      '@media (max-width:720px){.__ad_page,.__ad_hostSettings{padding:12px 14px 24px}.__ad_btn{width:100%;justify-content:center;min-height:38px}}'
    ].join('')

    function ensureStyle(ctx) {
      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(function () { return injectStyle() }, 'hub-adapters: styles')
        return
      }
      injectStyle()
    }

    function injectStyle() {
      if (typeof document === 'undefined') return function () {}
      if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return function () {}
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-hub-adapters'
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return function () {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
      }
    }

    /* ── 降级页 ──────────────────────────────────────────────────────────── */
    function Fallback(props) {
      var target = props.target
      var isMain = target.slot === 'main'
      var canJump = isMain && typeof props.openPanel === 'function'
      return h('div', { className: '__ad_page' },
        h('div', { className: '__ad_card' },
          h('div', { className: '__ad_avatar' }, target.label.slice(0, 1).toUpperCase()),
          h('div', { className: '__ad_title' }, target.label),
          h('div', { className: '__ad_text' },
            '这个插件的页面需要宿主上下文（会话数据、面板状态等），没法在插件中心里直接渲染。插件本身没问题，原入口照常可用。'
          ),
          canJump
            ? h('button', {
              type: 'button',
              className: '__ad_btn',
              onClick: function () {
                try { props.openPanel(target.only) } catch (error) {
                  if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[dsh-hub-adapters] 跳转失败：' + (error && error.message ? error.message : String(error)))
                  }
                }
              }
            }, '打开「' + target.label + '」')
            : h('div', { className: '__ad_text' }, '原入口在「设置」里，搜索该插件名即可找到。'),
          props.error
            ? h('details', { className: '__ad_details' },
              h('summary', { className: '__ad_summary' }, '技术细节'),
              h('div', { className: '__ad_error' }, String(props.error && props.error.message ? props.error.message : props.error))
            )
            : null
        )
      )
    }

    /* ── 错误边界 ────────────────────────────────────────────────────────── */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error: error }
      }

      componentDidCatch(error) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[dsh-hub-adapters] 第三方页面渲染失败：'
            + (error && error.message ? error.message : String(error)))
        }
      }

      render() {
        if (this.state.error) {
          return h(Fallback, {
            target: this.props.target,
            error: this.state.error,
            openPanel: this.props.openPanel
          })
        }
        return this.props.children
      }
    }

    /* ── 桥：直接渲染第三方插件注册的组件 ────────────────────────────────── */
    function Bridge(props) {
      var target = props.target
      var resolveEntry = props.resolveEntry
      var openPanel = props.openPanel

      var resolved = null
      var failure = null
      try {
        resolved = typeof resolveEntry === 'function' ? resolveEntry() : null
      } catch (error) {
        failure = error
      }

      if (failure !== null) {
        return h(Fallback, { target: target, error: failure, openPanel: openPanel })
      }
      if (!resolved) {
        return h(Fallback, {
          target: target,
          error: new Error('没有找到「' + target.only + '」对应的注册项：插件可能已禁用，或升级后改了槽位 id'),
          openPanel: openPanel
        })
      }

      // 动作型适配：不渲染原组件（它可能自带 fixed 定位或依赖特定容器），
      // 只借它 inject 里暴露的回调，在面板里画一个按钮。
      if (target.action) {
        var actionFn = resolved.injected ? resolved.injected[target.action.method] : null
        var callable = typeof actionFn === 'function'
        return h('div', { className: hostClass },
          target.note ? h('div', { className: '__ad_note' }, target.note) : null,
          h('button', {
            type: 'button',
            className: '__ad_btn',
            disabled: !callable,
            onClick: function () {
              if (!callable) return
              try {
                actionFn()
              } catch (error) {
                if (typeof console !== 'undefined' && console.warn) {
                  console.warn('[dsh-hub-adapters] 动作调用失败：' + (error && error.message ? error.message : String(error)))
                }
              }
            }
          }, callable ? (target.action.label || target.label) : '该插件没有暴露打开动作')
        )
      }

      if (!resolved.component) {
        return h(Fallback, {
          target: target,
          error: new Error('没有找到「' + target.only + '」对应的组件：插件可能已禁用，或升级后改了槽位 id'),
          openPanel: openPanel
        })
      }

      // 按框架组装顺序重建 props：
      //   1. 注册时的 inject 结果（插件自己的 control / statusFeed / controller …）
      //   2. locale 座位 t（条目声明了 locale 时）
      //   3. 槽位 ownerProps（owner wins，与框架一致）
      var ownerProps = {}
      if (resolved.injected) {
        for (var injectedName in resolved.injected) {
          if (Object.prototype.hasOwnProperty.call(resolved.injected, injectedName)) {
            ownerProps[injectedName] = resolved.injected[injectedName]
          }
        }
      }
      if (resolved.t) ownerProps.t = resolved.t
      if (target.ownerProps) {
        for (var ownerName in target.ownerProps) {
          if (Object.prototype.hasOwnProperty.call(target.ownerProps, ownerName)) {
            ownerProps[ownerName] = target.ownerProps[ownerName]
          }
        }
      }
      if (target.slot === 'settings.section' && ownerProps.close === undefined) {
        ownerProps.close = noop
      }

      var hostClass = target.slot === 'main' ? '__ad_hostMain' : '__ad_hostSettings'

      return h('div', { className: hostClass },
        target.note ? h('div', { className: '__ad_note' }, target.note) : null,
        h(Boundary, { target: target, openPanel: openPanel }, h(resolved.component, ownerProps))
      )
    }

    /* ── 接入清单 ────────────────────────────────────────────────────────────
     * id 用插件真实包名（插件中心据此合并使用页与设置页）。
     * usage    → 取 main 槽位里 key 匹配的组件
     * settings → 取 settings.section 槽位里 id 匹配的组件
     * order ≥ 100 的条目会被插件中心归到「第三方插件」分组。
     */
    var ENTRIES = [
      {
        id: 'dsh-context',
        label: '上下文',
        order: 100,
        usage: { slot: 'main', only: 'dsh-context', label: '上下文' }
      },
      {
        id: 'task-board',
        label: '任务看板',
        order: 101,
        usage: { slot: 'main', only: 'task-board', label: '任务看板' }
      },
      {
        id: 'dsh-talk-map',
        label: '对话地图',
        order: 102,
        usage: { slot: 'main', only: 'talk-map', label: '对话地图' },
        settings: { slot: 'settings.section', only: 'talk-map-remote', label: '对话地图' }
      },
      {
        id: 'dsh-market',
        label: '插件市场',
        order: 103,
        usage: { slot: 'main', only: 'dsh-market', label: '插件市场' }
      },
      {
        id: 'dsh-skin-market',
        label: '皮肤市场',
        order: 104,
        settings: { slot: 'settings.section', only: 'skin-market', label: '皮肤市场' }
      },
      {
        id: 'dsh-plugin-wallpaper-engine',
        label: '壁纸引擎',
        order: 105,
        settings: { slot: 'settings.section', only: 'wallpaper-engine', label: '壁纸引擎' }
      },
      {
        id: 'dsh-startup-secret',
        label: '启动界面',
        order: 106,
        settings: { slot: 'settings.section', only: 'startup-screen', label: '启动界面' }
      },
      {
        // ds-harness-remote 没有整页面板。它把 UI 注册在 shell.overlay
        // （桌面端 nativeTitlebar 为真，走浮层分支），那个组件自带 fixed 定位，
        // 直接搬进面板会飘到页面角落。
        // 改用它 inject 里暴露的 onSignIn（= 插件内部的 openRemote 广播），
        // 在面板里画一个按钮，点它打开原生远程控制浮层。
        id: 'ds-harness-remote',
        label: '远程控制',
        order: 107,
        usage: {
          slot: 'shell.overlay',
          only: 'ds-harness-remote-global-context',
          label: '远程控制',
          note: 'P2P 端到端加密远程访问：用手机或其它设备连上这台电脑的 Harness。点下面的按钮打开远程控制面板（二维码 / 设备列表 / 连接状态）。',
          action: { label: '打开远程控制面板', method: 'onSignIn' }
        }
      }
    ]

    /* ── 注册 ─────────────────────────────────────────────────────────────── */
    function apply(ctx) {
      ensureStyle(ctx)

      for (var i = 0; i < ENTRIES.length; i++) {
        registerEntry(ctx, ENTRIES[i], 'usage', 'plugin-hub.usage')
        registerEntry(ctx, ENTRIES[i], 'settings', 'plugin-hub.settings')
      }
    }

    function registerEntry(ctx, entry, kind, slotName) {
      var target = entry[kind]
      if (!target) return

      ctx.slots.inject(slotName, function () {
        return ctx.slots.register({
          name: slotName,
          id: entry.id,
          order: entry.order,
          label: entry.label,
          inject: function () {
            return {
              target: target,
              resolveEntry: function () { return resolveEntry(ctx, target) },
              openPanel: function (panelId) {
                try {
                  if (ctx.layout && typeof ctx.layout.selectPanel === 'function') ctx.layout.selectPanel(panelId)
                } catch (error) {
                  if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[dsh-hub-adapters] 无法切换面板：' + (error && error.message ? error.message : String(error)))
                  }
                }
              }
            }
          }
        }, Bridge)
      })
    }

    /**
     * 从槽位账本里按 key/id 取出条目，连同注册时的 inject 结果和 locale 座位。
     * 框架本来会在渲染该条目时替它调用 inject、绑定 t，直调时要自己补这两样。
     */
    function resolveEntry(ctx, target) {
      var list = []
      try {
        if (ctx.slots && typeof ctx.slots.entriesOfSlot === 'function') {
          list = ctx.slots.entriesOfSlot(target.slot) || []
        }
      } catch (error) {
        list = []
      }

      for (var i = 0; i < list.length; i++) {
        var entry = list[i]
        var options = (entry && entry.options) || {}
        var matched = target.slot === 'main'
          ? options.key === target.only
          : options.id === target.only
        if (!matched) continue

        var injected = null
        try {
          if (typeof entry.inject === 'function') injected = entry.inject() || null
        } catch (error) {
          injected = null
        }

        var translate = null
        if (typeof entry.locale === 'string' && ctx.locale && typeof ctx.locale.bind === 'function') {
          try { translate = ctx.locale.bind(entry.locale) } catch (error) { translate = null }
        }

        return { component: entry.component || null, injected: injected, t: translate }
      }
      return null
    }

    exports.apply = apply
    // layout：降级页的「打开原面板」靠 ctx.layout.selectPanel 跳转。
    // locale：重建条目 props 时要用 ctx.locale.bind(entry.locale) 补 t。
    exports.inject = ['slots', 'layout', 'locale']
    return module.exports
  }
})
