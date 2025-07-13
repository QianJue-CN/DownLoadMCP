import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  ListDownloadsArgsSchema,
  MCPToolResponse,
  ListDownloadsResponse
} from '../types/mcp.js';
import { DownloadManager } from '../core/download-manager.js';
import { DownloadStatus } from '../types/download.js';

export class ListDownloadsTool {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'list_downloads',
      description: '列出所有下载任务，支持按状态筛选和分页查询',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'downloading', 'paused', 'completed', 'failed', 'cancelled'],
            description: '按状态筛选任务（可选）'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: '返回的任务数量限制（默认20）'
          },
          offset: {
            type: 'number',
            minimum: 0,
            description: '分页偏移量（默认0）'
          }
        }
      }
    };
  }

  /**
   * 执行列出下载任务工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<ListDownloadsResponse>> {
    try {
      // 验证参数
      const validatedArgs = ListDownloadsArgsSchema.parse(args || {});

      const limit = validatedArgs.limit || 20;
      const offset = validatedArgs.offset || 0;
      const status = validatedArgs.status as DownloadStatus | undefined;

      // 获取任务列表
      let allTasks = this.downloadManager.getAllTasks();

      // 按状态筛选
      if (status) {
        allTasks = allTasks.filter(task => task.status === status);
      }

      // 排序（最新的在前）
      allTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // 分页
      const total = allTasks.length;
      const tasks = allTasks.slice(offset, offset + limit);

      // 构建响应数据
      const response: ListDownloadsResponse = {
        tasks: tasks.map(task => ({
          taskId: task.id,
          status: task.status,
          filename: task.config.filename || this.extractFilenameFromUrl(task.config.url),
          url: task.config.url,
          progress: Math.round(task.progress.percentage * 100) / 100,
          createdAt: task.createdAt.toISOString()
        })),
        total,
        hasMore: offset + limit < total
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
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : '获取任务列表失败',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 生成任务列表的详细报告
   */
  generateDetailedReport(args?: unknown): string {
    try {
      const validatedArgs = ListDownloadsArgsSchema.parse(args || {});
      const status = validatedArgs.status as DownloadStatus | undefined;

      let allTasks = this.downloadManager.getAllTasks();

      if (status) {
        allTasks = allTasks.filter(task => task.status === status);
      }

      if (allTasks.length === 0) {
        return status
          ? `没有找到状态为 "${this.translateStatus(status)}" 的下载任务。`
          : '没有找到任何下载任务。';
      }

      // 按状态分组统计
      const stats = this.calculateStats(allTasks);

      let report = `📊 下载任务统计:\n`;
      report += `总任务数: ${stats.total}\n`;
      report += `正在下载: ${stats.downloading}\n`;
      report += `已完成: ${stats.completed}\n`;
      report += `已暂停: ${stats.paused}\n`;
      report += `失败: ${stats.failed}\n`;
      report += `已取消: ${stats.cancelled}\n`;
      report += `等待中: ${stats.pending}\n\n`;

      // 排序并显示任务列表
      allTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      report += `📋 任务列表:\n`;

      for (const task of allTasks.slice(0, 10)) { // 只显示前10个
        const filename = task.config.filename || this.extractFilenameFromUrl(task.config.url);
        const status = this.translateStatus(task.status);
        const progress = task.progress.percentage.toFixed(1);
        const createdAt = task.createdAt.toLocaleString();

        report += `\n🔹 ${filename}\n`;
        report += `   ID: ${task.id}\n`;
        report += `   状态: ${status} (${progress}%)\n`;
        report += `   创建时间: ${createdAt}\n`;

        if (task.status === 'downloading') {
          report += `   速度: ${this.formatSpeed(task.progress.speed)}\n`;
          if (task.progress.eta > 0) {
            report += `   剩余时间: ${this.formatTime(task.progress.eta)}\n`;
          }
        }

        if (task.error) {
          report += `   错误: ${task.error}\n`;
        }
      }

      if (allTasks.length > 10) {
        report += `\n... 还有 ${allTasks.length - 10} 个任务`;
      }

      return report;

    } catch (error) {
      return `生成报告失败: ${error instanceof Error ? error.message : String(error)}`;
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

  /**
   * 计算统计信息
   */
  private calculateStats(tasks: any[]) {
    return {
      total: tasks.length,
      downloading: tasks.filter(t => t.status === 'downloading').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      paused: tasks.filter(t => t.status === 'paused').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      pending: tasks.filter(t => t.status === 'pending').length
    };
  }

  /**
   * 格式化速度
   */
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

  /**
   * 格式化时间
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}分${remainingSeconds}秒`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    }
  }
}
