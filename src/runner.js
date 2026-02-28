/**
 * runner.js — Orchestrates all checks, collects results.
 * Runs enabled checks, handles errors per-check gracefully.
 */

import { checkCommits } from './checks/commits.js'
import { checkBranch } from './checks/branch.js'
import { checkDescription } from './checks/description.js'
import { checkFiles } from './checks/files.js'
import { checkLabels } from './checks/labels.js'
import { checkConflicts } from './checks/conflicts.js'

/**
 * Check registry — maps config key to check function.
 * Order determines display order in output.
 */
const CHECKS = [
  { key: 'branch', fn: checkBranch, name: 'Branch naming' },
  { key: 'commits', fn: checkCommits, name: 'Commit messages' },
  { key: 'description', fn: checkDescription, name: 'PR description' },
  { key: 'files', fn: checkFiles, name: 'File limits' },
  { key: 'conflicts', fn: checkConflicts, name: 'Merge conflicts' },
  { key: 'labels', fn: checkLabels, name: 'Labels' }
]

/**
 * Build the context object from available sources.
 * Supports CLI args, environment variables (GitHub Actions), and git.
 * @param {object} [opts]
 * @returns {object}
 */
export function buildContext(opts = {}) {
  const env = process.env

  return {
    // Branch — CLI opt > GITHUB_HEAD_REF > GITHUB_REF (strip refs/heads/)
    branch: opts.branch
      ?? env.GITHUB_HEAD_REF
      ?? (env.GITHUB_REF?.replace('refs/heads/', '') || undefined),

    // PR description — CLI opt > env var
    description: opts.description ?? env.GITHUB_PR_BODY ?? env.PR_BODY ?? null,

    // Labels — CLI opt > JSON env var
    labels: opts.labels ?? parseJsonEnv(env.GITHUB_PR_LABELS),

    // Changed files — CLI opt > JSON env var
    files: opts.files ?? parseJsonEnv(env.GITHUB_CHANGED_FILES),

    // Raw git log — CLI opt > env var
    rawLog: opts.rawLog ?? env.GITHUB_PR_COMMITS ?? null,

    // Pre-parsed commits array
    commits: opts.commits ?? parseJsonEnv(env.GITHUB_PR_COMMITS_JSON)
  }
}

/**
 * Safely parse a JSON env variable. Returns null on failure.
 * @param {string|undefined} value
 * @returns {any|null}
 */
function parseJsonEnv(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

/**
 * Run all checks (or a subset) against the given context.
 * Each check is isolated — errors in one don't abort others.
 * @param {object} context
 * @param {object} config
 * @param {{ only?: string[] }} opts
 * @returns {Promise<{ results: object[], summary: object }>}
 */
export async function runChecks(context, config, opts = {}) {
  const { only } = opts

  const checksToRun = only
    ? CHECKS.filter(c => only.includes(c.key))
    : CHECKS

  const results = await Promise.all(
    checksToRun.map(async ({ key, fn, name }) => {
      const checkConfig = config.checks?.[key] ?? {}

      try {
        const result = await fn(context, checkConfig)
        return { key, ...result }
      } catch (err) {
        return {
          key,
          name,
          status: 'error',
          message: `Check threw an error: ${err.message}`,
          details: [err.stack ?? err.message]
        }
      }
    })
  )

  const summary = {
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warned: results.filter(r => r.status === 'warn').length,
    skipped: results.filter(r => r.status === 'skip').length,
    errored: results.filter(r => r.status === 'error').length,
    total: results.length
  }

  return { results, summary }
}
