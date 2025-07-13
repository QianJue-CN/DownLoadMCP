import { createHash, randomBytes } from 'crypto';
import { URL } from 'url';

export interface ProxyConfig {
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface AuthConfig {
  type: 'basic' | 'digest' | 'ntlm' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
  domain?: string; // For NTLM
  workstation?: string; // For NTLM
}

export interface AdvancedSessionConfig {
  proxy?: ProxyConfig;
  auth?: AuthConfig;
  userAgent?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  maxRedirects?: number;
  enableCompression?: boolean;
  enableKeepAlive?: boolean;
  maxSockets?: number;
  retryOnFailure?: boolean;
  retryCount?: number;
}

export interface DigestAuthChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
  stale?: boolean;
}

export class AdvancedSessionManager {
  private config: AdvancedSessionConfig;
  private sessionCookies: Map<string, string> = new Map();
  private digestNonceCount: Map<string, number> = new Map();
  private connectionPool: Map<string, any> = new Map();
  private stats = {
    requestCount: 0,
    authAttempts: 0,
    proxyConnections: 0,
    errors: 0
  };

  constructor(config: AdvancedSessionConfig = {}) {
    this.config = {
      timeout: 30000,
      maxRedirects: 5,
      enableCompression: true,
      enableKeepAlive: true,
      maxSockets: 10,
      retryOnFailure: true,
      retryCount: 3,
      ...config
    };
  }

