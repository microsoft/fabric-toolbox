#!/usr/bin/env pwsh
# DAX Performance Tuner - Windows Setup Script
# This script automates the setup process for Windows users

param(
    [switch]$NonInteractive = $false
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

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Info {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Step {
    param($Message)
    Write-Host ""
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

Write-Header

# Check if running on Windows
if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Error "This tool requires Windows (Power BI dependency)"
    exit 1
}

Write-Success "Running on Windows"

# Function to check if a command exists
function Test-Command($command) {
    try {
        if (Get-Command $command -ErrorAction Stop) { return $true }
    }
    catch { return $false }
}

# Check Python
Write-Step "Checking Python installation..."
if (-not (Test-Command "python")) {
    Write-Error "Python not found!"
    Write-Warning "Please install Python 3.8+ from: https://python.org/downloads/"
    Write-Warning "Make sure to check 'Add Python to PATH' during installation"
    exit 1
}

$pythonVersion = python --version 2>&1
Write-Success "Found: $pythonVersion"

# Verify Python version
try {
    $versionOutput = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1
    $majorMinor = $versionOutput.Split('.')
    $major = [int]$majorMinor[0]
    $minor = [int]$majorMinor[1]
    
    if ($major -eq 3 -and $minor -ge 8) {
        Write-Success "Python version is supported (3.$minor)"
    } elseif ($major -gt 3) {
        Write-Success "Python version is supported ($major.$minor)"
    } else {
        Write-Error "Python 3.8+ required, found $major.$minor"
        Write-Warning "Please upgrade Python from: https://python.org/downloads/"
        exit 1
    }
} catch {
    Write-Warning "Could not verify Python version, continuing..."
}

# Check .NET
Write-Step "Checking .NET installation..."
if (-not (Test-Command "dotnet")) {
    Write-Error ".NET not found!"
    Write-Warning "Please install .NET 8.0 Runtime from:"
    Write-Warning "https://dotnet.microsoft.com/download/dotnet/8.0"
    Write-Warning "Choose: '.NET 8.0 Runtime' (not SDK - DaxExecutor is already built!)"
    exit 1
}

$dotnetVersion = dotnet --version 2>&1
Write-Success "Found .NET: $dotnetVersion"

# Check for .NET 8.0 specifically
try {
    $runtimes = dotnet --list-runtimes 2>&1 | Select-String "Microsoft.NETCore.App.*8\."
    if ($runtimes) {
        Write-Success ".NET 8.0 Runtime available"
    } else {
        Write-Warning ".NET 8.0 Runtime not found"
        Write-Warning "Please install .NET 8.0 Runtime from:"
        Write-Warning "https://dotnet.microsoft.com/download/dotnet/8.0"
        Write-Info "Current .NET version ($dotnetVersion) might work, continuing..."
    }
} catch {
    Write-Info "Continuing with available .NET version..."
}

# Create Python virtual environment
Write-Step "Creating Python virtual environment..."
$venvPath = ".venv"
if (Test-Path $venvPath) {
    Write-Info "Virtual environment already exists at $venvPath"
} else {
    try {
        python -m venv $venvPath
        Write-Success "Virtual environment created at $venvPath"
    }
    catch {
        Write-Error "Failed to create virtual environment"
        Write-Warning "Try running manually: python -m venv .venv"
        exit 1
    }
}

# Activate virtual environment
Write-Step "Activating virtual environment..."
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (Test-Path $activateScript) {
    try {
        & $activateScript
        Write-Success "Virtual environment activated"
    }
    catch {
        Write-Warning "Failed to activate virtual environment, continuing with system Python"
    }
} else {
    Write-Warning "Activate script not found, using system Python"
}

# Determine Python executable path for later use
$pythonExe = if (Test-Path (Join-Path $venvPath "Scripts\python.exe")) {
    Join-Path $venvPath "Scripts\python.exe"
} else {
    "python"
}

# Install Python dependencies
Write-Step "Installing Python dependencies into virtual environment..."
try {
    Write-Info "Upgrading pip..."
    & $pythonExe -m pip install --upgrade pip --quiet
    Write-Success "Pip upgraded"
    
    Write-Info "Installing required packages (including pythonnet for XMLA)..."
    & $pythonExe -m pip install -r requirements.txt --quiet
    Write-Success "Python dependencies installed in virtual environment"
}
catch {
    Write-Error "Failed to install Python dependencies"
    Write-Warning "Try running manually: .venv\Scripts\python -m pip install -r requirements.txt"
    exit 1
}

# Check DaxExecutor
Write-Step "Checking DaxExecutor..."
$daxExecutorPath = "src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe"

if (Test-Path $daxExecutorPath) {
    $fileSize = (Get-Item $daxExecutorPath).Length / 1MB
    Write-Success "DaxExecutor ready! ($($fileSize.ToString('F1'))MB)"
    Write-Info "Pre-built executable - no building required"
} else {
    Write-Warning "DaxExecutor not found at expected location"
    Write-Warning "This should be included in the repository"
    Write-Info "Expected location: $daxExecutorPath"
    
    # Try to build if we have SDK
    $dotnetSdks = dotnet --list-sdks 2>&1 | Select-String "8\."
    if ($dotnetSdks) {
        Write-Info "Attempting to build DaxExecutor..."
        Push-Location "src\dax_executor"
        try {
            dotnet publish -c Release -r win-x64 --no-self-contained
            if ($LASTEXITCODE -eq 0) {
                Write-Success "DaxExecutor built successfully!"
            } else {
                throw "Build failed"
            }
        }
        catch {
            Write-Error "Failed to build DaxExecutor"
            Pop-Location
            exit 1
        }
        finally {
            Pop-Location
        }
    } else {
        Write-Error "Cannot build DaxExecutor (no .NET SDK) and pre-built version missing"
        exit 1
    }
}

# Unblock DLLs downloaded from the internet (Windows security feature)
Write-Step "Unblocking ADOMD.NET DLLs (for XMLA connectivity)..."
try {
    $dllsToUnblock = Get-ChildItem -Path "dotnet\*.dll" -ErrorAction SilentlyContinue
    if ($dllsToUnblock) {
        $unblockedCount = 0
        foreach ($dll in $dllsToUnblock) {
            Unblock-File -Path $dll.FullName -ErrorAction SilentlyContinue
            $unblockedCount++
        }
        Write-Success "Unblocked $unblockedCount ADOMD.NET DLL(s) in dotnet\ folder"
    } else {
        Write-Warning "No DLLs found in dotnet\ folder - XMLA connectivity may not work"
    }
    
    # Also unblock DaxExecutor's own DLLs if present
    $executorDlls = Get-ChildItem -Path "src\dax_executor\bin\Release\net8.0-windows\win-x64\*.dll" -ErrorAction SilentlyContinue
    if ($executorDlls) {
        foreach ($dll in $executorDlls) {
            Unblock-File -Path $dll.FullName -ErrorAction SilentlyContinue
        }
        Write-Success "Unblocked DaxExecutor runtime DLLs"
    }
    
    Write-Info "DLLs are now trusted and can be loaded by .NET runtime"
}
catch {
    Write-Warning "Could not unblock some DLLs - you may need to run setup as Administrator"
    Write-Info "Or manually: Right-click each DLL → Properties → Check 'Unblock' → OK"
}

# Validation Summary
Write-Step "Setup validation complete..."
Write-Success "All components are ready!"
Write-Info "Python environment with all dependencies installed"
Write-Info "DaxExecutor ready for performance analysis"
Write-Info "MCP server configured and ready to start"

# Success message
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Setup Completed Successfully!" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host ""
# Configure VS Code settings for running the MCP server
Write-Step "Configuring VS Code in .vscode directory..."

# Get the absolute path to the current directory (where setup.ps1 is located)
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) {
    $scriptDir = Get-Location
}

# Create .vscode directory
$vsCodeDir = Join-Path -Path $scriptDir -ChildPath ".vscode"
if (-not (Test-Path $vsCodeDir)) {
        New-Item -ItemType Directory -Path $vsCodeDir | Out-Null
        Write-Info "Created .vscode directory"
} else {
        Write-Info ".vscode directory already exists"
}

# Create or update mcp.json with relative paths (workspace-relative)
$mcpFile = Join-Path $vsCodeDir "mcp.json"

# Use relative paths for portability across different machines
$mcpContent = @"
{
  "servers": {
    "dax-performance-tuner": {
      "command": "./.venv/Scripts/python",
      "args": [
        "src/server.py"
      ],
      "env": {}
    }
  }
}
"@

Set-Content -Path $mcpFile -Value $mcpContent -Encoding UTF8
Write-Success "mcp.json configured with relative paths for portability"
Write-Info "MCP server will use virtual environment Python"

Write-Host ""
Write-Host "What's Ready:" -ForegroundColor Cyan
Write-Success "Python virtual environment with all dependencies"
Write-Success "DaxExecutor.exe ready for performance analysis"  
Write-Success "4 streamlined MCP tools for DAX optimization"
Write-Success "VS Code MCP config prepared (if missing)"

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start the MCP server whenever you need it:" -ForegroundColor Yellow
Write-Host "   .venv\Scripts\python src/server.py" -ForegroundColor Green
Write-Host "   (Or just restart VS Code - it will auto-start via mcp.json)" -ForegroundColor Green
Write-Host ""
Write-Host "2. Configure your AI client:" -ForegroundColor Yellow
Write-Host "   - VS Code / GitHub Copilot Chat: Already configured via .vscode/mcp.json ✓" -ForegroundColor Yellow
Write-Host "   - Claude Desktop: Copy config from .vscode/mcp.json to claude_desktop_config.json" -ForegroundColor Yellow
Write-Host "   - Other MCP clients: Use .venv/Scripts/python with arg src/server.py" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Test it works:" -ForegroundColor Yellow
Write-Host "   Ask your AI: 'Help me optimize a DAX query'" -ForegroundColor Yellow
Write-Host "   You should see 4 streamlined DAX optimization tools available" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Start optimizing:" -ForegroundColor Yellow
Write-Host "   Provide your workspace, dataset, and DAX query" -ForegroundColor Yellow
Write-Host "   Let the AI guide you through the optimization process" -ForegroundColor Yellow

Write-Host ""
Write-Info "Need help? Check:"
Write-Info "- README.md (setup + configuration)"
Write-Info "- requirements.txt (Python dependencies)"
Write-Info "- setup.ps1 (this automation script)"

if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "Setup complete! The virtual environment is ready." -ForegroundColor Green
    Write-Host "Restart VS Code to activate the MCP server, or run: .venv\Scripts\python src/server.py" -ForegroundColor Green
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
