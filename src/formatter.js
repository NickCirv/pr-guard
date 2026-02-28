/**
 * formatter.js — Chalk-based terminal formatting helpers.
 * All color/style logic lives here so reporter.js stays readable.
 */

let chalk

async function getChalk() {
  if (!chalk) {
    const mod = await import('chalk')
    chalk = mod.default
  }
  return chalk
}

const STATUS_ICONS = {
  pass: '✓',
  fail: '✗',
  warn: '~',
  skip: '–',
  error: '!'
}

const STATUS_LABELS = {
  pass: 'PASS',
  fail: 'FAIL',
  warn: 'WARN',
  skip: 'SKIP',
  error: 'ERROR'
}

/**
 * Get a chalk-colored icon for a status.
 * @param {'pass'|'fail'|'warn'|'skip'|'error'} status
 * @returns {Promise<string>}
 */
export async function statusIcon(status) {
  const c = await getChalk()
  const icon = STATUS_ICONS[status] ?? '?'
  switch (status) {
    case 'pass': return c.green(icon)
    case 'fail': return c.red(icon)
    case 'warn': return c.yellow(icon)
    case 'skip': return c.dim(icon)
    case 'error': return c.magenta(icon)
    default: return icon
  }
}

/**
 * Get a chalk-colored label for a status.
 * @param {'pass'|'fail'|'warn'|'skip'|'error'} status
 * @returns {Promise<string>}
 */
export async function statusLabel(status) {
  const c = await getChalk()
  const label = STATUS_LABELS[status] ?? status.toUpperCase()
  switch (status) {
    case 'pass': return c.green.bold(label)
    case 'fail': return c.red.bold(label)
    case 'warn': return c.yellow.bold(label)
    case 'skip': return c.dim(label)
    case 'error': return c.magenta.bold(label)
    default: return label
  }
}

/**
 * Format a check name for display — padded to a fixed width.
 * @param {string} name
 * @param {number} [width=22]
 * @returns {Promise<string>}
 */
export async function checkName(name, width = 22) {
  const c = await getChalk()
  return c.white(name.padEnd(width))
}

/**
 * Format a message value — dimmed, truncated if too long.
 * @param {string} message
 * @param {number} [maxLen=40]
 * @returns {Promise<string>}
 */
export async function checkMessage(message, maxLen = 40) {
  const c = await getChalk()
  const truncated = message.length > maxLen
    ? message.slice(0, maxLen - 3) + '...'
    : message
  return c.dim(truncated.padEnd(maxLen))
}

/**
 * Format a fix hint line.
 * @param {string} fix
 * @returns {Promise<string>}
 */
export async function fixHint(fix) {
  const c = await getChalk()
  return `  ${c.cyan('Fix:')} ${fix}`
}

/**
 * Format a detail line (sub-item under a failed check).
 * @param {string} detail
 * @returns {Promise<string>}
 */
export async function detailLine(detail) {
  const c = await getChalk()
  return `    ${c.dim('→')} ${c.dim(detail)}`
}

/**
 * Format the PR-GUARD header banner.
 * @returns {Promise<string>}
 */
export async function header(version = '1.0.0') {
  const c = await getChalk()
  return [
    '',
    `  ${c.bold.blue('PR-GUARD')}  ${c.dim('v' + version)}`,
    '',
    `  ${c.dim('Checking PR quality...')}`,
    ''
  ].join('\n')
}

/**
 * Format the summary divider line.
 * @returns {Promise<string>}
 */
export async function divider() {
  const c = await getChalk()
  return `  ${c.dim('─'.repeat(55))}`
}

/**
 * Format the summary result line.
 * @param {object} summary
 * @returns {Promise<string>}
 */
export async function summaryLine(summary) {
  const c = await getChalk()
  const parts = []

  if (summary.passed > 0) parts.push(c.green(`${summary.passed} passed`))
  if (summary.failed > 0) parts.push(c.red(`${summary.failed} failed`))
  if (summary.warned > 0) parts.push(c.yellow(`${summary.warned} warned`))
  if (summary.skipped > 0) parts.push(c.dim(`${summary.skipped} skipped`))
  if (summary.errored > 0) parts.push(c.magenta(`${summary.errored} errored`))

  return `  Result: ${parts.join(c.dim(' │ '))}`
}
