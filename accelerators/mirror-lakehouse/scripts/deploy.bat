@echo off
setlocal enabledelayedexpansion

echo.
echo 🏠 Lakehouse Mirror - Docker Build ^& Deploy Script
echo ==================================================
echo.

REM Configuration
set IMAGE_NAME=lakehouse-mirror
set CONTAINER_NAME=lakehouse-mirror-app
set PORT=3000

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Check if .env file exists
if not exist ".env" (
    echo [WARNING] .env file not found. Creating from .env.example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SUCCESS] Created .env file from .env.example
        echo [WARNING] Please update .env file with your configuration before proceeding.
    ) else (
        echo [ERROR] .env.example file not found. Cannot create .env file.
        exit /b 1
    )
)

echo [INFO] Stopping existing containers...
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm %CONTAINER_NAME% >nul 2>&1

echo [INFO] Building Docker image...
docker build -t %IMAGE_NAME% .

if errorlevel 1 (
    echo [ERROR] Failed to build Docker image
    exit /b 1
)

echo [SUCCESS] Docker image built successfully

echo [INFO] Starting container...
docker run -d --name %CONTAINER_NAME% -p %PORT%:3001 --env-file .env --restart unless-stopped %IMAGE_NAME%

if errorlevel 1 (
    echo [ERROR] Failed to start container
    exit /b 1
)

echo [SUCCESS] Container started successfully
echo [SUCCESS] Application is running at: http://localhost:%PORT%

echo [INFO] Waiting for application to be ready...
timeout /t 10 >nul

REM Check application health (using curl if available, otherwise skip)
curl -f http://localhost:%PORT%/health >nul 2>&1
if not errorlevel 1 (
    echo [SUCCESS] Application is healthy and ready to use!
) else (
    echo [WARNING] Unable to verify health. Application may still be starting up.
    echo [WARNING] Check logs with: docker logs %CONTAINER_NAME%
)

echo.
echo 🎉 Deployment completed successfully!
echo.
echo Useful commands:
echo   View logs: docker logs -f %CONTAINER_NAME%
echo   Stop app:  docker stop %CONTAINER_NAME%
echo   Start app: docker start %CONTAINER_NAME%
echo   Remove:    docker rm -f %CONTAINER_NAME%
echo.

endlocal