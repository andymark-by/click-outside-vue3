/* global jest describe it expect beforeEach afterEach */

import {
  createApp,
  defineComponent,
  nextTick,
  reactive,
  ref,
  version,
} from 'vue'
import plugin from '../src/index'

const [major, minor, patch] = version
  .split('.')
  .map((part) => parseInt(part, 10))
const supportsDeepDirectives =
  major > 3 || (major === 3 && (minor > 1 || (minor === 1 && patch >= 5)))

describe('Vue integration', () => {
  let app
  let container

  beforeEach(() => {
    jest.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (app) {
      app.unmount()
      app = undefined
    }
    jest.clearAllTimers()
    container.remove()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('calls the handler outside and ignores clicks inside', () => {
    const handler = jest.fn()
    app = createApp({
      setup: () => ({ handler }),
      template: '<div v-click-outside="handler"><span>inside</span></div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    container
      .querySelector('span')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })
  ;(supportsDeepDirectives ? it : it.skip)(
    'reacts to in-place isActive changes',
    async () => {
      const handler = jest.fn()
      const config = reactive({ handler, isActive: true })
      app = createApp({
        setup: () => ({ config }),
        template: '<div v-click-outside="config">inside</div>',
      })
      app.use(plugin)
      app.mount(container)
      jest.runAllTimers()
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      config.isActive = false
      await nextTick()
      jest.runAllTimers()
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      config.isActive = true
      await nextTick()
      jest.runAllTimers()
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(2)
    },
  )

  it('reacts when the config object is replaced', async () => {
    const handler = jest.fn()
    const config = ref({ handler, isActive: true })
    app = createApp({
      setup: () => ({ config }),
      template: '<div v-click-outside="config">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    config.value = { handler, isActive: false }
    await nextTick()
    jest.runAllTimers()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    config.value = { handler, isActive: true }
    await nextTick()
    jest.runAllTimers()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('uses a new handler from a reactive reference', async () => {
    const first = jest.fn()
    const second = jest.fn()
    const handler = ref(first)
    app = createApp({
      setup: () => ({ handler }),
      template: '<div v-click-outside="handler">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    handler.value = second
    await nextTick()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('removes listeners when v-if removes the element', async () => {
    const handler = jest.fn()
    const visible = ref(true)
    const remove = jest.spyOn(document.documentElement, 'removeEventListener')
    app = createApp({
      setup: () => ({ handler, visible }),
      template: '<div v-if="visible" v-click-outside="handler">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    visible.value = false
    await nextTick()
    jest.runAllTimers()
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function), false)
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
      capture: true,
    })
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('notifies only the other v-for elements after an inside click', () => {
    const handlers = [jest.fn(), jest.fn(), jest.fn()]
    app = createApp({
      setup: () => ({ handlers, items: ['a', 'b', 'c'] }),
      template:
        '<div v-for="(item, index) in items" :key="item" v-click-outside="handlers[index]" class="item">{{ item }}</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    container
      .querySelector('.item')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handlers[0]).not.toHaveBeenCalled()
    expect(handlers[1]).toHaveBeenCalledTimes(1)
    expect(handlers[2]).toHaveBeenCalledTimes(1)
  })

  it('updates inline handlers without new listeners', async () => {
    const onOutside = jest.fn()
    const counter = ref(0)
    const add = jest.spyOn(document.documentElement, 'addEventListener')
    app = createApp({
      setup: () => ({ counter, onOutside }),
      template:
        '<div><span>{{ counter }}</span><button v-click-outside="() => onOutside(\'a\')">inside</button></div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    const clickAdds = () =>
      add.mock.calls.filter(([type]) => type === 'click').length
    expect(clickAdds()).toBe(1)
    counter.value = 1
    await nextTick()
    jest.runAllTimers()
    counter.value = 2
    await nextTick()
    jest.runAllTimers()
    counter.value = 3
    await nextTick()
    jest.runAllTimers()
    expect(clickAdds()).toBe(1)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOutside).toHaveBeenCalledTimes(1)
    expect(onOutside).toHaveBeenCalledWith('a')
  })

  it('removes child listeners when v-if removes it', async () => {
    const handler = jest.fn()
    const visible = ref(true)
    const add = jest.spyOn(document.documentElement, 'addEventListener')
    const remove = jest.spyOn(document.documentElement, 'removeEventListener')
    const Child = defineComponent({
      setup: () => ({ handler }),
      template: '<div v-click-outside="handler">child</div>',
    })
    app = createApp({
      components: { Child },
      setup: () => ({ visible }),
      template: '<Child v-if="visible" />',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    const added = add.mock.calls.slice()
    expect(added.map(([type]) => type)).toEqual(['click', 'pointerdown'])
    visible.value = false
    await nextTick()
    jest.runAllTimers()
    expect(remove).toHaveBeenCalledTimes(added.length)
    added.forEach(([type, listener, options]) => {
      const capture = typeof options === 'boolean' ? options : options.capture
      expect(
        remove.mock.calls.some(
          ([removedType, removedListener, removedOptions]) => {
            const removedCapture =
              typeof removedOptions === 'boolean'
                ? removedOptions
                : removedOptions.capture
            return (
              removedType === type &&
              removedListener === listener &&
              removedCapture === capture
            )
          },
        ),
      ).toBe(true)
    })
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('removes listeners when the app unmounts', () => {
    const handler = jest.fn()
    const remove = jest.spyOn(document.documentElement, 'removeEventListener')
    app = createApp({
      setup: () => ({ handler }),
      template: '<div v-click-outside="handler">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    app.unmount()
    app = undefined
    jest.runAllTimers()
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function), false)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses middleware from a reactive config', async () => {
    const handler = jest.fn()
    const config = ref({ handler, middleware: () => false })
    app = createApp({
      setup: () => ({ config }),
      template: '<div v-click-outside="config">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    config.value = { handler, middleware: () => true }
    await nextTick()
    jest.runAllTimers()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('replaces click with dblclick after a config update', async () => {
    const handler = jest.fn()
    const config = ref({ handler, events: ['click'] })
    app = createApp({
      setup: () => ({ config }),
      template: '<div v-click-outside="config">inside</div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    config.value = { handler, events: ['dblclick'] }
    await nextTick()
    jest.runAllTimers()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    document.body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('captures outside clicks stopped before bubble listeners', () => {
    const captured = jest.fn()
    const bubbled = jest.fn()
    const stop = jest.fn()
    const captureConfig = { handler: captured, capture: true }
    const bubbleConfig = { handler: bubbled, capture: false }
    app = createApp({
      setup: () => ({ captureConfig, bubbleConfig, stop }),
      template:
        '<div><div v-click-outside="captureConfig"></div><div v-click-outside="bubbleConfig"></div><button @click.stop="stop">outside</button></div>',
    })
    app.use(plugin)
    app.mount(container)
    jest.runAllTimers()
    container
      .querySelector('button')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(captured).toHaveBeenCalledTimes(1)
    expect(bubbled).not.toHaveBeenCalled()
  })
})
