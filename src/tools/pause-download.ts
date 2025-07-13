import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  PauseDownloadArgsSchema,
  MCPToolResponse,
  OperationResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';

export class PauseDownloadTool {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'pause_download',
      description: '暂停正在进行的下载任务，保留已下载的数据以便后续恢复',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '要暂停的下载任务ID'
          }
        },
        required: ['taskId']
      }
    };
  }

  /**
   * 执行暂停下载工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<OperationResponse>> {
    try {
      // 验证参数
      const validatedArgs = PauseDownloadArgsSchema.parse(args);

      // 检查任务是否存在
      const task = this.downloadManager.getTask(validatedArgs.taskId);
      if (!task) {
        return {
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: `任务 ${validatedArgs.taskId} 不存在`
          },
          timestamp: new Date().toISOString()
        };
      }

      // 检查任务状态
      if (task.status !== 'downloading') {
        return {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `任务 ${validatedArgs.taskId} 当前状态为 ${task.status}，无法暂停。只有正在下载的任务才能暂停。`
          },
          timestamp: new Date().toISOString()
        };
      }

      // 暂停下载
      await this.downloadManager.pauseDownload(validatedArgs.taskId);

      const response: OperationResponse = {
        taskId: validatedArgs.taskId,
        success: true,
        message: `下载任务已暂停。已下载 ${this.formatProgress(task)} 的数据。使用 resume_download 工具可以恢复下载。`,
        newStatus: 'paused'
      };

      return {
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PAUSE_ERROR',
          message: error instanceof Error ? error.message : '暂停下载失败',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 格式化进度信息
   */
  private formatProgress(task: any): string {
    const percentage = task.progress.percentage.toFixed(1);
    const downloadedSize = this.formatSize(task.progress.downloadedSize);
    const totalSize = this.formatSize(task.progress.totalSize);

    return `${percentage}% (${downloadedSize} / ${totalSize})`;
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }
}
