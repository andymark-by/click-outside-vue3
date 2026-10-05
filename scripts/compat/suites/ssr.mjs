import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { makeDom, tail, waitTimers } from '../lib.mjs'

export const name = 'ssr'

const versions = ['3.0.11', '3.2.47', 'latest']

const componentTemplate = [
  '<div>',
  '<div id="inside" v-click-outside="onOut">in</div>',
  '<button id="outside">out</button>',
  '</div>',
].join('')

function serverSource(rendererPackage) {
  return `const { createSSRApp } = require('vue')
const { renderToString } = require('${rendererPackage}')
const plugin = require('click-outside-vue3')
const warnings = []
const Comp = {
  template: '${componentTemplate}',
  setup() { return { onOut() {} } }
}
const app = createSSRApp(Comp).use(plugin)
app.config.warnHandler = (message) => { warnings.push(String(message)) }
renderToString(app)
  .then((html) => { console.log(JSON.stringify({ html, warnings })) })
  .catch((error) => { console.error(error); process.exitCode = 1 })
`
}

const clientSource = `window.__ssrCompat = { calls: 0, warnings: [] }
const Comp = {
  template: '${componentTemplate}',
  setup() {
    return { onOut() { window.__ssrCompat.calls += 1 } }
  }
}
const app = window.Vue.createSSRApp(Comp).use(window['v-click-outside'])
app.config.warnHandler = (message) => {
  window.__ssrCompat.warnings.push(String(message))
}
app.mount('#app')
`

function installedVersion(dir) {
  const packagePath = path.join(dir, 'node_modules', 'vue', 'package.json')
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version
}

function serverRender(ctx, dir, rendererPackage) {
  fs.writeFileSync(
    path.join(dir, 'ssr-server.cjs'),
    serverSource(rendererPackage),
  )
  const rendered = ctx.sh('node ssr-server.cjs', { cwd: dir })
  if (rendered.code !== 0) {
    throw new Error(tail(`${rendered.stdout}\n${rendered.stderr}`, 8))
  }

  const line = rendered.stdout.trim().split('\n').pop()
  const result = JSON.parse(line)
  if (!result.html || !result.html.includes('id="inside"')) {
    throw new Error('SSR output is missing the inside element')
  }
  if (
    result.warnings.some((warning) => /click-outside|directive/i.test(warning))
  ) {
    throw new Error(`SSR directive warning: ${result.warnings.join('; ')}`)
  }
  return result.html
}

async function hydrate(dir, html) {
  const requireFromDir = createRequire(path.join(dir, 'package.json'))
  const vueCode = fs.readFileSync(
    requireFromDir.resolve('vue/dist/vue.global.js'),
    'utf8',
  )
  const pluginCode = fs.readFileSync(
    requireFromDir.resolve('click-outside-vue3'),
    'utf8',
  )
  const dom = makeDom(dir)
  const { window } = dom
  const consoleWarnings = []
  try {
    window.console.warn = (...args) => {
      consoleWarnings.push(args.map(String).join(' '))
    }
    window.document.body.innerHTML = `<div id="app">${html}</div>`
    window.eval(vueCode)
    window.eval(pluginCode)
    window.eval(clientSource)
    await waitTimers(window, 10)

    const state = Object.getOwnPropertyDescriptor(window, '__ssrCompat')?.value
    const inside = window.document.getElementById('inside')
    const outside = window.document.getElementById('outside')
    if (!state || !inside || !outside) {
      throw new Error('Hydration did not render click targets')
    }

    inside.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, detail: 1 }),
    )
    if (state.calls !== 0) {
      throw new Error(`Inside click called handler ${state.calls} times`)
    }
    outside.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, detail: 1 }),
    )
    if (state.calls !== 1) {
      throw new Error(`Outside click called handler ${state.calls} times`)
    }

    const mismatches = [
      ...consoleWarnings,
      ...state.warnings,
    ].filter((warning) => /hydration|mismatch/i.test(warning))
    if (mismatches.length > 0) {
      throw new Error(`Hydration warning: ${mismatches[0]}`)
    }
  } finally {
    window.close()
  }
}

export async function run(ctx) {
  const results = []
  for (const version of versions) {
    const dir = path.join(ctx.tmpRoot, name, `vue-${version}`)
    const caseName = `vue${version}`
    ctx.log(`ssr: ${caseName}`)
    try {
      const packages = ['jsdom', `vue@${version}`, ctx.tarball]
      if (version === '3.0.11') {
        packages.push('@vue/server-renderer@3.0.11')
      }
      ctx.npmInstall(dir, packages)
      const rendererPackage =
        version === '3.0.11' ? '@vue/server-renderer' : 'vue/server-renderer'
      const html = serverRender(ctx, dir, rendererPackage)
      await hydrate(dir, html)
      results.push({
        suite: name,
        case: caseName,
        status: 'pass',
        detail: `SSR and hydration worked with Vue ${installedVersion(dir)}`,
      })
    } catch (error) {
      results.push({
        suite: name,
        case: caseName,
        status: 'fail',
        detail: tail(error.message, 3),
      })
    }
  }
  return results
}
