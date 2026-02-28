/**
 * labels.js — Required labels checker (GitHub Action only)
 * Ensures PRs have at least one type label and no conflicting labels.
 */

const DEFAULT_TYPE_LABELS = new Set([
  'bug', 'feature', 'enhancement', 'docs', 'documentation',
  'chore', 'refactor', 'performance', 'security', 'test',
  'breaking change', 'hotfix', 'ci', 'dependencies'
])

const CONFLICTING_LABEL_PAIRS = [
  ['bug', 'feature'],
  ['breaking change', 'patch'],
  ['wip', 'ready for review'],
  ['do not merge', 'approved']
]

/**
 * Validate PR labels.
 * @param {string[]} labels
 * @param {object} config
 * @returns {{ issues: string[], warnings: string[], passed: boolean }}
 */
function validateLabels(labels, config = {}) {
  const issues = []
  const warnings = []

  const {
    requireType = true,
    typeLabels,
    conflictingPairs
  } = config

  const labelSet = new Set(labels.map(l => l.toLowerCase()))
  const typeSet = typeLabels
    ? new Set(typeLabels.map(l => l.toLowerCase()))
    : DEFAULT_TYPE_LABELS

  const pairs = conflictingPairs ?? CONFLICTING_LABEL_PAIRS

  if (requireType) {
    const hasType = [...labelSet].some(l => typeSet.has(l))
    if (!hasType) {
      issues.push(
        `PR has no type label — add one of: ${[...typeSet].slice(0, 8).join(', ')}, ...`
      )
    }
  }

  for (const [a, b] of pairs) {
    if (labelSet.has(a.toLowerCase()) && labelSet.has(b.toLowerCase())) {
      issues.push(`Conflicting labels: "${a}" and "${b}" should not both be present`)
    }
  }

  return { issues, warnings, passed: issues.length === 0 }
}

/**
 * Run the labels check.
 * @param {{ labels?: string[] }} context
 * @param {object} config
 * @returns {{ name: string, status: 'pass'|'fail'|'skip', message: string, details?: string[] }}
 */
export async function checkLabels(context, config = {}) {
  const { enabled = true } = config

  if (!enabled) {
    return { name: 'Labels', status: 'skip', message: 'Disabled in config' }
  }

  if (!context.labels) {
    return {
      name: 'Labels',
      status: 'skip',
      message: 'Not in GitHub Action context — label checks require GITHUB_TOKEN'
    }
  }

  const labels = Array.isArray(context.labels) ? context.labels : []

  if (labels.length === 0) {
    const { enabled: requireType = true } = config
    if (requireType) {
      return {
        name: 'Labels',
        status: 'fail',
        message: 'No labels',
        details: ['PR has no labels — add a type label (bug, feature, docs, etc.)'],
        fix: `Add a type label to your PR on GitHub`
      }
    }
    return { name: 'Labels', status: 'pass', message: 'No labels (not required)' }
  }

  const { issues, passed } = validateLabels(labels, config)

  if (!passed) {
    return {
      name: 'Labels',
      status: 'fail',
      message: labels.join(', '),
      details: issues,
      fix: `Add or remove labels to match requirements`
    }
  }

  return {
    name: 'Labels',
    status: 'pass',
    message: labels.join(', ')
  }
}
