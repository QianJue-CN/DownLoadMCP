import { EventEmitter } from 'events';

/**
 * Cookie 接口
 */
export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 会话状态接口
 */
export interface SessionState {
  cookies: Cookie[];
  headers: Record<string, string>;
  userAgent: string;
  referer?: string;
  origin?: string;
}

/**
 * 会话管理器
 * 用于管理HTTP会话状态，包括cookies、headers等
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * 创建新会话
   */
  createSession(sessionId: string, initialState?: Partial<SessionState>): SessionState {
    const session: SessionState = {
      cookies: [],
      headers: {
        'User-Agent': this.defaultUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      userAgent: this.defaultUserAgent,
      ...initialState
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', { sessionId, session });
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 更新会话状态
   */
  updateSession(sessionId: string, updates: Partial<SessionState>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    Object.assign(session, updates);
    this.emit('session:updated', { sessionId, session });
  }

  /**
   * 从响应中提取并更新cookies
   */
  updateCookiesFromResponse(sessionId: string, response: Response): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    for (const cookieHeader of setCookieHeaders) {
      const cookie = this.parseCookie(cookieHeader);
      if (cookie) {
        this.addCookie(sessionId, cookie);
      }
    }
  }

  /**
   * 添加cookie到会话
   */
  addCookie(sessionId: string, cookie: Cookie): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    // 移除同名cookie
    session.cookies = session.cookies.filter(c =>
      !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );

    // 添加新cookie
    session.cookies.push(cookie);
    this.emit('cookie:added', { sessionId, cookie });
  }

  /**
   * 获取适用于URL的cookies
   */
  getCookiesForUrl(sessionId: string, url: string): Cookie[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const urlObj = new URL(url);
    const now = new Date();

    return session.cookies.filter(cookie => {
      // 检查过期时间
      if (cookie.expires && cookie.expires < now) {
        return false;
      }

      // 检查域名
      if (cookie.domain) {
        if (!this.isDomainMatch(urlObj.hostname, cookie.domain)) {
          return false;
        }
      }

      // 检查路径
      if (cookie.path && !urlObj.pathname.startsWith(cookie.path)) {
        return false;
      }

      // 检查安全性
      if (cookie.secure && urlObj.protocol !== 'https:') {
        return false;
      }

      return true;
    });
  }

  /**
   * 生成Cookie头
   */
  getCookieHeader(sessionId: string, url: string): string {
    const cookies = this.getCookiesForUrl(sessionId, url);
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }

  /**
   * 获取会话的请求头
   */
  getRequestHeaders(sessionId: string, url: string, additionalHeaders?: Record<string, string>): Record<string, string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    const headers = { ...session.headers };

    // 添加Cookie头
    const cookieHeader = this.getCookieHeader(sessionId, url);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // 添加Referer
    if (session.referer) {
      headers['Referer'] = session.referer;
    }

    // 添加Origin
    if (session.origin) {
      headers['Origin'] = session.origin;
    }

    // 合并额外的headers
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }

    return headers;
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.emit('session:deleted', { sessionId });
    }
    return deleted;
  }

  /**
   * 清理过期的cookies
   */
  cleanupExpiredCookies(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      const originalCount = session.cookies.length;
      session.cookies = session.cookies.filter(cookie =>
        !cookie.expires || cookie.expires > now
      );

      if (session.cookies.length !== originalCount) {
        this.emit('cookies:cleaned', { sessionId, removed: originalCount - session.cookies.length });
      }
    }
  }

  /**
   * 解析Cookie字符串
   */
  private parseCookie(cookieString: string): Cookie | null {
    try {
      const parts = cookieString.split(';').map(part => part.trim());
      const nameValue = parts[0];
      if (!nameValue) {
        return null;
      }

      const [name, value] = nameValue.split('=', 2);

      if (!name || value === undefined) {
        return null;
      }

      const cookie: Cookie = {
        name: name.trim(),
        value: value.trim()
      };

      // 解析其他属性
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;

        const [key, val] = part.split('=', 2);
        if (!key) continue;

        const lowerKey = key.toLowerCase();

        switch (lowerKey) {
          case 'domain':
            if (val) cookie.domain = val;
            break;
          case 'path':
            if (val) cookie.path = val;
            break;
          case 'expires':
            if (val) cookie.expires = new Date(val);
            break;
          case 'max-age':
            if (val) {
              cookie.maxAge = parseInt(val, 10);
              if (!isNaN(cookie.maxAge)) {
                cookie.expires = new Date(Date.now() + cookie.maxAge * 1000);
              }
            }
            break;
          case 'secure':
            cookie.secure = true;
            break;
          case 'httponly':
            cookie.httpOnly = true;
            break;
          case 'samesite':
            if (val) cookie.sameSite = val as 'Strict' | 'Lax' | 'None';
            break;
        }
      }

      return cookie;
    } catch {
      return null;
    }
  }

  /**
   * 检查域名是否匹配
   */
  private isDomainMatch(hostname: string, cookieDomain: string): boolean {
    if (cookieDomain.startsWith('.')) {
      // 子域名匹配
      return hostname === cookieDomain.slice(1) || hostname.endsWith(cookieDomain);
    } else {
      // 精确匹配
      return hostname === cookieDomain;
    }
  }
}
