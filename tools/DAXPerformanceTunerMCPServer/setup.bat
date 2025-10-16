@echo off
REM DAX Query Tuner - Windows bootstrap script
REM Double-click this file to run the PowerShell setup helper

title DAX Query Tuner Setup

echo.
echo ========================================
echo    DAX Query Tuner Setup
echo ========================================
echo.
echo This will automatically install everything you need.
echo.
echo What this script does:
echo  [CHECK] Validates Python and .NET installations
echo  [INSTALL] Installs Python requirements
echo  [VALIDATE] Confirms DaxExecutor is available
echo  [CONFIG] Writes VS Code MCP settings (if missing)
echo.
echo Press any key to start, or close this window to cancel...
pause >nul

echo.
echo Starting setup...

REM Check if PowerShell is available
powershell -Command "Write-Host 'Testing PowerShell...'" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] PowerShell not found
    echo.
    echo This is unusual for Windows 10/11. Please try:
    echo 1. Run this as Administrator
    echo 2. Or manually run: powershell -File setup.ps1
    echo.
    goto :error
)

echo [SUCCESS] PowerShell available
echo.
echo Running automated setup...
echo.

REM Run the PowerShell setup script with better error handling
powershell -ExecutionPolicy Bypass -File ".\setup.ps1" -NonInteractive

if errorlevel 1 (
    echo.
    echo ========================================
    echo    Setup encountered issues
    echo ========================================
    echo.
    echo Common solutions:
    echo.
    echo Missing Python?
    echo  Download from: https://python.org/downloads/
    echo  Make sure to check "Add Python to PATH"
    echo.
    echo Missing .NET?
    echo  Download .NET 8.0 Runtime from: 
    echo    https://dotnet.microsoft.com/download/dotnet/8.0
    echo  Choose "Download .NET 8.0 Runtime" (not SDK)
    echo.
    echo Permission issues?
    echo  Right-click setup.bat and select "Run as administrator"
    echo.
    echo For detailed help, see: README.md ("Quick Development Setup")
    goto :error
) else (
    echo.
    echo ========================================
    echo    Setup completed successfully!
    echo ========================================
    echo.
    echo NEXT STEPS:
    echo.
    echo 1. Configure your AI client (Claude Desktop, VS Code, etc.)
    echo    See README.md for configuration examples
    echo.
    echo 2. Start optimizing:
    echo    Ask your AI: "Help me optimize a DAX query"
    echo.
    echo 3. You should see 4 streamlined DAX optimization tools available
    echo.
    echo For detailed instructions, see: README.md ("Configure Your AI Client")
    echo.
    goto :success
)

:error
echo.
echo Need help? Check:
echo  README.md (quick setup guide + troubleshooting)
echo  requirements.txt (list of Python packages)
echo  setup.ps1 (detailed automation steps)
echo.
echo You can also run: pip install -r requirements.txt && python src\server.py
echo.
