import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  GetDownloadStatusArgsSchema,
  MCPToolResponse,
  GetDownloadStatusResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';
import { ProgressMonitor } from '../core/progress-monitor.js';

export class GetDownloadStatusTool {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'get_download_status',
      description: '获取下载任务的详细状态信息，包括进度、速度和预计剩余时间',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '下载任务的唯一标识符'
          }
        },
        required: ['taskId']
      }
    };
  }

  /**
   * 执行获取下载状态工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<GetDownloadStatusResponse>> {
    try {
      // 验证参数
      const validatedArgs = GetDownloadStatusArgsSchema.parse(args);

      // 获取任务信息
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

      // 构建响应数据
      const response: GetDownloadStatusResponse = {
        taskId: task.id,
        status: task.status,
        progress: {
          percentage: Math.round(task.progress.percentage * 100) / 100,
          downloadedSize: task.progress.downloadedSize,
          totalSize: task.progress.totalSize,
          speed: task.progress.speed,
          eta: task.progress.eta
        },
        metadata: {
          filename: task.config.filename || this.extractFilenameFromUrl(task.config.url),
          url: task.config.url,
          createdAt: task.createdAt.toISOString(),
          startedAt: task.startedAt?.toISOString(),
          completedAt: task.completedAt?.toISOString()
        },
        error: task.error
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
          code: 'STATUS_ERROR',
          message: error instanceof Error ? error.message : '获取状态失败',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 从 URL 中提取文件名
   */
  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'unknown';
      return decodeURIComponent(filename);
    } catch {
      return 'unknown';
    }
  }

  /**
   * 生成详细的状态报告
   */
  generateDetailedReport(taskId: string): string {
    const task = this.downloadManager.getTask(taskId);
    if (!task) {
      return `任务 ${taskId} 不存在`;
    }

    const filename = task.config.filename || this.extractFilenameFromUrl(task.config.url);
    const status = this.translateStatus(task.status);
    const progress = task.progress;

    let report = `
📁 文件名: ${filename}
🔗 URL: ${task.config.url}
📊 状态: ${status}
📈 进度: ${progress.percentage.toFixed(1)}%
📦 大小: ${ProgressMonitor.formatSize(progress.downloadedSize)} / ${ProgressMonitor.formatSize(progress.totalSize)}
    `.trim();

    if (task.status === 'downloading') {
      report += `\n⚡ 速度: ${ProgressMonitor.formatSpeed(progress.speed)}`;
      if (progress.eta > 0) {
        report += `\n⏱️ 剩余时间: ${ProgressMonitor.formatTime(progress.eta)}`;
      }
      report += `\n🧵 活跃分段: ${progress.segments.length}`;
    }

    if (task.startedAt) {
      report += `\n🕐 开始时间: ${task.startedAt.toLocaleString()}`;
    }

    if (task.completedAt) {
      report += `\n✅ 完成时间: ${task.completedAt.toLocaleString()}`;

      if (task.startedAt) {
        const duration = task.completedAt.getTime() - task.startedAt.getTime();
        report += `\n⏱️ 总耗时: ${ProgressMonitor.formatTime(duration / 1000)}`;

        const averageSpeed = progress.downloadedSize / (duration / 1000);
        report += `\n📊 平均速度: ${ProgressMonitor.formatSpeed(averageSpeed)}`;
      }
    }

    if (task.error) {
      report += `\n❌ 错误: ${task.error}`;
    }

    return report;
  }

  /**
   * 翻译状态
   */
  private translateStatus(status: string): string {
    const translations: Record<string, string> = {
      'pending': '等待中',
      'downloading': '下载中',
      'paused': '已暂停',
      'completed': '已完成',
      'failed': '失败',
      'cancelled': '已取消'
    };

    return translations[status] || status;
  }
}
