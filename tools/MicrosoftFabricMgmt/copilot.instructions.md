---
description: Copilot authoring, build, and test instructions for the MicrosoftFabricMgmt PowerShell module
applyTo: 'tools/MicrosoftFabricMgmt/**'
---

# MicrosoftFabricMgmt — Copilot Instructions

These rules apply only within `tools/MicrosoftFabricMgmt/**` for the PowerShell module that administers Microsoft Fabric.

## Scope and file locations

- Make ALL code changes only under `tools/MicrosoftFabricMgmt/source/`.
- Do NOT modify anything under `tools/MicrosoftFabricMgmt/output/` (build artifacts) or outside this directory unless explicitly asked.
- Place public functions in the module's public area (e.g., `source/Public/`) and private helpers in `source/Private/` when such folders exist; otherwise keep functions organized under `source/` with clear filenames matching the function names.
- the sampler buidl process will generate the module manifest and module file during build; do NOT edit those files directly.

## PowerShell coding standards

- Use professional PowerShell practices and PSScriptAnalyzer conventions.
- Author functions as Advanced Functions with `[CmdletBinding()]` and a `param()` block.
- Use approved verbs (`Get-Verb`) and `Verb-Noun` naming with PascalCase; prefer singular nouns.
- Support `SupportsShouldProcess` for any operation that changes state (enable `-WhatIf`/`-Confirm`).
- Validate inputs with types and `Validate*` attributes where appropriate.
- Prefer clear error handling: use `throw` for terminating errors; use `Write-Error` for non-terminating with rich `ErrorRecord` data.
- Avoid side-effectful console output: no `Write-Host`, no banners, no prompts. Use `Write-Verbose`/`Write-Information` for diagnostics only.
- Do NOT use `Format-*` or `Out-*` cmdlets inside module functions.

## Output contract — objects only

- Functions must return objects only, never plain strings meant for display.
- Prefer returning typed objects or `[pscustomobject]` with stable property names.
- Do not emit extraneous output (including from unassigned expressions). Only return the final object(s).

## Linting and validation (must run before tests)

- Before running any tests, check all changed code with Script Analyzer and fix issues and parse errors.
- Minimum requirement: zero parse errors. Prefer addressing warnings where reasonable.
- Example command to run from the repository root:

  - Analyze: `Invoke-ScriptAnalyzer -Path tools/MicrosoftFabricMgmt/source -Recurse -Severities Error,Warning`

## Build workflow

- Build the module in a NEW PowerShell session from the repository root:

  - Build: `./build.ps1 -Tasks build`

- The build produces artifacts in `tools/MicrosoftFabricMgmt/output/` (or the repo-standard output folder). Do not edit generated files.

## Test workflow

- After analyzer checks pass and any fixes are applied, run the full test suite:

  - Run tests: `Invoke-Pester tools/MicrosoftFabricMgmt/tests/`

- Keep tests green. Update or add tests when changing public behavior.

## Quality gates

1) Lint/Analyze: PASS (no parse errors)
2) Build: PASS using `./build.ps1 -Tasks build` in a fresh session
3) Tests: PASS via `Invoke-Pester tools/MicrosoftFabricMgmt/tests/`

## Security and reliability

- Never hardcode secrets, tokens, or connection strings.
- Prefer idempotent operations where feasible; make destructive actions explicit and guarded by `ShouldProcess`.
- Ensure functions handle common edge cases (null/empty input, timeouts, permission issues) and return useful errors.

## Documentation

- Include comment-based help for public functions with synopsis, description, parameter help, examples, and outputs. Keep examples object-focused (no formatted output).
