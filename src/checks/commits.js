/**
 * commits.js — Commit message format checker
 * Validates conventional commit format, subject length, body line length,
 * and blocks WIP/fixup commits in final PRs.
 */

const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'chore', 'docs', 'style', 'refactor',
  'perf', 'test', 'build', 'ci', 'revert', 'merge'
]

const CONVENTIONAL_RE = new RegExp(
  `^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9._-]+\\))?(!)?:\\s.+`,
  'i'
)

const BLOCKED_PATTERNS = [/\bwip\b/i, /\bfixup!/i, /\bsquash!/i, /^fixup/i, /^squash/i]

/**
 * Parse raw git log output into structured commit objects.
 * Each commit is separated by the COMMIT_DELIMITER.
 * @param {string} raw
 * @returns {{ hash: string, subject: string, body: string }[]}
 */
function parseCommits(raw) {
  const DELIMITER = '---COMMIT---'
  return raw
    .split(DELIMITER)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      const hash = lines[0]?.trim() ?? ''
      const subject = lines[1]?.trim() ?? ''
      const body = lines.slice(2).join('\n').trim()
      return { hash, subject, body }
    })
    .filter(c => c.hash && c.subject)
}

/**
 * Validate a single commit against configured rules.
 * @param {{ hash: string, subject: string, body: string }} commit
 * @param {{ conventional: boolean, maxSubjectLength: number }} config
 * @returns {{ hash: string, subject: string, issues: string[], passed: boolean }}
 */
function validateCommit(commit, config) {
  const issues = []
  const { subject, body, hash } = commit
  const { conventional = true, maxSubjectLength = 72 } = config

  if (conventional && !CONVENTIONAL_RE.test(subject)) {
    issues.push(
      `Non-conventional format — expected "type(scope): description" (e.g. feat: add login)`
    )
  }

  if (subject.length > maxSubjectLength) {
    issues.push(
      `Subject too long: ${subject.length} chars (max ${maxSubjectLength})`
    )
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(subject)) {
      issues.push(`Blocked commit pattern detected: "${subject}"`)
      break
    }
  }

  if (body) {
    const longLines = body
      .split('\n')
      .filter(line => line.length > 100)

    if (longLines.length > 0) {
      issues.push(
        `Body has ${longLines.length} line(s) over 100 chars`
      )
    }
  }

  return { hash, subject, issues, passed: issues.length === 0 }
}

/**
 * Run the commits check.
 * @param {{ commits?: object[], rawLog?: string }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'skip', message: string, details?: string[], score?: string }}
 */
export async function checkCommits(context, config = {}) {
  const { conventional = true, maxSubjectLength = 72, enabled = true } = config

  if (!enabled) {
    return { name: 'Commit messages', status: 'skip', message: 'Disabled in config' }
  }

  let commits = []

  if (context.commits && Array.isArray(context.commits)) {
    commits = context.commits
  } else if (context.rawLog) {
    commits = parseCommits(context.rawLog)
  } else {
    return {
      name: 'Commit messages',
      status: 'skip',
      message: 'No commit data available (not in a git repo or no upstream)'
    }
  }

  if (commits.length === 0) {
    return {
      name: 'Commit messages',
      status: 'skip',
      message: 'No commits to check'
    }
  }

  const results = commits.map(c =>
    validateCommit(c, { conventional, maxSubjectLength })
  )

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const score = `${passed}/${commits.length} conventional`

  const failDetails = results
    .filter(r => !r.passed)
    .flatMap(r =>
      r.issues.map(issue => `  ${r.hash.slice(0, 7)}: ${r.subject} — ${issue}`)
    )

  if (failed > 0) {
    return {
      name: 'Commit messages',
      status: 'fail',
      message: score,
      details: failDetails,
      fix: `Fix commit messages to follow conventional format: type(scope): description`
    }
  }

  return {
    name: 'Commit messages',
    status: 'pass',
    message: score
  }
}
