import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { createContext, shellQuote, tail } from './lib.mjs'

const suites = [
  'es5',
  'node',
  'vue',
  'diff',
  'ssr',
  'bundlers',
  'browsers',
  'typescript',
  'templates',
]

function parseArgs(argv) {
  const options = { only: null, keep: false, list: false, maxMinutes: 30 }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--only' && argv[index + 1]) {
      options.only = argv[index + 1].split(',').filter(Boolean)
      index += 1
    } else if (arg === '--keep') {
      options.keep = true
    } else if (arg === '--list') {
      options.list = true
    } else if (arg === '--max-minutes' && argv[index + 1]) {
      const minutes = Number(argv[index + 1])
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error('--max-minutes must be a positive number')
      }
      options.maxMinutes = minutes
      index += 1
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }

  if (options.only) {
    const unknown = options.only.filter((name) => !suites.includes(name))
    if (unknown.length > 0) {
      throw new Error(`Unknown suites: ${unknown.join(', ')}`)
    }
  }

  return options
}

function printTable(results) {
  const columns = ['suite', 'case', 'status', 'detail']
  const rows = results.map((result) =>
    columns.map((column) => String(result[column] ?? '').replace(/\s+/g, ' ')),
  )
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => row[index].length)),
  )
  const printRow = (row) =>
    console.log(
      row.map((cell, index) => cell.padEnd(widths[index])).join(' | '),
    )

  printRow(columns)
  console.log(widths.map((width) => '-'.repeat(width)).join('-+-'))
  rows.forEach(printRow)

  const counts = { pass: 0, warn: 0, fail: 0 }
  results.forEach((result) => {
    counts[result.status] += 1
  })
  console.log(`pass ${counts.pass}, warn ${counts.warn}, fail ${counts.fail}`)
  return counts.fail
}

function snapshotSrc(repoRoot) {
  const hashes = new Map()
  const visit = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(filePath)
      } else {
        const content = entry.isSymbolicLink()
          ? fs.readlinkSync(filePath)
          : fs.readFileSync(filePath)
        hashes.set(
          path.relative(repoRoot, filePath),
          createHash('sha256').update(content).digest('hex'),
        )
      }
    })
  }
  const sourceDir = path.join(repoRoot, 'src')
  if (fs.existsSync(sourceDir)) {
    visit(sourceDir)
  }
  return hashes
}

function sourceResult(before, after) {
  const paths = [...new Set([...before.keys(), ...after.keys()])]
  const changed = paths
    .filter((filePath) => before.get(filePath) !== after.get(filePath))
    .sort()
  return {
    suite: 'build',
    case: 'src untouched',
    status: changed.length > 0 ? 'fail' : 'pass',
    detail:
      changed.length > 0
        ? changed.slice(0, 10).join(', ')
        : 'No source changes',
  }
}

function tarballResult(preparation, tarball, repoRoot) {
  const listing = preparation.sh(`tar -tzf ${shellQuote(tarball)}`, {
    cwd: repoRoot,
  })
  if (listing.code !== 0) {
    return {
      suite: 'build',
      case: 'tarball contents',
      status: 'fail',
      detail: tail(`${listing.stdout}\n${listing.stderr}`, 3),
    }
  }

  const files = listing.stdout
    .split('\n')
    .filter((filePath) => filePath && !filePath.endsWith('/'))
  return {
    suite: 'build',
    case: 'tarball contents',
    status: files.length > 40 ? 'fail' : 'pass',
    detail:
      files.length > 40
        ? `${files.length} files: ${files.slice(0, 10).join(', ')}`
        : `${files.length} files`,
  }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  if (options.list) {
    suites.forEach((name) => console.log(name))
    return
  }

  const startedAt = Date.now()
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  )
  const tmpRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'click-outside-compat-'),
  )
  const selected = suites.filter(
    (name) => !options.only || options.only.includes(name),
  )

  try {
    const preparation = createContext({ repoRoot, tmpRoot, tarball: '' })
    const results = []
    const sourceBefore = snapshotSrc(repoRoot)
    preparation.log('Building package')
    const build = preparation.sh('npm run build', { cwd: repoRoot })
    results.push(sourceResult(sourceBefore, snapshotSrc(repoRoot)))
    if (build.code !== 0) {
      console.error(
        `Build failed:\n${tail(`${build.stdout}\n${build.stderr}`)}`,
      )
      printTable(results)
      process.exitCode = 1
      return
    }

    preparation.log('Packing package')
    const pack = preparation.sh(
      `npm pack --pack-destination ${shellQuote(tmpRoot)}`,
      { cwd: repoRoot },
    )
    if (pack.code !== 0) {
      console.error(`Pack failed:\n${tail(`${pack.stdout}\n${pack.stderr}`)}`)
      printTable(results)
      process.exitCode = 1
      return
    }

    const archive = pack.stdout.trim().split('\n').pop()
    const tarball = path.join(tmpRoot, archive)
    if (!archive || !fs.existsSync(tarball)) {
      console.error(`Pack archive missing:\n${tail(pack.stdout)}`)
      printTable(results)
      process.exitCode = 1
      return
    }

    results.push(tarballResult(preparation, tarball, repoRoot))
    const ctx = createContext({ repoRoot, tmpRoot, tarball })
    for (const name of selected) {
      if (Date.now() - startedAt >= options.maxMinutes * 60 * 1000) {
        results.push({
          suite: name,
          case: 'skipped: global time limit',
          status: 'fail',
          detail: `${options.maxMinutes} minute limit reached`,
        })
        ctx.log(`${name}: skipped after global time limit`)
      } else {
        const started = Date.now()
        ctx.log(`Running ${name}`)
        const modulePath = path.join(
          repoRoot,
          'scripts',
          'compat',
          'suites',
          `${name}.mjs`,
        )
        if (!fs.existsSync(modulePath)) {
          results.push({
            suite: name,
            case: 'module',
            status: 'fail',
            detail: 'suite module missing',
          })
        } else {
          try {
            const suite = await import(`./suites/${name}.mjs`)
            const suiteResults = await suite.run(ctx)
            if (!Array.isArray(suiteResults)) {
              throw new Error('suite did not return results')
            }
            results.push(
              ...suiteResults.map((result) =>
                /timed out/i.test(String(result.detail || ''))
                  ? { ...result, status: 'fail' }
                  : result,
              ),
            )
          } catch (error) {
            results.push({
              suite: name,
              case: 'suite',
              status: 'fail',
              detail: tail(error.message, 1),
            })
          }
        }
        const elapsedSeconds = ((Date.now() - started) / 1000).toFixed(1)
        ctx.log(`${name}: completed in ${elapsedSeconds}s`)
      }
    }

    if (printTable(results) > 0) {
      process.exitCode = 1
    }
  } finally {
    if (options.keep) {
      console.error(`Temporary files kept at ${tmpRoot}`)
    } else {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      } catch (error) {
        console.error(`Warning: could not remove ${tmpRoot}: ${error.message}`)
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
