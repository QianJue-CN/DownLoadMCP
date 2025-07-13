import { promises as fs } from 'fs';
import { dirname } from 'path';
import { DownloadTask, DownloadStatus } from '../types/download.js';

export class TaskStorage {
  private filePath: string;
  private isInitialized: boolean = false;
  private tasks: Map<string, DownloadTask> = new Map();

  constructor(filePath: string = './downloads.json') {
    this.filePath = filePath;
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保目录存在
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      
      // 尝试加载现有数据
      try {
        const data = await fs.readFile(this.filePath, 'utf8');
        const tasksData = JSON.parse(data);
        
        for (const taskData of tasksData) {
          const task: DownloadTask = {
            ...taskData,
            createdAt: new Date(taskData.createdAt),
            updatedAt: new Date(taskData.updatedAt),
            startedAt: taskData.startedAt ? new Date(taskData.startedAt) : undefined,
            completedAt: taskData.completedAt ? new Date(taskData.completedAt) : undefined
          };
          this.tasks.set(task.id, task);
        }
      } catch {
        // 文件不存在或格式错误，创建空存储
        await this.saveToFile();
      }
      
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`初始化存储失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 保存任务
   */
  async saveTask(task: DownloadTask): Promise<void> {
    this.tasks.set(task.id, task);
    await this.saveToFile();
  }

  /**
   * 更新任务
   */
  async updateTask(task: DownloadTask): Promise<void> {
    return this.saveTask(task);
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<DownloadTask | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 加载所有任务
   */
  async loadTasks(): Promise<DownloadTask[]> {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 按状态查询任务
   */
  async getTasksByStatus(status: DownloadStatus): Promise<DownloadTask[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 分页查询任务
   */
  async getTasksPaginated(
    limit: number = 20, 
    offset: number = 0, 
    status?: DownloadStatus
  ): Promise<{ tasks: DownloadTask[]; total: number }> {
    let allTasks = Array.from(this.tasks.values());
    
    if (status) {
      allTasks = allTasks.filter(task => task.status === status);
    }
    
    allTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const total = allTasks.length;
    const tasks = allTasks.slice(offset, offset + limit);
    
    return { tasks, total };
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
    await this.saveToFile();
  }

  /**
   * 清理已完成的任务
   */
  async cleanupCompletedTasks(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    let deletedCount = 0;
    const completedStatuses = [DownloadStatus.COMPLETED, DownloadStatus.FAILED, DownloadStatus.CANCELLED];
    
    for (const [taskId, task] of this.tasks) {
      if (completedStatuses.includes(task.status) && task.updatedAt < cutoffDate) {
        this.tasks.delete(taskId);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      await this.saveToFile();
    }
    
    return deletedCount;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<DownloadStatus, number>;
    totalSize: number;
    downloadedSize: number;
  }> {
    const stats = {
      total: this.tasks.size,
      byStatus: {} as Record<DownloadStatus, number>,
      totalSize: 0,
      downloadedSize: 0
    };

    // 初始化状态计数
    Object.values(DownloadStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });

    for (const task of this.tasks.values()) {
      stats.byStatus[task.status]++;
      stats.totalSize += task.progress.totalSize;
      stats.downloadedSize += task.progress.downloadedSize;
    }

    return stats;
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    if (this.isInitialized) {
      await this.saveToFile();
      this.isInitialized = false;
    }
  }

  /**
   * 保存数据到文件
   */
  private async saveToFile(): Promise<void> {
    const tasksArray = Array.from(this.tasks.values());
    const data = JSON.stringify(tasksArray, null, 2);
    await fs.writeFile(this.filePath, data, 'utf8');
  }
}
