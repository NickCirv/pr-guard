/**
 * conflicts.js — Merge conflict marker detector
 * Scans all changed files for unresolved merge conflict markers.
 * Supports text files only — skips binary files gracefully.
 */

import { readFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

const CONFLICT_MARKERS = ['<<<<<<<', '=======', '>>>>>>>']

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
  '.mp4', '.mov', '.avi', '.mp3', '.wav',
  '.zip', '.tar', '.gz', '.7z',
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot',
  '.exe', '.dll', '.so', '.dylib',
  '.db', '.sqlite', '.bin'
])

/**
 * Check if a file extension is likely binary.
 * @param {string} filepath
 * @returns {boolean}
 */
function isBinary(filepath) {
  return BINARY_EXTENSIONS.has(path.extname(filepath).toLowerCase())
}

/**
 * Scan a file for merge conflict markers.
 * @param {string} filepath
 * @returns {Promise<{ file: string, lines: number[], hasConflict: boolean }>}
 */
async function scanFile(filepath) {
  if (isBinary(filepath)) {
    return { file: filepath, lines: [], hasConflict: false }
  }

  try {
    const content = await readFile(filepath, 'utf8')
    const lines = content.split('\n')
    const conflictLines = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (CONFLICT_MARKERS.some(marker => line.startsWith(marker))) {
        conflictLines.push(i + 1)
      }
    }

    return { file: filepath, lines: conflictLines, hasConflict: conflictLines.length > 0 }
  } catch {
    return { file: filepath, lines: [], hasConflict: false }
  }
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
    // fall through
  }

  try {
    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only'])
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Run the conflicts check.
 * @param {{ files?: string[] }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'skip', message: string, details?: string[] }}
 */
export async function checkConflicts(context, config = {}) {
  const { enabled = true } = config

  if (!enabled) {
    return { name: 'Merge conflicts', status: 'skip', message: 'Disabled in config' }
  }

  const files = context.files ?? context.changedFiles ?? (await getChangedFiles())

  if (files.length === 0) {
    return {
      name: 'Merge conflicts',
      status: 'skip',
      message: 'No changed files to scan'
    }
  }

  const results = await Promise.all(files.map(scanFile))
  const conflicted = results.filter(r => r.hasConflict)

  if (conflicted.length > 0) {
    const details = conflicted.map(
      r => `${r.file} (lines: ${r.lines.join(', ')})`
    )
    return {
      name: 'Merge conflicts',
      status: 'fail',
      message: `${conflicted.length} file(s) have unresolved conflicts`,
      details,
      fix: `Resolve conflict markers (<<<<<<<, =======, >>>>>>>) in the listed files`
    }
  }

  const scanned = results.filter(r => !isBinary(r.file)).length
  const skipped = results.length - scanned

  return {
    name: 'Merge conflicts',
    status: 'pass',
    message: skipped > 0
      ? `${scanned} files scanned, ${skipped} binary skipped`
      : `${scanned} files scanned, none`
  }
}
