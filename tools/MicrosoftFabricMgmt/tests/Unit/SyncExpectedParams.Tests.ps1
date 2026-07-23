#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Regression tests for scripts/sync-test-expected-params.ps1.

    Guards the documented footgun: a second run must NOT duplicate the $expectedParams
    block into already-synced test files. Exercises Set-ExpectedParamsInTest in isolation
    against temp files (the script's main loop is guarded so dot-sourcing does not touch the
    real suite).
#>

BeforeAll {
    $ScriptPath = "$PSScriptRoot/../../scripts/sync-test-expected-params.ps1"
    # Dot-source to load the helper functions; the main loop is skipped when InvocationName is '.'.
    . $ScriptPath

    $script:WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ("syncparams-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:WorkDir -Force | Out-Null
}

AfterAll {
    if ($script:WorkDir -and (Test-Path $script:WorkDir)) {
        Remove-Item $script:WorkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Describe 'sync-test-expected-params.ps1 :: Set-ExpectedParamsInTest' -Tag 'UnitTests' {

    It 'inserts an expectedParams block after param() when none exists' {
        $file = Join-Path $script:WorkDir 'insert.Tests.ps1'
        @'
param()

Describe 'Thing' {
    It 'has params' { $true | Should -BeTrue }
}
'@ | Set-Content -Path $file -NoNewline

        $changed = Set-ExpectedParamsInTest -TestPath $file -ExpectedParams @('WorkspaceId', 'WhatIf')
        $changed | Should -BeTrue

        $content = Get-Content -Path $file -Raw
        ([regex]::Matches($content, '\$expectedParams\s*=\s*@\(')).Count | Should -Be 1
        $content | Should -Match 'WorkspaceId'
    }

    It 'replaces an existing block with the new parameter list' {
        $file = Join-Path $script:WorkDir 'replace.Tests.ps1'
        @'
param()

$expectedParams = @(
    "OldParam"
)

Describe 'Thing' { }
'@ | Set-Content -Path $file -NoNewline

        $changed = Set-ExpectedParamsInTest -TestPath $file -ExpectedParams @('NewParam', 'Confirm')
        $changed | Should -BeTrue

        $content = Get-Content -Path $file -Raw
        ([regex]::Matches($content, '\$expectedParams\s*=\s*@\(')).Count | Should -Be 1
        $content | Should -Match 'NewParam'
        $content | Should -Not -Match 'OldParam'
    }

    It 'is idempotent: a second run makes no change and does NOT duplicate the block' {
        $file = Join-Path $script:WorkDir 'idempotent.Tests.ps1'
        @'
param()

Describe 'Thing' { }
'@ | Set-Content -Path $file -NoNewline

        $params = @('WorkspaceId', 'ItemId', 'WhatIf')

        # First run inserts the block.
        (Set-ExpectedParamsInTest -TestPath $file -ExpectedParams $params) | Should -BeTrue
        $afterFirst = Get-Content -Path $file -Raw

        # Second run with the same params must be a no-op (returns $false, content unchanged).
        (Set-ExpectedParamsInTest -TestPath $file -ExpectedParams $params) | Should -BeFalse
        $afterSecond = Get-Content -Path $file -Raw

        $afterSecond | Should -BeExactly $afterFirst
        ([regex]::Matches($afterSecond, '\$expectedParams\s*=\s*@\(')).Count | Should -Be 1
        # The param() block must remain intact and single.
        ([regex]::Matches($afterSecond, '(?m)^param\s*\(')).Count | Should -Be 1
    }
}
