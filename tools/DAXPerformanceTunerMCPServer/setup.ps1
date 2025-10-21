#!/usr/bin/env pwsh
# DAX Performance Tuner - Windows Setup Script
# Automates setup for Windows users

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
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "[ERROR] $Message"   -ForegroundColor Red }
function Write-Info    { param($Message) Write-Host "[INFO]  $Message"   -ForegroundColor Blue }
function Write-Step    { param($Message) Write-Host "`n[STEP] $Message"   -ForegroundColor Cyan }

Write-Header

# Sanity: Windows only (PBID dependency)
if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Error "This tool requires Windows (Power BI dependency)"
    exit 1
}
Write-Success "Running on Windows"

function Test-Command($command) {
    try { if (Get-Command $command -ErrorAction Stop) { return $true } }
    catch { return $false }
}

# ---------- Python check (optional if called with -SkipInstall) ----------
$SelectedPython = $null
$SelectedVersion = $null

if (-not $SkipInstall) {
    Write-Step "Checking Python installation..."

    if (Test-Command "python") {
        $versionOutput = (python --version 2>&1) -replace "Python\s+",""
        Write-Info "Default Python: $versionOutput"
        try {
            $mm = (python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1).Trim()
        } catch { $mm = $null }

        if ($mm) {
            $major,$minor = $mm.Split('.',2)
            if ([int]$major -eq 3 -and [int]$minor -ge 8 -and [int]$minor -le 13) {
                $SelectedPython = "python"
                $SelectedVersion = $versionOutput
                Write-Success "Using default Python $versionOutput"
            } else {
                Write-Warning "Default Python $versionOutput not compatible (need 3.8-3.13)"
            }
        }
    } else {
        Write-Warning "Python not found on PATH"
    }

    if (-not $SelectedPython -and (Test-Command "py")) {
        Write-Info "Trying Windows Python Launcher (py) for compatible versions..."
        foreach ($v in "3.13","3.12","3.11","3.10","3.9","3.8") {
            $out = & py -$v --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $SelectedPython = "py -$v"
                $SelectedVersion = ($out -replace "Python\s+","").Trim()
                Write-Success "Using $SelectedVersion via py -$v"
                break
            }
        }
    }

    if (-not $SelectedPython) {
        Write-Error "No compatible Python (3.8-3.13) found."
        Write-Info  "Install Python 3.13 or 3.12 from https://python.org/downloads/"
        exit 1
    }

    # Upgrade pip + install deps using the selected interpreter
    Write-Step "Installing Python dependencies..."
    & $SelectedPython -m pip install --upgrade pip --quiet
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to upgrade pip"; exit 1 }

    & $SelectedPython -m pip install -r requirements.txt --quiet
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install Python packages"; exit 1 }

    # Verify pythonnet present (for XMLA connectivity)
    $pythonnetCheck = & $SelectedPython -c "import pythonnet" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "pythonnet is installed"
    } else {
        Write-Warning "pythonnet not detected, installing..."
        & $SelectedPython -m pip install "pythonnet>=3.0.0,<3.1.0" --quiet
        if ($LASTEXITCODE -ne 0) { Write-Error "Failed to install pythonnet"; exit 1 }
        Write-Success "pythonnet installed"
    }
} else {
    Write-Info "Skipping Python install checks (handled by setup.bat)"
}

# ---------- .NET check (optional if -SkipInstall) ----------
Write-Step "Checking .NET installation..."
if (-not $SkipInstall) {
    if (-not (Test-Command "dotnet")) {
        Write-Error ".NET not found! Install .NET SDK 8.0+: https://dotnet.microsoft.com/download/dotnet/8.0"
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
            Write-Warning ".NET SDK 8.0+ not found for building"
            Write-Info "Installed SDKs:`n$sdks"
        }
    } catch { Write-Info "Continuing with available .NET version..." }
} else {
    Write-Info "Skipping .NET check (handled by setup.bat)"
}

