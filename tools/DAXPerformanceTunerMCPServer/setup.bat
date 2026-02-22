@echo off
setlocal enabledelayedexpansion
REM DAX Performance Tuner - Windows setup script
REM Builds the MCP server from source and configures VS Code

REM Change to the script's directory
cd /d "%~dp0"

title DAX Performance Tuner Setup

echo.
echo ========================================
echo    DAX Performance Tuner Setup
echo ========================================
echo.
echo This will automatically build and configure the DAX Performance Tuner MCP server.
echo.
echo What this script does:
echo  [CHECK] Validates .NET SDK 8.0+ installation
echo  [BUILD] Builds and publishes the MCP server from C# source
echo  [CONFIG] Configures VS Code MCP settings
echo.
echo Press any key to start, or close this window to cancel...
pause >nul

echo.
echo Starting setup...
echo.

REM ---------- Check .NET SDK ----------
dotnet --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] .NET SDK not found
  echo Please install .NET SDK 8.0 or higher: https://dotnet.microsoft.com/download
  goto :error
)

for /f "tokens=1 delims=." %%a in ('dotnet --version 2^>^&1') do set "DOTNET_MAJOR=%%a"
if !DOTNET_MAJOR! LSS 8 (
  echo [ERROR] .NET SDK 8.0 or higher required. Found: 
  dotnet --version
  echo Please install .NET SDK 8.0+: https://dotnet.microsoft.com/download
  goto :error
)
echo [SUCCESS] .NET SDK found
dotnet --version
echo.

REM ---------- Build and Publish ----------
set "PUBLISH_DIR=src\DaxPerformanceTuner.Console\bin\Release\net8.0-windows\win-x64\publish"
set "EXE_PATH=%PUBLISH_DIR%\dax-performance-tuner.exe"

echo Building DAX Performance Tuner MCP server...
pushd src
dotnet publish DaxPerformanceTuner.Console\DaxPerformanceTuner.Console.csproj -c Release
if errorlevel 1 (
  popd
  echo [ERROR] Build failed
  goto :error
)
popd

if not exist "%EXE_PATH%" (
  echo [ERROR] Build succeeded but executable not found at expected path
  echo Expected: %EXE_PATH%
  goto :error
)

echo [SUCCESS] MCP server built successfully
echo.

REM ---------- Configure VS Code MCP ----------
echo Configuring VS Code MCP settings...
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
echo For other MCP clients, use this executable path:
echo   %CD%\%EXE_PATH% --start
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
