import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { URL } from 'url';

export interface SessionConfig {
  userAgent?: string;
  timeout?: number;
  maxRedirects?: number;
  enableCookies?: boolean;
  enableCompression?: boolean;
  cookieJarPath?: string;
  proxyUrl?: string;
  customHeaders?: Record<string, string>;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface RedirectInfo {
  url: string;
  statusCode: number;
  headers: Record<string, string>;
}

export interface RequestOptions extends RequestInit {
  followRedirects?: boolean;
  maxRedirects?: number;
  timeout?: number;
}

export class EnhancedSessionManager extends EventEmitter {
  private config: SessionConfig;
  private cookies: Map<string, CookieData> = new Map();
  private redirectHistory: RedirectInfo[] = [];
  private requestCount: number = 0;

  constructor(config: SessionConfig = {}) {
    super();
    this.config = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      timeout: 30000,
      maxRedirects: 5,
      enableCookies: true,
      enableCompression: true,
      ...config
    };

    // 加载持久化的Cookie
    if (this.config.cookieJarPath) {
      this.loadCookies().catch(() => {
        // 忽略加载失败
      });
    }
  }

  /**
   * 创建请求选项
   */
  async createRequest(url: string, options: RequestOptions = {}): Promise<RequestInit> {
    this.requestCount++;

    // 基础请求头
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent!,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...this.config.customHeaders,
      ...options.headers as Record<string, string>
    };

