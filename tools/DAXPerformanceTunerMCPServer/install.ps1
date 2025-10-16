#!/usr/bin/env pwsh
# DAX Performance Tuner - Quick Installer
# Downloads and installs from GitHub without needing to clone the entire repo

param(
    [string]$InstallPath = "$env:LOCALAPPDATA\DAXPerformanceTuner"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DAX Performance Tuner - Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# GitHub repository details
$repoOwner = "DAXNoobJustin"
$repoName = "fabric-toolbox"
$branch = "Add-DAX-Performance-Tuner-MCP"  # Change to "main" after merge
$toolPath = "tools/DAXPerformanceTunerMCPServer"

Write-Host "Installation directory: $InstallPath" -ForegroundColor Cyan
Write-Host "Repository: $repoOwner/$repoName" -ForegroundColor Gray
Write-Host "Branch: $branch" -ForegroundColor Gray
Write-Host ""

if (Test-Path $InstallPath) {
    Write-Host "Directory already exists. Removing old installation..." -ForegroundColor Yellow
    Remove-Item -Path $InstallPath -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# Download repository as ZIP
$zipUrl = "https://github.com/$repoOwner/$repoName/archive/refs/heads/$branch.zip"
$tempZip = Join-Path $env:TEMP "DAXPerformanceTuner-download.zip"
$tempExtract = Join-Path $env:TEMP "DAXPerformanceTuner-extract"

Write-Host "Downloading from GitHub..." -ForegroundColor Yellow
Write-Host "URL: $zipUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "Please wait, downloading repository..." -ForegroundColor Yellow

try {
    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    $ProgressPreference = 'Continue'
    
    $fileSize = [math]::Round((Get-Item $tempZip).Length / 1MB, 2)
    Write-Host "✓ Download complete! ($fileSize MB)" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Download failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "  1. Internet connection" -ForegroundColor White
    Write-Host "  2. GitHub repository exists: https://github.com/$repoOwner/$repoName" -ForegroundColor White
    Write-Host "  3. Branch '$branch' exists" -ForegroundColor White
    exit 1
}

# Extract the archive
Write-Host ""
Write-Host "Extracting files..." -ForegroundColor Yellow

if (Test-Path $tempExtract) {
    Remove-Item -Path $tempExtract -Recurse -Force
}
New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

try {
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Remove-Item -Path $tempZip -Force
    Write-Host "✓ Extraction complete!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Extraction failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Find the extracted tool folder
# GitHub extracts as: reponame-branchname/tools/DAXPerformanceTunerMCPServer
$extractedRepoFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
$toolSourcePath = Join-Path $extractedRepoFolder.FullName $toolPath

if (-not (Test-Path $toolSourcePath)) {
    Write-Host ""
    Write-Host "ERROR: Tool folder not found in repository" -ForegroundColor Red
    Write-Host "Expected path: $toolPath" -ForegroundColor Red
    Write-Host "Extracted to: $($extractedRepoFolder.FullName)" -ForegroundColor Red
    exit 1
}

# Copy tool files to installation directory
Write-Host ""
Write-Host "Installing to $InstallPath..." -ForegroundColor Yellow

try {
    Get-ChildItem -Path $toolSourcePath | Copy-Item -Destination $InstallPath -Recurse -Force
    Write-Host "✓ Files copied!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Copy failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup temp extraction folder
    if (Test-Path $tempExtract) {
        Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Run setup script
Write-Host ""
Write-Host "Running setup..." -ForegroundColor Yellow
Write-Host ""

Push-Location $InstallPath
try {
    & ".\setup.ps1" -NonInteractive
    $setupResult = $LASTEXITCODE
    
    if ($setupResult -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  Installation Complete!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Installation location:" -ForegroundColor Cyan
        Write-Host "  $InstallPath" -ForegroundColor White
        Write-Host ""
        Write-Host "To open in VS Code:" -ForegroundColor Cyan
        Write-Host "  cd `"$InstallPath`"" -ForegroundColor White
        Write-Host "  code ." -ForegroundColor White
        Write-Host ""
        Write-Host "Or to start the MCP server manually:" -ForegroundColor Cyan
        Write-Host "  cd `"$InstallPath`"" -ForegroundColor White
        Write-Host "  .venv\Scripts\python src\server.py" -ForegroundColor White
        Write-Host ""
    }
    else {
        Write-Host ""
        Write-Host "Setup completed with warnings. Check output above." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR during setup: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "You can try running setup manually from: $InstallPath" -ForegroundColor Yellow
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
