@echo off
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
    echo Please install Python 3.8 or higher:
    echo  Download from: https://python.org/downloads/
    echo  Important: Check "Add Python to PATH" during installation
    echo.
    goto :error
)

echo [SUCCESS] Python found
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
    echo [SUCCESS] Virtual environment already exists
    echo.
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
