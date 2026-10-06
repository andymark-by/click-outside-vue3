const HANDLERS_PROPERTY = '__v-click-outside'
const HAS_WINDOW = typeof window !== 'undefined'
const HAS_NAVIGATOR = typeof navigator !== 'undefined'
const IS_TOUCH =
  HAS_WINDOW &&
  ('ontouchstart' in window ||
    (HAS_NAVIGATOR && navigator.msMaxTouchPoints > 0))
const EVENTS = IS_TOUCH ? ['touchstart'] : ['click']

const isInside = (el, event) => {
  if (typeof event.composedPath === 'function') {
    const path = event.composedPath()
    if (Array.isArray(path) && path.length > 0) {
      return path.indexOf(el) !== -1
    }
  }
  return el.contains(event.target)
}

const normalize = (value) => {
  const binding = typeof value === 'function' ? { handler: value } : value
  const source =
    binding === undefined || binding === null || binding === false
      ? {}
      : binding
  if (typeof source !== 'object' || source === null) {
    throw new Error(
      'v-click-outside: Binding value must be a function or an object',
    )
  }
  const hasHandler = source.handler !== undefined && source.handler !== null
  if (
    source.isActive !== false &&
    hasHandler &&
    typeof source.handler !== 'function'
  ) {
    throw new Error('v-click-outside: Binding value handler must be a function')
  }
  if (
    source.isActive !== false &&
    hasHandler &&
    source.events &&
    !Array.isArray(source.events)
  ) {
    throw new Error('v-click-outside: Binding value events must be an array')
  }
  return {
    handler: source.handler,
    middleware: source.middleware || (() => true),
    events: Array.isArray(source.events) ? source.events : EVENTS,
    isActive: source.isActive !== false && hasHandler,
    detectIframe: source.detectIframe !== false,
    capture: Boolean(source.capture),
  }
}

const getState = (el, key) => {
  const states = el[HANDLERS_PROPERTY] || []
  return states.filter((state) => state.key === key)[0]
}

const teardown = (el, key) => {
  const state = getState(el, key)
  if (!state) {
    return
  }
  if (state.timeout !== null) {
    clearTimeout(state.timeout)
  }
  if (state.registered) {
    state.listeners.forEach(
      ({ target, eventName, listener, removeOptions }) => {
        target.removeEventListener(eventName, listener, removeOptions)
      },
    )
  }
  const states = el[HANDLERS_PROPERTY].filter((item) => item !== state)
  if (states.length > 0) {
    el[HANDLERS_PROPERTY] = states
  } else {
    delete el[HANDLERS_PROPERTY]
  }
}

const mount = (el, key, config) => {
  const state = {
    key,
    config: { ...config, events: [...config.events] },
    listeners: [],
    timeout: null,
    registered: false,
    pointerDownInside: false,
  }
  el[HANDLERS_PROPERTY] = (el[HANDLERS_PROPERTY] || []).concat(state)
  if (!config.isActive) {
    return
  }

  const onEvent = (event) => {
    // A press that started inside and ended outside is a drag (e.g. text
    // selection), not a click outside. Keyboard-triggered clicks have detail 0.
    const isDrag =
      event.type === 'click' && event.detail !== 0 && state.pointerDownInside
    if (event.type === 'click') {
      state.pointerDownInside = false
    }
    if (isDrag || isInside(el, event)) {
      return
    }
    if (state.config.middleware(event)) {
      state.config.handler(event)
    }
  }
  const onPointerDown = (event) => {
    state.pointerDownInside = isInside(el, event)
  }
  const onBlur = (event) => {
    // Note: on firefox clicking on iframe triggers blur, but only on
    //       next event loop it becomes document.activeElement
    // https://stackoverflow.com/q/2381336#comment61192398_23231136
    setTimeout(() => {
      if (getState(el, key) !== state) {
        return
      }
      const { activeElement } = document
      if (
        activeElement &&
        activeElement.tagName === 'IFRAME' &&
        !el.contains(activeElement) &&
        state.config.middleware(event)
      ) {
        state.config.handler(event)
      }
    }, 0)
  }

  state.listeners = state.config.events.map((eventName) => ({
    target: document.documentElement,
    eventName,
    listener: onEvent,
    addOptions: state.config.capture,
    removeOptions: state.config.capture,
  }))
  if (state.config.detectIframe) {
    state.listeners.push({
      target: window,
      eventName: 'blur',
      listener: onBlur,
      addOptions: state.config.capture,
      removeOptions: state.config.capture,
    })
  }
  if (state.config.events.indexOf('click') !== -1) {
    state.listeners.push({
      target: document.documentElement,
      eventName: 'pointerdown',
      listener: onPointerDown,
      addOptions: { capture: true, passive: true },
      removeOptions: { capture: true },
    })
  }

  // Note: More info about this implementation can be found here:
  //       https://github.com/ndelvalle/v-click-outside/issues/137
  state.timeout = setTimeout(() => {
    state.timeout = null
    state.listeners.forEach(({ target, eventName, listener, addOptions }) => {
      target.addEventListener(eventName, listener, addOptions)
    })
    state.registered = true
  }, 0)
}

// A component can have the directive on its root element while its parent
// adds another one to the component, so state is kept per owning instance.
const beforeMount = (el, { value, instance }) => {
  const config = normalize(value)
  teardown(el, instance)
  mount(el, instance, config)
}

const updated = (el, { value, instance }) => {
  const config = normalize(value)
  const state = getState(el, instance)
  // Compare with the stored snapshot, not binding.oldValue: when the config
  // object is mutated in place, oldValue and value are the same object.
  if (
    state &&
    state.config.isActive === config.isActive &&
    state.config.detectIframe === config.detectIframe &&
    state.config.capture === config.capture &&
    state.config.events.length === config.events.length &&
    state.config.events.every(
      (eventName, index) => eventName === config.events[index],
    )
  ) {
    state.config.handler = config.handler
    state.config.middleware = config.middleware
    return
  }
  teardown(el, instance)
  mount(el, instance, config)
}

const unmounted = (el, { instance } = {}) => {
  teardown(el, instance)
}

export default HAS_WINDOW ? { beforeMount, updated, unmounted, deep: true } : {}
