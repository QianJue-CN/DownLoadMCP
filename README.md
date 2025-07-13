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
```bash
npm start
```

### 2. MCP 配置

将项目中的 `mcp-config-example.json` 配置添加到您的 MCP 客户端配置中：

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

**注意**: 请将 `args` 中的路径修改为您的实际项目路径。

### 3. Claude Desktop 集成

对于 Claude Desktop，将上述配置添加到 `claude_desktop_config.json` 文件中：

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

## 🛠️ 可用工具

### 1. pre_request - 预请求工具
建立会话状态，处理需要登录或特定会话的网站。

**参数:**
- `url`: 要访问的 URL
- `method`: HTTP 方法 (`GET`, `POST`, `HEAD`)
- `headers`: 额外的请求头 (可选)
- `body`: 请求体 (POST 请求时使用)
- `sessionId`: 会话 ID (可选)

### 2. download_file - 文件下载
主要的文件下载工具，支持多线程和会话管理。

**参数:**
- `url`: 下载链接
- `outputPath`: 输出目录
- `filename`: 文件名 (可选)
- `maxConcurrency`: 并发数 (1-16，默认 4)
- `chunkSize`: 分块大小 (默认 1MB)
- `timeout`: 超时时间 (默认 30秒)
- `retryCount`: 重试次数 (默认 3)
- `workMode`: 工作模式 (`blocking` 或 `non_blocking`)
- `enableResume`: 断点续传 (默认 true)
- `sessionId`: 会话 ID (可选)

### 3. 任务管理工具
- `get_download_status`: 查询下载状态
  - 参数: `taskId` (任务ID)
- `pause_download`: 暂停下载
  - 参数: `taskId` (任务ID)
- `resume_download`: 恢复下载
  - 参数: `taskId` (任务ID)
- `cancel_download`: 取消下载
  - 参数: `taskId` (任务ID)
- `list_downloads`: 列出所有任务
  - 参数: 无

## 📊 使用场景

### 🔐 需要登录的网站
```
1. 使用 pre_request 工具建立会话:
   - url: "https://site.com/login"
   - method: "POST"
   - body: "username=user&password=pass"

2. 使用返回的 sessionId 进行下载:
   - url: "https://site.com/protected-file.zip"
   - outputPath: "./downloads"
   - sessionId: "从步骤1返回的会话ID"
```

### 🚀 高性能下载
```
使用 download_file 工具:
- url: "https://example.com/largefile.zip"
- outputPath: "./downloads"
- maxConcurrency: 16
- chunkSize: 4194304
- workMode: "non_blocking"
```

## ⚙️ 配置建议

| 连接类型 | 并发数 | 分块大小 | 适用场景   |
| -------- | ------ | -------- | ---------- |
| 慢速     | 1-2    | 256KB    | <10Mbps    |
| 中速     | 4-6    | 1MB      | 10-100Mbps |
| 高速     | 8-16   | 2-4MB    | >100Mbps   |

## 🆚 与其他工具对比

| 特性         | 本工具 | aria2 | wget | curl |
| ------------ | ------ | ----- | ---- | ---- |
| 多线程下载   | ✅      | ✅     | ❌    | ❌    |
| 会话管理     | ✅      | ❌     | ❌    | ✅    |
| MCP 集成     | ✅      | ❌     | ❌    | ❌    |
| 实时监控     | ✅      | ✅     | ❌    | ❌    |
| 断点续传     | ✅      | ✅     | ✅    | ✅    |

## 🐛 故障排除

**需要登录的网站**
- 使用 `pre_request` 建立会话
- 在下载时传入 `sessionId` 参数

**下载速度慢**
- 增加 `maxConcurrency` 参数
- 调整 `chunkSize` 大小
- 检查网络连接

**连接超时**
- 增加 `timeout` 参数
- 检查防火墙设置
- 验证 URL 有效性

## 📄 许可证

MIT License

---

**🎉 现在您拥有了一个功能完整、性能卓越的下载工具！**
