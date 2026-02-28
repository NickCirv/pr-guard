/**
 * src/index.js — Barrel exports for programmatic use.
 * Import individual modules for fine-grained usage.
 */

export { runChecks, buildContext } from './runner.js'
export { loadConfig, generateTemplate } from './config.js'
export { printTerminal, printJson, generateMarkdown, setExitCode } from './reporter.js'

export { checkCommits } from './checks/commits.js'
export { checkBranch } from './checks/branch.js'
export { checkDescription } from './checks/description.js'
export { checkFiles } from './checks/files.js'
export { checkLabels } from './checks/labels.js'
export { checkConflicts } from './checks/conflicts.js'
