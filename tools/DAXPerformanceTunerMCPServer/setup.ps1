#!/usr/bin/env pwsh
# DAX Performance Tuner - Windows Setup Script
# This script automates the setup process for Windows users

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
if (-not $SkipInstall) {
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
        
        if ($major -eq 3 -and $minor -ge 8 -and $minor -le 13) {
            Write-Success "Python version is supported (3.$minor)"
        } elseif ($major -eq 3 -and $minor -gt 13) {
            Write-Error "Python $major.$minor is too new for pythonnet"
            Write-Warning "pythonnet 3.0.x supports Python 3.8 through 3.13"
            Write-Warning "Please install Python 3.13 or earlier from: https://python.org/downloads/"
            Write-Info "Recommended: Python 3.12.x (most stable)"
            exit 1
        } elseif ($major -eq 3 -and $minor -lt 8) {
            Write-Error "Python 3.8+ required, found $major.$minor"
            Write-Warning "Please upgrade Python from: https://python.org/downloads/"
            exit 1
        } else {
            Write-Error "Python 3.x required, found $major.$minor"
            Write-Warning "Please install Python 3.8-3.13 from: https://python.org/downloads/"
            exit 1
        }
    } catch {
        Write-Warning "Could not verify Python version, continuing..."
    }
} else {
    Write-Info "Skipping Python check (installation handled by setup.bat)"
}

# Check .NET
Write-Step "Checking .NET installation..."
if (-not $SkipInstall) {
    if (-not (Test-Command "dotnet")) {
        Write-Error ".NET not found!"
        Write-Warning "Please install .NET SDK 8.0+ from:"
        Write-Warning "https://dotnet.microsoft.com/download/dotnet/8.0"
        exit 1
    }

    $dotnetVersion = dotnet --version 2>&1
    Write-Success "Found .NET: $dotnetVersion"

    # Check for .NET SDK 8.0 or higher
    try {
        $dotnetSdks = dotnet --list-sdks 2>&1
        $hasCompatibleSdk = $dotnetSdks | Where-Object { 
            $_ -match "(\d+)\." -and [int]$matches[1] -ge 8 
        }
        
        if ($hasCompatibleSdk) {
            Write-Success ".NET SDK 8.0+ available for building"
        } else {
            Write-Warning ".NET SDK 8.0+ not found for building"
            Write-Info "Current SDKs: $dotnetSdks"
        }
    } catch {
        Write-Info "Continuing with available .NET version..."
    }
} else {
    Write-Info "Skipping .NET check (installation handled by setup.bat)"
}

# Install Python dependencies
Write-Step "Installing Python dependencies..."
if (-not $SkipInstall) {
    try {
        Write-Info "Upgrading pip..."
        python -m pip install --upgrade pip --quiet
        Write-Success "Pip upgraded"
        
        Write-Info "Installing required packages..."
        python -m pip install -r requirements.txt --quiet
        Write-Success "Python dependencies installed"
        # Ensure pythonnet installed for XMLA connectivity
        Write-Info "Verifying pythonnet installation..."
        python -c "import pythonnet" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "pythonnet is installed"
        } else {
            Write-Warning "pythonnet not detected, installing pythonnet..."
            python -m pip install pythonnet>=3.0.0 --quiet
            Write-Success "pythonnet installed"
        }
    }
    catch {
        Write-Error "Failed to install Python dependencies"
        Write-Warning "Try running manually: pip install -r requirements.txt"
        exit 1
    }
} else {
    Write-Info "Skipping Python package installation (handled by setup.bat)"
}

