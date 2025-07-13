import { promises as fs } from 'fs';
import { dirname, join, extname, basename } from 'path';
import { createHash } from 'crypto';

/**
 * 文件工具函数集合
 */
export class FileUtils {
  /**
   * 确保目录存在，如果不存在则创建
   */
  static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 检查文件是否存在
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取文件大小
   */
  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * 计算文件的 MD5 哈希值
   */
  static async calculateMD5(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return createHash('md5').update(data).digest('hex');
  }

  /**
   * 计算文件的 SHA256 哈希值
   */
  static async calculateSHA256(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * 从 URL 中提取文件名
   */
  static extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let filename = pathname.split('/').pop() || 'download';
      
      // 解码 URL 编码的字符
      filename = decodeURIComponent(filename);
      
      // 如果没有扩展名，尝试从 Content-Type 推断
      if (!extname(filename)) {
        filename += '.bin'; // 默认扩展名
      }
      
      return filename;
    } catch {
      return 'download.bin';
    }
  }

  /**
   * 生成安全的文件名（移除不安全字符）
   */
  static sanitizeFilename(filename: string): string {
    // 移除或替换不安全的字符
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // 替换不安全字符
      .replace(/\s+/g, '_') // 替换空格
      .replace(/_{2,}/g, '_') // 合并多个下划线
      .replace(/^_+|_+$/g, ''); // 移除开头和结尾的下划线
  }

  /**
   * 生成唯一的文件名（如果文件已存在）
   */
  static async generateUniqueFilename(filePath: string): Promise<string> {
    if (!(await this.fileExists(filePath))) {
      return filePath;
    }

    const dir = dirname(filePath);
    const ext = extname(filePath);
    const name = basename(filePath, ext);

    let counter = 1;
    let newFilePath: string;

    do {
      newFilePath = join(dir, `${name}_${counter}${ext}`);
      counter++;
    } while (await this.fileExists(newFilePath));

    return newFilePath;
  }

  /**
   * 复制文件
   */
  static async copyFile(source: string, destination: string): Promise<void> {
    await this.ensureDir(dirname(destination));
    await fs.copyFile(source, destination);
  }

  /**
   * 移动文件
   */
  static async moveFile(source: string, destination: string): Promise<void> {
    await this.ensureDir(dirname(destination));
    await fs.rename(source, destination);
  }

  /**
   * 删除文件（如果存在）
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 清理目录中的临时文件
   */
  static async cleanupTempFiles(dirPath: string, pattern: RegExp = /\.part\d+$/): Promise<number> {
    try {
      const files = await fs.readdir(dirPath);
      let deletedCount = 0;

      for (const file of files) {
        if (pattern.test(file)) {
          await this.deleteFile(join(dirPath, file));
          deletedCount++;
        }
      }

      return deletedCount;
    } catch {
      return 0;
    }
  }

  /**
   * 格式化文件大小为人类可读的格式
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
  }

  /**
   * 验证文件路径是否安全（防止路径遍历攻击）
   */
  static isPathSafe(filePath: string, baseDir: string): boolean {
    try {
      const resolvedPath = join(baseDir, filePath);
      const normalizedPath = join(resolvedPath);
      const normalizedBase = join(baseDir);

      return normalizedPath.startsWith(normalizedBase);
    } catch {
      return false;
    }
  }

  /**
   * 获取文件的 MIME 类型（基于扩展名）
   */
  static getMimeType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 创建临时文件路径
   */
  static createTempFilePath(originalPath: string, suffix: string = '.tmp'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = extname(originalPath);
    const name = basename(originalPath, ext);
    const dir = dirname(originalPath);

    return join(dir, `${name}_${timestamp}_${random}${suffix}`);
  }
}
