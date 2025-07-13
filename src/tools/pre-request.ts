import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SessionManager } from '../core/session-manager.js';
import { MCPToolResponse } from '../types/mcp.js';

// 预请求参数验证模式
export const PreRequestArgsSchema = z.object({
  url: z.string().url('必须是有效的 URL'),
  sessionId: z.string().min(1, '会话ID不能为空').optional(),
  method: z.enum(['GET', 'POST', 'HEAD']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  followRedirects: z.boolean().default(true),
  timeout: z.number().min(1000).default(30000),
  userAgent: z.string().optional(),
  referer: z.string().optional()
});

export type PreRequestArgs = z.infer<typeof PreRequestArgsSchema>;

// 预请求响应接口
export interface PreRequestResponse {
  sessionId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  redirects: string[];
  finalUrl: string;
  responseTime: number;
  message: string;
}

/**
 * 预请求工具
 * 用于建立会话状态，处理需要特定会话的下载链接
 */
export class PreRequestTool {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(): Tool {
    return {
      name: 'pre_request',
      description: '发送预请求以建立会话状态，用于处理需要特定会话状态的下载链接（如Cloudflare测试链接）',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要访问的URL，通常是主页面或登录页面'
          },
          sessionId: {
            type: 'string',
            description: '会话ID，如果不提供将自动生成'
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'HEAD'],
            default: 'GET',
            description: 'HTTP方法'
          },
          headers: {
            type: 'object',
            description: '额外的请求头'
          },
          body: {
            type: 'string',
            description: '请求体（仅用于POST请求）'
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: '是否跟随重定向'
          },
          timeout: {
            type: 'number',
            default: 30000,
            description: '请求超时时间（毫秒）'
          },
          userAgent: {
            type: 'string',
            description: '自定义User-Agent'
          },
          referer: {
            type: 'string',
            description: '设置Referer头'
          }
        },
        required: ['url']
      }
    };
  }

  /**
   * 执行预请求工具
   */
  async execute(args: unknown): Promise<MCPToolResponse<PreRequestResponse>> {
    try {
      // 验证参数
      const validatedArgs = PreRequestArgsSchema.parse(args);
      
      // 生成或使用提供的会话ID
      const sessionId = validatedArgs.sessionId || this.generateSessionId();
      
      // 创建或获取会话
      let session = this.sessionManager.getSession(sessionId);
      if (!session) {
        session = this.sessionManager.createSession(sessionId);
      }

      // 更新会话状态
      if (validatedArgs.userAgent) {
        session.userAgent = validatedArgs.userAgent;
        session.headers['User-Agent'] = validatedArgs.userAgent;
      }

      if (validatedArgs.referer) {
        session.referer = validatedArgs.referer;
      }

      // 设置Origin
      const urlObj = new URL(validatedArgs.url);
      session.origin = `${urlObj.protocol}//${urlObj.host}`;

      const startTime = Date.now();
      const redirects: string[] = [];
      let currentUrl = validatedArgs.url;
      let response: Response;

      // 执行请求（处理重定向）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), validatedArgs.timeout);

      try {
        const requestHeaders = this.sessionManager.getRequestHeaders(
          sessionId, 
          currentUrl, 
          validatedArgs.headers
        );

        const requestOptions: RequestInit = {
          method: validatedArgs.method,
          headers: requestHeaders,
          signal: controller.signal,
          redirect: validatedArgs.followRedirects ? 'follow' : 'manual'
        };

        if (validatedArgs.body && validatedArgs.method === 'POST') {
          requestOptions.body = validatedArgs.body;
        }

        response = await fetch(currentUrl, requestOptions);

        // 处理手动重定向
        if (!validatedArgs.followRedirects && response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            redirects.push(location);
            currentUrl = new URL(location, currentUrl).href;
          }
        }

        clearTimeout(timeoutId);

        // 更新会话中的cookies
        this.sessionManager.updateCookiesFromResponse(sessionId, response);

        // 更新Referer为当前URL
        this.sessionManager.updateSession(sessionId, {
          referer: currentUrl
        });

        const responseTime = Date.now() - startTime;

        // 构建响应头对象
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // 获取cookies信息
        const cookies = this.sessionManager.getCookiesForUrl(sessionId, currentUrl)
          .map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path
          }));

        const responseData: PreRequestResponse = {
          sessionId,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          cookies,
          redirects,
          finalUrl: currentUrl,
          responseTime,
          message: `预请求成功完成。会话 ${sessionId} 已建立，包含 ${cookies.length} 个cookies。现在可以使用此会话ID进行下载。`
        };

        return {
          success: true,
          data: responseData,
          timestamp: new Date().toISOString()
        };

      } finally {
        clearTimeout(timeoutId);
      }

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PRE_REQUEST_ERROR',
          message: error instanceof Error ? error.message : '预请求失败',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 为Cloudflare测试创建专用的预请求
   */
  async createCloudflareSession(): Promise<MCPToolResponse<PreRequestResponse>> {
    return this.execute({
      url: 'https://speed.cloudflare.com/',
      method: 'GET',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      followRedirects: true,
      timeout: 30000
    });
  }
}
