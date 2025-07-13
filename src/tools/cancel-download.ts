import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  CancelDownloadArgsSchema,
  MCPToolResponse,
  OperationResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';

export class CancelDownloadTool {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'cancel_download',
      description: '取消下载任务并清理相关的临时文件',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '要取消的下载任务ID'
          }
        },
        required: ['taskId']
      }
    };
  }

  /**
   * 执行取消下载工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<OperationResponse>> {
    try {
      // 验证参数
      const validatedArgs = CancelDownloadArgsSchema.parse(args);

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
      if (task.status === 'completed') {
        return {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `任务 ${validatedArgs.taskId} 已完成，无法取消。`
          },
          timestamp: new Date().toISOString()
        };
      }

      if (task.status === 'cancelled') {
        return {
          success: true,
          data: {
            taskId: validatedArgs.taskId,
            success: true,
            message: `任务 ${validatedArgs.taskId} 已经被取消。`,
            newStatus: 'cancelled'
          },
          timestamp: new Date().toISOString()
        };
      }

      // 记录取消前的进度信息
      const progressInfo = this.formatProgress(task);

      // 取消下载
      await this.downloadManager.cancelDownload(validatedArgs.taskId);

      const response: OperationResponse = {
        taskId: validatedArgs.taskId,
        success: true,
        message: `下载任务已取消。已下载的数据 (${progressInfo}) 和临时文件已被清理。`,
        newStatus: 'cancelled'
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
          code: 'CANCEL_ERROR',
          message: error instanceof Error ? error.message : '取消下载失败',
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
