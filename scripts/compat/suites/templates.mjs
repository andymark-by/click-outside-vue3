import fs from 'fs'
import path from 'path'
import { shellQuote, tail } from '../lib.mjs'

export const name = 'templates'

const combinations = [
  { vue: '3.3.13', vueTsc: '1.8.27', typescript: '5.2.2' },
  { vue: '3.4.38', vueTsc: '2.0.29', typescript: '5.4.5' },
  { vue: 'latest', vueTsc: 'latest', typescript: '5' },
]

const caseNames = [
  'valid',
  'negative',
  'loose-any',
  'loose-mutable-events',
  'shim',
]

const mainSource = `import { createApp } from 'vue'
import clickOutside from 'click-outside-vue3'
import App from './App.vue'

createApp(App).use(clickOutside).mount('#app')
`

const baseSetup = `<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ClickOutsideOptions } from 'click-outside-vue3'

const open = ref(true)
function close() {}
function onMouse(e: MouseEvent) {}
async function onAsync() {}
const reactiveConfig = reactive({ handler: close, isActive: true })
const computedConfig = computed(() => ({ handler: close, isActive: open.value }))
const typedConfig: ClickOutsideOptions = { handler: close, events: ['click'] }
</script>

<template>
  <div>
    <div v-click-outside="close"></div>
    <div v-click-outside="() => (open = false)"></div>
    <div v-click-outside="onMouse"></div>
    <div v-click-outside="onAsync"></div>
    <div v-click-outside="{ handler: close, events: ['click', 'touchstart'], isActive: open, detectIframe: false, capture: true, middleware: (e: Event) => e.isTrusted }"></div>
    <div v-click-outside="reactiveConfig"></div>
    <div v-click-outside="computedConfig"></div>
    <div v-click-outside="typedConfig"></div>
  </div>
</template>
`

const validSetup = baseSetup
  .replace(
    'const typedConfig: ClickOutsideOptions',
    'const h: Function = () => {}\nconst typedConfig: ClickOutsideOptions',
  )
  .replace(
    '    <div v-click-outside="typedConfig"></div>',
    `    <div v-click-outside="typedConfig"></div>
    <div v-click-outside="h"></div>
    <div v-click-outside="{ handler: undefined, isActive: false }"></div>
    <div v-click-outside="{ handler: open ? close : undefined, isActive: open }"></div>
    <div v-click-outside="open && close"></div>
    <div v-click-outside="null"></div>`,
  )

const shimSetup = baseSetup
  .split('\n')
  .filter((line) => !line.startsWith('import type { ClickOutsideOptions }'))
  .join('\n')
  .replace('typedConfig: ClickOutsideOptions', 'typedConfig')
  .replace('onMouse(e: MouseEvent)', 'onMouse(e: Event)')

const baseOptions = `<script lang="ts">
import { defineComponent } from 'vue'
import clickOutside from 'click-outside-vue3'

export default defineComponent({
  directives: { clickOutside: clickOutside.directive },
  data() {
    return { config: { handler: () => {}, events: ['click'], isActive: true } }
  },
  methods: {
    close() {}
  }
})
</script>

<template>
  <div>
    <div v-click-outside="close"></div>
    <div v-click-outside="config"></div>
  </div>
</template>
`

const validOptions = baseOptions
  .replace(
    '  directives: { clickOutside: clickOutside.directive },',
    '  props: { onClose: Function },\n  directives: { clickOutside: clickOutside.directive },',
  )
  .replace(
    '    <div v-click-outside="config"></div>',
    '    <div v-click-outside="config"></div>\n    <div v-click-outside="onClose"></div>',
  )

const validLocal = `<script setup lang="ts">
import clickOutside from 'click-outside-vue3'

const vClickOutside = clickOutside.directive
function close() {}
</script>

<template>
  <div v-click-outside="close"></div>
</template>
`

const negativeSource = `<template>
  <div v-click-outside="42"></div>
</template>
`

const looseSources = {
  'loose-any': `<script setup lang="ts">
const h: any = () => {}
</script>
<template><div v-click-outside="h"></div></template>
`,
  'loose-mutable-events': `<script setup lang="ts">
import { ref } from 'vue'
const events = ref<string[]>(['click'])
function close() {}
</script>
<template><div v-click-outside="{ handler: close, events }"></div></template>
`,
}

const shimSource = `declare module 'click-outside-vue3' {
  import { App, Directive } from 'vue';
  type Handler = (event: Event) => void;
  interface Params {
    handler: Handler;
    middleware?: (event: Event) => boolean;
    events?: string[];
    isActive?: boolean;
    detectIframe?: boolean;
    capture?: boolean;
  }
  type ClickOutside = Directive<HTMLElement, Handler | Params>;
  declare const plugin: {
    install: (Vue: App) => void;
    directive: ClickOutside;
  };
  export default plugin;
  declare module '@vue/runtime-core' {
    export interface ComponentCustomProperties {
      vClickOutside: ClickOutside;
    }
  }
}
`

const tsconfig = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    target: 'es2020',
    lib: ['es2020', 'dom'],
    jsx: 'preserve',
    types: [],
  },
  include: ['src/**/*.ts', 'src/**/*.vue'],
}

