import { z } from 'zod';
import { WorkMode } from './download.js';

// MCP 工具参数验证模式

// 下载文件工具参数
export const DownloadFileArgsSchema = z.object({
  url: z.string().url('必须是有效的 URL'),
  outputPath: z.string().min(1, '输出路径不能为空'),
  filename: z.string().optional(),
  maxConcurrency: z.number().min(1).max(16).optional(),
  chunkSize: z.number().min(1024).optional(),
  timeout: z.number().min(1000).optional(),
  retryCount: z.number().min(0).max(10).optional(),
  workMode: z.nativeEnum(WorkMode).optional(),
  headers: z.record(z.string()).optional(),
  enableResume: z.boolean().optional(),
  sessionId: z.string().optional()
});

export type DownloadFileArgs = z.infer<typeof DownloadFileArgsSchema>;

// 获取下载状态工具参数
export const GetDownloadStatusArgsSchema = z.object({
  taskId: z.string().min(1, '任务 ID 不能为空')
});

export type GetDownloadStatusArgs = z.infer<typeof GetDownloadStatusArgsSchema>;

// 暂停下载工具参数
export const PauseDownloadArgsSchema = z.object({
  taskId: z.string().min(1, '任务 ID 不能为空')
});

export type PauseDownloadArgs = z.infer<typeof PauseDownloadArgsSchema>;

// 恢复下载工具参数
export const ResumeDownloadArgsSchema = z.object({
  taskId: z.string().min(1, '任务 ID 不能为空')
});

export type ResumeDownloadArgs = z.infer<typeof ResumeDownloadArgsSchema>;

// 取消下载工具参数
export const CancelDownloadArgsSchema = z.object({
  taskId: z.string().min(1, '任务 ID 不能为空')
});

export type CancelDownloadArgs = z.infer<typeof CancelDownloadArgsSchema>;

// 列出下载任务工具参数
export const ListDownloadsArgsSchema = z.object({
  status: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional()
});

export type ListDownloadsArgs = z.infer<typeof ListDownloadsArgsSchema>;

// MCP 工具响应格式
export interface MCPToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// 下载文件工具响应
export interface DownloadFileResponse {
  taskId: string;
  status: string;
  message: string;
  estimatedDuration?: number;
}

// 获取下载状态工具响应
export interface GetDownloadStatusResponse {
  taskId: string;
  status: string;
  progress: {
    percentage: number;
    downloadedSize: number;
    totalSize: number;
    speed: number;
    eta: number;
  };
  metadata: {
    filename: string;
    url: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  error?: string;
}

// 列出下载任务工具响应
export interface ListDownloadsResponse {
  tasks: Array<{
    taskId: string;
    status: string;
    filename: string;
    url: string;
    progress: number;
    createdAt: string;
  }>;
  total: number;
  hasMore: boolean;
}

// 通用操作响应
export interface OperationResponse {
  taskId: string;
  success: boolean;
  message: string;
  newStatus?: string;
}
