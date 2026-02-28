/**
 * config.js — Load .prguard.yml config or fall back to sensible defaults.
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DEFAULTS = {
  checks: {
    commits: {
      enabled: true,
      conventional: true,
      maxSubjectLength: 72
    },
    branch: {
      enabled: true,
      pattern: null,
      maxLength: 60
    },
    description: {
      enabled: true,
      minLength: 50,
      requireWhat: true,
      requireWhy: true
    },
    files: {
      enabled: true,
      maxFileSize: '500KB',
      maxFiles: 50,
      forbidden: ['.env', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa', 'id_ed25519'],
      requireLfs: false
    },
    labels: {
      enabled: true
    },
    conflicts: {
      enabled: true
    }
  },
  strict: false,
  output: 'terminal'
}

/**
 * Deep merge two plain objects. Values in `override` take precedence.
 * @param {object} base
 * @param {object} override
 * @returns {object}
 */
function deepMerge(base, override) {
  const result = { ...base }
  for (const [key, val] of Object.entries(override ?? {})) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = deepMerge(base[key] ?? {}, val)
    } else {
      result[key] = val
    }
  }
  return result
}

/**
 * Load and parse a .prguard.yml config file.
 * Returns merged config (file values override defaults).
 * @param {string} [configPath]
 * @returns {Promise<object>}
 */
export async function loadConfig(configPath) {
  const candidates = [
    configPath,
    path.join(process.cwd(), '.prguard.yml'),
    path.join(process.cwd(), '.prguard.yaml'),
    path.join(process.cwd(), 'prguard.yml')
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue

    try {
      const raw = await readFile(candidate, 'utf8')
      const { load } = await import('js-yaml')
      const parsed = load(raw)

      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid config file: ${candidate}`)
      }

      return {
        ...deepMerge(DEFAULTS, parsed),
        _source: candidate
      }
    } catch (err) {
      throw new Error(`Failed to load config from ${candidate}: ${err.message}`)
    }
  }

  return { ...DEFAULTS, _source: 'defaults' }
}

/**
 * Generate a .prguard.yml template string.
 * @returns {string}
 */
export function generateTemplate() {
  return `# .prguard.yml — PR Guard configuration
# https://github.com/NickCirv/pr-guard

checks:
  commits:
    enabled: true
    conventional: true        # Enforce conventional commit format
    maxSubjectLength: 72      # Max chars for commit subject line

  branch:
    enabled: true
    # pattern: "(feature|fix|chore|docs|release|hotfix)/.*"
    maxLength: 60

  description:
    enabled: true
    minLength: 50             # Minimum chars in PR description
    requireWhat: true         # Require a "what changed" section
    requireWhy: true          # Require a "why" or linked issue

  files:
    enabled: true
    maxFileSize: 500KB        # Max size per file (supports KB, MB)
    maxFiles: 50              # Max files changed per PR
    forbidden:                # Patterns for files that should never be committed
      - ".env"
      - "*.pem"
      - "*.key"
      - "id_rsa"

  labels:
    enabled: true             # GitHub Action only

  conflicts:
    enabled: true             # Scan for unresolved merge conflict markers

# Treat warnings as failures (useful in CI)
strict: false
`
}

export { DEFAULTS }
