<div align="center">

# pr-guard

**Block bad PRs before they waste reviewer time — commits, secrets, conflicts, and more**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?labelColor=0B0A09)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-available-blue?labelColor=0B0A09&logo=github)](https://github.com/marketplace/actions/pr-guard)

</div>

## Install

```bash
# GitHub Action (recommended)
uses: NickCirv/pr-guard@v1

# CLI
npx github:NickCirv/pr-guard
```

## Usage

```bash
# Run all checks on the current branch
npx github:NickCirv/pr-guard

# Run a specific check
npx github:NickCirv/pr-guard --check commits

# Strict mode — warnings become failures
npx github:NickCirv/pr-guard --strict

# JSON output for scripting
npx github:NickCirv/pr-guard --json

# Generate a config template
npx github:NickCirv/pr-guard init
```

| Flag | Description |
|------|-------------|
| `--check <name>` | Run one check: `commits`, `branch`, `description`, `files`, `conflicts`, `labels` |
| `--config <path>` | Path to `.prguard.yml` |
| `--branch <name>` | Override git branch detection |
| `--description <text>` | Override PR description |
| `--strict` | Treat warnings as failures (exit 1) |
| `--json` | Machine-readable output |

### GitHub Action

```yaml
name: PR Guard
on:
  pull_request:
    types: [opened, synchronize, edited]

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: NickCirv/pr-guard@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## What it does

PR Guard runs automated quality checks on a pull request before any human reads it. It validates branch naming conventions, enforces conventional commits, checks PR description length, detects secrets and forbidden files, scans for unresolved merge conflict markers, and enforces file count and size limits. Works as a zero-config GitHub Action or a local CLI — drop a `.prguard.yml` in your repo root to customise any threshold.

---
<sub>Node ≥18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
