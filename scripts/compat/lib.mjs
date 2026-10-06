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

// timeout puts the command in its own process group, so Ctrl+C from the
// terminal never reaches it. This wrapper stays in our group and kills it.
// Node only runs its SIGINT handler once spawnSync returns, hence the marker.
const INTERRUPTED = 'compat: interrupted'
const RUN_WITH_TIMEOUT = [
  'child=',
  `trap '[ -n "$child" ] && { kill -KILL -- "-$child" || kill -KILL "$child"; } 2>/dev/null; echo "${INTERRUPTED}" >&2; exit 130' INT TERM`,
  '"$1" -k 10 "$2" bash -lc "$3" &',
  'child=$!',
  'wait "$child"',
].join('\n')

export const cleanupState = {
  tmpRoot: null,
  keep: false,
  containers: new Set(),
}

export function cleanupSync() {
  cleanupState.containers.forEach((container) => {
    spawnSync('docker', ['rm', '-f', container], {
      stdio: 'ignore',
      timeout: 15000,
      killSignal: 'SIGKILL',
    })
  })
  cleanupState.containers.clear()
  if (cleanupState.tmpRoot && cleanupState.keep) {
    console.error(`Temporary files kept at ${cleanupState.tmpRoot}`)
  } else if (cleanupState.tmpRoot) {
    try {
      fs.rmSync(cleanupState.tmpRoot, { recursive: true, force: true })
    } catch (error) {
      console.error(
        `Warning: could not remove ${cleanupState.tmpRoot}: ${error.message}`,
      )
    }
  }
}

export function isTimedOut(result) {
  return (
    result.timedOut === true || /timed out/i.test(String(result.detail || ''))
  )
}

export function createContext({ repoRoot, tmpRoot, tarball, deadline = null }) {
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
  if (!timeoutCommand) {
    throw new Error(
      'timeout command not found: install coreutils (gtimeout) or run on Linux',
    )
  }

  const stats = { timeouts: 0 }

  const sh = (cmd, { cwd = repoRoot, env = {}, timeoutSec = 600 } = {}) => {
    const requestedSeconds = Number(timeoutSec)
    const ownSeconds =
      Number.isFinite(requestedSeconds) && requestedSeconds > 0
        ? requestedSeconds
        : 600
    const remainingSeconds =
      deadline === null
        ? Infinity
        : Math.max(10, (deadline - Date.now()) / 1000)
    const budgetLimited = remainingSeconds < ownSeconds
    const seconds = Math.ceil(Math.min(ownSeconds, remainingSeconds))
    const started = Date.now()
    const result = spawnSync(
      'bash',
      ['-c', RUN_WITH_TIMEOUT, 'compat', timeoutCommand, String(seconds), cmd],
      {
        cwd,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        killSignal: 'SIGKILL',
      },
    )
    if (result.status === 130 && (result.stderr || '').includes(INTERRUPTED)) {
      console.error('Interrupted, cleaning up')
      cleanupSync()
      process.exit(130)
    }
    const elapsed = Date.now() - started
    const timedOut =
      result.status === 124 ||
      ((result.status === 137 || result.signal === 'SIGKILL') &&
        elapsed >= seconds * 1000)
    const stderr = result.stderr || String(result.error || '')
    if (timedOut) {
      stats.timeouts += 1
    }

    return {
      code: timedOut ? 124 : result.status ?? 1,
      timedOut,
      stdout: result.stdout || '',
      stderr: timedOut
        ? [
            stderr.trimEnd(),
            budgetLimited
              ? `timed out after ${seconds}s: time budget exceeded`
              : `timed out after ${seconds}s`,
          ]
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
    stats,
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
