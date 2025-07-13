import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  ResumeDownloadArgsSchema,
  MCPToolResponse,
  OperationResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';

export class ResumeDownloadTool {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'resume_download',
      description: '恢复已暂停的下载任务，从上次中断的位置继续下载',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '要恢复的下载任务ID'
          }
        },
        required: ['taskId']
      }
    };
  }

  /**
   * 执行恢复下载工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<OperationResponse>> {
    try {
      // 验证参数
      const validatedArgs = ResumeDownloadArgsSchema.parse(args);

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
      if (task.status !== 'paused') {
        return {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `任务 ${validatedArgs.taskId} 当前状态为 ${task.status}，无法恢复。只有已暂停的任务才能恢复。`
          },
          timestamp: new Date().toISOString()
        };
      }

      // 恢复下载
      await this.downloadManager.resumeDownload(validatedArgs.taskId);

      const response: OperationResponse = {
        taskId: validatedArgs.taskId,
        success: true,
        message: `下载任务已恢复。将从 ${this.formatProgress(task)} 的位置继续下载。`,
        newStatus: 'downloading'
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
          code: 'RESUME_ERROR',
          message: error instanceof Error ? error.message : '恢复下载失败',
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
