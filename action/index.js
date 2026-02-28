/**
 * action/index.js — GitHub Action entry point.
 * Reads PR context from GITHUB_EVENT_PATH, runs all checks,
 * posts a PR comment (if GITHUB_TOKEN), and sets action outputs.
 */

import { readFile } from 'fs/promises'
import path from 'path'

async function run() {
  try {
    const { loadConfig } = await import('../src/config.js')
    const { runChecks, buildContext } = await import('../src/runner.js')
    const { printTerminal, printJson, generateMarkdown, setExitCode } = await import('../src/reporter.js')

    const configPath = process.env.INPUT_CONFIG || '.prguard.yml'
    const strict = (process.env.INPUT_STRICT || 'false').toLowerCase() === 'true'

    const config = await loadConfig(configPath)

    const eventPath = process.env.GITHUB_EVENT_PATH
    let prContext = {}

    if (eventPath) {
      try {
        const eventRaw = await readFile(eventPath, 'utf8')
        const event = JSON.parse(eventRaw)
        const pr = event.pull_request ?? {}

        prContext = {
          branch: pr.head?.ref,
          description: pr.body ?? '',
          labels: (pr.labels ?? []).map(l => l.name),
          prNumber: pr.number,
          prTitle: pr.title,
          baseBranch: pr.base?.ref
        }
      } catch {
        // Continue without event context
      }
    }

    const context = buildContext(prContext)
    const { results, summary } = await runChecks(context, config)

    await printTerminal(results, summary, { version: '1.0.0' })

    const markdown = generateMarkdown(results, summary)

    // Set action outputs
    const outputFile = process.env.GITHUB_OUTPUT
    if (outputFile) {
      const { appendFile } = await import('fs/promises')
      const outputs = [
        `passed=${summary.passed}`,
        `failed=${summary.failed}`,
        `warned=${summary.warned}`,
        `skipped=${summary.skipped}`,
        `success=${summary.failed === 0 && (!strict || summary.warned === 0)}`,
        `markdown<<EOF\n${markdown}\nEOF`
      ].join('\n')
      await appendFile(outputFile, outputs + '\n')
    }

    // Post PR comment if GITHUB_TOKEN is available
    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPOSITORY
    const prNumber = prContext.prNumber

    if (token && repo && prNumber && (summary.failed > 0 || summary.warned > 0)) {
      await postPrComment(token, repo, prNumber, markdown)
    }

    setExitCode(summary, strict)

  } catch (err) {
    process.stderr.write(`PR Guard action failed: ${err.message}\n`)
    process.stderr.write(err.stack + '\n')
    process.exit(1)
  }
}

/**
 * Post a comment on the PR with the markdown report.
 * @param {string} token
 * @param {string} repo
 * @param {number} prNumber
 * @param {string} body
 */
async function postPrComment(token, repo, prNumber, body) {
  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'pr-guard/1.0.0'
      },
      body: JSON.stringify({ body }),
      signal: controller.signal
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      process.stderr.write(`Warning: Failed to post PR comment (${response.status}): ${text}\n`)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      process.stderr.write(`Warning: PR comment request timed out\n`)
    } else {
      process.stderr.write(`Warning: Could not post PR comment: ${err.message}\n`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

run()
