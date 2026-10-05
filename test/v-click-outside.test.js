/* global jest describe it expect beforeEach afterEach */

import plugin, * as indexModule from '../src/index'
import directive from '../src/v-click-outside'

const elements = []

function element(parent = document.body) {
  const el = document.createElement('div')
  parent.appendChild(el)
  elements.push(el)
  return el
}

function mount(value, el = element()) {
  directive.beforeMount(el, { value })
  jest.runAllTimers()
  return el
}

function click(target, detail = 0) {
  const event = new MouseEvent('click', { bubbles: true, detail })
  target.dispatchEvent(event)
  return event
}

function pointerdown(target) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
}

function expectRemoved(add, remove) {
  expect(remove).toHaveBeenCalledTimes(add.mock.calls.length)
  add.mock.calls.forEach(([type, listener, options]) => {
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
}

describe('plugin', () => {
  it('registers the directive', () => {
    const app = { directive: jest.fn() }
    plugin.install(app)
    expect(app.directive).toHaveBeenCalledTimes(1)
    expect(app.directive).toHaveBeenCalledWith('click-outside', directive)
    expect(plugin.directive).toBe(directive)
  })

  it('has no named directive export in JavaScript', () => {
    expect(indexModule.directive).toBeUndefined()
  })
})

describe('directive', () => {
  let documentAdd
  let documentRemove
  let windowAdd
  let windowRemove

  beforeEach(() => {
    jest.useFakeTimers()
    documentAdd = jest.spyOn(document.documentElement, 'addEventListener')
    documentRemove = jest.spyOn(document.documentElement, 'removeEventListener')
    windowAdd = jest.spyOn(window, 'addEventListener')
    windowRemove = jest.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    jest.clearAllTimers()
    elements.forEach((el) => {
      directive.unmounted(el)
      el.remove()
    })
    elements.length = 0
    if (Object.prototype.hasOwnProperty.call(document, 'activeElement')) {
      delete document.activeElement
    }
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('exposes Vue 3 hooks and deep tracking', () => {
    expect(typeof directive.beforeMount).toBe('function')
    expect(typeof directive.updated).toBe('function')
    expect(typeof directive.unmounted).toBe('function')
    expect(directive.deep).toBe(true)
    expect(directive).not.toHaveProperty('bind')
    expect(directive).not.toHaveProperty('update')
    expect(directive).not.toHaveProperty('unbind')
  })

  it.each(['click', 1, true])(
    'rejects invalid beforeMount value %p',
    (value) => {
      expect(() => directive.beforeMount(element(), { value })).toThrow(
        'v-click-outside: Binding value must be a function or an object',
      )
    },
  )

  it.each([undefined, null, false])(
    'accepts disabled beforeMount value %p without listeners',
    (value) => {
      expect(() => directive.beforeMount(element(), { value })).not.toThrow()
      jest.runAllTimers()
      expect(documentAdd).not.toHaveBeenCalled()
      expect(windowAdd).not.toHaveBeenCalled()
    },
  )

  it.each([
    {},
    { handler: undefined },
    { handler: null },
    { events: ['click'] },
  ])('accepts object without handler %p without listeners', (value) => {
    expect(() => directive.beforeMount(element(), { value })).not.toThrow()
    jest.runAllTimers()
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
  })

  it.each([{ handler: 'x' }, { handler: 1 }])(
    'rejects a non-function handler %p',
    (value) => {
      expect(() => directive.beforeMount(element(), { value })).toThrow(
        'v-click-outside: Binding value handler must be a function',
      )
    },
  )

  it('accepts an inactive object without a handler', () => {
    mount({ isActive: false })
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
  })

  it('accepts an inactive object with a non-function handler', () => {
    const el = element()
    expect(() =>
      directive.beforeMount(el, {
        value: { handler: 'x', isActive: false },
      }),
    ).not.toThrow()
    jest.runAllTimers()
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
  })

  it('enables a handler after an inactive non-function value', () => {
    const el = mount({ handler: 'x', isActive: false })
    directive.updated(el, { value: { handler: jest.fn() } })
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
  })

  it('registers click on documentElement', () => {
    mount(jest.fn())
    expect(documentAdd).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      false,
    )
  })

  it('defers all registration until the timer', () => {
    directive.beforeMount(element(), { value: jest.fn() })
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
  })

  it('registers nothing for inactive configuration', () => {
    mount({ handler: jest.fn(), isActive: false })
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
  })

  it('registers iframe blur by default', () => {
    mount(jest.fn())
    expect(windowAdd).toHaveBeenCalledWith('blur', expect.any(Function), false)
  })

  it('skips iframe blur when detectIframe is false', () => {
    mount({ handler: jest.fn(), detectIframe: false })
    expect(windowAdd).not.toHaveBeenCalled()
  })

  it('passes capture to configured events and blur', () => {
    mount({ handler: jest.fn(), events: ['mousedown'], capture: true })
    expect(documentAdd).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function),
      true,
    )
    expect(windowAdd).toHaveBeenCalledWith('blur', expect.any(Function), true)
  })

  it('registers pointerdown for click with capture and passive', () => {
    mount(jest.fn())
    expect(documentAdd).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true, passive: true },
    )
  })

  it('skips pointerdown when click is absent', () => {
    mount({ handler: jest.fn(), events: ['mousedown'] })
    expect(documentAdd).toHaveBeenCalledTimes(1)
    expect(documentAdd.mock.calls[0][0]).toBe('mousedown')
  })

  it('uses touchstart by default in a touch environment', () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'ontouchstart')
    Object.defineProperty(window, 'ontouchstart', {
      configurable: true,
      value: null,
    })
    try {
      jest.isolateModules(() => {
        jest.resetModules()
        // eslint-disable-next-line global-require
        const touchDirective = require('../src/v-click-outside').default
        const el = element()
        touchDirective.beforeMount(el, { value: jest.fn() })
        jest.runAllTimers()
        expect(documentAdd).toHaveBeenCalledWith(
          'touchstart',
          expect.any(Function),
          false,
        )
        expect(documentAdd.mock.calls.map(([type]) => type)).toEqual([
          'touchstart',
        ])
        touchDirective.unmounted(el)
      })
    } finally {
      if (previous) {
        Object.defineProperty(window, 'ontouchstart', previous)
      } else {
        delete window.ontouchstart
      }
    }
  })

  it('keeps touch defaults independent across elements', () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'ontouchstart')
    Object.defineProperty(window, 'ontouchstart', {
      configurable: true,
      value: null,
    })
    try {
      jest.isolateModules(() => {
        jest.resetModules()
        // eslint-disable-next-line global-require
        const touchDirective = require('../src/v-click-outside').default
        const firstHandler = jest.fn()
        const secondHandler = jest.fn()
        const first = element()
        const second = element()
        touchDirective.beforeMount(first, { value: firstHandler })
        touchDirective.beforeMount(second, { value: secondHandler })
        jest.runAllTimers()
        expect(documentAdd.mock.calls.map(([type]) => type)).toEqual([
          'touchstart',
          'touchstart',
        ])
        touchDirective.updated(first, {
          value: { handler: firstHandler, events: ['click'] },
        })
        jest.runAllTimers()
        document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))
        expect(firstHandler).not.toHaveBeenCalled()
        expect(secondHandler).toHaveBeenCalledTimes(1)
        touchDirective.unmounted(first)
        touchDirective.unmounted(second)
      })
    } finally {
      if (previous) {
        Object.defineProperty(window, 'ontouchstart', previous)
      } else {
        delete window.ontouchstart
      }
    }
  })

  it('removes document listeners for multiple elements', () => {
    const mounted = [mount(jest.fn()), mount(jest.fn()), mount(jest.fn())]
    mounted.forEach((el) => directive.unmounted(el))
    expectRemoved(documentAdd, documentRemove)
    mounted.forEach((el) => {
      expect(
        Object.prototype.hasOwnProperty.call(el, '__v-click-outside'),
      ).toBe(false)
    })
  })

  it('removes the window listener', () => {
    const el = mount(jest.fn())
    directive.unmounted(el)
    expectRemoved(windowAdd, windowRemove)
  })

  it('removes listeners with the same capture', () => {
    const el = mount({ handler: jest.fn(), capture: true })
    directive.unmounted(el)
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
    expect(documentRemove).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true },
    )
  })

  it('rejects invalid updated values', () => {
    const el = mount(jest.fn())
    expect(() => directive.updated(el, { value: 'invalid' })).toThrow(
      'v-click-outside: Binding value must be a function or an object',
    )
    expect(() => directive.updated(el, { value: 1 })).toThrow(
      'v-click-outside: Binding value must be a function or an object',
    )
    expect(() => directive.updated(el, { value: true })).toThrow(
      'v-click-outside: Binding value must be a function or an object',
    )
    expect(() => directive.updated(el, { value: { handler: 'x' } })).toThrow(
      'v-click-outside: Binding value handler must be a function',
    )
  })

  it('disables and re-enables an object handler through updated', () => {
    const handler = jest.fn()
    const el = mount({ handler })
    expect(() =>
      directive.updated(el, { value: { handler: undefined } }),
    ).not.toThrow()
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
    click(document.body)
    expect(handler).not.toHaveBeenCalled()
    directive.updated(el, { value: { handler } })
    expect(documentAdd).toHaveBeenCalledTimes(2)
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(4)
    expect(windowAdd).toHaveBeenCalledTimes(2)
    click(document.body)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([
    null,
    false,
    {},
    { handler: undefined },
    { handler: null },
    { events: ['click'] },
  ])('accepts disabled updated value %p without new listeners', (value) => {
    const el = mount(jest.fn())
    expect(() => directive.updated(el, { value })).not.toThrow()
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
  })

  it('removes all listeners when updated from a function to undefined', () => {
    const el = mount(jest.fn())
    directive.updated(el, { value: undefined })
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
  })

  it('registers after enabling an undefined binding', () => {
    const el = mount(undefined)
    directive.updated(el, { value: jest.fn() })
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
  })

  it('keeps listeners for active to active', () => {
    const el = mount(jest.fn())
    directive.updated(el, { value: jest.fn() })
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    expect(documentRemove).not.toHaveBeenCalled()
    expect(windowRemove).not.toHaveBeenCalled()
  })

  it('removes listeners for active to inactive', () => {
    const el = mount(jest.fn())
    directive.updated(el, { value: { isActive: false } })
    jest.runAllTimers()
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
  })

  it('adds listeners for inactive to active', () => {
    const el = mount({ isActive: false })
    directive.updated(el, { value: jest.fn() })
    jest.runAllTimers()
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
  })

  it('keeps no listeners for inactive to inactive', () => {
    const el = mount({ isActive: false })
    directive.updated(el, { value: { isActive: false } })
    jest.runAllTimers()
    expect(documentAdd).not.toHaveBeenCalled()
    expect(documentRemove).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
    expect(windowRemove).not.toHaveBeenCalled()
  })

  it('tears down and restores iframe detection', () => {
    const handler = jest.fn()
    const el = mount({ handler })
    directive.updated(el, { value: { handler, detectIframe: false } })
    jest.runAllTimers()
    expect(windowRemove).toHaveBeenCalledTimes(1)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    directive.updated(el, { value: { handler, detectIframe: true } })
    jest.runAllTimers()
    expect(windowAdd).toHaveBeenCalledTimes(2)
    directive.updated(el, { value: { handler, detectIframe: true } })
    jest.runAllTimers()
    expect(windowAdd).toHaveBeenCalledTimes(2)
    expect(windowRemove).toHaveBeenCalledTimes(1)
  })

  it('balances listeners after structural updates and unmounted', () => {
    const handler = jest.fn()
    const el = mount({ handler, events: ['click'] })
    directive.updated(el, {
      value: { handler, events: ['keyup'], capture: true },
    })
    jest.runAllTimers()
    directive.updated(el, {
      value: { handler, events: ['click'], detectIframe: false },
    })
    jest.runAllTimers()
    directive.unmounted(el)
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
  })

  it('calls the handler with an outside click', () => {
    const handler = jest.fn()
    mount(handler)
    const event = click(document.body)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('uses default middleware for an object configuration', () => {
    const handler = jest.fn()
    mount({ handler })
    const event = click(document.body)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('ignores a click inside the element', () => {
    const handler = jest.fn()
    const el = mount(handler)
    click(el)
    expect(handler).not.toHaveBeenCalled()
  })

  it('respects middleware returning false', () => {
    const handler = jest.fn()
    const middleware = jest.fn(() => false)
    mount({ handler, middleware })
    const event = click(document.body)
    expect(middleware).toHaveBeenCalledWith(event)
    expect(handler).not.toHaveBeenCalled()
  })

  it('never reads event.path', () => {
    const handler = jest.fn()
    const el = mount(handler)
    const outside = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(outside, 'path', {
      get: () => {
        throw new Error('path read')
      },
    })
    document.body.dispatchEvent(outside)
    expect(handler).toHaveBeenCalledWith(outside)
    const inside = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(inside, 'path', { value: {} })
    el.dispatchEvent(inside)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('falls back to contains without composedPath', () => {
    const handler = jest.fn()
    const el = mount(handler)
    const child = document.createElement('span')
    el.appendChild(child)
    const inside = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(inside, 'composedPath', { value: undefined })
    child.dispatchEvent(inside)
    const outside = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(outside, 'composedPath', { value: undefined })
    document.body.dispatchEvent(outside)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(outside)
  })

  it('falls back to contains for an empty composedPath', () => {
    const handler = jest.fn()
    const el = mount(handler)
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'composedPath', { value: () => [] })
    el.dispatchEvent(event)
    expect(handler).not.toHaveBeenCalled()
  })

  it('suppresses a dragged click from inside and resets the flag', () => {
    const handler = jest.fn()
    const el = mount(handler)
    pointerdown(el)
    click(document.body, 1)
    expect(handler).not.toHaveBeenCalled()
    pointerdown(document.body)
    click(document.body, 1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('allows a keyboard click after pointerdown inside', () => {
    const handler = jest.fn()
    const el = mount(handler)
    pointerdown(el)
    click(document.body, 0)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('updates drag state after an inside click', () => {
    const handler = jest.fn()
    const el = mount(handler)
    pointerdown(el)
    click(el, 1)
    pointerdown(document.body)
    click(document.body, 1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('uses new handler and middleware without listener changes', () => {
    const oldHandler = jest.fn()
    const newHandler = jest.fn()
    const el = mount({ handler: oldHandler, middleware: () => false })
    directive.updated(el, {
      value: { handler: newHandler, middleware: () => true },
    })
    jest.runAllTimers()
    click(document.body)
    expect(oldHandler).not.toHaveBeenCalled()
    expect(newHandler).toHaveBeenCalledTimes(1)
    expect(documentAdd).toHaveBeenCalledTimes(2)
    expect(windowAdd).toHaveBeenCalledTimes(1)
    expect(documentRemove).not.toHaveBeenCalled()
    expect(windowRemove).not.toHaveBeenCalled()
  })

  it('detects in-place isActive mutation despite equal oldValue', () => {
    const config = { handler: jest.fn(), isActive: true }
    const el = mount(config)
    config.isActive = false
    directive.updated(el, { value: config, oldValue: config })
    jest.runAllTimers()
    expectRemoved(documentAdd, documentRemove)
    expectRemoved(windowAdd, windowRemove)
  })

  it('detects in-place events mutation despite equal oldValue', () => {
    const config = { handler: jest.fn(), events: ['click'] }
    const el = mount(config)
    config.events = ['keyup']
    directive.updated(el, { value: config, oldValue: config })
    jest.runAllTimers()
    expect(documentRemove).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      false,
    )
    expect(documentRemove).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { capture: true },
    )
    expect(documentAdd).toHaveBeenCalledWith(
      'keyup',
      expect.any(Function),
      false,
    )
    expect(documentAdd).toHaveBeenCalledTimes(3)
  })

  it('detects in-place capture mutation despite equal oldValue', () => {
    const config = { handler: jest.fn(), capture: false }
    const el = mount(config)
    config.capture = true
    directive.updated(el, { value: config, oldValue: config })
    jest.runAllTimers()
    expect(documentRemove).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      false,
    )
    expect(documentAdd).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      true,
    )
    expect(windowRemove).toHaveBeenCalledWith(
      'blur',
      expect.any(Function),
      false,
    )
    expect(windowAdd).toHaveBeenCalledWith('blur', expect.any(Function), true)
  })

  it('cancels pending registration before a structural update', () => {
    const el = element()
    directive.beforeMount(el, {
      value: { handler: jest.fn(), events: ['click'] },
    })
    directive.updated(el, {
      value: { handler: jest.fn(), events: ['keyup'] },
    })
    jest.runAllTimers()
    expect(documentAdd.mock.calls.map(([type]) => type)).toEqual(['keyup'])
    expect(windowAdd).toHaveBeenCalledTimes(1)
  })

  it('cancels pending registration on unmounted', () => {
    const el = element()
    directive.beforeMount(el, { value: jest.fn() })
    directive.unmounted(el)
    jest.runAllTimers()
    expect(documentAdd).not.toHaveBeenCalled()
    expect(windowAdd).not.toHaveBeenCalled()
    expect(el).not.toHaveProperty('__v-click-outside')
  })

  it('handles an outside iframe after blur', () => {
    const handler = jest.fn()
    mount(handler)
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: iframe,
    })
    window.dispatchEvent(new Event('blur'))
    expect(handler).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(handler).toHaveBeenCalledTimes(1)
    iframe.remove()
  })

  it('passes an outside iframe blur through middleware', () => {
    const handler = jest.fn()
    const middleware = jest.fn(() => false)
    mount({ handler, middleware })
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: iframe,
    })
    window.dispatchEvent(new Event('blur'))
    jest.runAllTimers()
    expect(middleware).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
    iframe.remove()
  })

  it('ignores an iframe inside the element', () => {
    const handler = jest.fn()
    const el = mount(handler)
    const iframe = document.createElement('iframe')
    el.appendChild(iframe)
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: iframe,
    })
    window.dispatchEvent(new Event('blur'))
    jest.runAllTimers()
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores pending iframe blur after unmounted', () => {
    const handler = jest.fn()
    const el = mount(handler)
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: iframe,
    })
    window.dispatchEvent(new Event('blur'))
    directive.unmounted(el)
    jest.runAllTimers()
    expect(handler).not.toHaveBeenCalled()
    iframe.remove()
  })
})
