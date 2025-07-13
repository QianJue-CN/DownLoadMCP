@echo off
echo Starting Download MCP Server...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dist directory exists
if not exist "dist" (
    echo Building project...
    npm run build
    if %errorlevel% neq 0 (
        echo Error: Build failed
        pause
        exit /b 1
    )
)

REM Start the server
echo Starting MCP server...
node dist/index.js

pause
