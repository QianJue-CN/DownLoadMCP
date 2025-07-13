import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  DownloadTask,
  DownloadSegment,
  DownloadStatus
} from '../types/download.js';

interface ResumeData {
  version: string;
  taskId: string;
  url: string;
  outputPath: string;
  totalSize: number;
  segments: DownloadSegment[];
  checksum?: string;
  lastModified?: string;
  etag?: string;
  createdAt: Date;
  updatedAt: Date;
  userAgent?: string;
  headers?: Record<string, string>;
}

export class ResumeManager {
  private static readonly STATE_VERSION = '2.0';
  private resumeDir: string;

  constructor(resumeDir: string = './.download-resume') {
    this.resumeDir = resumeDir;
  }

  /**
   * 初始化断点续传管理器
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.resumeDir, { recursive: true });
    } catch (error) {
      console.error('初始化断点续传目录失败:', error);
    }
  }

  /**
   * 保存断点续传数据
   */
  async saveResumeData(task: DownloadTask): Promise<void> {
    if (!task.config.enableResume) {
      return;
    }

    const resumeData: ResumeData = {
      version: ResumeManager.STATE_VERSION,
      taskId: task.id,
      url: task.config.url,
      outputPath: task.config.outputPath,
      totalSize: task.progress.totalSize,
      segments: task.progress.segments,
      checksum: await this.calculateFileChecksum(task.config.outputPath),
      lastModified: task.metadata.lastModified,
      etag: task.metadata.etag,
      createdAt: task.createdAt,
      updatedAt: new Date()
    };

    const resumeFilePath = this.getResumeFilePath(task.id);

    try {
      await fs.writeFile(resumeFilePath, JSON.stringify(resumeData, null, 2), 'utf8');
    } catch (error) {
      console.error(`保存断点续传数据失败 (${task.id}):`, error);
    }
  }

