# Download MCP

基于 MCP (Model Context Protocol) 标准的高性能文件下载工具，支持多线程下载、断点续传和会话管理。

## ✨ 功能特性

### 🚀 核心下载功能
- **多线程下载**: 支持 1-16 个并发连接，显著提升下载速度
- **断点续传**: 自动处理网络中断，支持从断点继续下载
- **实时监控**: 提供详细的下载进度、速度和 ETA 信息
- **智能重试**: 自动重试失败的下载段，提高成功率
- **任务管理**: 完整的下载任务列表和状态查询

### 🌐 会话管理
- **Cookie 管理**: 自动处理 HTTP cookies 和会话状态
- **浏览器模拟**: 完整的 headers 和用户代理模拟
- **预请求支持**: 建立会话状态，处理需要登录的网站
- **多站点支持**: 支持需要特定会话状态的下载链接

### 🔧 技术特性
- **MCP 标准**: 完全兼容 MCP 协议，易于集成
- **TypeScript**: 完整的类型安全和智能提示
- **持久化存储**: 下载状态自动保存，重启后可恢复
- **跨平台**: 支持 Windows、Linux、macOS

## 📦 安装

```bash
# 克隆项目
git clone <repository-url>
cd DownLoadMCP

# 安装依赖
npm install

# 构建项目
npm run build
```

## 🚀 快速开始

### 1. 启动服务

#### Windows
```cmd
# 使用批处理脚本
start.bat

# 或手动启动
npm start
```

#### Linux/macOS
```bash
# 使用 shell 脚本
chmod +x start.sh
./start.sh

# 或手动启动
npm start
```

### 2. MCP 配置

#### 基础配置
将以下配置添加到您的 MCP 客户端配置中：

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

#### 跨平台路径配置

**Windows 示例**:
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

**Linux/macOS 示例**:
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

**环境变量说明**:
- `NODE_ENV`: 设置为 `production` 启用生产模式优化
- `PATH`: 确保 Node.js 可执行文件路径包含在环境变量中
  - Windows: 通常 Node.js 安装在 `C:\Program Files\nodejs`
  - Linux/macOS: 通常在 `/usr/local/bin` 或 `/usr/bin`

**环境变量有效性验证**:

1. **NODE_ENV=production 的作用**:
   - 启用 Node.js 生产模式优化
   - 禁用开发调试信息
   - 提升运行性能和安全性

2. **PATH 环境变量的重要性**:
   - 确保 Claude Desktop 能找到 Node.js 可执行文件
   - 避免 "node: command not found" 错误
   - 支持不同的 Node.js 安装路径

3. **验证配置是否正确**:
   ```bash
   # 检查 Node.js 是否在 PATH 中
   node --version

   # 检查 npm 是否可用
   npm --version

   # 测试项目是否能正常启动
   cd /path/to/DownLoadMCP
   node dist/index.js
   ```

**配置要点**:
- 使用绝对路径指向 `dist/index.js`
- 确保 Node.js 在系统 PATH 中
- 根据操作系统调整路径格式

### 3. Claude Desktop 集成

#### 配置文件位置
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### 完整配置示例

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

## 🛠️ 可用工具

### 核心下载工具

#### 1. pre_request - 预请求工具
建立会话状态，处理需要登录或特定会话的网站。

**参数:**
- `url` (必需): 要访问的 URL
- `method` (可选): HTTP 方法 (`GET`, `POST`, `HEAD`，默认 `GET`)
- `headers` (可选): 额外的请求头对象
- `body` (可选): 请求体内容 (POST 请求时使用)
- `sessionId` (可选): 会话 ID，不提供将自动生成
- `timeout` (可选): 请求超时时间，默认 30000ms
- `followRedirects` (可选): 是否跟随重定向，默认 true
- `userAgent` (可选): 自定义 User-Agent
- `referer` (可选): 设置 Referer 头

**返回值:**
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

### 2. download_file - 文件下载
主要的文件下载工具，支持多线程和会话管理。

**参数:**
- `url` (必需): 下载链接
- `outputPath` (必需): 输出目录路径
- `filename` (可选): 自定义文件名
- `maxConcurrency` (可选): 并发连接数 (1-16，默认 4)
- `chunkSize` (可选): 分块大小，默认 1048576 (1MB)
- `timeout` (可选): 请求超时时间，默认 30000ms
- `retryCount` (可选): 重试次数 (0-10，默认 3)
- `workMode` (可选): 工作模式
  - `blocking`: 阻塞模式，等待下载完成
  - `non_blocking`: 非阻塞模式，立即返回任务ID
  - `persistent`: 持久化模式
  - `temporary`: 临时模式
- `enableResume` (可选): 启用断点续传，默认 true
- `sessionId` (可选): 使用预建立的会话状态
- `headers` (可选): 自定义 HTTP 请求头

**返回值:**
```json
{
  "success": true,
  "taskId": "task-uuid",
  "filename": "downloaded-file.zip",
  "totalSize": 1048576,
  "status": "downloading"
}
```

### 3. 任务管理工具

#### get_download_status - 查询下载状态
**参数:**
- `taskId` (必需): 下载任务的唯一标识符

**返回值:**
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

#### pause_download - 暂停下载
**参数:**
- `taskId` (必需): 要暂停的下载任务ID

#### resume_download - 恢复下载
**参数:**
- `taskId` (必需): 要恢复的下载任务ID

