@echo off
setlocal enabledelayedexpansion
REM DAX Performance Tuner - Windows setup script
REM Creates virtual environment and installs all dependencies (Python 3.8-3.13)

REM Change to the script's directory
cd /d "%~dp0"

title DAX Performance Tuner Setup

echo.
echo ========================================
echo    DAX Performance Tuner Setup
echo ========================================
echo.
echo This will automatically install everything you need.
echo.
echo What this script does:
echo  [CHECK] Validates Python (3.8-3.13) and .NET SDK installations
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

REM ---------- Find a compatible Python (3.8-3.13) ----------
set "PYTHON_CMD="
set "PYTHON_VERSION="
set "PY_MAJOR="
set "PY_MINOR="

REM 1) Try default "python"
python --version >nul 2>&1
if not errorlevel 1 (
  for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%v"
  for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
    set "PY_MAJOR=%%a"
    set "PY_MINOR=%%b"
  )
  if defined PY_MAJOR if defined PY_MINOR (
    if "%PY_MAJOR%"=="3" (
      if !PY_MINOR! GEQ 8 if !PY_MINOR! LEQ 13 (
        set "PYTHON_CMD=python"
        echo [SUCCESS] Using default Python %PYTHON_VERSION%
      ) else (
        echo [WARNING] Default Python %PYTHON_VERSION% not compatible (need 3.8-3.13)
      )
    ) else (
      echo [WARNING] Default Python %PYTHON_VERSION% is not Python 3.x
    )
  ) else (
    echo [WARNING] Could not parse Python version
  )
) else (
  echo [WARNING] Python not found on PATH
)

REM 2) If needed, try the Windows Python Launcher with specific versions
if not defined PYTHON_CMD (
  echo.
  echo Checking for compatible Python via the py launcher...
  for %%v in (3.13 3.12 3.11 3.10 3.9 3.8) do (
    py -%%v --version >nul 2>&1
    if not errorlevel 1 (
      for /f "tokens=2 delims= " %%p in ('py -%%v --version 2^>^&1') do set "PYTHON_VERSION=%%p"
      set "PYTHON_CMD=py -%%v"
      echo [SUCCESS] Found Python !PYTHON_VERSION! via py -%%v
      goto :have_python
    )
  )
)

if not defined PYTHON_CMD (
  echo.
  echo [ERROR] No compatible Python version found (need 3.8-3.13).
  echo Your default Python is: %PYTHON_VERSION%
  echo.
  echo Solutions:
  echo  1. Install Python 3.13 or 3.12: https://python.org/downloads/
  echo  2. Or install alongside and use: py -3.13
  goto :error
)

:have_python
echo.

REM ---------- Check .NET SDK ----------
dotnet --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] .NET SDK not found
  echo Please install .NET SDK 8.0 or higher: https://dotnet.microsoft.com/download
  goto :error
)
echo [SUCCESS] .NET SDK found
echo.

REM ---------- Create or repair venv with the compatible interpreter ----------
set "VENV_PY=.venv\Scripts\python.exe"

if exist ".venv" (
  echo Checking existing virtual environment...
  if exist "%VENV_PY%" (
    for /f "tokens=2 delims= " %%v in ('"%VENV_PY%" --version 2^>^&1') do set "VENV_VERSION=%%v"
    echo Virtual environment Python: !VENV_VERSION!
    for /f "tokens=1,2 delims=." %%a in ("!VENV_VERSION!") do (
      set "VENV_MAJOR=%%a"
      set "VENV_MINOR=%%b"
    )
    if "!VENV_MAJOR!"=="3" (
      if !VENV_MINOR! GEQ 8 if !VENV_MINOR! LEQ 13 (
        echo [SUCCESS] Virtual environment is compatible
      ) else (
        echo [WARNING] Venv Python !VENV_VERSION! incompatible, recreating with %PYTHON_CMD%...
        rmdir /s /q .venv
        %PYTHON_CMD% -m venv .venv
        if errorlevel 1 (
          echo [ERROR] Failed to create virtual environment
          goto :error
        )
        echo [SUCCESS] Virtual environment recreated
      )
    ) else (
      echo [WARNING] Venv Python !VENV_VERSION! incompatible, recreating with %PYTHON_CMD%...
      rmdir /s /q .venv
      %PYTHON_CMD% -m venv .venv
      if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        goto :error
      )
      echo [SUCCESS] Virtual environment recreated
    )
  ) else (
    echo [INFO] .venv exists but missing python.exe, recreating with %PYTHON_CMD%...
    rmdir /s /q .venv
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 (
      echo [ERROR] Failed to create virtual environment
      goto :error
    )
    echo [SUCCESS] Virtual environment recreated
  )
) else (
  echo Creating virtual environment with %PYTHON_CMD%...
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment
    goto :error
  )
  echo [SUCCESS] Virtual environment created
)

echo.

REM ---------- Install Python packages using the venv python ----------
set "PYTHONUTF8=1"
set "VENV_PY=.venv\Scripts\python.exe"

echo Installing Python packages...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] Failed to upgrade pip
  goto :error
)
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] Failed to install Python packages
  goto :error
)
echo [SUCCESS] Python packages installed
echo.

REM ---------- Build DaxExecutor if needed ----------
if not exist "src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe" (
  echo Building DaxExecutor from source...
  pushd src\dax_executor
  dotnet build -c Release -r win-x64 --self-contained false
  if errorlevel 1 (
    popd
    echo [ERROR] Failed to build DaxExecutor
    goto :error
  )
  popd
  echo [SUCCESS] DaxExecutor built successfully
) else (
  echo [SUCCESS] DaxExecutor already built
)
echo.

REM ---------- Configure MCP (non-install actions only) ----------
echo Configuring MCP settings...
powershell -ExecutionPolicy Bypass -File ".\setup.ps1" -NonInteractive -SkipInstall
if errorlevel 1 (
  echo [WARNING] MCP configuration encountered issues (non-critical)
)

echo.
echo ========================================
echo    Setup completed successfully!
echo ========================================
echo.
echo NEXT STEPS:
echo  1. Open VS Code in this folder
echo  2. Open .vscode\mcp.json and click "Start" on the server
echo  3. Ask Copilot: "Help me optimize a DAX query"
echo.
echo For other MCP clients, use this Python path:
echo   %CD%\.venv\Scripts\python.exe
echo.
pause
exit /b 0

:error
echo.
echo Setup failed. Please check the error messages above.
echo Need help? Check README.md for troubleshooting tips.
echo.
pause
exit /b 1