  /**
   * 加载断点续传数据
   */
  async loadResumeData(taskId: string): Promise<ResumeData | null> {
    const resumeFilePath = this.getResumeFilePath(taskId);

    try {
      const data = await fs.readFile(resumeFilePath, 'utf8');
      return JSON.parse(data) as ResumeData;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查是否可以断点续传
   */
  async canResume(task: DownloadTask): Promise<boolean> {
    if (!task.config.enableResume) {
      return false;
    }

    const resumeData = await this.loadResumeData(task.id);
    if (!resumeData) {
      return false;
    }

    // 检查 URL 是否匹配
    if (resumeData.url !== task.config.url) {
      return false;
    }

    // 检查文件是否存在
    const fileExists = await this.fileExists(resumeData.outputPath);
    if (!fileExists) {
      return false;
    }

    // 检查文件完整性
    const isValid = await this.validatePartialFile(resumeData);
    if (!isValid) {
      return false;
    }

    // 检查服务器文件是否发生变化
    const serverChanged = await this.hasServerFileChanged(task, resumeData);
    if (serverChanged) {
      return false;
    }

    return true;
  }

  /**
   * 恢复下载任务
   */
  async resumeTask(task: DownloadTask): Promise<DownloadTask> {
    const resumeData = await this.loadResumeData(task.id);
    if (!resumeData) {
      throw new Error('无法找到断点续传数据');
    }

    // 恢复进度信息
    task.progress.totalSize = resumeData.totalSize;
    task.progress.segments = resumeData.segments;

    // 计算已下载大小
    task.progress.downloadedSize = resumeData.segments.reduce(
      (sum, segment) => sum + segment.downloaded, 0
    );

    task.progress.percentage = task.progress.totalSize > 0
      ? (task.progress.downloadedSize / task.progress.totalSize) * 100
      : 0;

    // 更新任务状态
    task.status = DownloadStatus.PAUSED;
    task.updatedAt = new Date();

    return task;
  }

  /**
   * 清理断点续传数据
   */
  async cleanupResumeData(taskId: string): Promise<void> {
    const resumeFilePath = this.getResumeFilePath(taskId);

    try {
      await fs.unlink(resumeFilePath);
    } catch (error) {
      // 忽略删除失败
    }
  }

  /**
   * 获取所有断点续传任务
   */
  async getAllResumeData(): Promise<ResumeData[]> {
    try {
      const files = await fs.readdir(this.resumeDir);
      const resumeFiles = files.filter(file => file.endsWith('.resume.json'));

      const resumeDataList: ResumeData[] = [];

      for (const file of resumeFiles) {
        try {
          const filePath = join(this.resumeDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const resumeData = JSON.parse(data) as ResumeData;
          resumeDataList.push(resumeData);
        } catch (error) {
          console.error(`读取断点续传文件失败 (${file}):`, error);
        }
      }

      return resumeDataList;
    } catch (error) {
      console.error('获取断点续传数据列表失败:', error);
      return [];
    }
  }

  /**
   * 清理过期的断点续传数据
   */
  async cleanupExpiredResumeData(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const resumeDataList = await this.getAllResumeData();
    const now = new Date();

    for (const resumeData of resumeDataList) {
      const age = now.getTime() - new Date(resumeData.updatedAt).getTime();

      if (age > maxAge) {
        await this.cleanupResumeData(resumeData.taskId);

        // 清理相关的临时文件
        await this.cleanupTempFiles(resumeData);
      }
    }
  }

  /**
   * 获取断点续传文件路径
   */
  private getResumeFilePath(taskId: string): string {
    return join(this.resumeDir, `${taskId}.resume.json`);
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证部分下载文件的完整性
   */
  private async validatePartialFile(resumeData: ResumeData): Promise<boolean> {
    try {
      // 检查主文件
      const mainFileExists = await this.fileExists(resumeData.outputPath);

      // 检查分段文件
      let hasValidSegments = false;
      for (const segment of resumeData.segments) {
        if (segment.status === DownloadStatus.COMPLETED) {
          const segmentExists = await this.fileExists(segment.filePath);
          if (segmentExists) {
            hasValidSegments = true;
          }
        }
      }

      return mainFileExists || hasValidSegments;
    } catch (error) {
      console.error('验证部分文件失败:', error);
      return false;
    }
  }

  /**
   * 检查服务器文件是否发生变化
   */
  private async hasServerFileChanged(task: DownloadTask, resumeData: ResumeData): Promise<boolean> {
    try {
      // 如果有 ETag，优先使用 ETag 比较
      if (resumeData.etag && task.metadata.etag) {
        return resumeData.etag !== task.metadata.etag;
      }

      // 使用 Last-Modified 比较
      if (resumeData.lastModified && task.metadata.lastModified) {
        return resumeData.lastModified !== task.metadata.lastModified;
      }

      // 如果都没有，假设文件未变化
      return false;
    } catch (error) {
      console.error('检查服务器文件变化失败:', error);
      return true; // 出错时假设文件已变化，重新下载
    }
  }

  /**
   * 计算文件校验和
   */
  private async calculateFileChecksum(filePath: string): Promise<string | undefined> {
    try {
      const fileExists = await this.fileExists(filePath);
      if (!fileExists) {
        return undefined;
      }

      const data = await fs.readFile(filePath);
      return createHash('md5').update(data).digest('hex');
    } catch (error) {
      console.error('计算文件校验和失败:', error);
      return undefined;
    }
  }

  /**
   * 清理临时文件
   */
  private async cleanupTempFiles(resumeData: ResumeData): Promise<void> {
    // 清理分段文件
    for (const segment of resumeData.segments) {
      try {
        await fs.unlink(segment.filePath);
      } catch {
        // 忽略删除失败
      }
    }

    // 清理未完成的主文件
    try {
      const stats = await fs.stat(resumeData.outputPath);
      if (stats.size < resumeData.totalSize) {
        await fs.unlink(resumeData.outputPath);
      }
    } catch {
      // 忽略删除失败
    }
  }
}
