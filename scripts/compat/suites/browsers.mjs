import fs from 'fs'
import path from 'path'
import { cleanupState, shellQuote, tail } from '../lib.mjs'

export const name = 'browsers'

const PLAYWRIGHT_VERSION = '1.62.1'
const browserNames = ['chromium', 'firefox', 'webkit']
const scenarioNames = [
  'inside-outside',
  'drag',
  'keyboard',
  'in-place-isActive',
  'handler-swap',
  'iframe',
  'unmount',
  'touch',
]
const expectedCases = browserNames.flatMap((browser) =>
  scenarioNames
    .filter((scenario) => scenario !== 'touch' || browser !== 'firefox')
    .map((scenario) => `${browser}/${scenario}`),
)

const runnerSource = String.raw`
const fs = require('fs')
const playwright = require('playwright')

const browserNames = ['chromium', 'firefox', 'webkit']
const scenarioNames = [
  'inside-outside',
  'drag',
  'keyboard',
  'in-place-isActive',
  'handler-swap',
  'iframe',
  'unmount',
  'touch',
]
const vueCode = fs.readFileSync(
  'node_modules/vue/dist/vue.global.prod.js',
  'utf8',
)
const pluginCode = fs.readFileSync(
  'node_modules/click-outside-vue3/dist/v-click-outside.umd.js',
  'utf8',
)

function progress(state, label) {
  state.step = label
  fs.writeSync(
    2,
    '[' + state.browser + '/' + state.scenario + '] ' +
      label +
      ' +' +
      (Date.now() - state.started) +
      'ms\n',
  )
}

async function step(state, label, action) {
  if (state.cancelled) {
    throw new Error('scenario cancelled')
  }
  progress(state, label)
  return action()
}

function withLimit(action, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(typeof message === 'function' ? message() : message))
    }, Math.max(1, ms))
  })
  return Promise.race([Promise.resolve().then(action), timeout]).finally(() => {
    clearTimeout(timer)
  })
}

async function closeLimited(target, state, label) {
  if (!target) {
    return
  }
  try {
    await withLimit(
      () => {
        progress(state, label)
        return target.close()
      },
      5000,
      label + ' timeout',
    )
  } catch (error) {
    progress(state, label + ' failed: ' + error.message)
  }
}

function removeTouchStart() {
  let current = window
  while (current !== null) {
    if (Object.prototype.hasOwnProperty.call(current, 'ontouchstart')) {
      delete current.ontouchstart
    }
    current = Object.getPrototypeOf(current)
  }
}

async function probeNative(browser, state, deadline) {
  let context
  try {
    const remaining = deadline - Date.now()
    return await withLimit(async () => {
      context = await step(state, 'native newContext', () =>
        browser.newContext(),
      )
      const page = await step(state, 'native newPage', () => context.newPage())
      page.setDefaultTimeout(10000)
      page.setDefaultNavigationTimeout(10000)
      return step(state, 'native evaluate', () =>
        page.evaluate(() => ({
          ontouchstart: 'ontouchstart' in window,
          maxTouchPoints: Number(navigator.maxTouchPoints || 0),
        })),
      )
    }, Math.min(30000, remaining), () =>
      remaining <= 30000 ? 'browser time limit' : 'native probe timeout',
    )
  } finally {
    await closeLimited(context, state, 'native close context')
  }
}

async function setupPage(page, scenario, state) {
  await step(state, 'setContent', () =>
    page.setContent(
      '<!doctype html><html><body><div id="app"></div></body></html>',
    ),
  )
  const environment = await step(state, 'environment', () =>
    page.evaluate(() => ({
      hasTouch: 'ontouchstart' in window,
      maxTouchPoints: Number(navigator.maxTouchPoints || 0),
    })),
  )
  if (scenario !== 'touch' && environment.hasTouch) {
    throw new Error(
      'desktop ontouchstart remains true, maxTouchPoints=' +
        environment.maxTouchPoints,
    )
  }
  await step(state, 'load Vue', () => page.addScriptTag({ content: vueCode }))
  await step(state, 'load plugin', () =>
    page.addScriptTag({ content: pluginCode }),
  )
  await step(state, 'mount app', () => page.evaluate(() => {
    const { createApp, reactive, ref } = window.Vue
    const counts = { a: 0, b: 0 }
    const handlerA = () => {
      counts.a += 1
    }
    const handlerB = () => {
      counts.b += 1
    }
    const config = reactive({ handler: handlerA, isActive: true })
    const mounted = ref(true)
    window.__t = { counts, config, mounted, handlerB, raw: [] }
    document.addEventListener(
      'pointerdown',
      (event) => {
        window.__t.raw.push({ type: 'pointerdown', target: event.target.id })
      },
      true,
    )
    document.addEventListener(
      'click',
      (event) => {
        window.__t.raw.push({ type: 'click', target: event.target.id })
      },
      true,
    )
    window.addEventListener('blur', () => {
      window.__t.raw.push({ type: 'blur' })
    })
    window.addEventListener('focus', () => {
      window.__t.raw.push({ type: 'focus' })
    })
    const template =
      '<div id="box" v-if="mounted" v-click-outside="config">' +
      '<input id="inner" value="some long text to select by dragging">' +
      '<button id="inner-btn">in</button></div>' +
      '<div id="zone" style="height:120px">zone</div>' +
      '<button id="outside-btn">out</button>' +
      '<iframe id="frame" srcdoc="<button>in frame</button>" ' +
      'style="width:200px;height:80px"></iframe>'
    const app = createApp({
      template,
      setup: () => ({ config, mounted }),
    })
    app.use(window['v-click-outside'])
    app.mount('#app')
  }))
  await step(state, 'mount wait', () => page.waitForTimeout(50))
  return environment
}

async function observe(page, scenario, environment, state) {
  if (scenario === 'inside-outside') {
    await step(state, 'inside click', () => page.click('#inner-btn'))
    const inside = await step(state, 'inside count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    await step(state, 'outside click', () => page.click('#zone'))
    const outside = await step(state, 'outside count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    return [inside, outside]
  }
  if (scenario === 'drag') {
    const inner = await step(state, 'inner bounds', () =>
      page.locator('#inner').boundingBox(),
    )
    const zone = await step(state, 'zone bounds', () =>
      page.locator('#zone').boundingBox(),
    )
    if (!inner || !zone) {
      throw new Error('drag targets have no bounding boxes')
    }
    await step(state, 'mouse to inner', () =>
      page.mouse.move(inner.x + inner.width / 2, inner.y + inner.height / 2),
    )
    await step(state, 'mouse down', () => page.mouse.down())
    await step(state, 'mouse drag', () =>
      page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, {
        steps: 10,
      }),
    )
    await step(state, 'mouse up', () => page.mouse.up())
    await step(state, 'drag wait', () => page.waitForTimeout(50))
    const afterDrag = await step(state, 'drag count', () =>
      page.evaluate(() => ({
        calls: window.__t.counts.a,
        dragClick: window.__t.raw.some((event) => event.type === 'click'),
      })),
    )
    await step(state, 'ordinary click', () => page.click('#zone'))
    const afterOrdinary = await step(state, 'ordinary count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    return {
      drag: afterDrag.calls,
      ordinary: afterOrdinary - afterDrag.calls,
      dragClick: afterDrag.dragClick,
    }
  }
  if (scenario === 'keyboard') {
    await step(state, 'inner click', () => page.click('#inner'))
    await step(state, 'outside focus', () => page.focus('#outside-btn'))
    await step(state, 'Enter', () => page.keyboard.press('Enter'))
    return step(state, 'keyboard count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
  }
  if (scenario === 'in-place-isActive') {
    await step(state, 'deactivate', () => page.evaluate(() => {
      window.__t.config.isActive = false
    }))
    await step(state, 'deactivate wait', () => page.waitForTimeout(50))
    await step(state, 'inactive click', () => page.click('#zone'))
    const inactive = await step(state, 'inactive count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    await step(state, 'activate', () => page.evaluate(() => {
      window.__t.config.isActive = true
    }))
    await step(state, 'activate wait', () => page.waitForTimeout(50))
    await step(state, 'active click', () => page.click('#zone'))
    const active = await step(state, 'active count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    return [inactive, active - inactive]
  }
  if (scenario === 'handler-swap') {
    await step(state, 'swap handler', () => page.evaluate(() => {
      window.__t.config.handler = window.__t.handlerB
    }))
    await step(state, 'swap wait', () => page.waitForTimeout(50))
    await step(state, 'swapped click', () => page.click('#zone'))
    return step(state, 'handler counts', () =>
      page.evaluate(() => window.__t.counts),
    )
  }
  if (scenario === 'iframe') {
    await step(state, 'baseline click', () => page.click('#zone'))
    const before = await step(state, 'baseline count', () =>
      page.evaluate(() => {
        const calls = window.__t.counts.a
        window.__t.counts.a = 0
        window.__t.raw.length = 0
        return calls
      }),
    )
    await step(state, 'iframe click', () =>
      page.frameLocator('#frame').locator('button').click(),
    )
    await step(state, 'iframe wait', () => page.waitForTimeout(100))
    const after = await step(state, 'iframe count', () =>
      page.evaluate(() => ({
        calls: window.__t.counts.a,
        windowEvents: window.__t.raw
          .filter((event) => event.type === 'blur' || event.type === 'focus')
          .map((event) => event.type),
      })),
    )
    return { before, after: after.calls, windowEvents: after.windowEvents }
  }
  if (scenario === 'unmount') {
    await step(state, 'pre-unmount click', () => page.click('#zone'))
    const before = await step(state, 'pre-unmount count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    await step(state, 'unmount', () => page.evaluate(() => {
      window.__t.mounted.value = false
    }))
    await step(state, 'unmount wait', () => page.waitForTimeout(50))
    await step(state, 'post-unmount click', () => page.click('#zone'))
    const after = await step(state, 'post-unmount count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    return [before, after - before]
  }
  if (scenario === 'touch') {
    await step(state, 'outside tap', () => page.tap('#zone'))
    const outside = await step(state, 'outside count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    await step(state, 'inside tap', () => page.tap('#inner-btn'))
    const inside = await step(state, 'inside count', () =>
      page.evaluate(() => window.__t.counts.a),
    )
    return {
      hasTouch: environment.hasTouch,
      maxTouchPoints: environment.maxTouchPoints,
      calls: [outside, inside - outside],
    }
  }
  throw new Error('unknown scenario: ' + scenario)
}

async function runScenario(browser, browserName, scenario, state) {
  if (scenario === 'touch') {
    if (browserName === 'chromium') {
      state.context = await step(state, 'new touch context', () =>
        browser.newContext({ hasTouch: true, isMobile: true }),
      )
    } else {
      state.context = await step(state, 'new touch context', () =>
        browser.newContext({ hasTouch: true }),
      )
    }
  } else {
    state.context = await step(state, 'new context', () =>
      browser.newContext(),
    )
  }
  if (scenario !== 'touch') {
    await step(state, 'context init script', () =>
      state.context.addInitScript(removeTouchStart),
    )
  }
  state.page = await step(state, 'new page', () => state.context.newPage())
  state.page.setDefaultTimeout(10000)
  state.page.setDefaultNavigationTimeout(10000)
  if (scenario !== 'touch') {
    await step(state, 'page init script', () =>
      state.page.addInitScript(removeTouchStart),
    )
  }
  const environment = await setupPage(state.page, scenario, state)
  return observe(state.page, scenario, environment, state)
}

async function main() {
  const rows = []
  for (const browserName of browserNames) {
    const started = Date.now()
    const deadline = started + 120000
    const cases = scenarioNames.filter(
      (scenario) => scenario !== 'touch' || browserName !== 'firefox',
    )
    const launchState = {
      browser: browserName,
      scenario: 'launch',
      started,
      step: 'launch',
    }
    let browser
    let launchError
    try {
      browser = await withLimit(
        () => step(launchState, 'launch', () =>
          playwright[browserName].launch({
            headless: true,
            timeout: 60000,
          }),
        ),
        60000,
        'launch timeout',
      )
    } catch (error) {
      launchError = error
    }
    if (launchError) {
      for (const scenario of cases) {
        rows.push({
          browser: browserName,
          scenario,
          version: 'unavailable',
          native: {
            ontouchstart: 'unavailable',
            maxTouchPoints: 'unavailable',
          },
          error: launchError.message,
          launchError: true,
        })
      }
    } else {
      const version = browser.version()
      let native = {
        ontouchstart: 'unavailable',
        maxTouchPoints: 'unavailable',
      }
      let probeError
      try {
        native = await probeNative(
          browser,
          { browser: browserName, scenario: 'native', started },
          deadline,
        )
      } catch (error) {
        probeError = error
      }
      for (const scenario of cases) {
        if (Date.now() >= deadline) {
          rows.push({
            browser: browserName,
            scenario,
            version,
            native,
            error: 'browser time limit',
          })
        } else if (probeError) {
          rows.push({
            browser: browserName,
            scenario,
            version,
            native,
            error: 'native probe failed: ' + probeError.message,
          })
        } else {
          const state = {
            browser: browserName,
            scenario,
            started: Date.now(),
            step: 'start',
          }
          const remaining = deadline - Date.now()
          try {
            const observed = await withLimit(
              () => runScenario(browser, browserName, scenario, state),
              Math.min(30000, remaining),
              () =>
                remaining <= 30000
                  ? 'browser time limit'
                  : 'timeout at step ' + state.step,
            )
            rows.push({
              browser: browserName,
              scenario,
              version,
              native,
              observed,
            })
          } catch (error) {
            state.cancelled = true
            const message =
              error.name === 'TimeoutError' ||
              /Timeout .*exceeded/.test(error.message)
                ? 'timeout at step ' + state.step
                : error.message
            rows.push({
              browser: browserName,
              scenario,
              version,
              native,
              error: message,
            })
          } finally {
            await closeLimited(state.page, state, 'close page')
            await closeLimited(state.context, state, 'close context')
          }
        }
      }
      await closeLimited(browser, launchState, 'close browser')
    }
  }
  return rows
}

main()
  .then((rows) => {
    process.stdout.write(JSON.stringify(rows) + '\n', () => process.exit(0))
  })
  .catch((error) => {
    process.stdout.write(
      JSON.stringify({ fatal: error.message }) + '\n',
      () => process.exit(0),
    )
  })
`

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const matches = (scenario, observed) => {
  if (scenario === 'inside-outside') {
    return equal(observed, [0, 1])
  }
  if (scenario === 'drag') {
    return observed && observed.drag === 0 && observed.ordinary === 1
  }
  if (scenario === 'keyboard') {
    return observed === 1
  }
  if (scenario === 'in-place-isActive') {
    return equal(observed, [0, 1])
  }
  if (scenario === 'handler-swap') {
    return equal(observed, { a: 0, b: 1 })
  }
  if (scenario === 'iframe') {
    return observed && observed.before === 1 && observed.after === 1
  }
  if (scenario === 'unmount') {
    return equal(observed, [1, 0])
  }
  if (scenario === 'touch') {
    return observed && equal(observed.calls, [1, 0])
  }
  return false
}

