@echo off
setlocal enabledelayedexpansion
REM DAX Performance Tuner - Windows setup script
REM Creates virtual environment and installs all dependencies

title DAX Performance Tuner Setup

echo.
echo ========================================
echo    DAX Performance Tuner Setup
echo ========================================
echo.
echo This will automatically install everything you need.
echo.
echo What this script does:
echo  [CHECK] Validates Python and .NET SDK installations
echo  [CREATE] Creates isolated Python virtual environment
echo  [INSTALL] Installs Python packages in virtual environment
echo  [BUILD] Compiles DaxExecutor.exe from source
echo  [CONFIG] Configures VS Code MCP settings
echo.
echo Press any key to start, or close this window to cancel...
pause >nul

echo.
echo Starting setup...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found
    echo.
    echo Please install Python 3.8-3.13:
    echo  Download from: https://python.org/downloads/
    echo  Important: Check "Add Python to PATH" during installation
    echo.
    goto :error
)

echo [SUCCESS] Python found

REM Check Python version before creating venv (must be 3.8-3.13 for pythonnet)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYTHON_VERSION=%%v
echo Python version: %PYTHON_VERSION%

REM Extract major.minor (e.g., 3.14 from 3.14.0)
for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)

if "%PY_MAJOR%" NEQ "3" (
    echo [ERROR] Python 3.x required, found Python %PYTHON_VERSION%
    echo.
    echo Please install Python 3.8-3.13 from: https://python.org/downloads/
    goto :error
)

if %PY_MINOR% LSS 8 (
    echo [ERROR] Python %PYTHON_VERSION% is too old
    echo.
    echo This tool requires Python 3.8 through 3.13
    echo Please install a newer version: https://python.org/downloads/
    goto :error
)

if %PY_MINOR% GTR 13 (
    echo [ERROR] Python %PYTHON_VERSION% is too new
    echo.
    echo pythonnet currently supports Python 3.8 through 3.13
    echo You have Python %PYTHON_VERSION% which is not yet supported
    echo.
    echo Solutions:
    echo  1. Install Python 3.13 or 3.12 alongside Python %PYTHON_VERSION%
    echo     Download: https://python.org/downloads/
    echo  2. During install, UNCHECK "Add to PATH" to keep %PYTHON_VERSION% as default
    echo  3. Use py launcher: py -3.13 -m venv .venv
    echo.
    goto :error
)

echo [SUCCESS] Python %PYTHON_VERSION% is compatible
echo.

REM Check if .NET SDK is available
dotnet --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] .NET SDK not found
    echo.
    echo Please install .NET SDK 8.0 or higher:
    echo  Download from: https://dotnet.microsoft.com/download
    echo.
    goto :error
)

echo [SUCCESS] .NET SDK found
echo.

REM Create virtual environment if it doesn't exist
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        goto :error
    )
    echo [SUCCESS] Virtual environment created
    echo.
) else (
    echo Checking existing virtual environment...
    
    REM Check if the venv Python version is compatible
    if exist ".venv\Scripts\python.exe" (
        for /f "tokens=2 delims= " %%v in ('.venv\Scripts\python.exe --version 2^>^&1') do set VENV_VERSION=%%v
        echo Virtual environment Python: !VENV_VERSION!
        
        REM Extract venv major.minor
        for /f "tokens=1,2 delims=." %%a in ("!VENV_VERSION!") do (
            set VENV_MAJOR=%%a
            set VENV_MINOR=%%b
        )
        
        REM Check if venv Python is 3.8-3.13
        if "!VENV_MAJOR!" NEQ "3" (
            echo [WARNING] Virtual environment has incompatible Python !VENV_VERSION!
            echo Recreating with Python %PYTHON_VERSION%...
            rmdir /s /q .venv
            python -m venv .venv
            echo [SUCCESS] Virtual environment recreated
            echo.
        ) else if !VENV_MINOR! LSS 8 (
            echo [WARNING] Virtual environment Python !VENV_VERSION! is too old
            echo Recreating with Python %PYTHON_VERSION%...
            rmdir /s /q .venv
            python -m venv .venv
            echo [SUCCESS] Virtual environment recreated
            echo.
        ) else if !VENV_MINOR! GTR 13 (
            echo [WARNING] Virtual environment has Python !VENV_VERSION! which is incompatible
            echo Recreating with Python %PYTHON_VERSION%...
            rmdir /s /q .venv
            python -m venv .venv
            echo [SUCCESS] Virtual environment recreated
            echo.
        ) else (
            echo [SUCCESS] Virtual environment Python !VENV_VERSION! is compatible
            echo.
        )
    ) else (
        echo [SUCCESS] Virtual environment exists
        echo.
    )
)

REM Activate virtual environment and install packages
echo Installing Python packages...
call .venv\Scripts\activate.bat
pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install Python packages
    goto :error
)
echo [SUCCESS] Python packages installed
echo.

REM Build DaxExecutor if needed
if not exist "src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe" (
    echo Building DaxExecutor from source...
    cd src\dax_executor
    dotnet build -c Release -r win-x64 --self-contained false
    if errorlevel 1 (
        cd ..\..
        echo [ERROR] Failed to build DaxExecutor
        goto :error
    )
    cd ..\..
    echo [SUCCESS] DaxExecutor built successfully
    echo.
) else (
    echo [SUCCESS] DaxExecutor already built
    echo.
)

REM Run PowerShell setup for MCP configuration
echo Configuring MCP settings...
powershell -ExecutionPolicy Bypass -File ".\setup.ps1" -NonInteractive -SkipInstall
if errorlevel 1 (
    echo [WARNING] MCP configuration encountered issues (non-critical)
    echo.
)

echo.
echo ========================================
echo    Setup completed successfully!
echo ========================================
echo.
echo NEXT STEPS:
echo.
echo 1. Open VS Code in this folder
echo 2. Open .vscode\mcp.json and click "Start" on the server
echo 3. Ask Copilot: "Help me optimize a DAX query"
echo.
echo For other MCP clients, use this Python path:
echo   %CD%\.venv\Scripts\python.exe
echo.

pause
exit /b 0

:error
echo.
echo Setup failed. Please check the error messages above.
echo.
echo Need help? Check README.md for troubleshooting tips.
echo.
pause
exit /b 1