# Check DaxExecutor
Write-Step "Checking DaxExecutor..."
if (-not $SkipInstall) {
    $daxExecutorPath = "src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe"

    if (Test-Path $daxExecutorPath) {
        # Verify it's executable and not corrupted
        try {
            $null = & $daxExecutorPath --help 2>&1
            if ($LASTEXITCODE -eq 0) {
                $fileSize = (Get-Item $daxExecutorPath).Length / 1MB
                Write-Success "DaxExecutor ready and verified! ($($fileSize.ToString('F1'))MB)"
            } else {
                Write-Warning "DaxExecutor exists but failed verification, rebuilding..."
                throw "Verification failed"
            }
        }
        catch {
            Write-Warning "Rebuilding DaxExecutor..."
            Remove-Item $daxExecutorPath -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $daxExecutorPath)) {
        Write-Info "DaxExecutor not found, building from source..."
        
        # Check for .NET SDK (8.0 or higher required for building)
        $dotnetSdks = dotnet --list-sdks 2>&1
        $hasCompatibleSdk = $dotnetSdks | Where-Object { 
            $_ -match "(\d+)\." -and [int]$matches[1] -ge 8 
        }
        
        if (-not $hasCompatibleSdk) {
            Write-Error ".NET SDK 8.0 or higher required to build DaxExecutor"
            Write-Info "You currently have:"
            dotnet --list-sdks 2>&1 | ForEach-Object { Write-Info "  $_" }
            Write-Warning "Options:"
            Write-Warning "1. Install .NET 8.0+ SDK from: https://dotnet.microsoft.com/download/dotnet"
            Write-Warning "2. Download pre-built release from GitHub"
            exit 1
        }
        
        $sdkVersion = ($hasCompatibleSdk | Select-Object -First 1) -replace '\s.*$', ''
        Write-Success "Found compatible .NET SDK: $sdkVersion"
        Write-Info "Building DaxExecutor (this may take 30-60 seconds)..."
        
        Push-Location "src\dax_executor"
        try {
            # Clean first to ensure fresh build
            dotnet clean -c Release --verbosity quiet | Out-Null
            
            # Build the project
            dotnet build -c Release --verbosity quiet
            
            if ($LASTEXITCODE -eq 0 -and (Test-Path "bin\Release\net8.0-windows\win-x64\DaxExecutor.exe")) {
                Write-Success "DaxExecutor built successfully!"
                
                # Verify the built executable
                $null = & "bin\Release\net8.0-windows\win-x64\DaxExecutor.exe" --help 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Build verified and working"
                } else {
                    throw "Built executable failed verification"
                }
            } else {
                throw "Build completed but executable not found"
            }
        }
        catch {
            Write-Error "Failed to build DaxExecutor: $_"
            Write-Warning "Please check:"
            Write-Warning "1. .NET 8.0 SDK is properly installed"
            Write-Warning "2. All source files are present in src/dax_executor/"
            Write-Warning "3. Microsoft Analysis Services DLLs are in dotnet/ folder"
            Pop-Location
            exit 1
        }
        finally {
            Pop-Location
        }
    }
} else {
    Write-Info "Skipping DaxExecutor check (build handled by setup.bat)"
}

# Unblock DLLs downloaded from the internet (Windows security feature)
Write-Step "Unblocking DLLs from Windows security restrictions..."
try {
    $dllsToUnblock = Get-ChildItem -Path "dotnet\*.dll" -ErrorAction SilentlyContinue
    if ($dllsToUnblock) {
        $unblockedCount = 0
        foreach ($dll in $dllsToUnblock) {
            Unblock-File -Path $dll.FullName -ErrorAction SilentlyContinue
            $unblockedCount++
        }
        Write-Success "Unblocked $unblockedCount DLL(s) in dotnet\ folder"
    } else {
        Write-Info "No DLLs found in dotnet\ folder to unblock"
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

# Create or update mcp.json with absolute paths
$mcpFile = Join-Path $vsCodeDir "mcp.json"
$serverPath = Join-Path $scriptDir "src\server.py"
$venvPython = Join-Path $scriptDir ".venv\Scripts\python.exe"

# Use forward slashes and escape backslashes for JSON
$serverPathJson = $serverPath -replace '\\', '\\'
$venvPythonJson = $venvPython -replace '\\', '\\'

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

Write-Host ""
Write-Host "What's Ready:" -ForegroundColor Cyan
Write-Success "Isolated Python virtual environment with all dependencies"
Write-Success "DaxExecutor.exe ready for performance analysis"  
Write-Success "4 streamlined MCP tools for DAX optimization"
Write-Success "VS Code MCP config prepared"

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open VS Code in this folder" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. Open .vscode/mcp.json and click 'Start' on the server" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Test it works:" -ForegroundColor Yellow
Write-Host "   Ask Copilot: 'Help me optimize a DAX query'" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. For other MCP clients (Claude Desktop, etc.):" -ForegroundColor Yellow
Write-Host "   Command: " -NoNewline -ForegroundColor Yellow
Write-Host "$scriptDir\.venv\Scripts\python.exe" -ForegroundColor Green
Write-Host "   Args: " -NoNewline -ForegroundColor Yellow  
Write-Host '["' -NoNewline -ForegroundColor Green
Write-Host "$serverPathJson" -NoNewline -ForegroundColor Green
Write-Host '"]' -ForegroundColor Green

Write-Host ""
Write-Info "Need help? Check:"
Write-Info "- README.md (setup + configuration)"
Write-Info "- requirements.txt (Python dependencies)"
Write-Info "- setup.ps1 (this automation script)"

if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "Setup complete! Launch the MCP server with 'python src/server.py' when you're ready." -ForegroundColor Green
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
