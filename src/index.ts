#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { DownloadManager } from './core/download-manager.js';
import { SessionManager } from './core/session-manager.js';
import { DownloadFileTool } from './tools/download-file.js';
import { GetDownloadStatusTool } from './tools/get-download-status.js';
import { PauseDownloadTool } from './tools/pause-download.js';
import { ResumeDownloadTool } from './tools/resume-download.js';
import { CancelDownloadTool } from './tools/cancel-download.js';
import { ListDownloadsTool } from './tools/list-downloads.js';
import { PreRequestTool } from './tools/pre-request.js';
import { ConfigureAdvancedSessionTool } from './tools/configure-advanced-session.js';
import { AnalyzePerformanceTool } from './tools/analyze-performance.js';
import { OptimizeConnectionsTool } from './tools/optimize-connections.js';

class DownloadMCPServer {
  private server: Server;
  private downloadManager: DownloadManager;
  private sessionManager: SessionManager;
  private tools: {
    downloadFile: DownloadFileTool;
    getDownloadStatus: GetDownloadStatusTool;
    pauseDownload: PauseDownloadTool;
    resumeDownload: ResumeDownloadTool;
    cancelDownload: CancelDownloadTool;
    listDownloads: ListDownloadsTool;
    preRequest: PreRequestTool;
    configureAdvancedSession: ConfigureAdvancedSessionTool;
    analyzePerformance: AnalyzePerformanceTool;
    optimizeConnections: OptimizeConnectionsTool;
  };

  constructor() {
    this.server = new Server(
      {
        name: 'download-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 初始化管理器
    this.downloadManager = new DownloadManager();
    this.sessionManager = new SessionManager();

    // 初始化工具
    this.tools = {
      downloadFile: new DownloadFileTool(this.downloadManager, this.sessionManager),
      getDownloadStatus: new GetDownloadStatusTool(this.downloadManager),
      pauseDownload: new PauseDownloadTool(this.downloadManager),
      resumeDownload: new ResumeDownloadTool(this.downloadManager),
      cancelDownload: new CancelDownloadTool(this.downloadManager),
      listDownloads: new ListDownloadsTool(this.downloadManager),
      preRequest: new PreRequestTool(this.sessionManager),
      configureAdvancedSession: new ConfigureAdvancedSessionTool(),
      analyzePerformance: new AnalyzePerformanceTool(),
      optimizeConnections: new OptimizeConnectionsTool()
    };

    this.setupHandlers();
    this.setupEventListeners();
  }

  private setupHandlers(): void {
    // 处理工具列表请求
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Core tools
          this.tools.preRequest.getToolDefinition(),
          this.tools.downloadFile.getToolDefinition(),
          this.tools.getDownloadStatus.getToolDefinition(),
          this.tools.pauseDownload.getToolDefinition(),
          this.tools.resumeDownload.getToolDefinition(),
          this.tools.cancelDownload.getToolDefinition(),
          this.tools.listDownloads.getToolDefinition(),
          // Phase 3: Advanced tools
          this.tools.configureAdvancedSession.getToolDefinition(),
          this.tools.analyzePerformance.getToolDefinition(),
          this.tools.optimizeConnections.getToolDefinition()
        ],
      };
    });

    // 处理工具调用请求
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;
        switch (name) {
          case 'pre_request':
            result = await this.tools.preRequest.execute(args);
            break;

          case 'download_file':
            result = await this.tools.downloadFile.execute(args);
            break;

          case 'get_download_status':
            result = await this.tools.getDownloadStatus.execute(args);
            break;

          case 'pause_download':
            result = await this.tools.pauseDownload.execute(args);
            break;

          case 'resume_download':
            result = await this.tools.resumeDownload.execute(args);
            break;

          case 'cancel_download':
            result = await this.tools.cancelDownload.execute(args);
            break;

          case 'list_downloads':
            result = await this.tools.listDownloads.execute(args);
            break;

          case 'configure_advanced_session':
            result = await this.tools.configureAdvancedSession.execute(args);
            break;

          case 'analyze_performance':
            result = await this.tools.analyzePerformance.execute(args);
            break;

          case 'optimize_connections':
            result = await this.tools.optimizeConnections.execute(args);
            break;

          default:
            throw new Error(`未知的工具: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'TOOL_ERROR',
                  message: error instanceof Error ? error.message : '工具执行失败',
                  details: error
                },
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  private setupEventListeners(): void {
    // 监听下载管理器事件（仅在开发模式下输出日志）
    const isDev = process.env['NODE_ENV'] === 'development';

    this.downloadManager.on('task:created', (data) => {
      if (isDev) console.error(`✅ 任务已创建: ${data.taskId}`);
    });

    this.downloadManager.on('task:started', (data) => {
      if (isDev) console.error(`🚀 任务开始下载: ${data.taskId}`);
    });

    this.downloadManager.on('task:progress', (data) => {
      if (isDev) {
        const progress = data.progress.percentage.toFixed(1);
        const speed = this.formatSpeed(data.progress.speed);
        console.error(`📊 任务进度 ${data.taskId}: ${progress}% (${speed})`);
      }
    });

    this.downloadManager.on('task:completed', (data) => {
      if (isDev) console.error(`✅ 任务完成: ${data.taskId}`);
    });

    this.downloadManager.on('task:failed', (data) => {
      if (isDev) console.error(`❌ 任务失败 ${data.taskId}: ${data.error}`);
    });

    this.downloadManager.on('task:paused', (data) => {
      if (isDev) console.error(`⏸️ 任务暂停: ${data.taskId}`);
    });

    this.downloadManager.on('task:cancelled', (data) => {
      if (isDev) console.error(`🚫 任务取消: ${data.taskId}`);
    });

    this.downloadManager.on('manager:error', (data) => {
      if (isDev) console.error(`💥 管理器错误: ${data.error}`);
    });

    // 处理进程退出
    process.on('SIGINT', () => {
      if (isDev) console.error('\n🛑 正在关闭下载服务器...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      if (isDev) console.error('\n🛑 正在关闭下载服务器...');
      this.shutdown();
    });
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(0)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else if (bytesPerSecond < 1024 * 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    }
  }

  private async shutdown(): Promise<void> {
    try {
      const isDev = process.env['NODE_ENV'] === 'development';

      // 这里可以添加清理逻辑，比如保存未完成的任务状态
      if (isDev) console.error('📝 保存任务状态...');

      // 关闭服务器
      await this.server.close();
      if (isDev) console.error('✅ 服务器已关闭');

      process.exit(0);
    } catch (error) {
      if (process.env['NODE_ENV'] === 'development') {
        console.error('❌ 关闭服务器时出错:', error);
      }
      process.exit(1);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // 只在非 MCP 模式下输出启动信息
    if (process.env['NODE_ENV'] === 'development') {
      console.error('🚀 Download MCP Server 已启动');
    }
  }
}

// 启动服务器
async function main() {
  try {
    const server = new DownloadMCPServer();
    await server.start();
  } catch (error) {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

// 启动服务器
main().catch((error) => {
  if (process.env['NODE_ENV'] === 'development') {
    console.error('❌ 启动服务器失败:', error);
  }
  process.exit(1);
});

export { DownloadMCPServer };
