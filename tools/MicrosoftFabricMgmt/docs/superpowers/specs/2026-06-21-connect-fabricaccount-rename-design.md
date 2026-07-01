# Design: Rename `Set-FabricApiHeaders` → `Connect-FabricAccount`

**Date:** 2026-06-21
**Module:** MicrosoftFabricMgmt
**Status:** Approved (pending spec review)
**Scope:** Plan 1 of 3 (this spec covers Plan 1 only)

## Summary

Make `Connect-FabricAccount` the primary authentication command for the module,
mirroring the `Connect-AzAccount` convention from `Az.Accounts`. The existing
`Set-FabricApiHeaders` name continues to work identically, becoming a thin
backward-compatible wrapper that emits a one-time-per-session deprecation warning
via PSFramework and forwards all arguments to `Connect-FabricAccount`.

**No breaking changes.** Existing scripts calling `Set-FabricApiHeaders` keep
working with identical behavior, gaining only a single informational warning per
session.

## Goals

- `Connect-FabricAccount` exists as the real, primary implementation.
- `Set-FabricApiHeaders` keeps working with identical parameters, parameter sets,
  validation, tab-completion, and behavior.
- First use of `Set-FabricApiHeaders` in a session emits a PSFramework warning
  recommending `Connect-FabricAccount`. The warning appears once per session only.
- Documentation, tests, and changelog reflect the new primary name.

## Non-Goals

- Plan 2 (research and increase Fabric + Power BI API endpoint coverage) — separate spec.
- Plan 3 (complete, correct Pester test coverage across the module) — separate spec.
- Removing `Set-FabricApiHeaders` (it remains supported indefinitely for now).
- Any change to authentication behavior, parameters, or the
  `$script:FabricAuthContext` state model.
- The orphaned `docs/Set-FabricHeaders.md` file (noted but out of scope).

## Design

### Component 1: `Connect-FabricAccount` (primary implementation)

- **File:** `source/Public/Utils/Connect-FabricAccount.ps1` (git-renamed from
  `Set-FabricApiHeaders.ps1` to preserve history).
- **Function:** renamed to `Connect-FabricAccount`. The function body is unchanged —
  same three parameter sets (`UserPrincipal`, `ServicePrincipal`, `ManagedIdentity`),
  same authentication logic, same `$script:FabricAuthContext` updates, same error
  handling.
- **Comment-based help:** updated so `.SYNOPSIS` / `.DESCRIPTION` reference
  `Connect-FabricAccount`, all `.EXAMPLE` blocks use `Connect-FabricAccount`, and a
  `.NOTES` line records that `Set-FabricApiHeaders` is a backward-compatible
  (deprecated) wrapper.
- No `[Alias()]` attribute (an alias cannot emit the required warning).

### Component 2: `Set-FabricApiHeaders` (deprecated wrapper)

- **File:** `source/Public/Utils/Set-FabricApiHeaders.ps1` (retained, rewritten as a
  wrapper).
- **Function:** thin wrapper exposing a param block identical to
  `Connect-FabricAccount` (duplicated verbatim so parameter sets, validation, and tab
  completion remain identical), then forwarding via `Connect-FabricAccount @PSBoundParameters`.
- **Deprecation warning:** emitted via PSFramework's `-Once` parameter, which writes
  the message only once per PowerShell process (per session), keyed by an identifier
  string. No manual flag or `prefix.ps1` change is needed.

  ```powershell
  function Set-FabricApiHeaders {
      [CmdletBinding(DefaultParameterSetName = 'UserPrincipal', SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
      param ( <# param block identical to Connect-FabricAccount #> )

      Write-PSFMessage -Level Warning -Once 'MicrosoftFabricMgmt.SetFabricApiHeaders.Deprecation' `
          -Message "Set-FabricApiHeaders is deprecated; use Connect-FabricAccount instead. (This warning shows once per session.)"
      Connect-FabricAccount @PSBoundParameters
  }
  ```

- The wrapper passes through `-WhatIf` / `-Confirm` naturally via `@PSBoundParameters`;
  `SupportsShouldProcess` on the wrapper keeps those common parameters bindable.

### Component 3: Manifest exports

- **File:** `source/MicrosoftFabricMgmt.psd1`.
- `FunctionsToExport`: replace `'Set-FabricApiHeaders'` with **both**
  `'Connect-FabricAccount'` and `'Set-FabricApiHeaders'`.
- `AliasesToExport`: remains `@()` (no aliases used).

  > Note: if the Sampler build auto-generates `FunctionsToExport` from public function
  > files, the source manifest edit may be redundant but is kept explicit and correct.
  > The plan will verify the built manifest exports both names.

### Component 4: Documentation

- Rename/regenerate `docs/Set-FabricApiHeaders.md` → `docs/Connect-FabricAccount.md`
  (primary), and either retain a short `docs/Set-FabricApiHeaders.md` stub pointing to
  the new name or regenerate it noting deprecation.
- Update `README.md` and `docs/index.md` references from `Set-FabricApiHeaders` to
  `Connect-FabricAccount` (mentioning the alias/wrapper for back-compat).
- `CHANGELOG.md` / manifest `ReleaseNotes` `[Unreleased]`:
  - **Added:** `Connect-FabricAccount` as the primary authentication command.
  - **Deprecated:** `Set-FabricApiHeaders` — now a wrapper for `Connect-FabricAccount`;
    emits a one-time-per-session warning. Still fully supported.

## Testing

Update `tests/Unit/Set-FabricApiHeaders.Tests.ps1` (and/or add
`tests/Unit/Connect-FabricAccount.Tests.ps1`) to cover:

1. `Connect-FabricAccount` performs authentication for each parameter set (existing
   assertions, retargeted to the new name) with mocked `Connect-AzAccount` /
   `Get-AzAccessToken`.
2. `Set-FabricApiHeaders` forwards correctly to `Connect-FabricAccount` for each
   parameter set (mock `Connect-FabricAccount`, assert it is invoked with the expected
   bound parameters).
3. `Set-FabricApiHeaders` emits the deprecation warning via `Write-PSFMessage -Once`:
   mock `Write-PSFMessage` and `Connect-FabricAccount`, invoke the wrapper, and assert
   `Write-PSFMessage` was called once with `-Level Warning` and the expected `-Once`
   identifier, and `Connect-FabricAccount` was invoked. (The actual once-per-process
   suppression is PSFramework's responsibility, so the test verifies the wrapper passes
   `-Once` rather than re-testing PSFramework internals.)
4. Both commands are exported and resolvable after importing the built module.

## Verification

```powershell
.\build.ps1 -Tasks build,test
Import-Module .\output\module\MicrosoftFabricMgmt\<version>\MicrosoftFabricMgmt.psd1 -Force
Get-Command Connect-FabricAccount, Set-FabricApiHeaders   # both present
```

- Confirm `build,test` passes.
- Confirm both commands are available post-import.
- Confirm calling `Set-FabricApiHeaders` twice in one session warns once.

## Risks / Notes

- **Param duplication drift:** the wrapper's param block must stay in sync with
  `Connect-FabricAccount`. Mitigated by a test asserting forwarding for every parameter
  set; documented as the cost of supporting the one-time warning (a pure alias cannot
  warn).
- **Sampler manifest generation:** verify whether the build regenerates
  `FunctionsToExport`; ensure the final built manifest exports both names.