const failAll = (detail) =>
  expectedCases.map((caseName) => ({
    suite: name,
    case: caseName,
    status: 'fail',
    detail,
  }))

const addProgress = (results, stderr) => {
  const lines = stderr ? String(stderr).trim().split(/\r?\n/) : []
  const fallbackSeen = new Set()
  return results.map((result) => {
    if (result.status !== 'fail') {
      return result
    }
    const [browser, scenario] = result.case.split('/')
    const caseLines = lines.filter((line) =>
      line.startsWith(`[${browser}/${scenario}]`),
    )
    if (caseLines.length > 0) {
      return {
        ...result,
        detail: `${result.detail}; stderr: ${caseLines.slice(-15).join('\n')}`,
      }
    }
    let detail = `${result.detail}; not reached`
    if (!fallbackSeen.has(browser)) {
      fallbackSeen.add(browser)
      const browserLines = lines.filter((line) =>
        line.startsWith(`[${browser}/`),
      )
      if (browserLines.length > 0) {
        detail += `; last step: ${browserLines[browserLines.length - 1]}`
      }
    }
    return {
      ...result,
      detail,
    }
  })
}

export async function run(ctx) {
  const dir = path.join(ctx.tmpRoot, name)
  try {
    ctx.log('browsers: installing Playwright, Vue and package')
    ctx.npmInstall(dir, [
      `playwright@${PLAYWRIGHT_VERSION}`,
      'vue@latest',
      ctx.tarball,
    ])
    fs.writeFileSync(path.join(dir, 'run.cjs'), runnerSource)
    const hasDocker =
      ctx.sh('docker version', { cwd: dir, timeoutSec: 20 }).code === 0
    const containerName = `click-outside-compat-${process.pid}-${Date.now()}`
    const image = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`
    const command = hasDocker
      ? `docker run --rm --init --name ${shellQuote(
          containerName,
        )} --ipc=host -v ${shellQuote(`${dir}:/work`)} -w /work ${shellQuote(
          image,
        )} node run.cjs`
      : 'node run.cjs'
    ctx.log(`browsers: ${hasDocker ? 'Docker' : 'host'} execution`)
    let result
    if (hasDocker) {
      cleanupState.containers.add(containerName)
    }
    try {
      result = ctx.sh(command, {
        cwd: dir,
        timeoutSec: 480,
      })
    } finally {
      if (hasDocker) {
        const removed = ctx.sh(`docker rm -f ${shellQuote(containerName)}`, {
          cwd: dir,
          timeoutSec: 10,
        })
        const removeOutput = `${removed.stdout}\n${removed.stderr}`
        if (removed.code !== 0 && !/no such container/i.test(removeOutput)) {
          ctx.log(
            `browsers: container cleanup failed: ${tail(removeOutput, 1)}`,
          )
        } else {
          cleanupState.containers.delete(containerName)
        }
      }
    }
    const hint = hasDocker ? '' : '; run npx playwright install'
    if (result.code !== 0) {
      return addProgress(
        failAll(`browser runner exited with code ${result.code}${hint}`),
        result.stderr,
      )
    }
    let rows
    try {
      const jsonLine = result.stdout
        .trim()
        .split(/\r?\n/)
        .reverse()
        .find((line) => line.startsWith('[') || line.startsWith('{'))
      rows = JSON.parse(jsonLine)
    } catch (error) {
      return addProgress(
        failAll(`cannot parse browser results: ${error.message}`),
        result.stderr,
      )
    }
    if (!Array.isArray(rows)) {
      return addProgress(
        failAll(rows.fatal || 'browser results are not an array'),
        result.stderr,
      )
    }
    const byCase = new Map(
      rows.map((row) => [`${row.browser}/${row.scenario}`, row]),
    )
    const results = expectedCases.map((caseName) => {
      const row = byCase.get(caseName)
      if (!row) {
        return {
          suite: name,
          case: caseName,
          status: 'fail',
          detail: 'browser result missing',
        }
      }
      const native = row.native || {}
      const nativeDetail = `native ontouchstart=${
        native.ontouchstart ?? 'unavailable'
      }, maxTouchPoints=${native.maxTouchPoints ?? 'unavailable'}`
      let detail = row.error
        ? `version=${row.version}; ${nativeDetail}; ${row.error}${
            !hasDocker && row.launchError ? '; run npx playwright install' : ''
          }`
        : `version=${row.version}; ${nativeDetail}; observed=${JSON.stringify(
            row.observed,
          )}`
      if (
        !row.error &&
        row.scenario === 'drag' &&
        row.observed &&
        !row.observed.dragClick
      ) {
        detail += '; no drag click (rule not exercised)'
      }
      if (!row.error && row.scenario === 'touch' && row.observed) {
        detail += `; ontouchstart in window=${row.observed.hasTouch}, maxTouchPoints=${row.observed.maxTouchPoints}`
        if (!row.observed.hasTouch) {
          detail +=
            '; engine does not expose ontouchstart in touch emulation; default stays click'
        }
      }
      const missingIframeBlur =
        hasDocker &&
        !row.error &&
        row.scenario === 'iframe' &&
        row.observed &&
        row.observed.before === 1 &&
        row.observed.after === 0 &&
        Array.isArray(row.observed.windowEvents) &&
        !row.observed.windowEvents.includes('blur')
      if (missingIframeBlur) {
        detail += '; window blur not dispatched in this environment'
      }
      let status =
        !row.error && matches(row.scenario, row.observed) ? 'pass' : 'fail'
      if (missingIframeBlur) {
        status = 'warn'
      }
      if (
        !row.error &&
        row.scenario === 'touch' &&
        row.observed &&
        !row.observed.hasTouch &&
        matches(row.scenario, row.observed)
      ) {
        status = 'warn'
      }
      return {
        suite: name,
        case: caseName,
        status,
        detail,
      }
    })
    return addProgress(results, result.stderr)
  } catch (error) {
    return failAll(tail(error.message, 8))
  }
}
