import fs from 'fs'
import path from 'path'
import { shellQuote, tail } from '../lib.mjs'

export const name = 'node'

const majors = [14, 16, 18, 20, 22]

const checkSource = `const p = require('click-outside-vue3')
let registration = null
if (typeof p.install === 'function') {
  p.install({ directive(name, directive) { registration = { name, same: directive === p.directive } } })
}
console.log(JSON.stringify({
  install: typeof p.install,
  directive: typeof p.directive,
  empty: p.directive && Object.keys(p.directive).length === 0,
  registration
}))
`

export async function run(ctx) {
  const dir = path.join(ctx.tmpRoot, name)

  try {
    ctx.npmInstall(dir, [ctx.tarball])
    fs.writeFileSync(path.join(dir, 'check.cjs'), checkSource)
  } catch (error) {
    return [
      {
        suite: name,
        case: 'setup',
        status: 'fail',
        detail: tail(error.message, 8),
      },
    ]
  }

  const results = []
  for (const major of majors) {
    const caseName = `node${major}`
    try {
      const prefix = `npx -y -p node@${major} -- node`
      const version = ctx.sh(`${prefix} --version`, { cwd: dir })
      const reported = version.stdout.trim().split('\n').pop()
      if (version.code !== 0 || !reported.startsWith(`v${major}.`)) {
        results.push({
          suite: name,
          case: caseName,
          status: 'fail',
          detail: `Node version unavailable: ${tail(
            `${version.stdout}\n${version.stderr}`,
            3,
          )}`,
        })
      } else {
        const checked = ctx.sh(`${prefix} ${shellQuote('check.cjs')}`, {
          cwd: dir,
        })
        if (checked.code !== 0) {
          results.push({
            suite: name,
            case: caseName,
            status: 'fail',
            detail: tail(`${checked.stdout}\n${checked.stderr}`, 3),
          })
        } else {
          const actual = JSON.parse(checked.stdout.trim().split('\n').pop())
          const valid =
            actual.install === 'function' &&
            actual.directive === 'object' &&
            actual.empty === true &&
            actual.registration?.name === 'click-outside' &&
            actual.registration.same === true
          results.push({
            suite: name,
            case: caseName,
            status: valid ? 'pass' : 'fail',
            detail: valid
              ? reported
              : `Unexpected SSR exports: ${JSON.stringify(actual)}`,
          })
        }
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

  return results
}