    // 添加压缩支持
    if (this.config.enableCompression) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }

    // 添加Cookie
    if (this.config.enableCookies) {
      const cookieString = await this.getCookieString(url);
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }
    }

    // 代理设置（如果支持）
    const requestOptions: RequestInit = {
      ...options,
      headers
    };

    return requestOptions;
  }

  /**
   * 处理响应
   */
  async handleResponse(url: string, response: Response): Promise<void> {
    // 处理Set-Cookie头
    if (this.config.enableCookies) {
      const setCookieHeaders = response.headers.get('set-cookie');
      if (setCookieHeaders) {
        await this.parseCookies(url, setCookieHeaders);
      }
    }

    // 记录重定向信息
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        this.redirectHistory.push({
          url: location,
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries())
        });
      }
    }

    // 保存Cookie到文件
    if (this.config.cookieJarPath && this.cookies.size > 0) {
      await this.saveCookies().catch(() => {
        // 忽略保存失败
      });
    }

    this.emit('response', { url, response, requestCount: this.requestCount });
  }

  /**
   * 跟踪重定向
   */
  async followRedirects(
    url: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const maxRedirects = options.maxRedirects ?? this.config.maxRedirects!;
    let currentUrl = url;
    let redirectCount = 0;

    this.redirectHistory = []; // 重置重定向历史

    while (redirectCount < maxRedirects) {
      const requestOptions = await this.createRequest(currentUrl, {
        ...options,
        redirect: 'manual' // 手动处理重定向
      });

      const response = await fetch(currentUrl, requestOptions);
      await this.handleResponse(currentUrl, response);

      // 检查是否是重定向
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          currentUrl = new URL(location, currentUrl).href;
          redirectCount++;
          this.emit('redirect', { from: currentUrl, to: location, count: redirectCount });
          continue;
        }
      }

      return response;
    }

    throw new Error(`Too many redirects (${maxRedirects})`);
  }

  /**
   * 获取Cookie字符串
   */
  private async getCookieString(url: string): Promise<string> {
    const urlObj = new URL(url);
    const relevantCookies: CookieData[] = [];

    for (const cookie of this.cookies.values()) {
      // 检查域名匹配
      if (this.isDomainMatch(urlObj.hostname, cookie.domain)) {
        // 检查路径匹配
        if (this.isPathMatch(urlObj.pathname, cookie.path)) {
          // 检查是否过期
          if (!cookie.expires || cookie.expires > new Date()) {
            // 检查安全性
            if (!cookie.secure || urlObj.protocol === 'https:') {
              relevantCookies.push(cookie);
            }
          }
        }
      }
    }

    return relevantCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  /**
   * 解析Cookie
   */
  private async parseCookies(url: string, setCookieHeader: string): Promise<void> {
    const urlObj = new URL(url);
    const cookies = setCookieHeader.split(',');

    for (const cookieStr of cookies) {
      const cookie = this.parseSingleCookie(cookieStr.trim(), urlObj);
      if (cookie) {
        const key = `${cookie.name}:${cookie.domain}:${cookie.path}`;
        this.cookies.set(key, cookie);
      }
    }
  }

  /**
   * 解析单个Cookie
   */
  private parseSingleCookie(cookieStr: string, urlObj: URL): CookieData | null {
    const parts = cookieStr.split(';').map(part => part.trim());
    const nameValue = parts[0];
    if (!nameValue) {
      return null;
    }

    const [name, value] = nameValue.split('=', 2);

    if (!name || value === undefined) {
      return null;
    }

    const cookie: CookieData = {
      name: name.trim(),
      value: value.trim(),
      domain: urlObj.hostname,
      path: '/'
    };

    // 解析属性
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const [attrName, attrValue] = part.split('=', 2);
      if (!attrName) continue;

      const lowerAttrName = attrName.toLowerCase();

      switch (lowerAttrName) {
        case 'domain':
          cookie.domain = attrValue || urlObj.hostname;
          break;
        case 'path':
          cookie.path = attrValue || '/';
          break;
        case 'expires':
          if (attrValue) {
            cookie.expires = new Date(attrValue);
          }
          break;
        case 'httponly':
          cookie.httpOnly = true;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'samesite':
          cookie.sameSite = (attrValue?.toLowerCase() as any) || 'lax';
          break;
      }
    }

    return cookie;
  }

  /**
   * 域名匹配检查
   */
  private isDomainMatch(hostname: string, cookieDomain: string): boolean {
    if (hostname === cookieDomain) {
      return true;
    }

    // 支持子域名匹配
    if (cookieDomain.startsWith('.')) {
      return hostname.endsWith(cookieDomain.substring(1));
    }

    return false;
  }

  /**
   * 路径匹配检查
   */
  private isPathMatch(pathname: string, cookiePath: string): boolean {
    return pathname.startsWith(cookiePath);
  }

  /**
   * 保存Cookie到文件
   */
  async saveCookies(): Promise<void> {
    if (!this.config.cookieJarPath) return;

    const cookieData = Array.from(this.cookies.values());
    const jsonData = JSON.stringify(cookieData, null, 2);
    await fs.writeFile(this.config.cookieJarPath, jsonData, 'utf-8');
  }

  /**
   * 从文件加载Cookie
   */
  async loadCookies(): Promise<void> {
    if (!this.config.cookieJarPath) return;

    try {
      const jsonData = await fs.readFile(this.config.cookieJarPath, 'utf-8');
      const cookieData: CookieData[] = JSON.parse(jsonData);

      this.cookies.clear();
      for (const cookie of cookieData) {
        // 检查Cookie是否过期
        if (!cookie.expires || cookie.expires > new Date()) {
          const key = `${cookie.name}:${cookie.domain}:${cookie.path}`;
          this.cookies.set(key, {
            ...cookie,
            expires: cookie.expires ? new Date(cookie.expires) : undefined
          });
        }
      }
    } catch (error) {
      // 文件不存在或格式错误，忽略
    }
  }

  /**
   * 清除所有Cookie
   */
  clearCookies(): void {
    this.cookies.clear();
  }

  /**
   * 清除特定域名的Cookie
   */
  clearCookiesForDomain(domain: string): void {
    for (const [key, cookie] of this.cookies.entries()) {
      if (this.isDomainMatch(domain, cookie.domain)) {
        this.cookies.delete(key);
      }
    }
  }

  /**
   * 获取重定向历史
   */
  getRedirectHistory(): RedirectInfo[] {
    return [...this.redirectHistory];
  }

  /**
   * 获取请求统计
   */
  getStats(): {
    requestCount: number;
    cookieCount: number;
    redirectCount: number;
  } {
    return {
      requestCount: this.requestCount,
      cookieCount: this.cookies.size,
      redirectCount: this.redirectHistory.length
    };
  }

  /**
   * 重置会话状态
   */
  reset(): void {
    this.cookies.clear();
    this.redirectHistory = [];
    this.requestCount = 0;
  }
}
