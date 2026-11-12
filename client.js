// dsh-product-previs · DeepSeek-Harness 插件：浏览器半边
//   - 左侧栏加一个「产品预演」入口
//   - 主区域是插件页面（/product-previs/，iframe）：三维布景 + 机位监看 + 时间线
//   - 右侧栏页签复用同一个工作台，便于一边和 DSH 对话一边改镜头
window.__ModuleLoader__.load({
  id: 'dsh-product-previs',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const PANEL = 'product-previs'
    const BASE = '/product-previs'

    // 侧栏图标：摄影机
    function CameraIcon(props) {
      const size = (props && props.size) || 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round',
      },
        h('rect', { x: 3, y: 6, width: 13, height: 12, rx: 2 }),
        h('path', { d: 'm16 10 5-3v10l-5-3' }),
        h('path', { d: 'M7 3h5M9.5 6V3' }))
    }

    function apply(ctx) {
      const Studio = () => h('iframe', {
        src: BASE + '/',
        title: '产品白模预演',
        allow: 'fullscreen; clipboard-write',
        style: { display: 'block', width: '100%', height: '100%', border: 0, background: '#17191e' },
      })

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 7.5, label: () => '产品预演' }, CameraIcon))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Studio))

      // 右侧栏只在宿主提供该注册表时接入；缺少时静默跳过，不能因此让整个插件报错。
      try {
        ctx.inject(['sidebarRightTabs'], (c) => {
          ctx.effect(() => c.sidebarRightTabs.register({
            id: PANEL,
            kind: PANEL,
            title: () => '产品预演',
            guide: [{ order: 35, title: () => '产品预演', description: () => '与 AI 对话时查看、编辑产品白模与镜头' }],
          }))
        })
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: PANEL }, Studio))
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: PANEL }, () => h('span', null, '产品预演')))
      } catch (error) {
        // 左栏与主视图已可用；右栏是增强，失败不影响打开工作台。
        console.warn('[product-previs] 右侧栏页签未注册：', error && error.message ? error.message : error)
      }
    }

    const exports_ = { name: 'dsh-product-previs', inject: ['slots'], isPlugin: true, apply }
    return exports_
  },
})
