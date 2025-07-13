import { z } from 'zod';

// 下载状态枚举
export enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// 工作模式枚举
export enum WorkMode {
  BLOCKING = 'blocking',        // 阻塞模式
  NON_BLOCKING = 'non_blocking', // 非阻塞模式
  PERSISTENT = 'persistent',    // 持久化模式
  TEMPORARY = 'temporary'       // 临时模式
}

// 下载段信息
export interface DownloadSegment {
  id: string;
  start: number;
  end: number;
  downloaded: number;
  status: DownloadStatus;
  filePath: string;
  checksum?: string;
  retryCount?: number;
}

// 下载进度信息
export interface DownloadProgress {
  taskId: string;
  totalSize: number;
  downloadedSize: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
  segments: DownloadSegment[];
}

// 下载任务配置
export const DownloadConfigSchema = z.object({
  url: z.string().url('必须是有效的 URL'),
  outputPath: z.string().min(1, '输出路径不能为空'),
  filename: z.string().optional(),
  maxConcurrency: z.number().min(1).max(16).default(4),
  chunkSize: z.number().min(1024).default(1024 * 1024), // 1MB
  timeout: z.number().min(1000).default(30000), // 30 seconds
  retryCount: z.number().min(0).max(10).default(3),
  workMode: z.nativeEnum(WorkMode).default(WorkMode.NON_BLOCKING),
  headers: z.record(z.string()).optional(),
  enableResume: z.boolean().default(true),
  sessionId: z.string().optional()
});

export type DownloadConfig = z.infer<typeof DownloadConfigSchema>;

// 下载任务信息
export interface DownloadTask {
  id: string;
  config: DownloadConfig;
  status: DownloadStatus;
  progress: DownloadProgress;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata: {
    contentLength?: number;
    contentType?: string;
    lastModified?: string;
    etag?: string;
    supportsRange: boolean;
  };
}

// 下载结果
export interface DownloadResult {
  taskId: string;
  success: boolean;
  filePath?: string;
  fileSize?: number;
  duration?: number;
  averageSpeed?: number;
  error?: string;
}

// 下载统计信息
export interface DownloadStats {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDownloaded: number;
  currentSpeed: number;
}

// 网络错误类型
export enum NetworkErrorType {
  CONNECTION_TIMEOUT = 'connection_timeout',
  READ_TIMEOUT = 'read_timeout',
  CONNECTION_REFUSED = 'connection_refused',
  DNS_RESOLUTION_FAILED = 'dns_resolution_failed',
  SSL_ERROR = 'ssl_error',
  HTTP_ERROR = 'http_error',
  UNKNOWN = 'unknown'
}

// 下载错误信息
export interface DownloadError {
  type: NetworkErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  timestamp: Date;
}
