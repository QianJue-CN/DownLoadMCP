# Download MCP

A high-performance file download tool based on the MCP (Model Context Protocol) standard, supporting multi-threaded downloads, resume capability, and session management.

[中文版本](README.md) | **English Version**

## ✨ Features

### 🚀 Core Download Features
- **Multi-threaded Downloads**: Support for 1-16 concurrent connections, significantly improving download speeds
- **Resume Capability**: Automatic handling of network interruptions with resume from breakpoints
- **Real-time Monitoring**: Detailed download progress, speed, and ETA information
- **Smart Retry**: Automatic retry of failed download segments for improved success rates
- **Task Management**: Complete download task list and status queries

### 🌐 Session Management
- **Cookie Management**: Automatic handling of HTTP cookies and session states
- **Browser Simulation**: Complete headers and user agent simulation
- **Pre-request Support**: Establish session states for websites requiring login
- **Multi-site Support**: Support for download links requiring specific session states

### 🔧 Technical Features
- **MCP Standard**: Fully compatible with MCP protocol for easy integration
- **TypeScript**: Complete type safety and intelligent code completion
- **Persistent Storage**: Download states automatically saved, recoverable after restart
- **Cross-platform**: Support for Windows, Linux, macOS

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/QianJue-CN/DownLoadMCP.git
cd DownLoadMCP

# Install dependencies
npm install

# Build the project
npm run build
```

## 🚀 Quick Start

### 1. Start the Service

#### Windows
```cmd
# Using batch script
start.bat

# Or manual start
npm start
```

#### Linux/macOS
```bash
# Using shell script
chmod +x start.sh
./start.sh

# Or manual start
npm start
```

### 2. MCP Configuration

#### Basic Configuration
Add the following configuration to your MCP client configuration:

```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Cross-platform Path Configuration

**Windows Example**:
```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\DownLoadMCP\\dist\\index.js"],
      "env": {
        "NODE_ENV": "production",
        "PATH": "C:\\Program Files\\nodejs;%PATH%"
      }
    }
  }
}
```

