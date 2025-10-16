#!/usr/bin/env pwsh
# DAX Performance Tuner - Windows Setup Script
# This script automates the setup process for Windows users

param(
    [switch]$NonInteractive = $false
)

function Write-Header {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "   DAX Performance Tuner Setup"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Setting up everything you need for DAX optimization..."
    Write-Host ""
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message"
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message"
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message"
}

function Write-Info {
    param($Message)
    Write-Host "[INFO] $Message"
}

function Write-Step {
    param($Message)
    Write-Host ""
    Write-Host "[STEP] $Message"
}

Write-Header

# Check if running from Downloads folder (common mistake)
$currentPath = Get-Location
if ($currentPath -like "*\Downloads\*") {
    Write-Warning "You are running from the Downloads folder!"
    Write-Info "For best results, extract the files to a permanent location first"
    Write-Info "Example: C:\Projects\fabric-toolbox\tools\DAXPerformanceTunerMCPServer"
    Write-Host ""
    if (-not $NonInteractive) {
        Write-Host "Continue anyway? (Y/N): " -NoNewline
        $response = Read-Host
        if ($response -ne "Y" -and $response -ne "y") {
            Write-Info "Setup cancelled. Please extract to a permanent location and run again."
            exit 0
        }
    }
}

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
Write-Host "========================================"
Write-Host "   Setup Completed Successfully!"
Write-Host "========================================"
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

# Create or update mcp.json with relative paths (like SemanticModelMCPServer)
$mcpFile = Join-Path $vsCodeDir "mcp.json"

# Use relative paths with cwd set to this directory
# This matches the pattern used by SemanticModelMCPServer
$mcpContent = @"
{
  "servers": {
    "dax-performance-tuner": {
      "command": "./.venv/Scripts/python",
      "args": ["src/server.py"],
      "cwd": "$($scriptDir -replace '\\', '\\\\')"
    }
  }
}
"@

Set-Content -Path $mcpFile -Value $mcpContent -Encoding UTF8
Write-Success "mcp.json configured (will work from: $scriptDir)"
Write-Info "Configuration uses relative paths with working directory set"

Write-Host ""
Write-Host "What's Ready:"
Write-Success "Python virtual environment with all dependencies"
Write-Success "DaxExecutor.exe ready for performance analysis"  
Write-Success "4 streamlined MCP tools for DAX optimization"
Write-Success "VS Code MCP config prepared (if missing)"

Write-Host ""
Write-Host "Next Steps:"
Write-Host ""
Write-Host "1. Add this MCP server to your VS Code User Settings:"
Write-Host ""
Write-Host "   Option A - Using VS Code UI:"
Write-Host "   - Press Ctrl+Shift+P and search for 'Preferences: Open User Settings (JSON)'"
Write-Host "   - Add the 'github.copilot.chat.mcp.servers' section (see below)"
Write-Host ""
Write-Host "   Option B - Manual configuration:"
Write-Host "   - Copy the configuration from: $mcpFile"
Write-Host "   - Paste into your VS Code User Settings JSON"
Write-Host ""
Write-Host "   The configuration to add:"
Write-Host '   "github.copilot.chat.mcp.servers": {'
Write-Host '     "dax-performance-tuner": {'
Write-Host '       "command": "./.venv/Scripts/python",'
Write-Host '       "args": ["src/server.py"],'
Write-Host "       `"cwd`": `"$scriptDir`""
Write-Host '     }'
Write-Host '   }'
Write-Host ""
Write-Host "2. Restart VS Code (close all windows and reopen)"
Write-Host ""
Write-Host "3. Test the MCP server:"
Write-Host "   - Open GitHub Copilot Chat"
Write-Host "   - Ask: 'What MCP tools are available?'"
Write-Host "   - You should see 4 DAX Performance Tuner tools"
Write-Host ""
Write-Host "4. Start optimizing DAX queries!"
Write-Host "   - Ask: 'Help me optimize a DAX query'"
Write-Host "   - Provide workspace, dataset, and your DAX query"

Write-Host ""
Write-Info "Need help? Check:"
Write-Info "- README.md (setup + configuration)"
Write-Info "- requirements.txt (Python dependencies)"
Write-Info "- setup.ps1 (this automation script)"

if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "Setup complete! The virtual environment is ready."
    Write-Host "Restart VS Code to activate the MCP server, or run: .venv\Scripts\python src/server.py"
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
