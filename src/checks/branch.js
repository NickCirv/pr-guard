/**
 * branch.js — Branch naming convention checker
 * Validates branch name against configured pattern, length, and character rules.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const DEFAULT_PATTERN = /^(feature|feat|fix|bugfix|chore|docs|release|hotfix|refactor|perf|test|ci)\/.+/

const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'development', 'staging', 'production'])

/**
 * Get the current git branch name using execFile (safe, no shell injection).
 * @returns {Promise<string|null>}
 */
async function getCurrentBranch() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = stdout.trim()
    return branch === 'HEAD' ? null : branch
  } catch {
    return null
  }
}

/**
 * Validate a branch name against configured rules.
 * @param {string} branch
 * @param {object} config
 * @returns {{ issues: string[], passed: boolean }}
 */
function validateBranch(branch, config = {}) {
  const issues = []
  const {
    pattern,
    maxLength = 60,
    allowProtected = false
  } = config

  const re = pattern ? new RegExp(pattern) : DEFAULT_PATTERN

  if (!re.test(branch)) {
    issues.push(
      `Branch "${branch}" doesn't match required pattern (e.g. feature/my-feature, fix/bug-name)`
    )
  }

  if (branch.length > maxLength) {
    issues.push(`Branch name too long: ${branch.length} chars (max ${maxLength})`)
  }

  if (/[A-Z]/.test(branch)) {
    issues.push(`Branch name contains uppercase letters — use lowercase only`)
  }

  if (/\s/.test(branch)) {
    issues.push(`Branch name contains spaces — use hyphens instead`)
  }

  if (/[^a-z0-9._\-/]/.test(branch)) {
    const badChars = [...new Set(branch.match(/[^a-z0-9._\-/]/g) ?? [])].join(', ')
    issues.push(`Branch name contains special characters: ${badChars}`)
  }

  if (!allowProtected && PROTECTED_BRANCHES.has(branch)) {
    issues.push(
      `Cannot open a PR from protected branch "${branch}" — create a feature branch`
    )
  }

  return { issues, passed: issues.length === 0 }
}

/**
 * Run the branch check.
 * @param {{ branch?: string }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'skip', message: string, details?: string[] }}
 */
export async function checkBranch(context, config = {}) {
  const { enabled = true } = config

  if (!enabled) {
    return { name: 'Branch naming', status: 'skip', message: 'Disabled in config' }
  }

  const branch = context.branch ?? (await getCurrentBranch())

  if (!branch) {
    return {
      name: 'Branch naming',
      status: 'skip',
      message: 'Could not determine branch name'
    }
  }

  const { issues, passed } = validateBranch(branch, config)

  if (!passed) {
    return {
      name: 'Branch naming',
      status: 'fail',
      message: branch,
      details: issues,
      fix: `Rename your branch to match: feature/*, fix/*, chore/*, hotfix/*, release/*`
    }
  }

  return {
    name: 'Branch naming',
    status: 'pass',
    message: branch
  }
}