#### cancel_download - 取消下载
**参数:**
- `taskId` (必需): 要取消的下载任务ID

#### list_downloads - 列出所有任务
**参数:**
- `status` (可选): 按状态筛选 (`pending`, `downloading`, `paused`, `completed`, `failed`, `cancelled`)
- `limit` (可选): 返回任务数量限制，默认 20
- `offset` (可选): 分页偏移量，默认 0

### 4. verify_integrity - 文件完整性验证
验证文件的完整性，支持多种哈希算法。

**参数:**
- `filePath` (必需): 要验证的文件路径
- `algorithm` (可选): 哈希算法 (`md5`, `sha1`, `sha256`, `sha512`，默认 `sha256`)
- `expectedChecksum` (可选): 期望的校验和值
- `generateReport` (可选): 是否生成详细报告，默认 false

**返回值:**
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

## ⚙️ 配置建议

| 连接类型 | 并发数 | 分块大小 | 适用场景   |
| -------- | ------ | -------- | ---------- |
| 慢速     | 1-2    | 256KB    | <10Mbps    |
| 中速     | 4-6    | 1MB      | 10-100Mbps |
| 高速     | 8-16   | 2-4MB    | >100Mbps   |

## 🆚 与其他工具对比

| 特性       | 本工具 | aria2 | wget | curl |
| ---------- | ------ | ----- | ---- | ---- |
| 多线程下载 | ✅      | ✅     | ❌    | ❌    |
| 会话管理   | ✅      | ❌     | ❌    | ✅    |
| MCP 集成   | ✅      | ❌     | ❌    | ❌    |
| 实时监控   | ✅      | ✅     | ❌    | ❌    |
| 断点续传   | ✅      | ✅     | ✅    | ✅    |

## 🐛 故障排除

### 常见问题解决方案

#### 1. 安装和启动问题

**问题**: `npm install` 失败
```bash
# 解决方案
# 清理缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json  # Linux/macOS
rmdir /s node_modules & del package-lock.json  # Windows
npm install
```

**问题**: 构建失败 `npm run build`
```bash
# 检查 TypeScript 版本
npx tsc --version

# 重新安装 TypeScript
npm install -D typescript@latest

# 清理并重新构建
npm run clean
npm run build
```

**问题**: 服务启动失败
```bash
# 检查 Node.js 版本 (需要 >=18.0.0)
node --version

# 检查端口占用
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Linux/macOS

# 检查文件权限 (Linux/macOS)
chmod +x start.sh
```

#### 2. MCP 配置问题

**问题**: Claude Desktop 无法连接到 MCP 服务器
- **检查路径**: 确保 `args` 中的路径是绝对路径
- **检查权限**: 确保 Claude Desktop 有访问文件的权限
- **检查 Node.js**: 确保系统 PATH 中包含 Node.js

**Windows 配置示例**:
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

#### 3. 下载问题

**问题**: 需要登录的网站无法下载
```javascript
// 解决方案：使用 pre_request 建立会话
// 1. 先建立会话
{
  "tool": "pre_request",
  "url": "https://site.com/login",
  "method": "POST",
  "body": "username=user&password=pass"
}

// 2. 使用返回的 sessionId 下载
{
  "tool": "download_file",
  "url": "https://site.com/protected-file.zip",
  "outputPath": "./downloads",
  "sessionId": "从步骤1返回的会话ID"
}
```

**问题**: 下载速度慢
- **增加并发数**: 设置 `maxConcurrency` 为 8-16
- **调整分块大小**: 高速网络使用 2-4MB `chunkSize`
- **检查网络**: 使用网络测速工具检查带宽
- **服务器限制**: 某些服务器限制单IP连接数

**问题**: 连接超时
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

**问题**: 断点续传失败
- **检查磁盘空间**: 确保有足够的存储空间
- **检查文件权限**: 确保有写入权限
- **清理状态文件**: 删除 `.download-resume/` 目录重新开始

#### 4. 文件完整性问题

**问题**: 校验和不匹配
```json
{
  "tool": "verify_integrity",
  "filePath": "./downloads/file.zip",
  "algorithm": "sha256",
  "expectedChecksum": "abc123..."
}
```

**问题**: 下载的文件损坏
- **重新下载**: 删除部分下载的文件重新开始
- **更换下载源**: 尝试不同的下载链接
- **检查网络稳定性**: 使用有线连接替代无线

#### 5. 性能优化

**慢速网络 (<10Mbps)**:
```json
{
  "maxConcurrency": 2,
  "chunkSize": 262144,
  "timeout": 60000,
  "retryCount": 5
}
```

**高速网络 (>100Mbps)**:
```json
{
  "maxConcurrency": 16,
  "chunkSize": 4194304,
  "timeout": 30000,
  "retryCount": 3
}
```

#### 6. 日志和调试

**启用详细日志**:
```bash
# 设置环境变量
export DEBUG=download-mcp:*  # Linux/macOS
set DEBUG=download-mcp:*     # Windows

# 启动服务
npm start
```

**查看下载状态**:
```json
{
  "tool": "list_downloads",
  "status": "failed"
}
```

**获取任务详情**:
```json
{
  "tool": "get_download_status",
  "taskId": "your-task-id"
}
```

## 📄 许可证

MIT License

---

**🎉 现在您拥有了一个功能完整、性能卓越的下载工具！**
