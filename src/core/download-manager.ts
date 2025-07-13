import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  DownloadTask,
  DownloadConfig,
  DownloadStatus,
  DownloadStats,
  WorkMode
} from '../types/download.js';
import { MultiThreadDownloader } from './multi-thread-downloader.js';
import { ResumeManager } from './resume-manager.js';
import { ProgressMonitor } from './progress-monitor.js';
import { TaskStorage } from '../storage/task-storage.js';

export class DownloadManager extends EventEmitter {
  private tasks: Map<string, DownloadTask> = new Map();
  private downloaders: Map<string, MultiThreadDownloader> = new Map();
  private resumeManager: ResumeManager;
  private progressMonitor: ProgressMonitor;
  private taskStorage: TaskStorage;
  private maxConcurrentTasks: number = 5;

  constructor() {
    super();
    this.resumeManager = new ResumeManager();
    this.progressMonitor = new ProgressMonitor();
    this.taskStorage = new TaskStorage();

    // 初始化时恢复未完成的任务
    this.initializeManager();
  }

  private async initializeManager(): Promise<void> {
    try {
      await this.taskStorage.initialize();
      const savedTasks = await this.taskStorage.loadTasks();

      for (const task of savedTasks) {
        this.tasks.set(task.id, task);

        // 恢复未完成的下载任务
        if (task.status === DownloadStatus.DOWNLOADING ||
          task.status === DownloadStatus.PAUSED) {
          task.status = DownloadStatus.PAUSED;
          await this.taskStorage.updateTask(task);
        }
      }

      this.emit('manager:initialized', { taskCount: savedTasks.length });
    } catch (error) {
      this.emit('manager:error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 创建新的下载任务
   */
  async createDownloadTask(config: DownloadConfig): Promise<string> {
    const taskId = randomUUID();

    const task: DownloadTask = {
      id: taskId,
      config,
      status: DownloadStatus.PENDING,
      progress: {
        taskId,
        totalSize: 0,
        downloadedSize: 0,
        percentage: 0,
        speed: 0,
        eta: 0,
        segments: []
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        supportsRange: false
      }
    };

    this.tasks.set(taskId, task);
    await this.taskStorage.saveTask(task);

    this.emit('task:created', { taskId, config });

    // 根据工作模式决定是否立即开始下载
    if (config.workMode === WorkMode.BLOCKING ||
      config.workMode === WorkMode.NON_BLOCKING) {
      await this.startDownload(taskId);
    }

    return taskId;
  }

  /**
   * 开始下载任务
   */
  async startDownload(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.status !== DownloadStatus.PENDING &&
      task.status !== DownloadStatus.PAUSED) {
      throw new Error(`任务 ${taskId} 当前状态不允许开始下载`);
    }

    // 检查并发任务限制
    const activeTasks = Array.from(this.tasks.values())
      .filter(t => t.status === DownloadStatus.DOWNLOADING).length;

    if (activeTasks >= this.maxConcurrentTasks) {
      throw new Error('已达到最大并发下载任务数限制');
    }

    try {
      task.status = DownloadStatus.DOWNLOADING;
      task.startedAt = new Date();
      task.updatedAt = new Date();

      await this.taskStorage.updateTask(task);

      // 检查是否可以断点续传
      if (task.config.enableResume && await this.resumeManager.canResume(task)) {
        const resumedTask = await this.resumeManager.resumeTask(task);
        this.tasks.set(taskId, resumedTask);
      }

      // 创建多线程下载器
      const downloader = new MultiThreadDownloader(task.config);
      this.downloaders.set(taskId, downloader);

      // 开始进度监控
      this.progressMonitor.startMonitoringTask(taskId);

      // 监听下载事件
      this.setupDownloaderEvents(taskId, downloader);

      // 开始下载
      await downloader.start();

      this.emit('task:started', { taskId });

    } catch (error) {
      task.status = DownloadStatus.FAILED;
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date();

      await this.taskStorage.updateTask(task);
      this.emit('task:failed', { taskId, error: task.error });

      throw error;
    }
  }

  /**
   * 暂停下载任务
   */
  async pauseDownload(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.status !== DownloadStatus.DOWNLOADING) {
      throw new Error(`任务 ${taskId} 当前状态不允许暂停`);
    }

    const downloader = this.downloaders.get(taskId);
    if (downloader) {
      await downloader.pause();
    }

    task.status = DownloadStatus.PAUSED;
    task.updatedAt = new Date();

    await this.taskStorage.updateTask(task);
    this.emit('task:paused', { taskId });
  }

  /**
   * 恢复下载任务
   */
  async resumeDownload(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.status !== DownloadStatus.PAUSED) {
      throw new Error(`任务 ${taskId} 当前状态不允许恢复`);
    }

    await this.startDownload(taskId);
  }

  /**
   * 取消下载任务
   */
  async cancelDownload(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    const downloader = this.downloaders.get(taskId);
    if (downloader) {
      await downloader.cancel();
      this.downloaders.delete(taskId);
    }

    task.status = DownloadStatus.CANCELLED;
    task.updatedAt = new Date();

    await this.taskStorage.updateTask(task);
    this.emit('task:cancelled', { taskId });
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取下载统计信息
   */
  getStats(): DownloadStats {
    const tasks = Array.from(this.tasks.values());

    return {
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => t.status === DownloadStatus.DOWNLOADING).length,
      completedTasks: tasks.filter(t => t.status === DownloadStatus.COMPLETED).length,
      failedTasks: tasks.filter(t => t.status === DownloadStatus.FAILED).length,
      totalDownloaded: tasks.reduce((sum, t) => sum + t.progress.downloadedSize, 0),
      currentSpeed: tasks
        .filter(t => t.status === DownloadStatus.DOWNLOADING)
        .reduce((sum, t) => sum + t.progress.speed, 0)
    };
  }

  private setupDownloaderEvents(taskId: string, downloader: MultiThreadDownloader): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    downloader.on('progress', (progress) => {
      task.progress = { ...progress, taskId };
      task.updatedAt = new Date();

      this.taskStorage.updateTask(task).catch(console.error);
      this.emit('task:progress', { taskId, progress });
    });

    downloader.on('completed', async (result) => {
      task.status = DownloadStatus.COMPLETED;
      task.completedAt = new Date();
      task.updatedAt = new Date();

      await this.taskStorage.updateTask(task);
      this.downloaders.delete(taskId);

      this.emit('task:completed', { taskId, result });
    });

    downloader.on('error', async (error) => {
      task.status = DownloadStatus.FAILED;
      task.error = error.message;
      task.updatedAt = new Date();

      await this.taskStorage.updateTask(task);
      this.downloaders.delete(taskId);

      this.emit('task:failed', { taskId, error: error.message });
    });
  }
}
