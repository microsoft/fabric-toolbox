#!/usr/bin/env pwsh
# DAX Performance Tuner - Windows Setup Script
# Builds the MCP server from C# source and configures VS Code

param(
    [switch]$NonInteractive = $false,
    [switch]$SkipInstall = $false
)

function Write-Header {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   DAX Performance Tuner Setup" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Setting up everything you need for DAX optimization..." -ForegroundColor Cyan
    Write-Host ""
}
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warn    { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Err     { param($Message) Write-Host "[ERROR] $Message"   -ForegroundColor Red }
function Write-Info    { param($Message) Write-Host "[INFO]  $Message"   -ForegroundColor Blue }
function Write-Step    { param($Message) Write-Host "`n[STEP] $Message"   -ForegroundColor Cyan }

function Test-Command($command) {
    try { if (Get-Command $command -ErrorAction Stop) { return $true } }
    catch { return $false }
}

Write-Header

# Sanity: Windows only (Power BI dependency)
if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Err "This tool requires Windows (Power BI dependency)"
    exit 1
}
Write-Success "Running on Windows"

# ---------- .NET SDK check ----------
if (-not $SkipInstall) {
    Write-Step "Checking .NET installation..."
    if (-not (Test-Command "dotnet")) {
        Write-Err ".NET SDK not found! Install .NET SDK 8.0+: https://dotnet.microsoft.com/download/dotnet/8.0"
        exit 1
    }
    $dotnetVersion = dotnet --version 2>&1
    Write-Success "Found .NET: $dotnetVersion"

    try {
        $sdks = dotnet --list-sdks 2>&1
        $has8plus = $sdks | Where-Object { $_ -match "^\s*(\d+)\." -and [int]$matches[1] -ge 8 }
        if ($has8plus) {
            Write-Success ".NET SDK 8.0+ available"
        } else {
            Write-Err ".NET SDK 8.0+ required for building"
            Write-Info "Installed SDKs:`n$sdks"
            exit 1
        }
    } catch {
        Write-Warn "Could not verify SDK version, continuing..."
    }
} else {
    Write-Info "Skipping .NET check (handled by setup.bat)"
}

# ---------- Build and Publish ----------
$publishDir = "src\DaxPerformanceTuner.Console\bin\Release\net8.0-windows\win-x64\publish"
$exePath = Join-Path $publishDir "dax-performance-tuner.exe"

if (-not $SkipInstall) {
    Write-Step "Building DAX Performance Tuner MCP server..."

    if (Test-Path $exePath) {
        & $exePath --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $sizeMB = ((Get-Item $exePath).Length / 1MB).ToString("F1")
            Write-Success "MCP server already built ($sizeMB MB)"
        } else {
            Write-Warn "Existing build failed verification; rebuilding..."
            Remove-Item $exePath -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $exePath)) {
        Push-Location src
        try {
            dotnet publish DaxPerformanceTuner.Console\DaxPerformanceTuner.Console.csproj -c Release --verbosity quiet
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path "..\$exePath")) {
                throw "Build failed"
            }
            & "..\$exePath" --version *> $null
            if ($LASTEXITCODE -ne 0) { throw "Post-build verification failed" }
            Write-Success "MCP server built and verified"
        } catch {
            Write-Err "Failed to build MCP server: $_"
            Pop-Location
            exit 1
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Info "Skipping build (handled by setup.bat)"
}

# ---------- Unblock DLLs ----------
Write-Step "Unblocking DLLs from Windows security restrictions..."
try {
    $dlls = @()
    $dlls += Get-ChildItem -Path "dotnet\*.dll" -ErrorAction SilentlyContinue
    foreach ($d in $dlls) { Unblock-File -Path $d.FullName -ErrorAction SilentlyContinue }
    if ($dlls.Count -gt 0) { Write-Success "Unblocked $($dlls.Count) DLL(s)" } else { Write-Info "No DLLs to unblock" }
} catch {
    Write-Warn "Could not unblock some DLLs - consider running as Administrator"
}

# ---------- Configure VS Code MCP ----------
Write-Step "Configuring VS Code (.vscode/mcp.json)..."
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = Get-Location }

$vsCodeDir = Join-Path $scriptDir ".vscode"
$mcpFile   = Join-Path $vsCodeDir "mcp.json"
$fullExePath = Join-Path $scriptDir $exePath

if (-not (Test-Path $vsCodeDir)) {
    New-Item -ItemType Directory -Path $vsCodeDir | Out-Null
    Write-Info "Created .vscode directory"
} else {
    Write-Info ".vscode directory already exists"
}

# Escape backslashes for JSON
$exePathJson = ($fullExePath -replace '\\','\\')

$mcpContent = @"
{
  "servers": {
    "dax-performance-tuner": {
      "command": "$exePathJson",
      "args": ["--start"]
    }
  }
}
"@

Set-Content -Path $mcpFile -Value $mcpContent -Encoding UTF8
Write-Success "mcp.json configured to use built MCP server"

# ---------- Summary ----------
Write-Step "Setup validation complete"
Write-Success "All components are ready!"
Write-Info "MCP server built from C# source"
Write-Info "MCP config written"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Setup Completed Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Open VS Code in this folder" -ForegroundColor Yellow
Write-Host "2. Open .vscode/mcp.json and click 'Start' on the server" -ForegroundColor Yellow
Write-Host "3. Try: Ask Copilot 'Help me optimize a DAX query'" -ForegroundColor Yellow
Write-Host ""
Write-Host "For other MCP clients, use:" -ForegroundColor Yellow
Write-Host ("  {0} --start" -f $fullExePath) -ForegroundColor Green

if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
