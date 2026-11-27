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

    /**
     * task-board 的面板组件通过注册时的 inject 拿 controller
     * （`inject: () => ({ controller })`），直调时必须手动补上。
     * 它把 controller 存在自己 provide 的 `taskBoard` 服务的公开字段里，
     * 这里用可选注入把服务引用缓存下来。
     */
    var taskBoardService = null

    /* ── CSS ─────────────────────────────────────────────────────────────── */
    var CSS = [
      '.__ad_hostMain{height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
      '.__ad_hostMain > *{flex:1;min-height:0}',
      '.__ad_hostSettings{padding:16px 18px 28px;box-sizing:border-box}',

      '.__ad_page{padding:16px 18px 28px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#e6edf3)}',
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
      var resolveComponent = props.resolveComponent
      var openPanel = props.openPanel

      var Component = null
      var failure = null
      try {
        Component = typeof resolveComponent === 'function' ? resolveComponent() : null
      } catch (error) {
        failure = error
      }

      if (failure !== null) {
        return h(Fallback, { target: target, error: failure, openPanel: openPanel })
      }
      if (!Component) {
        return h(Fallback, {
          target: target,
          error: new Error('没有找到「' + target.only + '」对应的组件：插件可能已禁用，或升级后改了槽位 id'),
          openPanel: openPanel
        })
      }

      // settings.section 的 ownerProps 契约要求 close；main 的 ownerProps 为空。
      var ownerProps = target.slot === 'settings.section' ? { close: noop } : {}

      // 少数插件（如 task-board）的面板靠注册时的 inject 拿数据源，直调时要补上。
      if (typeof target.resolveExtra === 'function') {
        var extra = null
        try { extra = target.resolveExtra() } catch (error) { extra = null }
        if (extra) {
          for (var extraName in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, extraName)) {
              ownerProps[extraName] = extra[extraName]
            }
          }
        }
      }

      var hostClass = target.slot === 'main' ? '__ad_hostMain' : '__ad_hostSettings'

      return h('div', { className: hostClass },
        h(Boundary, { target: target, openPanel: openPanel }, h(Component, ownerProps))
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
        usage: {
          slot: 'main',
          only: 'task-board',
          label: '任务看板',
          resolveExtra: function () {
            if (taskBoardService === null) return null
            var controller = taskBoardService.controller
            return controller === undefined ? null : { controller: controller }
          }
        }
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
      }
    ]

    /* ── 注册 ─────────────────────────────────────────────────────────────── */
    function apply(ctx) {
      ensureStyle(ctx)

      // task-board 把 live controller 存在它 provide 的 taskBoard 服务里。
      // 可选注入：没装该插件时回调不执行，不影响其它适配。
      if (ctx && typeof ctx.inject === 'function') {
        try {
          ctx.inject(['taskBoard'], function (scope) {
            taskBoardService = (scope && (scope.taskBoard
              || (typeof scope.get === 'function' ? scope.get('taskBoard') : null))) || null
            return function () { taskBoardService = null }
          })
        } catch (error) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[dsh-hub-adapters] 无法注入 taskBoard 服务：'
              + (error && error.message ? error.message : String(error)))
          }
        }
      }

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
              resolveComponent: function () { return resolveComponent(ctx, target) },
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

    /** 从槽位账本里按 key/id 取出第三方插件注册的原始组件。 */
    function resolveComponent(ctx, target) {
      var list = []
      try {
        if (ctx.slots && typeof ctx.slots.entriesOfSlot === 'function') {
          list = ctx.slots.entriesOfSlot(target.slot) || []
        }
      } catch (error) {
        list = []
      }
      for (var i = 0; i < list.length; i++) {
        var options = (list[i] && list[i].options) || {}
        var matched = target.slot === 'main'
          ? options.key === target.only
          : options.id === target.only
        if (matched) return list[i].component || null
      }
      return null
    }

    exports.apply = apply
    // layout 必须声明：降级页的「打开原面板」靠 ctx.layout.selectPanel 跳转，
    // 少了它 ctx.layout 是 undefined，按钮点了没有任何反应。
    exports.inject = ['slots', 'layout']
    return module.exports
  }
})
