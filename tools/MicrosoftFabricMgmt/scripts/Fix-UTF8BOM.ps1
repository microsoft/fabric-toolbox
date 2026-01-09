<#
.SYNOPSIS
    Ensures all PowerShell source files have UTF-8 BOM encoding.

.DESCRIPTION
    This script scans all .ps1 and .psm1 files in the source directory and ensures they have UTF-8 BOM encoding,
    which is required by the module's build configuration and PSScriptAnalyzer rules.

.PARAMETER Path
    The root path to search for files. Defaults to source directory.

.PARAMETER WhatIf
    Shows what would be changed without making changes.

.EXAMPLE
    .\Fix-UTF8BOM.ps1 -Path ../source

.NOTES
    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter()]
    [string]$Path = "$PSScriptRoot\..\source"
)

Write-Host "Starting UTF-8 BOM encoding fix..." -ForegroundColor Cyan

# UTF-8 with BOM encoding
$utf8BOM = New-Object System.Text.UTF8Encoding $true

# Find all PS1 and PSM1 files
$files = Get-ChildItem -Path $Path -Include "*.ps1", "*.psm1" -Recurse

Write-Host "Found $($files.Count) PowerShell files to check" -ForegroundColor Yellow

$filesFixed = 0

foreach ($file in $files) {
    # Read first 3 bytes to check for UTF-8 BOM (EF BB BF)
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)

    $hasBOM = $false
    if ($bytes.Length -ge 3) {
        if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $hasBOM = $true
        }
    }

    if (-not $hasBOM) {
        if ($PSCmdlet.ShouldProcess($file.FullName, "Add UTF-8 BOM encoding")) {
            # Read content and write back with UTF-8 BOM
            $content = [System.IO.File]::ReadAllText($file.FullName)
            [System.IO.File]::WriteAllText($file.FullName, $content, $utf8BOM)

            $filesFixed++
            Write-Host "  ✓ $($file.Name): Added UTF-8 BOM" -ForegroundColor Green
        }
    }
}

Write-Host "`nUTF-8 BOM encoding fix complete!" -ForegroundColor Cyan
Write-Host "  Files fixed: $filesFixed" -ForegroundColor Green
Write-Host "  Files already correct: $($files.Count - $filesFixed)" -ForegroundColor Gray

if ($filesFixed -gt 0) {
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "  1. Run: .\build.ps1 -Tasks build,test" -ForegroundColor White
    Write-Host "  2. Commit: git add . && git commit -m 'Fix UTF-8 BOM encoding for modified files'" -ForegroundColor White
}
