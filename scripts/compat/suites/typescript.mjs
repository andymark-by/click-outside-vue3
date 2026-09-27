import fs from 'fs'
import path from 'path'
import { tail } from '../lib.mjs'

export const name = 'typescript'

const vueVersions = ['3.0.11', '3.2.47', 'latest']
const compilers = [
  { alias: 'ts41', version: '4.1.6' },
  { alias: 'ts45', version: '4.5.5' },
  { alias: 'ts49', version: '4.9.5' },
  { alias: 'ts50', version: '5.0.4' },
  { alias: 'ts55', version: '5.5.4' },
  { alias: 'tslatest', version: 'latest' },
]

const consumerSource = `import { createApp, defineComponent, h, withDirectives } from 'vue'
import clickOutside from 'click-outside-vue3'
import type { ClickOutsideOptions, ClickOutsideBinding, ClickOutsideDirective } from 'click-outside-vue3'

createApp(defineComponent({ render: () => h('div') })).use(clickOutside)
const d: ClickOutsideDirective = clickOutside.directive
const options: ClickOutsideOptions = {
  handler: (e: MouseEvent) => {},
  middleware: (e: PointerEvent) => true,
  events: ['click', 'dblclick'] as const,
  isActive: true,
  detectIframe: false,
  capture: true
}
const fn: ClickOutsideBinding = (e: Event) => {}
withDirectives(h('div'), [[clickOutside.directive, fn]])
export { d, options, fn }
`

const negativeSource = `type RejectNumericHandler = { handler: number } extends ClickOutsideOptions ? true : false
const rejectsNumericHandler: false = false as RejectNumericHandler
export { rejectsNumericHandler }
`

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

const shimConsumerSource = `import { createApp, defineComponent, h, withDirectives } from 'vue'
import clickOutside from 'click-outside-vue3'

createApp(defineComponent({ render: () => h('div') })).use(clickOutside)
withDirectives(h('div'), [[clickOutside.directive, (e: Event) => {}]])
const options = { handler: (e: Event) => {}, events: ['click'] }
withDirectives(h('div'), [[clickOutside.directive, options]])
`

const baseOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: 'es2017',
  lib: ['es2017', 'dom'],
}

function variantsFor(version) {
  const major = Number(version.split('.')[0])
  const variants = []

  if (major < 6) {
    variants.push(
      {
        name: 'node10-interop',
        module: 'esnext',
        resolution: 'node',
        interop: true,
        negative: true,
      },
      {
        name: 'node10-nointerop',
        module: 'esnext',
        resolution: 'node',
      },
    )
  }

  if (major >= 5) {
    variants.push(
      {
        name: 'bundler',
        module: 'esnext',
        resolution: 'bundler',
        negative: true,
      },
      {
        name: 'nodenext-esm',
        module: 'nodenext',
        resolution: 'nodenext',
        folder: 'esm',
        packageType: 'module',
      },
      {
        name: 'nodenext-cjs',
        module: 'nodenext',
        resolution: 'nodenext',
        folder: 'cjs',
        interop: true,
        packageType: 'commonjs',
      },
      {
        name: 'shim-bundler',
        module: 'esnext',
        resolution: 'bundler',
        shim: true,
      },
    )
  }

  if (major < 6) {
    variants.push({
      name: 'shim-node10',
      module: 'esnext',
      resolution: 'node',
      interop: true,
      shim: true,
    })
  }

  return variants
}

function writeCase(dir, alias, variant) {
  const caseDir = path.join(dir, alias, variant.folder || variant.name)
  fs.mkdirSync(caseDir, { recursive: true })
  if (variant.packageType) {
    const packageData =
      variant.packageType === 'module' ? { type: 'module' } : {}
    fs.writeFileSync(
      path.join(caseDir, 'package.json'),
      `${JSON.stringify(packageData, null, 2)}\n`,
    )
  }

  const source = variant.shim
    ? shimConsumerSource
    : `${consumerSource}${variant.negative ? negativeSource : ''}`
  fs.writeFileSync(path.join(caseDir, 'consumer.ts'), source)

  const files = ['consumer.ts']
  if (variant.shim) {
    fs.writeFileSync(path.join(caseDir, 'shims.d.ts'), shimSource)
    files.push('shims.d.ts')
  }

  const compilerOptions = {
    ...baseOptions,
    module: variant.module,
    moduleResolution: variant.resolution,
  }
  if (variant.interop) {
    compilerOptions.esModuleInterop = true
  }
  fs.writeFileSync(
    path.join(caseDir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, files }),
  )

  return path.relative(dir, path.join(caseDir, 'tsconfig.json'))
}

function failureResult(caseName, output) {
  const lines = output.trim().split('\n').filter(Boolean)
  const diagnostics = lines.filter((line) => /error TS\d+/.test(line))
  const local = diagnostics.find((line) =>
    /(?:^|[/\\])(?:consumer\.ts|shims\.d\.ts)\(/.test(line),
  )
  const packageTypes = diagnostics.find((line) =>
    /node_modules[/\\]click-outside-vue3[/\\]/.test(line),
  )
  const nodeModulesOnly =
    diagnostics.length > 0 &&
    !packageTypes &&
    diagnostics.every((line) => line.includes('node_modules/'))

  return {
    suite: name,
    case: caseName,
    status: !local && nodeModulesOnly ? 'warn' : 'fail',
    detail:
      local ||
      packageTypes ||
      diagnostics[0] ||
      lines[0] ||
      'TypeScript exited with an error',
  }
}

export async function run(ctx) {
  const results = []
  for (const vueVersion of vueVersions) {
    const dir = path.join(ctx.tmpRoot, name, `vue-${vueVersion}`)
    const selectedCompilers = compilers.filter(
      ({ alias }) => alias !== 'ts41' || vueVersion !== 'latest',
    )
    let installedCompilers = selectedCompilers.map(({ alias, version }) => ({
      alias,
      version: version === 'latest' ? '7.0.0' : version,
    }))
    let setupError

    try {
      ctx.npmInstall(dir, [
        `vue@${vueVersion}`,
        ctx.tarball,
        ...selectedCompilers.map(
          ({ alias, version }) => `${alias}@npm:typescript@${version}`,
        ),
      ])
      installedCompilers = selectedCompilers.map(({ alias }) => ({
        alias,
        version: JSON.parse(
          fs.readFileSync(
            path.join(dir, 'node_modules', alias, 'package.json'),
            'utf8',
          ),
        ).version,
      }))
    } catch (error) {
      setupError = tail(error.message, 8)
    }

    for (const { alias, version } of installedCompilers) {
      for (const variant of variantsFor(version)) {
        const caseName = `vue${vueVersion}/${alias}/${variant.name}`
        if (setupError) {
          results.push({
            suite: name,
            case: caseName,
            status: 'fail',
            detail: setupError,
          })
        } else {
          ctx.log(`typescript: ${caseName}`)
          try {
            const configPath = writeCase(dir, alias, variant)
            const command = `node node_modules/${alias}/bin/tsc -p ${configPath}`
            const checked = ctx.sh(command, { cwd: dir })
            if (checked.code === 0) {
              results.push({
                suite: name,
                case: caseName,
                status: 'pass',
                detail: `TypeScript ${version}`,
              })
            } else {
              results.push(
                failureResult(caseName, `${checked.stdout}\n${checked.stderr}`),
              )
            }
          } catch (error) {
            results.push({
              suite: name,
              case: caseName,
              status: 'fail',
              detail: tail(error.message, 1),
            })
          }
        }
      }
    }
  }

  return results
}