# ---------- Build/verify DaxExecutor if doing installs ----------
Write-Step "Checking DaxExecutor..."
if (-not $SkipInstall) {
    $exe = "src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe"
    if (Test-Path $exe) {
        & $exe --help *> $null
        if ($LASTEXITCODE -eq 0) {
            $sizeMB = ((Get-Item $exe).Length / 1MB).ToString("F1")
            Write-Success "DaxExecutor ready ($sizeMB MB)"
        } else {
            Write-Warning "DaxExecutor present but failed verification; rebuilding..."
            Remove-Item $exe -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not (Test-Path $exe)) {
        $sdks = dotnet --list-sdks 2>&1
        $has8plus = $sdks | Where-Object { $_ -match "^\s*(\d+)\." -and [int]$matches[1] -ge 8 }
        if (-not $has8plus) {
            Write-Error ".NET SDK 8.0+ required to build DaxExecutor"
            Write-Info "Installed SDKs:`n$sdks"
            exit 1
        }
        Push-Location "src\dax_executor"
        try {
            dotnet clean -c Release --verbosity quiet | Out-Null
            dotnet build -c Release --verbosity quiet
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path "bin\Release\net8.0-windows\win-x64\DaxExecutor.exe")) {
                throw "Build failed"
            }
            & "bin\Release\net8.0-windows\win-x64\DaxExecutor.exe" --help *> $null
            if ($LASTEXITCODE -ne 0) { throw "Post-build verification failed" }
            Write-Success "DaxExecutor built and verified"
        } catch {
            Write-Error "Failed to build DaxExecutor: $_"
            Pop-Location
            exit 1
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Info "Skipping DaxExecutor build/verify (handled by setup.bat)"
}

# ---------- Unblock DLLs ----------
Write-Step "Unblocking DLLs from Windows security restrictions..."
try {
    $dlls = @()
    $dlls += Get-ChildItem -Path "dotnet\*.dll" -ErrorAction SilentlyContinue
    $dlls += Get-ChildItem -Path "src\dax_executor\bin\Release\net8.0-windows\win-x64\*.dll" -ErrorAction SilentlyContinue
    foreach ($d in $dlls) { Unblock-File -Path $d.FullName -ErrorAction SilentlyContinue }
    if ($dlls.Count -gt 0) { Write-Success "Unblocked $($dlls.Count) DLL(s)" } else { Write-Info "No DLLs to unblock" }
} catch {
    Write-Warning "Could not unblock some DLLs - consider running as Administrator"
}

# ---------- Configure VS Code MCP ----------
Write-Step "Configuring VS Code (.vscode/mcp.json)..."
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = Get-Location }

$vsCodeDir   = Join-Path $scriptDir ".vscode"
$mcpFile     = Join-Path $vsCodeDir "mcp.json"
$serverPath  = Join-Path $scriptDir "src\server.py"
$venvPython  = Join-Path $scriptDir ".venv\Scripts\python.exe"

if (-not (Test-Path $vsCodeDir)) {
    New-Item -ItemType Directory -Path $vsCodeDir | Out-Null
    Write-Info "Created .vscode directory"
} else {
    Write-Info ".vscode directory already exists"
}

# Escape backslashes for JSON
$serverPathJson = ($serverPath -replace '\\','\\')
$venvPythonJson = ($venvPython -replace '\\','\\')

$mcpContent = @"
{
  "servers": {
    "dax-performance-tuner": {
      "command": "$venvPythonJson",
      "args": [
        "$serverPathJson"
      ],
      "env": {}
    }
  }
}
"@

Set-Content -Path $mcpFile -Value $mcpContent -Encoding UTF8
Write-Success "mcp.json configured to use virtual environment Python"

# ---------- Summary ----------
Write-Step "Setup validation complete"
Write-Success "All components are ready!"
Write-Info "Python environment with dependencies"
Write-Info "DaxExecutor verified"
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
Write-Host "For other MCP clients, run:" -ForegroundColor Yellow
Write-Host ("  {0}" -f (Join-Path $scriptDir ".venv\Scripts\python.exe")) -ForegroundColor Green
Write-Host ("  [""{0}""]" -f $serverPathJson) -ForegroundColor Green

if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
