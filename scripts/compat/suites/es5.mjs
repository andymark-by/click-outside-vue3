import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { tail } from '../lib.mjs'

export const name = 'es5'

export async function run(ctx) {
  const dir = path.join(ctx.tmpRoot, name)
  const results = []
  let bundle

  try {
    ctx.npmInstall(dir, ['acorn'])
    bundle = fs.readFileSync(
      path.join(ctx.repoRoot, 'dist', 'v-click-outside.umd.js'),
      'utf8',
    )
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

  try {
    const requireFromDir = createRequire(path.join(dir, 'package.json'))
    requireFromDir('acorn').parse(bundle, {
      ecmaVersion: 5,
      sourceType: 'script',
    })
    results.push({
      suite: name,
      case: 'syntax',
      status: 'pass',
      detail: 'ES5 parse succeeded',
    })
  } catch (error) {
    const position = error.loc
      ? `line ${error.loc.line}, column ${error.loc.column}`
      : 'unknown position'
    results.push({
      suite: name,
      case: 'syntax',
      status: 'fail',
      detail: `${position}: ${tail(error.message, 1)}`,
    })
  }

  const apiPatterns = [
    ['Object.assign', /\bObject\.assign\b/g],
    ['Array.from', /\bArray\.from\b/g],
    ['Promise', /\bPromise\b/g],
    ['Symbol', /\bSymbol\b/g],
    ['Reflect', /\bReflect\b/g],
    ['new Map', /\bnew\s+Map\b/g],
    ['new Set', /\bnew\s+Set\b/g],
    ['WeakMap', /\bWeakMap\b/g],
    ['.includes(', /\.includes(?=\s*(?:\(|\|\|))/g],
    ['.startsWith(', /\.startsWith(?=\s*(?:\(|\|\|))/g],
    ['.find(', /\.find(?=\s*(?:\(|\|\|))/g],
    ['.findIndex(', /\.findIndex(?=\s*(?:\(|\|\|))/g],
  ]
  const found = apiPatterns
    .filter(([, pattern]) => {
      const matches = [...bundle.matchAll(pattern)]
      return matches.some(
        (match) =>
          !/^\s*\|\|/.test(bundle.slice(match.index + match[0].length)),
      )
    })
    .map(([api]) => api)
  results.push({
    suite: name,
    case: 'apis',
    status: found.length > 0 ? 'warn' : 'pass',
    detail: found.length > 0 ? found.join(', ') : 'No ES5-missing APIs found',
  })

  const eventPath = /\.path\b/.test(bundle)
  results.push({
    suite: name,
    case: 'event.path',
    status: eventPath ? 'fail' : 'pass',
    detail: eventPath ? 'Bundle contains .path' : 'No .path access found',
  })

  return results
}
