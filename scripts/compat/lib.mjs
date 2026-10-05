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
  const timeoutCheck = spawnSync(
    'bash',
    ['-lc', 'command -v timeout || command -v gtimeout'],
    {
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
    },
  )
  const timeoutCommand =
    timeoutCheck.status === 0
      ? timeoutCheck.stdout.trim().split('\n').pop()
      : null
  const hasTimeout = Boolean(timeoutCommand)

  const sh = (cmd, { cwd = repoRoot, env = {}, timeoutSec = 600 } = {}) => {
    const requestedSeconds = Number(timeoutSec)
    const seconds =
      Number.isFinite(requestedSeconds) && requestedSeconds > 0
        ? requestedSeconds
        : 600
    const started = Date.now()
    const result = spawnSync(
      hasTimeout ? timeoutCommand : 'bash',
      hasTimeout
        ? ['-k', '10', String(seconds), 'bash', '-lc', cmd]
        : ['-lc', cmd],
      {
        cwd,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: hasTimeout ? undefined : seconds * 1000,
        killSignal: 'SIGKILL',
      },
    )
    const elapsed = Date.now() - started
    const timedOut = hasTimeout
      ? result.status === 124 ||
        ((result.status === 137 || result.signal === 'SIGKILL') &&
          elapsed >= seconds * 1000)
      : result.error?.code === 'ETIMEDOUT'
    const stderr = result.stderr || String(result.error || '')

    return {
      code: timedOut ? 124 : result.status ?? 1,
      stdout: result.stdout || '',
      stderr: timedOut
        ? [stderr.trimEnd(), `timed out after ${seconds}s`]
            .filter(Boolean)
            .join('\n')
        : stderr,
    }
  }

  const npmInstall = (dir, packages) => {
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      const init = sh('npm init -y', { cwd: dir, timeoutSec: 600 })
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
      { cwd: dir, timeoutSec: 600 },
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
