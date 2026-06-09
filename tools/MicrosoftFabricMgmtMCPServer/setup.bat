@echo off
setlocal EnableDelayedExpansion

echo.
echo =====================================================
echo   MicrosoftFabricMgmt MCP Server - Setup
echo =====================================================
echo.

:: ------------------------------------------------------------------
:: 1. Check for pwsh (PowerShell 7+)
:: ------------------------------------------------------------------
echo [1/5] Checking for pwsh (PowerShell 7+)...
where pwsh >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pwsh not found on PATH.
    echo        Download PowerShell 7 from: https://aka.ms/powershell
    exit /b 1
)
for /f "delims=" %%v in ('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.Major"') do set PS_MAJOR=%%v
echo       Found pwsh (PowerShell %PS_MAJOR%).

:: ------------------------------------------------------------------
:: 2. Check for Python 3.10+
:: ------------------------------------------------------------------
echo.
echo [2/5] Checking for Python 3.10+...
set PYTHON_CMD=
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "delims=" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    set PYTHON_CMD=python
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        for /f "delims=" %%v in ('py --version 2^>^&1') do set PY_VER=%%v
        set PYTHON_CMD=py
    ) else (
        echo ERROR: Python not found. Install Python 3.10+ from https://python.org
        exit /b 1
    )
)
echo       Found !PY_VER! (!PYTHON_CMD!)

:: ------------------------------------------------------------------
:: 3. Create virtual environment
:: ------------------------------------------------------------------
echo.
echo [3/5] Creating Python virtual environment (.venv)...
if exist ".venv" (
    echo       .venv already exists, skipping creation.
) else (
    %PYTHON_CMD% -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create virtual environment.
        exit /b 1
    )
    echo       Virtual environment created.
)

:: ------------------------------------------------------------------
:: 4. Install Python dependencies
:: ------------------------------------------------------------------
echo.
echo [4/5] Installing Python dependencies...
call .venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pip install failed. Check requirements.txt and your network connection.
    exit /b 1
)
echo       Python dependencies installed.

:: ------------------------------------------------------------------
:: 5. Install PowerShell module dependencies + generate mcp.json
:: ------------------------------------------------------------------
echo.
echo [5/5] Installing PowerShell module dependencies and generating mcp.json...
pwsh -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0setup.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: PowerShell setup step reported errors (see above).
    echo          You may need to install PS module dependencies manually:
    echo          Install-Module Az.Accounts, PSFramework, MicrosoftPowerBIMgmt -Scope CurrentUser
)

echo.
echo =====================================================
echo   Setup complete!
echo.
echo   To start the MCP server:
echo     .venv\Scripts\python.exe server.py
echo.
echo   To configure Claude Desktop, add to claude_desktop_config.json:
echo     See README.md for configuration examples.
echo =====================================================
echo.
endlocal
