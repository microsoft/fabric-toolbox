param([Parameter(Mandatory=$true)][string]$FeatureName)

$phaseDir = "docs\features\$FeatureName"
$phases = Get-ChildItem "$phaseDir\phase_*.md" -ErrorAction SilentlyContinue | Sort-Object Name

if ($phases.Count -eq 0) {
    Write-Host "❌ ERROR: No phase files found in $phaseDir" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== PHASE COMPLETION VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Feature: $FeatureName" -ForegroundColor Cyan
Write-Host "Phase Directory: $phaseDir`n" -ForegroundColor Cyan

$incomplete = @()
$requiredSections = @("Working Directory", "Verification", "Acceptance Criteria", "COMMIT", "Rollback")

foreach ($file in $phases) {
    Write-Host "Checking $($file.Name)..." -ForegroundColor Yellow
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    
    if (-not $content) {
        Write-Host "  ❌ INCOMPLETE - File is empty or unreadable" -ForegroundColor Red
        $incomplete += $file.Name
        continue
    }
    
    $issues = @()
    
    # Check required sections
    foreach ($section in $requiredSections) {
        if ($content -notmatch $section) { 
            $issues += "Missing: $section" 
        }
    }
    
    # Check for truncation indicators
    $lastLines = Get-Content $file.FullName -ErrorAction SilentlyContinue | Select-Object -Last 20 | Out-String
    if ($lastLines -match "continue\.\.\.|I'll continue|let me continue|Due to length|Due to extensive") {
        $issues += "Truncation detected"
    }
    
    # Check code blocks are balanced
    $fences = ([regex]::Matches($content, '```')).Count
    if ($fences % 2 -ne 0) { 
        $issues += "Incomplete code blocks (odd number of ``` fences: $fences)" 
    }
    
    # Check for ellipsis in code
    if ($content -match '```[^`]*\.\.\.[^`]*```') {
        $issues += "Code blocks contain ellipsis (...)"
    }
    
    # Report
    if ($issues.Count -gt 0) {
        Write-Host "  ❌ INCOMPLETE" -ForegroundColor Red
        $issues | ForEach-Object { Write-Host "     - $_" -ForegroundColor Red }
        $incomplete += $file.Name
    } else {
        Write-Host "  ✅ COMPLETE" -ForegroundColor Green
    }
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$completeCount = $phases.Count - $incomplete.Count
Write-Host "Complete: $completeCount/$($phases.Count)" -ForegroundColor $(if ($completeCount -eq $phases.Count) { "Green" } else { "Yellow" })

if ($incomplete.Count -gt 0) {
    Write-Host "`n⚠️ Incomplete phases:" -ForegroundColor Red
    $incomplete | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "`nPlease regenerate or fix incomplete phases before proceeding to execution." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "`n✅ All phases complete and ready for execution!" -ForegroundColor Green
    Write-Host "Next step: Begin Phase 0 execution using phase_0_*.md" -ForegroundColor Cyan
    exit 0
}
