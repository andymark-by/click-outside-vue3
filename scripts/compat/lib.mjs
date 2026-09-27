import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

export function tail(value, count = 15) {
  return String(value || '')
    .trim()
    .split('\n')
    .slice(-count)
    .join('\n')
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function createContext({ repoRoot, tmpRoot, tarball }) {
  const sh = (cmd, { cwd = repoRoot, env = {} } = {}) => {
    const result = spawnSync('bash', ['-lc', cmd], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })

    return {
      code: result.status ?? 1,
      stdout: result.stdout || '',
      stderr: result.stderr || String(result.error || ''),
    }
  }

  const npmInstall = (dir, packages) => {
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      const init = sh('npm init -y', { cwd: dir })
      if (init.code !== 0) {
        throw new Error(tail(`${init.stdout}\n${init.stderr}`))
      }
      const packagePath = path.join(dir, 'package.json')
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      delete packageData.type
      fs.writeFileSync(packagePath, `${JSON.stringify(packageData, null, 2)}\n`)
    }

    const packageArgs = packages.map(shellQuote).join(' ')
    const install = sh(
      `npm install --no-audit --no-fund --loglevel=error ${packageArgs}`,
      { cwd: dir },
    )
    if (install.code !== 0) {
      throw new Error(tail(`${install.stdout}\n${install.stderr}`))
    }
  }

  return {
    repoRoot,
    tmpRoot,
    tarball,
    sh,
    npmInstall,
    log: (message) => console.error(message),
  }
}

export function makeDom(jsdomDir, { touch = false } = {}) {
  const requireFromDir = createRequire(path.join(jsdomDir, 'package.json'))
  const { JSDOM } = requireFromDir('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })

  if (touch) {
    if (!('ontouchstart' in dom.window)) {
      dom.window.ontouchstart = null
    }
    if (!('ontouchstart' in dom.window)) {
      throw new Error('cannot add ontouchstart to jsdom window')
    }
  } else {
    let current = dom.window
    while (current !== null) {
      if (Object.prototype.hasOwnProperty.call(current, 'ontouchstart')) {
        Reflect.deleteProperty(current, 'ontouchstart')
      }
      current = Object.getPrototypeOf(current)
    }
    if ('ontouchstart' in dom.window) {
      throw new Error('cannot remove ontouchstart from jsdom window')
    }
  }

  return dom
}

export function waitTimers(window, ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
