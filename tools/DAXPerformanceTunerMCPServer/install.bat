@echo off
REM DAX Performance Tuner - One-Line Installer
REM This downloads and installs the tool without needing to clone the entire repository

echo.
echo ========================================
echo   DAX Performance Tuner - Installer
echo ========================================
echo.
echo This will download and install DAX Performance Tuner
echo to: %LOCALAPPDATA%\DAXPerformanceTuner
echo.
pause

powershell -ExecutionPolicy Bypass -Command "iex (iwr 'https://raw.githubusercontent.com/DAXNoobJustin/fabric-toolbox/Add-DAX-Performance-Tuner-MCP/tools/DAXPerformanceTunerMCPServer/install.ps1').Content"

echo.
pause
