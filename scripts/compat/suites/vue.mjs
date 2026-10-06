import { mkdir, readFile } from 'fs/promises'
import path from 'path'
import { makeDom, shellQuote, waitTimers } from '../lib.mjs'

export const name = 'vue'

const versions = ['3.0.11', '3.1.5', '3.2.47', '3.3.13', '3.4.38', 'latest']

const failureDetail = (result) =>
  [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
    .split(/\r?\n/)
    .slice(-30)
    .join('\n') || `jest exited with code ${result.code}`

const runGlobalBuild = async (jsdomDir, vueCode, pluginCode) => {
  const dom = makeDom(jsdomDir)
  let app
  try {
    const { window } = dom
    window.eval(vueCode)
    window.eval(pluginCode)
    const { Vue } = window
    const plugin = window['v-click-outside']
    let calls = 0
    window.document.body.innerHTML = '<div id="app"></div>'
    app = Vue.createApp({
      template:
        '<div><div id="inside" v-click-outside="onOut"></div><div id="outside"></div></div>',
      setup: () => ({
        onOut: () => {
          calls += 1
        },
      }),
    })
    app.use(plugin)
    app.mount(window.document.querySelector('#app'))
    await waitTimers(window)
    await waitTimers(window)
    window.document
      .querySelector('#inside')
      .dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, detail: 1 }),
      )
    const insideCalls = calls
    window.document
      .querySelector('#outside')
      .dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, detail: 1 }),
      )
    if (insideCalls !== 0 || calls !== 1) {
      throw new Error(`inside=${insideCalls} outside=${calls}`)
    }
  } finally {
    if (app) {
      app.unmount()
    }
    dom.window.close()
  }
}

export async function run(ctx) {
  const results = []
  const suiteDir = path.join(ctx.tmpRoot, name)
  let pluginCode
  let globalSetupError
  try {
    await mkdir(suiteDir, { recursive: true })
    ctx.npmInstall(suiteDir, ['jsdom'])
    pluginCode = await readFile(
      path.join(ctx.repoRoot, 'dist/v-click-outside.umd.js'),
      'utf8',
    )
  } catch (error) {
    globalSetupError = error
  }

  for (const version of versions) {
    const dir = path.join(suiteDir, version)
    let installedVersion
    let installError
    try {
      ctx.log(`vue ${version}: installing`)
      ctx.npmInstall(dir, [`vue@${version}`])
      installedVersion = JSON.parse(
        await readFile(path.join(dir, 'node_modules/vue/package.json'), 'utf8'),
      ).version
    } catch (error) {
      installError = error
    }

    if (installError) {
      for (const caseName of [version, `${version} global build`]) {
        results.push({
          suite: name,
          case: caseName,
          status: 'fail',
          detail: installError.message,
        })
      }
    } else {
      try {
        ctx.log(`vue ${version}: jest`)
        const config = {
          rootDir: ctx.repoRoot,
          roots: ['<rootDir>/test'],
          testMatch: ['**/integration.test.js', '**/ssr.test.js'],
          moduleNameMapper: {
            '^vue$': path.join(dir, 'node_modules/vue/index.js'),
          },
          collectCoverage: false,
        }
        const command = `npx jest --config ${shellQuote(
          JSON.stringify(config),
        )} --runInBand --silent`
        const result = ctx.sh(command, { cwd: ctx.repoRoot })
        results.push({
          suite: name,
          case: version,
          status: result.code === 0 ? 'pass' : 'fail',
          detail:
            result.code === 0
              ? `installed=${installedVersion}`
              : `installed=${installedVersion}; ${failureDetail(result)}`,
        })
      } catch (error) {
        results.push({
          suite: name,
          case: version,
          status: 'fail',
          detail: `installed=${installedVersion}; ${error.message}`,
        })
      }

      try {
        if (globalSetupError) {
          throw globalSetupError
        }
        ctx.log(`vue ${version}: global build`)
        const vueCode = await readFile(
          path.join(dir, 'node_modules/vue/dist/vue.global.prod.js'),
          'utf8',
        )
        await runGlobalBuild(suiteDir, vueCode, pluginCode)
        results.push({
          suite: name,
          case: `${version} global build`,
          status: 'pass',
          detail: `installed=${installedVersion}; inside=0 outside=1`,
        })
      } catch (error) {
        results.push({
          suite: name,
          case: `${version} global build`,
          status: 'fail',
          detail: `installed=${installedVersion}; ${error.message}`,
        })
      }
    }
  }
  return results
}
