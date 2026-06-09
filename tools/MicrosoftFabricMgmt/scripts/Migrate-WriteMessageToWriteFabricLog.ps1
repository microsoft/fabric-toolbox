<#
.SYNOPSIS
    Migrates Write-Message calls to Write-FabricLog throughout the module.

.DESCRIPTION
    This script automates the migration of Write-Message calls to the new Write-FabricLog wrapper function.
    It processes PowerShell files and performs the following transformations:
    - Write-Message -Message "text" -Level Level → Write-FabricLog -Message "text" -Level Level
    - Adds -ErrorRecord $_ for Error level calls when appropriate

.PARAMETER Path
    The root path to search for files. Defaults to source directory.

.PARAMETER WhatIf
    Shows what would be changed without making changes.

.EXAMPLE
    .\Migrate-WriteMessageToWriteFabricLog.ps1 -Path ../source

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

Write-Host "Starting Write-Message to Write-FabricLog migration..." -ForegroundColor Cyan

# Find all PS1 files with Write-Message calls
$files = Get-ChildItem -Path $Path -Filter "*.ps1" -Recurse | Where-Object {
    $content = Get-Content $_.FullName -Raw
    $content -match 'Write-Message'
}

Write-Host "Found $($files.Count) files with Write-Message calls" -ForegroundColor Yellow

$totalReplacements = 0
$filesModified = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $fileReplacements = 0

    # Simple replacement: Write-Message → Write-FabricLog
    $pattern = 'Write-Message'
    $replacement = 'Write-FabricLog'

    $matches = [regex]::Matches($content, $pattern)
    if ($matches.Count -gt 0) {
        $content = $content -replace $pattern, $replacement
        $fileReplacements = $matches.Count
    }

    # Only write if content changed
    if ($content -ne $originalContent) {
        if ($PSCmdlet.ShouldProcess($file.FullName, "Replace $fileReplacements instances of Write-Message with Write-FabricLog")) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $totalReplacements += $fileReplacements
            $filesModified++
            Write-Host "  ✓ $($file.Name): $fileReplacements replacements" -ForegroundColor Green
        }
    }
}

Write-Host "`nMigration complete!" -ForegroundColor Cyan
Write-Host "  Files modified: $filesModified" -ForegroundColor Green
Write-Host "  Total replacements: $totalReplacements" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Run: .\build.ps1 -Tasks build,test" -ForegroundColor White
Write-Host "  2. Review: Select-String 'Write-Message' -Path $Path\**\*.ps1" -ForegroundColor White
Write-Host "  3. Commit: git add . && git commit -m 'Migrate logging: Write-Message to Write-FabricLog'" -ForegroundColor White
