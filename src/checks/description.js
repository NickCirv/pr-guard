/**
 * description.js — PR description quality checker
 * Validates minimum length, what/why sections, unfilled placeholders,
 * and unchecked checklist items.
 */

const PLACEHOLDER_PATTERNS = [
  /\[your description here\]/i,
  /\[describe your changes\]/i,
  /\[what does this pr do\]/i,
  /\[add description\]/i,
  /<!-- .* -->/,
  /\b(TODO|FIXME|PLACEHOLDER|FILL THIS IN)\b/,
  /\[x\] Your changes/i,
  /enter description/i
]

const WHAT_INDICATORS = [
  /#+\s*(what|changes|summary|overview|description)/i,
  /\bthis (pr|change|commit|patch) (adds|fixes|updates|removes|introduces|implements)/i,
  /\b(added|fixed|updated|removed|introduced|implemented|refactored)\b/i,
  /\bchanges?:/i,
  /\bsummary:/i
]

const WHY_INDICATORS = [
  /#+\s*(why|motivation|reason|context|background|problem)/i,
  /\b(because|in order to|so that|this (fixes|resolves|closes|addresses)|to (fix|resolve|improve|support))/i,
  /\bcloses?\s+#\d+/i,
  /\bfixes?\s+#\d+/i,
  /\bresolves?\s+#\d+/i,
  /\brelated\s+to\s+#\d+/i,
  /\breason:/i,
  /\bmotivation:/i,
  /\bcontext:/i
]

const UNCHECKED_BOX_RE = /^\s*-\s*\[\s\]\s+\S/m

/**
 * Validate a PR description string against quality rules.
 * @param {string} description
 * @param {object} config
 * @returns {{ issues: string[], passed: boolean, warnings: string[] }}
 */
function validateDescription(description, config = {}) {
  const issues = []
  const warnings = []
  const { minLength = 50, requireWhat = true, requireWhy = true } = config

  const trimmed = (description ?? '').trim()

  if (!trimmed) {
    return {
      issues: ['PR description is empty — reviewers cannot understand what this changes'],
      warnings: [],
      passed: false
    }
  }

  if (trimmed.length < minLength) {
    issues.push(
      `Description too short: ${trimmed.length} chars (minimum ${minLength})`
    )
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      issues.push(`Description contains unfilled template placeholder text`)
      break
    }
  }

  if (requireWhat && !WHAT_INDICATORS.some(re => re.test(trimmed))) {
    warnings.push(`No clear "what changed" section found — add a summary of your changes`)
  }

  if (requireWhy && !WHY_INDICATORS.some(re => re.test(trimmed))) {
    warnings.push(
      `No "why" context or linked issue found — add motivation or link an issue (e.g. Closes #42)`
    )
  }

  if (UNCHECKED_BOX_RE.test(trimmed)) {
    issues.push(`Description has unchecked checklist items — complete them before requesting review`)
  }

  return { issues, warnings, passed: issues.length === 0 }
}

/**
 * Run the description check.
 * @param {{ description?: string, prBody?: string }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'warn'|'skip', message: string, details?: string[] }}
 */
export async function checkDescription(context, config = {}) {
  const { enabled = true, minLength = 50 } = config

  if (!enabled) {
    return { name: 'PR description', status: 'skip', message: 'Disabled in config' }
  }

  const description = context.description ?? context.prBody ?? null

  if (description === null) {
    return {
      name: 'PR description',
      status: 'skip',
      message: 'No PR description available (CLI mode — pass --description or set GITHUB_PR_BODY)'
    }
  }

  const { issues, warnings, passed } = validateDescription(description, { ...config, minLength })

  if (!passed) {
    return {
      name: 'PR description',
      status: 'fail',
      message: `Too short or invalid (${(description ?? '').trim().length} chars)`,
      details: issues,
      fix: `Add a description with at least ${minLength} characters explaining what changed and why.`
    }
  }

  if (warnings.length > 0) {
    return {
      name: 'PR description',
      status: 'warn',
      message: `OK but could be stronger`,
      details: warnings
    }
  }

  const charCount = (description ?? '').trim().length
  return {
    name: 'PR description',
    status: 'pass',
    message: `${charCount} chars, looks good`
  }
}
