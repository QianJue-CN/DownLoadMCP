import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  DownloadFileArgsSchema,
  MCPToolResponse,
  DownloadFileResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';
import { DownloadConfigSchema, WorkMode } from '../types/download.js';
import { SessionManager } from '../core/session-manager.js';


export class DownloadFileTool {
  private downloadManager: DownloadManager;
  private sessionManager: SessionManager;

  constructor(downloadManager: DownloadManager, sessionManager: SessionManager) {
    this.downloadManager = downloadManager;
    this.sessionManager = sessionManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'download_file',
      description: '开始下载文件，支持多线程下载、断点续传和实时进度监控',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要下载的文件 URL'
          },
          outputPath: {
            type: 'string',
            description: '文件保存路径'
          },
          filename: {
            type: 'string',
            description: '自定义文件名（可选）'
          },
          maxConcurrency: {
            type: 'number',
            description: '最大并发下载线程数（1-16，默认4）',
            minimum: 1,
            maximum: 16
          },
          chunkSize: {
            type: 'number',
            description: '分块大小（字节，默认1MB）',
            minimum: 1024
          },
          timeout: {
            type: 'number',
            description: '请求超时时间（毫秒，默认30秒）',
            minimum: 1000
          },
          retryCount: {
            type: 'number',
            description: '重试次数（0-10，默认3）',
            minimum: 0,
            maximum: 10
          },
          workMode: {
            type: 'string',
            enum: ['blocking', 'non_blocking', 'persistent', 'temporary'],
            description: '工作模式：blocking（阻塞）、non_blocking（非阻塞）、persistent（持久化）、temporary（临时）'
          },
          headers: {
            type: 'object',
            description: '自定义 HTTP 请求头'
          },
          enableResume: {
            type: 'boolean',
            description: '是否启用断点续传（默认true）'
          },
          sessionId: {
            type: 'string',
            description: '会话ID，用于使用预建立的会话状态（如cookies）'
          }
        },
        required: ['url', 'outputPath']
      }
    };
  }

  /**
   * 执行下载文件工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<DownloadFileResponse>> {
    try {
      // 验证参数
      const validatedArgs = DownloadFileArgsSchema.parse(args);

      // 处理会话状态
      let finalHeaders = validatedArgs.headers || {};
      if (validatedArgs.sessionId) {
        const session = this.sessionManager.getSession(validatedArgs.sessionId);
        if (session) {
          // 合并会话headers和用户提供的headers
          const sessionHeaders = this.sessionManager.getRequestHeaders(
            validatedArgs.sessionId,
            validatedArgs.url,
            validatedArgs.headers
          );
          finalHeaders = sessionHeaders;
        } else {
          console.warn(`会话 ${validatedArgs.sessionId} 不存在，将使用默认headers`);
        }
      }

      // 构建下载配置
      const config = DownloadConfigSchema.parse({
        url: validatedArgs.url,
        outputPath: validatedArgs.outputPath,
        filename: validatedArgs.filename,
        maxConcurrency: validatedArgs.maxConcurrency || 4,
        chunkSize: validatedArgs.chunkSize || 1024 * 1024,
        timeout: validatedArgs.timeout || 30000,
        retryCount: validatedArgs.retryCount || 3,
        workMode: validatedArgs.workMode || WorkMode.NON_BLOCKING,
        headers: finalHeaders,
        enableResume: validatedArgs.enableResume !== false,
        sessionId: validatedArgs.sessionId
      });

      // 创建下载任务
      const taskId = await this.downloadManager.createDownloadTask(config);

      // 根据工作模式返回不同的响应
      let response: DownloadFileResponse;

      if (config.workMode === WorkMode.BLOCKING) {
        // 阻塞模式：等待下载完成
        response = await this.waitForCompletion(taskId);
      } else {
        // 非阻塞模式：立即返回任务ID
        response = {
          taskId,
          status: 'started',
          message: `下载任务已创建，任务ID: ${taskId}。使用 get_download_status 工具查看进度。`,
          estimatedDuration: this.estimateDownloadDuration(config)
        };
      }

      return {
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOWNLOAD_ERROR',
          message: error instanceof Error ? error.message : '下载失败',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 等待下载完成（阻塞模式）
   */
  private async waitForCompletion(taskId: string): Promise<DownloadFileResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('下载超时'));
      }, 300000); // 5分钟超时

      const checkStatus = () => {
        const task = this.downloadManager.getTask(taskId);
        if (!task) {
          clearTimeout(timeout);
          reject(new Error('任务不存在'));
          return;
        }

        switch (task.status) {
          case 'completed':
            clearTimeout(timeout);
            resolve({
              taskId,
              status: 'completed',
              message: `文件下载完成: ${task.config.outputPath}`,
              estimatedDuration: task.completedAt && task.startedAt
                ? task.completedAt.getTime() - task.startedAt.getTime()
                : undefined
            });
            break;

          case 'failed':
            clearTimeout(timeout);
            reject(new Error(task.error || '下载失败'));
            break;

          case 'cancelled':
            clearTimeout(timeout);
            reject(new Error('下载已取消'));
            break;

          default:
            // 继续等待
            setTimeout(checkStatus, 1000);
            break;
        }
      };

      checkStatus();
    });
  }

  /**
   * 估算下载时长
   */
  private estimateDownloadDuration(_config: any): number | undefined {
    // 基于文件大小和网络速度的简单估算
    // 这里可以根据历史数据或网络测试来改进
    return undefined;
  }




}
