import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { makeDom, tail, waitTimers } from '../lib.mjs'

export const name = 'bundlers'

const appBody = `window.__compat = {
  calls: 0,
  shape: {
    install: typeof vClickOutside.install,
    beforeMount: typeof vClickOutside.directive.beforeMount
  }
}
const Root = {
  render() {
    return h('div', { id: 'root' }, [
      withDirectives(
        h('div', { id: 'inside' }),
        [[resolveDirective('click-outside'), () => { window.__compat.calls += 1 }]]
      ),
      h('div', { id: 'outside' })
    ])
  }
}
createApp(Root).use(vClickOutside).mount('#app')
`

const entrySource = `import { createApp, h, withDirectives, resolveDirective } from 'vue'
import vClickOutside from 'click-outside-vue3'
${appBody}`

const scriptSource = `const { createApp, h, withDirectives, resolveDirective } = window.Vue
const vClickOutside = window['v-click-outside']
${appBody}`

const webpackConfig = `const path = require('path')
module.exports = {
  mode: 'production',
  target: 'web',
  entry: path.resolve(__dirname, 'entry.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  }
}
`

const viteConfig = `import { defineConfig } from 'vite'
import path from 'path'
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    lib: {
      entry: path.resolve('entry.js'),
      formats: ['iife'],
      name: 'CompatApp',
      fileName: () => 'bundle.js'
    },
    outDir: 'dist'
  }
})
`

const rollupConfig = `import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'
export default {
  input: 'entry.js',
  plugins: [
    replace({ 'process.env.NODE_ENV': JSON.stringify('production'), preventAssignment: true }),
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs()
  ],
  output: { file: 'dist/bundle.js', format: 'iife', name: 'CompatApp' }
}
`

async function checkBrowser(dir, scripts, expectGlobal = false) {
  const dom = makeDom(dir)
  const { window } = dom
  const desktop = !('ontouchstart' in window)
  try {
    if (!desktop) {
      throw new Error('Desktop jsdom window still has ontouchstart')
    }
    window.document.body.innerHTML = '<div id="app"></div>'
    scripts.forEach((script) => window.eval(script))
    await waitTimers(window, 10)

    if (expectGlobal) {
      const plugin = Object.getOwnPropertyDescriptor(window, 'v-click-outside')
        ?.value
      if (!plugin || Object.prototype.hasOwnProperty.call(plugin, 'default')) {
        throw new Error('Unexpected script-tag global export')
      }
    }

    const state = Object.getOwnPropertyDescriptor(window, '__compat')?.value
    if (
      !state ||
      state.shape.install !== 'function' ||
      state.shape.beforeMount !== 'function'
    ) {
      throw new Error(
        `Unexpected plugin shape: ${JSON.stringify(state?.shape)}`,
      )
    }

    const inside = window.document.getElementById('inside')
    const outside = window.document.getElementById('outside')
    if (!inside || !outside) {
      throw new Error('Vue app did not render both click targets')
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
  } catch (error) {
    error.desktop = desktop
    throw error
  } finally {
    window.close()
  }
}

async function buildCase(
  ctx,
  caseName,
  packages,
  configName,
  config,
  command,
  env,
) {
  const dir = path.join(ctx.tmpRoot, name, caseName)
  ctx.npmInstall(dir, [...packages, ctx.tarball, 'jsdom'])
  fs.writeFileSync(path.join(dir, 'entry.js'), entrySource)
  fs.writeFileSync(path.join(dir, configName), config)
  const built = ctx.sh(command, { cwd: dir, env })
  if (built.code !== 0) {
    throw new Error(tail(`${built.stdout}\n${built.stderr}`, 8))
  }

  const bundlePath = path.join(dir, 'dist', 'bundle.js')
  const bundle = fs.readFileSync(bundlePath, 'utf8')
  await checkBrowser(dir, [bundle])
}

async function scriptTagCase(ctx) {
  const dir = path.join(ctx.tmpRoot, name, 'script-tag')
  ctx.npmInstall(dir, ['vue@3.2.47', ctx.tarball, 'jsdom'])
  const requireFromDir = createRequire(path.join(dir, 'package.json'))
  const vueCode = fs.readFileSync(
    requireFromDir.resolve('vue/dist/vue.global.prod.js'),
    'utf8',
  )
  const pluginCode = fs.readFileSync(
    requireFromDir.resolve('click-outside-vue3'),
    'utf8',
  )
  await checkBrowser(dir, [vueCode, pluginCode, scriptSource], true)
}

function cjsCase(ctx) {
  const dir = path.join(ctx.tmpRoot, name, 'cjs-require')
  ctx.npmInstall(dir, [ctx.tarball])
  const requireFromDir = createRequire(path.join(dir, 'package.json'))
  const plugin = requireFromDir('click-outside-vue3')
  const keys = Object.keys(plugin).sort()
  if (
    keys.join(',') !== 'directive,install' ||
    typeof plugin.install !== 'function' ||
    typeof plugin.directive !== 'object' ||
    Object.prototype.hasOwnProperty.call(plugin, 'default')
  ) {
    throw new Error(`Unexpected CommonJS exports: ${keys.join(', ')}`)
  }
}

export async function run(ctx) {
  const cases = [
    [
      'webpack4',
      () =>
        buildCase(
          ctx,
          'webpack4',
          ['webpack@4', 'webpack-cli@3', 'vue@3.2.47'],
          'webpack.config.js',
          webpackConfig,
          './node_modules/.bin/webpack --config webpack.config.js',
          { NODE_OPTIONS: '--openssl-legacy-provider' },
        ),
    ],
    [
      'webpack5',
      () =>
        buildCase(
          ctx,
          'webpack5',
          ['webpack@5', 'webpack-cli@5', 'vue@3.4'],
          'webpack.config.js',
          webpackConfig,
          './node_modules/.bin/webpack --config webpack.config.js',
        ),
    ],
    [
      'vite',
      () =>
        buildCase(
          ctx,
          'vite',
          ['vite@latest', 'vue@latest'],
          'vite.config.mjs',
          viteConfig,
          './node_modules/.bin/vite build --config vite.config.mjs',
        ),
    ],
    [
      'rollup',
      () =>
        buildCase(
          ctx,
          'rollup',
          [
            'rollup@4',
            '@rollup/plugin-node-resolve',
            '@rollup/plugin-commonjs',
            '@rollup/plugin-replace',
            'vue@latest',
          ],
          'rollup.config.mjs',
          rollupConfig,
          './node_modules/.bin/rollup --config rollup.config.mjs',
        ),
    ],
    ['script-tag', () => scriptTagCase(ctx)],
    ['cjs-require', () => cjsCase(ctx)],
  ]

  const results = []
  for (const [caseName, execute] of cases) {
    ctx.log(`bundlers: ${caseName}`)
    try {
      await execute()
      results.push({
        suite: name,
        case: caseName,
        status: 'pass',
        detail: 'Consumer worked',
      })
    } catch (error) {
      const desktopDetail =
        caseName === 'cjs-require'
          ? ''
          : `; 'ontouchstart' in window === false: ${
              error.desktop === undefined ? 'not checked' : error.desktop
            }`
      results.push({
        suite: name,
        case: caseName,
        status: 'fail',
        detail: `${tail(error.message, 8)}${desktopDetail}`,
      })
    }
  }
  return results
}
