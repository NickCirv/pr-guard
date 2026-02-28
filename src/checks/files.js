/**
 * files.js — File size, count, secrets, and lockfile checks
 * Detects oversized files, too many files, .env/credential files,
 * binary files without LFS, and lockfile-without-manifest changes.
 */

import { stat } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

const SECRET_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /secrets?\.(json|yaml|yml|toml)$/i,
  /credentials?\.(json|yaml|yml)$/i,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa/,
  /id_ed25519/,
  /\.secret$/
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot',
  '.exe', '.dll', '.so', '.dylib',
  '.db', '.sqlite'
])

const LOCK_FILES = {
  'package-lock.json': 'package.json',
  'yarn.lock': 'package.json',
  'pnpm-lock.yaml': 'package.json',
  'Pipfile.lock': 'Pipfile',
  'Gemfile.lock': 'Gemfile',
  'poetry.lock': 'pyproject.toml',
  'Cargo.lock': 'Cargo.toml'
}

/**
 * Parse a human-readable size string into bytes.
 * Supports KB, MB, GB suffixes.
 * @param {string|number} size
 * @returns {number}
 */
function parseSize(size) {
  if (typeof size === 'number') return size
  const str = String(size).toUpperCase().trim()
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)?$/)
  if (!match) return 500 * 1024
  const value = parseFloat(match[1])
  const unit = match[2] ?? 'B'
  const multipliers = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

/**
 * Get list of changed files from git.
 * @returns {Promise<string[]>}
 */
async function getChangedFiles() {
  try {
    const { stdout } = await execFileAsync('git', [
      'diff', '--name-only', 'HEAD~1', 'HEAD'
    ])
    const files = stdout.trim().split('\n').filter(Boolean)
    if (files.length > 0) return files
  } catch {
    // fall through to staged
  }

  try {
    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only'])
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Check if a filepath matches any of the secret file patterns.
 * @param {string} filepath
 * @param {string[]} additionalPatterns
 * @returns {boolean}
 */
function isSecretFile(filepath, additionalPatterns = []) {
  const filename = path.basename(filepath)
  const allPatterns = [
    ...SECRET_PATTERNS,
    ...additionalPatterns.map(p => {
      try { return new RegExp(p.replace(/\*/g, '.*')) } catch { return null }
    }).filter(Boolean)
  ]
  return allPatterns.some(re => re.test(filename) || re.test(filepath))
}

/**
 * Run the files check.
 * @param {{ files?: string[], changedFiles?: string[] }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'warn'|'skip', message: string, details?: string[] }}
 */
export async function checkFiles(context, config = {}) {
  const {
    enabled = true,
    maxFileSize = '500KB',
    maxFiles = 50,
    forbidden = [],
    requireLfs = false
  } = config

  if (!enabled) {
    return { name: 'File limits', status: 'skip', message: 'Disabled in config' }
  }

  const maxBytes = parseSize(maxFileSize)
  const files = context.files ?? context.changedFiles ?? (await getChangedFiles())

  if (files.length === 0) {
    return {
      name: 'File limits',
      status: 'skip',
      message: 'No changed files detected'
    }
  }

  const issues = []
  const warnings = []

  if (files.length > maxFiles) {
    issues.push(
      `PR changes ${files.length} files (max ${maxFiles}) — consider splitting into smaller PRs`
    )
  }

  const secretFiles = files.filter(f => isSecretFile(f, forbidden))
  if (secretFiles.length > 0) {
    issues.push(
      `Secret or credential files detected: ${secretFiles.join(', ')}`
    )
  }

  const lockfileNames = Object.keys(LOCK_FILES)
  const changedLockfiles = files.filter(f => lockfileNames.includes(path.basename(f)))
  for (const lockfile of changedLockfiles) {
    const manifestName = LOCK_FILES[path.basename(lockfile)]
    const manifestChanged = files.some(f => path.basename(f) === manifestName)
    if (!manifestChanged) {
      warnings.push(
        `${path.basename(lockfile)} changed without ${manifestName} — ensure this is intentional`
      )
    }
  }

  const sizeChecks = await Promise.all(
    files.map(async f => {
      try {
        const s = await stat(f)
        return { file: f, size: s.size }
      } catch {
        return { file: f, size: 0 }
      }
    })
  )

  const oversized = sizeChecks.filter(({ size }) => size > maxBytes)
  for (const { file, size } of oversized) {
    const kb = (size / 1024).toFixed(1)
    const limitKb = (maxBytes / 1024).toFixed(0)
    issues.push(`Oversized file: ${file} (${kb}KB, limit ${limitKb}KB)`)
  }

  if (requireLfs) {
    const binaryWithoutLfs = files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return BINARY_EXTENSIONS.has(ext) && !isLfsTracked(f)
    })
    if (binaryWithoutLfs.length > 0) {
      warnings.push(
        `Binary files without LFS: ${binaryWithoutLfs.join(', ')} — consider git-lfs`
      )
    }
  }

  const largestFile = sizeChecks.reduce(
    (max, cur) => (cur.size > max.size ? cur : max),
    { file: '', size: 0 }
  )
  const largeSummary = largestFile.size > 0
    ? `, max ${(largestFile.size / 1024).toFixed(0)}KB`
    : ''

  if (issues.length > 0) {
    return {
      name: 'File limits',
      status: 'fail',
      message: `${files.length} files${largeSummary}`,
      details: issues,
      fix: oversized.length > 0
        ? `Reduce file sizes or add large files to .gitignore / git-lfs`
        : `Remove secret files or add to .gitignore`
    }
  }

  if (warnings.length > 0) {
    return {
      name: 'File limits',
      status: 'warn',
      message: `${files.length} files${largeSummary}`,
      details: warnings
    }
  }

  return {
    name: 'File limits',
    status: 'pass',
    message: `${files.length} files${largeSummary}`
  }
}

/**
 * Placeholder for LFS tracking check — would need .gitattributes parsing.
 * @param {string} _filepath
 * @returns {boolean}
 */
function isLfsTracked(_filepath) {
  return false
}
