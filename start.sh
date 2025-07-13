#!/bin/bash

echo "Starting Download MCP Server..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed"
    echo "Please install npm"
    exit 1
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Building project..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "Error: Build failed"
        exit 1
    fi
fi

# Start the server
echo "Starting MCP server..."
node dist/index.js