function installedVersion(dir, packageName) {
  const packagePath = path.join(
    dir,
    'node_modules',
    packageName,
    'package.json',
  )
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version
}

function binaryPath(dir) {
  const packageDir = path.join(dir, 'node_modules', 'vue-tsc')
  const packageData = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  )
  const binary =
    typeof packageData.bin === 'string'
      ? packageData.bin
      : packageData.bin['vue-tsc']
  if (!binary) {
    throw new Error('vue-tsc binary missing from package.json')
  }
  return path.join(packageDir, binary)
}

function appSource(components) {
  const imports = components.map(
    (component) => `import ${component} from './${component}.vue'`,
  )
  const elements = components.map((component) => `    <${component} />`)
  return `<script setup lang="ts">
${imports.join('\n')}
</script>
<template>
  <div>
${elements.join('\n')}
  </div>
</template>
`
}

function writeProject(dir, caseName) {
  const srcDir = path.join(dir, 'src')
  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig))
  fs.writeFileSync(path.join(srcDir, 'main.ts'), mainSource)

  let components
  if (caseName === 'valid' || caseName === 'shim') {
    components = ['ValidSetup', 'ValidOptions', 'ValidLocal']
    fs.writeFileSync(
      path.join(srcDir, 'ValidSetup.vue'),
      caseName === 'shim' ? shimSetup : validSetup,
    )
    fs.writeFileSync(
      path.join(srcDir, 'ValidOptions.vue'),
      caseName === 'shim' ? baseOptions : validOptions,
    )
    fs.writeFileSync(path.join(srcDir, 'ValidLocal.vue'), validLocal)
    if (caseName === 'shim') {
      fs.writeFileSync(path.join(srcDir, 'shims.d.ts'), shimSource)
    }
  } else if (caseName === 'negative') {
    components = ['Negative']
    fs.writeFileSync(path.join(srcDir, 'Negative.vue'), negativeSource)
  } else {
    components = ['Loose']
    fs.writeFileSync(path.join(srcDir, 'Loose.vue'), looseSources[caseName])
  }
  fs.writeFileSync(path.join(srcDir, 'App.vue'), appSource(components))
}

function firstError(output) {
  const lines = output.trim().split('\n').filter(Boolean)
  return (
    lines.find((line) => /error TS\d+/.test(line)) ||
    lines[0] ||
    'vue-tsc exited with an error'
  )
}

function caseResult(caseName, checked, versions) {
  const output = `${checked.stdout}\n${checked.stderr}`
  const errors = output.split('\n').filter((line) => /error TS\d+/.test(line))
  const suffix = `; ${versions}`
  if (caseName === 'negative') {
    const negativeErrors = errors.filter((line) =>
      line.includes('Negative.vue'),
    )
    if (negativeErrors.length > 0 && negativeErrors.length === errors.length) {
      return {
        suite: name,
        case: caseName,
        status: 'pass',
        detail: `Negative.vue rejected${suffix}`,
      }
    }
    if (checked.code === 0) {
      return {
        suite: name,
        case: caseName,
        status: 'warn',
        detail: `template directive values are not type-checked here${suffix}`,
      }
    }
    return {
      suite: name,
      case: caseName,
      status: 'fail',
      detail: `${firstError(output)}${suffix}`,
    }
  }

  if (checked.code === 0) {
    return { suite: name, case: caseName, status: 'pass', detail: versions }
  }
  return {
    suite: name,
    case: caseName,
    status: caseName.startsWith('loose-') ? 'warn' : 'fail',
    detail: `${firstError(output)}${suffix}`,
  }
}

export async function run(ctx) {
  const results = []
  for (const combination of combinations) {
    const dir = path.join(ctx.tmpRoot, name, `vue-${combination.vue}`)
    let binary
    let versions
    let setupError
    try {
      ctx.npmInstall(dir, [
        `vue@${combination.vue}`,
        `vue-tsc@${combination.vueTsc}`,
        `typescript@${combination.typescript}`,
        ctx.tarball,
      ])
      binary = binaryPath(dir)
      versions = [
        `vue ${installedVersion(dir, 'vue')}`,
        `vue-tsc ${installedVersion(dir, 'vue-tsc')}`,
        `typescript ${installedVersion(dir, 'typescript')}`,
      ].join(', ')
    } catch (error) {
      setupError = tail(error.message, 8)
    }

    for (const caseName of caseNames) {
      const fullName = `${combination.vue}/${caseName}`
      if (setupError) {
        results.push({
          suite: name,
          case: fullName,
          status: 'fail',
          detail: setupError,
        })
      } else {
        ctx.log(`templates: ${fullName}`)
        try {
          writeProject(dir, caseName)
          const checked = ctx.sh(
            `node ${shellQuote(binary)} --noEmit -p tsconfig.json`,
            { cwd: dir },
          )
          results.push({
            ...caseResult(caseName, checked, versions),
            case: fullName,
          })
        } catch (error) {
          results.push({
            suite: name,
            case: fullName,
            status: 'fail',
            detail: `${tail(error.message, 1)}; ${versions}`,
          })
        }
      }
    }
  }
  return results
}
