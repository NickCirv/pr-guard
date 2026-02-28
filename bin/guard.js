#!/usr/bin/env node
/**
 * bin/guard.js — CLI entry point for pr-guard.
 * Uses commander with lazy imports to keep startup fast.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

const { Command } = await import('commander')
const program = new Command()

program
  .name('pr-guard')
  .description('PR quality gate — blocks bad PRs before they waste reviewer time')
  .version(pkg.version, '-v, --version')

// ── init subcommand ──────────────────────────────────────────────────────────
program
  .command('init')
  .description('Generate a .prguard.yml config template in the current directory')
  .action(async () => {
    const { writeFile, existsSync } = await import('fs')
    const { promisify } = await import('util')
    const writeFileAsync = promisify(writeFile)
    const { generateTemplate } = await import('../src/config.js')

    const dest = path.join(process.cwd(), '.prguard.yml')

    if (existsSync(dest)) {
      const c = (await import('chalk')).default
      process.stderr.write(c.yellow(`  .prguard.yml already exists at ${dest}\n`))
      process.stderr.write(c.dim(`  Delete it first if you want a fresh template.\n\n`))
      process.exit(1)
    }

    await writeFileAsync(dest, generateTemplate(), 'utf8')
    const c = (await import('chalk')).default
    process.stdout.write(`\n  ${c.green('✓')} Created ${c.bold('.prguard.yml')} — edit to configure your checks.\n\n`)
  })

// ── run subcommand (explicit + default) ──────────────────────────────────────
const runCmd = program
  .command('run', { isDefault: true, hidden: true })
  .description('Run PR quality checks (default command)')
  .option('--check <name>', 'Run a specific check only (commits, branch, description, files, conflicts, labels)')
  .option('--config <path>', 'Path to .prguard.yml config file')
  .option('--json', 'Output results as JSON')
  .option('--strict', 'Treat warnings as failures (exit 1)')
  .option('--branch <name>', 'Branch name to check (overrides git detection)')
  .option('--description <text>', 'PR description text to check')
  .action(async (opts) => {
    try {
      const { loadConfig } = await import('../src/config.js')
      const { runChecks, buildContext } = await import('../src/runner.js')
      const { printTerminal, printJson, setExitCode } = await import('../src/reporter.js')

      const config = await loadConfig(opts.config)
      const strict = opts.strict ?? config.strict ?? false

      const context = buildContext({
        branch: opts.branch,
        description: opts.description
      })

      const only = opts.check ? [opts.check] : undefined
      const { results, summary } = await runChecks(context, config, { only })

      if (opts.json) {
        printJson(results, summary, config)
      } else {
        await printTerminal(results, summary, { version: pkg.version })
      }

      setExitCode(summary, strict)
    } catch (err) {
      const c = (await import('chalk')).default
      process.stderr.write(`\n  ${c.red('Error:')} ${err.message}\n\n`)
      process.exit(1)
    }
  })

await program.parseAsync(process.argv)
