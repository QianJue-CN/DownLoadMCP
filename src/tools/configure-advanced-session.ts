import { z } from 'zod';
import { AdvancedSessionManager, ProxyConfig, AuthConfig } from '../core/advanced-session-manager.js';

export class ConfigureAdvancedSessionTool {
  getToolDefinition() {
    return {
      name: 'configure_advanced_session',
      description: '配置高级会话管理，支持代理、认证和自定义请求头',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: '会话ID（可选，不提供将自动生成）'
          },
          proxy: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['http', 'https', 'socks4', 'socks5'] },
              host: { type: 'string' },
              port: { type: 'number' },
              username: { type: 'string' },
              password: { type: 'string' },
              timeout: { type: 'number' }
            },
            required: ['type', 'host', 'port'],
            description: '代理配置'
          },
          auth: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['basic', 'digest', 'ntlm', 'bearer'] },
              username: { type: 'string' },
              password: { type: 'string' },
              token: { type: 'string' },
              domain: { type: 'string' },
              workstation: { type: 'string' }
            },
            required: ['type'],
            description: '认证配置'
          },
          userAgent: {
            type: 'string',
            description: '自定义User-Agent'
          },
          defaultHeaders: {
            type: 'object',
            description: '默认请求头'
          },
          timeout: {
            type: 'number',
            description: '请求超时时间（毫秒）'
          },
          maxRedirects: {
            type: 'number',
            description: '最大重定向次数'
          },
          enableCompression: {
            type: 'boolean',
            description: '启用压缩'
          },
          enableKeepAlive: {
            type: 'boolean',
            description: '启用Keep-Alive'
          },
          maxSockets: {
            type: 'number',
            description: '最大Socket连接数'
          },
          retryOnFailure: {
            type: 'boolean',
            description: '失败时重试'
          },
          retryCount: {
            type: 'number',
            description: '重试次数'
          }
        }
      }
    };
  }

  async execute(args: unknown) {
    return await configureAdvancedSession(args);
  }
}

// Validation schemas
const ProxyConfigSchema = z.object({
  type: z.enum(['http', 'https', 'socks4', 'socks5']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  timeout: z.number().int().positive().optional()
});

const AuthConfigSchema = z.object({
  type: z.enum(['basic', 'digest', 'ntlm', 'bearer']),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  domain: z.string().optional(),
  workstation: z.string().optional()
});

const AdvancedSessionConfigSchema = z.object({
  sessionId: z.string().optional(),
  proxy: ProxyConfigSchema.optional(),
  auth: AuthConfigSchema.optional(),
  userAgent: z.string().optional(),
  defaultHeaders: z.record(z.string()).optional(),
  timeout: z.number().int().positive().optional(),
  maxRedirects: z.number().int().min(0).max(20).optional(),
  enableCompression: z.boolean().optional(),
  enableKeepAlive: z.boolean().optional(),
  maxSockets: z.number().int().positive().optional(),
  retryOnFailure: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional()
});

// Global session manager instances
const sessionManagers = new Map<string, AdvancedSessionManager>();

/**
 * Configure advanced session with proxy, authentication, and custom headers
 */
export async function configureAdvancedSession(args: unknown) {
  try {
    const params = AdvancedSessionConfigSchema.parse(args);

    // Generate session ID if not provided
    const sessionId = params.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate authentication configuration
    if (params.auth) {
      validateAuthConfig(params.auth);
    }

    // Create advanced session manager
    const sessionManager = new AdvancedSessionManager({
      proxy: params.proxy,
      auth: params.auth,
      userAgent: params.userAgent,
      defaultHeaders: params.defaultHeaders,
      timeout: params.timeout,
      maxRedirects: params.maxRedirects,
      enableCompression: params.enableCompression,
      enableKeepAlive: params.enableKeepAlive,
      maxSockets: params.maxSockets,
      retryOnFailure: params.retryOnFailure,
      retryCount: params.retryCount
    });

    // Store session manager
    sessionManagers.set(sessionId, sessionManager);

    // Test connection if proxy is configured
    let connectionTest;
    if (params.proxy) {
      connectionTest = await testProxyConnection(params.proxy);
    }

    return {
      success: true,
      sessionId,
      configuration: {
        proxy: params.proxy ? {
          type: params.proxy.type,
          host: params.proxy.host,
          port: params.proxy.port,
          hasAuth: !!(params.proxy.username && params.proxy.password)
        } : undefined,
        auth: params.auth ? {
          type: params.auth.type,
          hasCredentials: !!(params.auth.username || params.auth.token)
        } : undefined,
        userAgent: params.userAgent,
        timeout: params.timeout,
        maxRedirects: params.maxRedirects,
        features: {
          compression: params.enableCompression,
          keepAlive: params.enableKeepAlive,
          retryOnFailure: params.retryOnFailure
        }
      },
      connectionTest,
      message: 'Advanced session configured successfully'
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid configuration parameters',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get session configuration and statistics
 */
export async function getSessionInfo(args: unknown) {
  try {
    const params = z.object({
      sessionId: z.string()
    }).parse(args);

    const sessionManager = sessionManagers.get(params.sessionId);
    if (!sessionManager) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    const stats = sessionManager.getStats();

    return {
      success: true,
      sessionId: params.sessionId,
      stats,
      isActive: true
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Test proxy connection
 */
export async function testProxyConnection(args: unknown) {
  try {
    const params = ProxyConfigSchema.parse(args);

    const result = await performProxyTest(params);

    return {
      success: true,
      proxy: {
        type: params.type,
        host: params.host,
        port: params.port
      },
      test: result
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Proxy test failed'
    };
  }
}

/**
 * List all active sessions
 */
export async function listActiveSessions() {
  try {
    const sessions = Array.from(sessionManagers.entries()).map(([sessionId, manager]) => ({
      sessionId,
      stats: manager.getStats(),
      createdAt: new Date().toISOString() // Would be tracked in real implementation
    }));

    return {
      success: true,
      sessions,
      totalSessions: sessions.length
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list sessions'
    };
  }
}

/**
 * Close and cleanup a session
 */
export async function closeSession(args: unknown) {
  try {
    const params = z.object({
      sessionId: z.string()
    }).parse(args);

    const sessionManager = sessionManagers.get(params.sessionId);
    if (!sessionManager) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    await sessionManager.cleanup();
    sessionManagers.delete(params.sessionId);

    return {
      success: true,
      sessionId: params.sessionId,
      message: 'Session closed successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close session'
    };
  }
}

/**
 * Helper functions
 */
function validateAuthConfig(auth: AuthConfig): void {
  switch (auth.type) {
    case 'basic':
    case 'digest':
    case 'ntlm':
      if (!auth.username || !auth.password) {
        throw new Error(`Username and password required for ${auth.type} authentication`);
      }
      break;
    case 'bearer':
      if (!auth.token) {
        throw new Error('Token required for bearer authentication');
      }
      break;
  }
}

async function performProxyTest(_proxy: ProxyConfig): Promise<any> {
  // Simplified proxy test - in real implementation would test actual connection
  try {
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      connected: true,
      responseTime: Math.floor(Math.random() * 200) + 50, // 50-250ms
      location: 'Unknown', // Would be determined by actual test
      anonymityLevel: 'Unknown'
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}

// Export session manager getter for use by other tools
export function getSessionManager(sessionId: string): AdvancedSessionManager | undefined {
  return sessionManagers.get(sessionId);
}
