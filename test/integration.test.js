/* global jest describe it expect beforeEach afterEach */

import { createApp, nextTick, reactive, ref } from 'vue'
import plugin from '../src/index'

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

  it('reacts to in-place isActive changes', async () => {
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
})
