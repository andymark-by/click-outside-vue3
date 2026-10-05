import { mkdir, readFile } from 'fs/promises'
import path from 'path'
import { makeDom, waitTimers } from '../lib.mjs'

export const name = 'diff'

const dispatch = (env, selector, type = 'click') => {
  const element = env.window.document.querySelector(selector)
  element.dispatchEvent(
    new env.window.MouseEvent(type, { bubbles: true, detail: 1 }),
  )
}

const mount = (env, template, bindings) => {
  const errors = []
  const app = env.Vue.createApp({ template, setup: () => bindings })
  app.use(env.plugin)
  app.config.errorHandler = (error) => {
    errors.push(error)
  }
  let thrown
  try {
    app.mount(env.window.document.querySelector('#app'))
  } catch (error) {
    thrown = error
  }
  return thrown || errors[0]
}

const mountChecked = (env, template, bindings) => {
  const error = mount(env, template, bindings)
  if (error) {
    throw error
  }
}

const errorInfo = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
})

const scenarios = [
  {
    case: 'touch environment ignores click',
    kind: 'same',
    touch: true,
    expected: 0,
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div v-click-outside="handler"></div><div id="outside"></div></div>',
        {
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return calls
    },
  },
  {
    case: 'touch environment handles touchstart',
    kind: 'same',
    touch: true,
    expected: 1,
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div v-click-outside="handler"></div><div id="outside"></div></div>',
        {
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      env.window.document
        .querySelector('#outside')
        .dispatchEvent(new env.window.Event('touchstart', { bubbles: true }))
      return calls
    },
  },
  {
    case: 'function handler',
    kind: 'same',
    expected: [0, 1],
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div id="inside" v-click-outside="handler"></div><div id="outside"></div></div>',
        {
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#inside')
      const insideCalls = calls
      dispatch(env, '#outside')
      return [insideCalls, calls]
    },
  },
  {
    case: 'middleware false then true',
    kind: 'same',
    expected: [0, 1],
    run: async (env) => {
      let calls = 0
      let allowed = false
      mountChecked(
        env,
        '<div><div id="inside" v-click-outside="config"></div><div id="outside"></div></div>',
        {
          config: {
            handler: () => {
              calls += 1
            },
            middleware: () => allowed,
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      const blockedCalls = calls
      allowed = true
      dispatch(env, '#outside')
      return [blockedCalls, calls]
    },
  },
  {
    case: 'custom dblclick event',
    kind: 'same',
    expected: [0, 1],
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div id="inside" v-click-outside="config"></div><div id="outside"></div></div>',
        {
          config: {
            handler: () => {
              calls += 1
            },
            events: ['dblclick'],
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      const clickCalls = calls
      dispatch(env, '#outside', 'dblclick')
      return [clickCalls, calls]
    },
  },
  {
    case: 'capture and stopped propagation',
    kind: 'same',
    expected: [1, 0],
    run: async (env) => {
      let captured = 0
      let bubbled = 0
      mountChecked(
        env,
        '<div><div v-click-outside="capturedConfig"></div><div v-click-outside="bubbledConfig"></div><div id="outside"></div></div>',
        {
          capturedConfig: {
            handler: () => {
              captured += 1
            },
            capture: true,
          },
          bubbledConfig: {
            handler: () => {
              bubbled += 1
            },
            capture: false,
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      env.window.document
        .querySelector('#outside')
        .addEventListener('click', (event) => event.stopPropagation())
      dispatch(env, '#outside')
      return [captured, bubbled]
    },
  },
  {
    case: 'new isActive config object',
    kind: 'same',
    expected: [0, 1],
    run: async (env) => {
      let calls = 0
      const handler = () => {
        calls += 1
      }
      const config = env.Vue.ref({ handler, isActive: false })
      mountChecked(
        env,
        '<div><div v-click-outside="config"></div><div id="outside"></div></div>',
        { config },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      const inactiveCalls = calls
      config.value = { handler, isActive: true }
      await env.Vue.nextTick()
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return [inactiveCalls, calls]
    },
  },
  {
    case: 'default iframe detection',
    kind: 'same',
    expected: 1,
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div v-click-outside="handler"></div><iframe id="frame"></iframe></div>',
        {
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      const iframe = env.window.document.querySelector('#frame')
      iframe.tabIndex = 0
      iframe.focus()
      env.window.dispatchEvent(new env.window.FocusEvent('blur'))
      await waitTimers(env.window)
      await waitTimers(env.window)
      return calls
    },
  },
  {
    case: 'v-if unmount',
    kind: 'same',
    expected: 0,
    run: async (env) => {
      let calls = 0
      const visible = env.Vue.ref(true)
      mountChecked(
        env,
        '<div><div v-if="visible" v-click-outside="handler"></div><div id="outside"></div></div>',
        {
          visible,
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      visible.value = false
      await env.Vue.nextTick()
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return calls
    },
  },
  {
    case: 'v-for handlers',
    kind: 'same',
    expected: [1, 2],
    run: async (env) => {
      const calls = []
      const handlers = [0, 1, 2].map((index) => () => calls.push(index))
      mountChecked(
        env,
        '<div><div v-for="item in items" :key="item" class="inside" v-click-outside="handlers[item]"></div></div>',
        { items: [0, 1, 2], handlers },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '.inside')
      return calls
    },
  },
  {
    case: 'plugin shape',
    kind: 'same',
    expected: {
      keys: ['install', 'directive'],
      hooks: [true, true, true],
    },
    run: async (env) => ({
      keys: Object.keys(env.plugin),
      hooks: ['beforeMount', 'updated', 'unmounted'].map(
        (hook) => typeof env.plugin.directive[hook] === 'function',
      ),
    }),
  },
  {
    case: 'app.use directive registration',
    kind: 'same',
    expected: true,
    run: async (env) => {
      const app = env.Vue.createApp({ template: '<div></div>' })
      app.use(env.plugin)
      return app.directive('click-outside') !== undefined
    },
  },
  {
    case: 'in-place isActive mutation',
    kind: 'changed',
    oldExpected: [1, 1],
    newExpected: [1, 0],
    run: async (env) => {
      let calls = 0
      const config = env.Vue.reactive({
        handler: () => {
          calls += 1
        },
        isActive: true,
      })
      mountChecked(
        env,
        '<div><div v-click-outside="config"></div><div id="outside"></div></div>',
        { config },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      const beforeCalls = calls
      config.isActive = false
      await env.Vue.nextTick()
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return [beforeCalls, calls - beforeCalls]
    },
  },
  {
    case: 'in-place handler mutation',
    kind: 'changed',
    oldExpected: ['first'],
    newExpected: ['second'],
    run: async (env) => {
      const calls = []
      const config = env.Vue.reactive({
        handler: () => calls.push('first'),
      })
      mountChecked(
        env,
        '<div><div v-click-outside="config"></div><div id="outside"></div></div>',
        { config },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      config.handler = () => calls.push('second')
      await env.Vue.nextTick()
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return calls
    },
  },
  {
    case: 'drag from inside to outside',
    kind: 'changed',
    oldExpected: [1, 1],
    newExpected: [0, 1],
    run: async (env) => {
      let calls = 0
      mountChecked(
        env,
        '<div><div id="inside" v-click-outside="handler"></div><div id="outside"></div></div>',
        {
          handler: () => {
            calls += 1
          },
        },
      )
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#inside', 'pointerdown')
      dispatch(env, '#outside')
      const dragCalls = calls
      dispatch(env, '#outside', 'pointerdown')
      dispatch(env, '#outside')
      return [dragCalls, calls - dragCalls]
    },
  },
  {
    case: 'null binding',
    kind: 'changed',
    oldExpected: { phase: 'mount', name: 'TypeError' },
    newExpected: 0,
    run: async (env) => {
      const error = mount(
        env,
        '<div><div v-click-outside="config"></div><div id="outside"></div></div>',
        {
          config: null,
        },
      )
      if (error) {
        return { phase: 'mount', name: errorInfo(error).name }
      }
      await waitTimers(env.window)
      await waitTimers(env.window)
      let clickError
      env.window.addEventListener('error', (event) => {
        clickError = event.error || new Error(event.message)
        event.preventDefault()
      })
      env.dom.virtualConsole.on('jsdomError', (event) => {
        clickError ||= event.detail || event
      })
      dispatch(env, '#outside')
      return clickError
        ? { phase: 'click', name: errorInfo(clickError).name }
        : 0
    },
  },
  {
    case: 'conditional binding',
    kind: 'changed',
    oldExpected: { phase: 'mount' },
    newExpected: [0, 1],
    run: async (env) => {
      let calls = 0
      const open = env.Vue.ref(false)
      const onOut = () => {
        calls += 1
      }
      const error = mount(
        env,
        '<div><div v-click-outside="open && onOut"></div><div id="outside"></div></div>',
        { open, onOut },
      )
      if (error) {
        return { phase: 'mount' }
      }
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      const beforeCalls = calls
      open.value = true
      await env.Vue.nextTick()
      await waitTimers(env.window)
      await waitTimers(env.window)
      dispatch(env, '#outside')
      return [beforeCalls, calls - beforeCalls]
    },
  },
  {
    case: 'object without handler',
    kind: 'changed',
    oldExpected: { phase: 'click' },
    newExpected: { phase: 'none' },
    run: async (env) => {
      const mountError = mount(
        env,
        '<div><div v-click-outside="config"></div><div id="outside"></div></div>',
        { config: { events: ['click'] } },
      )
      if (mountError) {
        return { phase: 'mount' }
      }
      await waitTimers(env.window)
      await waitTimers(env.window)
      let clickError
      env.window.addEventListener('error', (event) => {
        clickError = event.error || new Error(event.message)
        event.preventDefault()
      })
      env.dom.virtualConsole.on('jsdomError', (error) => {
        clickError ||= error.detail || error
      })
      try {
        dispatch(env, '#outside')
      } catch (error) {
        clickError = error
      }
      return clickError ? { phase: 'click' } : { phase: 'none' }
    },
  },
]

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const execute = async (jsdomDir, vueCode, pluginCode, scenario) => {
  const dom = scenario.touch
    ? makeDom(jsdomDir, { touch: true })
    : makeDom(jsdomDir)
  try {
    const { window } = dom
    window.document.body.innerHTML = '<div id="app"></div>'
    window.eval(vueCode)
    window.eval(pluginCode)
    return await scenario.run({
      dom,
      window,
      Vue: window.Vue,
      plugin: window['v-click-outside'],
    })
  } finally {
    dom.window.close()
  }
}

export async function run(ctx) {
  const results = []
  const dir = path.join(ctx.tmpRoot, name)
  let vueCode
  let oldCode
  let newCode
  try {
    await mkdir(dir, { recursive: true })
    ctx.log('diff: installing published and current packages')
    ctx.npmInstall(dir, [
      'jsdom',
      'vue@latest',
      'old@npm:click-outside-vue3@4.0.1',
      ctx.tarball,
    ])
    vueCode = await readFile(
      path.join(dir, 'node_modules/vue/dist/vue.global.prod.js'),
      'utf8',
    )
    oldCode = await readFile(
      path.join(dir, 'node_modules/old/dist/v-click-outside.umd.js'),
      'utf8',
    )
    newCode = await readFile(
      path.join(
        dir,
        'node_modules/click-outside-vue3/dist/v-click-outside.umd.js',
      ),
      'utf8',
    )
  } catch (error) {
    return [{ case: 'desktop environment' }, ...scenarios].map((scenario) => ({
      suite: name,
      case: scenario.case,
      status: 'fail',
      detail: error.message,
    }))
  }

  try {
    ctx.log('diff: desktop environment')
    const dom = makeDom(dir)
    try {
      const touchAvailable = 'ontouchstart' in dom.window
      results.push({
        suite: name,
        case: 'desktop environment',
        status: touchAvailable ? 'fail' : 'pass',
        detail: `ontouchstart in window=${touchAvailable}`,
      })
    } finally {
      dom.window.close()
    }
  } catch (error) {
    results.push({
      suite: name,
      case: 'desktop environment',
      status: 'fail',
      detail: error.message,
    })
  }

  for (const scenario of scenarios) {
    try {
      ctx.log(`diff: ${scenario.case}`)
      const oldResult = await execute(dir, vueCode, oldCode, scenario)
      const newResult = await execute(dir, vueCode, newCode, scenario)
      let matches
      if (scenario.compare) {
        matches = scenario.compare(oldResult, newResult)
      } else if (scenario.kind === 'same') {
        matches =
          equal(oldResult, newResult) &&
          (!Object.hasOwn(scenario, 'expected') ||
            equal(newResult, scenario.expected))
      } else {
        matches =
          equal(oldResult, scenario.oldExpected) &&
          equal(newResult, scenario.newExpected)
      }
      results.push({
        suite: name,
        case: scenario.case,
        status: matches ? 'pass' : 'fail',
        detail: `old=${JSON.stringify(oldResult)} new=${JSON.stringify(
          newResult,
        )}`,
      })
    } catch (error) {
      results.push({
        suite: name,
        case: scenario.case,
        status: 'fail',
        detail: error.message,
      })
    }
  }
  return results
}
