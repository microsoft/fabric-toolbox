<#!
.SYNOPSIS
Update $expectedParams in each Unit test by dot-sourcing the related function and using Get-Command.

.DESCRIPTION
For each *.Tests.ps1 under tests/Unit, locate the corresponding function file under source/ (Public/Private),
dot-source it to load the function, get its parameters via Get-Command, and replace the $expectedParams array
in the test file to exactly match. This automatically includes common parameters and WhatIf/Confirm when
SupportsShouldProcess is set.

.NOTES
Updated by Jess Pomfret and Rob Sewell November 2026
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$RepoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot '..')).ProviderPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$testsRoot  = Join-Path $RepoRoot 'tests/Unit'
$sourceRoot = Join-Path $RepoRoot 'source'

if (-not (Test-Path $testsRoot)) { throw "Tests root not found: $testsRoot" }
if (-not (Test-Path $sourceRoot)) { throw "Source root not found: $sourceRoot" }

function Find-FunctionFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]$FunctionName
    )
    $files = Get-ChildItem -Path $sourceRoot -Filter "$FunctionName.ps1" -File -Recurse -ErrorAction SilentlyContinue
    if ($files) { return ($files | Select-Object -First 1) }
    return $null
}

function Get-FunctionParametersViaDotSource {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]$FunctionName,
        [Parameter(Mandatory)] [string]$FunctionPath
    )
    # Ensure we're using the function definition from the given file
    try {
        if (Get-Command -Name $FunctionName -ErrorAction SilentlyContinue) {
            if (Test-Path "Function:$FunctionName") { Remove-Item "Function:$FunctionName" -Force -ErrorAction SilentlyContinue }
        }
        . $FunctionPath
        $cmd = Get-Command -Name $FunctionName -ErrorAction Stop
        # Return parameter names as they appear; hashtable keys order not guaranteed
        # We'll keep raw keys for presence, then separate common parameters later.
        return @($cmd.Parameters.Keys)
    } catch {
        throw "Failed to load '$FunctionName' from '$FunctionPath': $($_.Exception.Message)"
    }
}

function Replace-ExpectedParamsInTest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]$TestPath,
        [Parameter(Mandatory)] [string[]]$ExpectedParams
    )
    $content = Get-Content -Path $TestPath -Raw
    # Multi-line formatting: one parameter per line
    $indented = $ExpectedParams | ForEach-Object { '    "{0}"' -f $_ }
    $replacement = "$" + 'expectedParams = @(' + "`n" + ($indented -join "`n") + "`n)"
    $pattern = '(?m)^\s*\$expectedParams\s*=\s*@\((?<arr>[\s\S]*?)\)'
    $newContent = [regex]::Replace($content, $pattern, $replacement)
    if ($newContent -ne $content) {
        Set-Content -Path $TestPath -Value $newContent -NoNewline
        return $true
    }
    # Fallback: insert after param() block
    $paramBlock = [regex]::Match($content, '(?m)^param\s*\((?:[\s\S]*?)\)\s*')
    if ($paramBlock.Success) {
        $idx = $paramBlock.Index + $paramBlock.Length
        $newContent = $content.Insert($idx, "`n`n$replacement`n")
        Set-Content -Path $TestPath -Value $newContent -NoNewline
        return $true
    }
    return $false
}

$testFiles = Get-ChildItem -Path $testsRoot -Filter '*.Tests.ps1' -File -Recurse
Write-Host "Found $($testFiles.Count) test files in Unit" -ForegroundColor Cyan

$updated = 0; $skipped = 0; $missing = 0; $failed = 0

foreach ($tf in $testFiles) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($tf.Name)
    $functionName = [regex]::Replace($base, '(?i)\.tests$', '')
    $funcFile = Find-FunctionFile -FunctionName $functionName
    if (-not $funcFile) {
        Write-Warning "No function file found for test '$($tf.Name)' (function '$functionName')"
        $missing++; continue
    }
    try {
        $params = Get-FunctionParametersViaDotSource -FunctionName $functionName -FunctionPath $funcFile.FullName
        # Separate function-specific from common/default parameters; keep requested ordering: function params first, common at bottom.
        $commonList = @('Verbose','Debug','ErrorAction','WarningAction','InformationAction','InformationVariable','OutVariable','OutBuffer','PipelineVariable','ErrorVariable','WarningVariable','Confirm','WhatIf')
        $functionSpecific = @()
        $commonDetected = @()
        foreach ($p in $params) {
            if ($commonList -contains $p) {
                if (-not ($commonDetected -contains $p)) { $commonDetected += $p }
            } else {
                if (-not ($functionSpecific -contains $p)) { $functionSpecific += $p }
            }
        }
        # Order common parameters according to commonList declaration
        $orderedCommon = foreach ($c in $commonList) { if ($commonDetected -contains $c) { $c } }
        $finalParams = @($functionSpecific + $orderedCommon)
        if (Replace-ExpectedParamsInTest -TestPath $tf.FullName -ExpectedParams $finalParams) {
            Write-Host "Updated expected params in: $($tf.Name)" -ForegroundColor Green
            $updated++
        } else {
            Write-Host "No change needed: $($tf.Name)" -ForegroundColor DarkGray
            $skipped++
        }
    } catch {
        Write-Warning $_.Exception.Message
        $failed++
    }
}

Write-Host "Done. Updated: $updated, Skipped: $skipped, Missing function: $missing, Failed: $failed" -ForegroundColor Yellow