  /**
   * Create request options with advanced session management
   */
  async createRequestOptions(url: string, options: RequestInit = {}): Promise<RequestInit> {
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...this.getDefaultHeaders(),
        ...this.config.defaultHeaders,
        ...options.headers
      }
    };

    // Add authentication headers
    if (this.config.auth) {
      const authHeaders = await this.getAuthHeaders(url, requestOptions.method || 'GET');
      if (requestOptions.headers) {
        Object.assign(requestOptions.headers, authHeaders);
      } else {
        requestOptions.headers = authHeaders;
      }
    }

    // Add proxy configuration
    if (this.config.proxy) {
      // Note: Proxy support would require additional implementation
      // This is a placeholder for proxy configuration
      const proxyAgent = this.getProxyAgent();
      if (proxyAgent) {
        (requestOptions as any).agent = proxyAgent;
      }
    }

    // Add cookies
    const cookieHeader = this.getCookieHeader(url);
    if (cookieHeader) {
      (requestOptions.headers as any)['Cookie'] = cookieHeader;
    }

    this.stats.requestCount++;
    return requestOptions;
  }

  /**
   * Get default headers including User-Agent
   */
  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent || 'DownloadMCP/2.0 (Advanced Session Manager)',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    };

    if (this.config.enableCompression) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }

    if (this.config.enableKeepAlive) {
      headers['Connection'] = 'keep-alive';
    }

    return headers;
  }

  /**
   * Get authentication headers based on auth type
   */
  private async getAuthHeaders(url: string, method: string): Promise<Record<string, string>> {
    if (!this.config.auth) return {};

    this.stats.authAttempts++;

    switch (this.config.auth.type) {
      case 'basic':
        return this.getBasicAuthHeaders();
      case 'digest':
        return await this.getDigestAuthHeaders(url, method);
      case 'bearer':
        return this.getBearerAuthHeaders();
      case 'ntlm':
        return await this.getNTLMAuthHeaders();
      default:
        return {};
    }
  }

  /**
   * Generate Basic Authentication headers
   */
  private getBasicAuthHeaders(): Record<string, string> {
    if (!this.config.auth?.username || !this.config.auth?.password) {
      throw new Error('Username and password required for Basic auth');
    }

    const credentials = `${this.config.auth.username}:${this.config.auth.password}`;
    const encoded = Buffer.from(credentials).toString('base64');

    return {
      'Authorization': `Basic ${encoded}`
    };
  }

  /**
   * Generate Digest Authentication headers
   */
  private async getDigestAuthHeaders(url: string, method: string): Promise<Record<string, string>> {
    if (!this.config.auth?.username || !this.config.auth?.password) {
      throw new Error('Username and password required for Digest auth');
    }

    // This would typically require a previous 401 response to get the challenge
    // For now, we'll return a placeholder implementation
    const challenge = await this.getDigestChallenge(url);
    if (!challenge) {
      return {};
    }

    const uri = new URL(url).pathname;
    const nc = this.getNextNonceCount(challenge.nonce);
    const cnonce = this.generateCnonce();

    const ha1 = this.calculateHA1(
      this.config.auth.username,
      challenge.realm,
      this.config.auth.password,
      challenge.algorithm
    );

    const ha2 = this.calculateHA2(method, uri, challenge.qop);

    const response = this.calculateDigestResponse(
      ha1, challenge.nonce, nc, cnonce, challenge.qop, ha2
    );

    let authHeader = `Digest username="${this.config.auth.username}", ` +
      `realm="${challenge.realm}", ` +
      `nonce="${challenge.nonce}", ` +
      `uri="${uri}", ` +
      `response="${response}"`;

    if (challenge.qop) {
      authHeader += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;
    }

    if (challenge.opaque) {
      authHeader += `, opaque="${challenge.opaque}"`;
    }

    return {
      'Authorization': authHeader
    };
  }

  /**
   * Generate Bearer token headers
   */
  private getBearerAuthHeaders(): Record<string, string> {
    if (!this.config.auth?.token) {
      throw new Error('Token required for Bearer auth');
    }

    return {
      'Authorization': `Bearer ${this.config.auth.token}`
    };
  }

  /**
   * Generate NTLM Authentication headers (simplified implementation)
   */
  private async getNTLMAuthHeaders(): Promise<Record<string, string>> {
    // NTLM is a complex protocol that requires multiple round trips
    // This is a simplified placeholder implementation
    if (!this.config.auth?.username || !this.config.auth?.password) {
      throw new Error('Username and password required for NTLM auth');
    }

    // Type 1 message (negotiate)
    const type1Message = this.createNTLMType1Message();

    return {
      'Authorization': `NTLM ${type1Message}`
    };
  }

  /**
   * Get proxy agent for requests
   */
  private getProxyAgent(): any {
    if (!this.config.proxy) return undefined;

    // This would require implementing proxy support
    // Placeholder for proxy agent creation
    this.stats.proxyConnections++;
    return undefined;
  }

  /**
   * Get cookie header for URL
   */
  private getCookieHeader(url: string): string | undefined {
    const urlObj = new URL(url);
    const cookies: string[] = [];

    for (const [name, value] of this.sessionCookies) {
      // Simple domain matching (would need more sophisticated logic)
      if (name.includes(urlObj.hostname)) {
        cookies.push(`${name.split('|')[1]}=${value}`);
      }
    }

    return cookies.length > 0 ? cookies.join('; ') : undefined;
  }

  /**
   * Store cookies from response
   */
  storeCookies(url: string, response: Response): void {
    const setCookieHeaders = response.headers.get('set-cookie');
    if (!setCookieHeaders) return;

    const urlObj = new URL(url);
    const cookies = setCookieHeaders.split(',');

    for (const cookie of cookies) {
      const [nameValue] = cookie.split(';');
      if (nameValue) {
        const [name, value] = nameValue.split('=');

        if (name && value) {
          const key = `${urlObj.hostname}|${name.trim()}`;
          this.sessionCookies.set(key, value.trim());
        }
      }
    }
  }

  /**
   * Helper methods for Digest authentication
   */
  private async getDigestChallenge(_url: string): Promise<DigestAuthChallenge | null> {
    // This would typically come from a 401 response
    // Placeholder implementation
    return null;
  }

  private getNextNonceCount(nonce: string): string {
    const current = this.digestNonceCount.get(nonce) || 0;
    const next = current + 1;
    this.digestNonceCount.set(nonce, next);
    return next.toString(16).padStart(8, '0');
  }

  private generateCnonce(): string {
    return randomBytes(16).toString('hex');
  }

  private calculateHA1(username: string, realm: string, password: string, algorithm = 'MD5'): string {
    const hash = createHash(algorithm.toLowerCase());
    hash.update(`${username}:${realm}:${password}`);
    return hash.digest('hex');
  }

  private calculateHA2(method: string, uri: string, qop?: string): string {
    const hash = createHash('md5');
    if (qop === 'auth-int') {
      // Would need request body hash
      hash.update(`${method}:${uri}:`);
    } else {
      hash.update(`${method}:${uri}`);
    }
    return hash.digest('hex');
  }

  private calculateDigestResponse(
    ha1: string, nonce: string, nc: string, cnonce: string, qop: string | undefined, ha2: string
  ): string {
    const hash = createHash('md5');
    if (qop) {
      hash.update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    } else {
      hash.update(`${ha1}:${nonce}:${ha2}`);
    }
    return hash.digest('hex');
  }

  private createNTLMType1Message(): string {
    // Simplified NTLM Type 1 message
    // Real implementation would be much more complex
    return Buffer.from('NTLMSSP\0\x01\x00\x00\x00').toString('base64');
  }

  /**
   * Get session statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset session state
   */
  reset(): void {
    this.sessionCookies.clear();
    this.digestNonceCount.clear();
    this.connectionPool.clear();
    this.stats = {
      requestCount: 0,
      authAttempts: 0,
      proxyConnections: 0,
      errors: 0
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.reset();
    // Close any open connections
    for (const [, connection] of this.connectionPool) {
      if (connection && typeof connection.destroy === 'function') {
        connection.destroy();
      }
    }
  }
}