**Linux/macOS Example**:
```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "node",
      "args": ["/home/username/DownLoadMCP/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

**Environment Variables Explanation**:
- `NODE_ENV`: Set to `production` to enable production mode optimizations
- `PATH`: Ensure Node.js executable path is included in environment variables
  - Windows: Usually Node.js is installed in `C:\Program Files\nodejs`
  - Linux/macOS: Usually in `/usr/local/bin` or `/usr/bin`

**Environment Variable Validation**:

1. **NODE_ENV=production Effects**:
   - Enable Node.js production mode optimizations
   - Disable development debugging information
   - Improve runtime performance and security

2. **PATH Environment Variable Importance**:
   - Ensure Claude Desktop can find Node.js executable
   - Avoid "node: command not found" errors
   - Support different Node.js installation paths

3. **Verify Configuration Correctness**:
   ```bash
   # Check if Node.js is in PATH
   node --version

   # Check if npm is available
   npm --version

   # Test if project starts normally
   cd /path/to/DownLoadMCP
   node dist/index.js
   ```

**Configuration Key Points**:
- Use absolute paths pointing to `dist/index.js`
- Ensure Node.js is in system PATH
- Adjust path format according to operating system

### 3. Claude Desktop Integration

#### Configuration File Locations
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### Complete Configuration Examples

**Windows**:
```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\DownLoadMCP\\dist\\index.js"],
      "env": {
        "NODE_ENV": "production",
        "PATH": "C:\\Program Files\\nodejs;%PATH%"
      }
    }
  }
}
```

**Linux/macOS**:
```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "node",
      "args": ["/home/username/DownLoadMCP/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 🛠️ Available Tools

### Core Download Tools

#### 1. pre_request - Pre-request Tool
Establish session states for websites requiring login or specific sessions.

**Parameters:**
- `url` (required): URL to access
- `method` (optional): HTTP method (`GET`, `POST`, `HEAD`, default `GET`)
- `headers` (optional): Additional request headers object
- `body` (optional): Request body content (for POST requests)
- `sessionId` (optional): Session ID, auto-generated if not provided
- `timeout` (optional): Request timeout, default 30000ms
- `followRedirects` (optional): Whether to follow redirects, default true
- `userAgent` (optional): Custom User-Agent
- `referer` (optional): Set Referer header

**Return Value:**
```json
{
  "success": true,
  "sessionId": "session-uuid",
  "statusCode": 200,
  "headers": {...},
  "cookies": [...],
  "redirectHistory": [...]
}
```

### 2. download_file - File Download
Main file download tool supporting multi-threading and session management.

**Parameters:**
- `url` (required): Download link
- `outputPath` (required): Output directory path
- `filename` (optional): Custom filename
- `maxConcurrency` (optional): Concurrent connections (1-16, default 4)
- `chunkSize` (optional): Chunk size, default 1048576 (1MB)
- `timeout` (optional): Request timeout, default 30000ms
- `retryCount` (optional): Retry count (0-10, default 3)
- `workMode` (optional): Work mode
  - `blocking`: Blocking mode, wait for download completion
  - `non_blocking`: Non-blocking mode, return task ID immediately
  - `persistent`: Persistent mode
  - `temporary`: Temporary mode
- `enableResume` (optional): Enable resume capability, default true
- `sessionId` (optional): Use pre-established session state
- `headers` (optional): Custom HTTP request headers

**Return Value:**
```json
{
  "success": true,
  "taskId": "task-uuid",
  "filename": "downloaded-file.zip",
  "totalSize": 1048576,
  "status": "downloading"
}
```

### 3. Task Management Tools

#### get_download_status - Query Download Status
**Parameters:**
- `taskId` (required): Unique identifier of the download task

**Return Value:**
```json
{
  "taskId": "task-uuid",
  "status": "downloading",
  "progress": 0.75,
  "downloadedSize": 786432,
  "totalSize": 1048576,
  "speed": "1.2 MB/s",
  "eta": "00:00:05",
  "connections": 4
}
```

#### pause_download - Pause Download
**Parameters:**
- `taskId` (required): Download task ID to pause

#### resume_download - Resume Download
**Parameters:**
- `taskId` (required): Download task ID to resume

#### cancel_download - Cancel Download
**Parameters:**
- `taskId` (required): Download task ID to cancel

#### list_downloads - List All Tasks
**Parameters:**
- `status` (optional): Filter by status (`pending`, `downloading`, `paused`, `completed`, `failed`, `cancelled`)
- `limit` (optional): Return task count limit, default 20
- `offset` (optional): Pagination offset, default 0

### 4. verify_integrity - File Integrity Verification
Verify file integrity supporting multiple hash algorithms.

**Parameters:**
- `filePath` (required): File path to verify
- `algorithm` (optional): Hash algorithm (`md5`, `sha1`, `sha256`, `sha512`, default `sha256`)
- `expectedChecksum` (optional): Expected checksum value
- `generateReport` (optional): Whether to generate detailed report, default false

**Return Value:**
```json
{
  "success": true,
  "algorithm": "sha256",
  "checksum": "abc123...",
  "verified": true,
  "fileSize": 1048576,
  "processingTime": "0.5s"
}
```

## ⚙️ Configuration Recommendations

| Connection Type | Concurrency | Chunk Size | Use Case   |
| --------------- | ----------- | ---------- | ---------- |
| Slow            | 1-2         | 256KB      | <10Mbps    |
| Medium          | 4-6         | 1MB        | 10-100Mbps |
| Fast            | 8-16        | 2-4MB      | >100Mbps   |

## 🆚 Comparison with Other Tools

| Feature            | This Tool | aria2 | wget | curl |
| ------------------ | --------- | ----- | ---- | ---- |
| Multi-threaded     | ✅         | ✅     | ❌    | ❌    |
| Session Management | ✅         | ❌     | ❌    | ✅    |
| MCP Integration    | ✅         | ❌     | ❌    | ❌    |
| Real-time Monitor  | ✅         | ✅     | ❌    | ❌    |
| Resume Capability  | ✅         | ✅     | ✅    | ✅    |

## 🐛 Troubleshooting

### Common Problem Solutions

#### 1. Installation and Startup Issues

**Problem**: `npm install` fails
```bash
# Solution
# Clear cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json  # Linux/macOS
rmdir /s node_modules & del package-lock.json  # Windows
npm install
```

**Problem**: Build fails `npm run build`
```bash
# Check TypeScript version
npx tsc --version

# Reinstall TypeScript
npm install -D typescript@latest

# Clean and rebuild
npm run clean
npm run build
```

**Problem**: Service startup fails
```bash
# Check Node.js version (requires >=18.0.0)
node --version

# Check port usage
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Linux/macOS

# Check file permissions (Linux/macOS)
chmod +x start.sh
```

#### 2. MCP Configuration Issues

**Problem**: Claude Desktop cannot connect to MCP server
- **Check paths**: Ensure `args` contains absolute paths
- **Check permissions**: Ensure Claude Desktop has file access permissions
- **Check Node.js**: Ensure Node.js is in system PATH

**Windows Configuration Example**:
```json
{
  "mcpServers": {
    "download-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\YourName\\DownLoadMCP\\dist\\index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### 3. Download Issues

**Problem**: Cannot download from sites requiring login
```javascript
// Solution: Use pre_request to establish session
// 1. First establish session
{
  "tool": "pre_request",
  "url": "https://site.com/login",
  "method": "POST",
  "body": "username=user&password=pass"
}

// 2. Use returned sessionId for download
{
  "tool": "download_file",
  "url": "https://site.com/protected-file.zip",
  "outputPath": "./downloads",
  "sessionId": "session ID from step 1"
}
```

**Problem**: Slow download speed
- **Increase concurrency**: Set `maxConcurrency` to 8-16
- **Adjust chunk size**: Use 2-4MB `chunkSize` for high-speed networks
- **Check network**: Use network speed test tools to check bandwidth
- **Server limitations**: Some servers limit connections per IP

**Problem**: Connection timeout
```json
{
  "tool": "download_file",
  "url": "https://example.com/file.zip",
  "outputPath": "./downloads",
  "timeout": 60000,
  "retryCount": 5,
  "maxConcurrency": 2
}
```

**Problem**: Resume fails
- **Check disk space**: Ensure sufficient storage space
- **Check file permissions**: Ensure write permissions
- **Clean state files**: Delete `.download-resume/` directory to restart

#### 4. File Integrity Issues

**Problem**: Checksum mismatch
```json
{
  "tool": "verify_integrity",
  "filePath": "./downloads/file.zip",
  "algorithm": "sha256",
  "expectedChecksum": "abc123..."
}
```

**Problem**: Downloaded file is corrupted
- **Re-download**: Delete partially downloaded file and restart
- **Change download source**: Try different download links
- **Check network stability**: Use wired connection instead of wireless

#### 5. Performance Optimization

**Slow Network (<10Mbps)**:
```json
{
  "maxConcurrency": 2,
  "chunkSize": 262144,
  "timeout": 60000,
  "retryCount": 5
}
```

**Fast Network (>100Mbps)**:
```json
{
  "maxConcurrency": 16,
  "chunkSize": 4194304,
  "timeout": 30000,
  "retryCount": 3
}
```

#### 6. Logging and Debugging

**Enable verbose logging**:
```bash
# Set environment variable
export DEBUG=download-mcp:*  # Linux/macOS
set DEBUG=download-mcp:*     # Windows

# Start service
npm start
```

**View download status**:
```json
{
  "tool": "list_downloads",
  "status": "failed"
}
```

**Get task details**:
```json
{
  "tool": "get_download_status",
  "taskId": "your-task-id"
}
```

## 📄 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

### License Key Points
- ✅ Commercial use allowed
- ✅ Modification and distribution allowed
- ✅ Private use allowed
- ⚠️ Modified code must be open source
- ⚠️ Must include license and copyright notice when distributing
- ⚠️ Derivative works must use the same license

---

**🎉 Now you have a feature-complete, high-performance download tool!**
