import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { DownloadSegment } from '../types/download.js';

export interface VerificationOptions {
  algorithm: string;
  expectedChecksum?: string;
  enableSegmentVerification?: boolean;
  enableRealTimeVerification?: boolean;
  chunkSize?: number;
}

export interface VerificationResult {
  isValid: boolean;
  actualChecksum: string;
  expectedChecksum?: string;
  algorithm: string;
  fileSize: number;
  verificationTime: number;
  errorMessage?: string;
}

export interface SegmentVerificationResult {
  segmentId: string;
  isValid: boolean;
  actualChecksum: string;
  expectedChecksum?: string;
  errorMessage?: string;
}

export class IntegrityVerifier {
  private static readonly SUPPORTED_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'];
  private static readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB

  /**
   * 验证文件完整性
   */
  static async verifyFile(
    filePath: string,
    options: VerificationOptions
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // 检查算法支持
      if (!this.isAlgorithmSupported(options.algorithm)) {
        throw new Error(`Unsupported hash algorithm: ${options.algorithm}`);
      }

      // 检查文件是否存在
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      // 计算文件校验和
      const actualChecksum = await this.calculateFileChecksum(
        filePath,
        options.algorithm,
        options.chunkSize
      );

      const verificationTime = Date.now() - startTime;
      const isValid = options.expectedChecksum
        ? actualChecksum.toLowerCase() === options.expectedChecksum.toLowerCase()
        : true; // 如果没有期望值，只返回计算结果

      return {
        isValid,
        actualChecksum,
        expectedChecksum: options.expectedChecksum,
        algorithm: options.algorithm,
        fileSize: stats.size,
        verificationTime
      };

    } catch (error) {
      return {
        isValid: false,
        actualChecksum: '',
        expectedChecksum: options.expectedChecksum,
        algorithm: options.algorithm,
        fileSize: 0,
        verificationTime: Date.now() - startTime,
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * 计算文件校验和
   */
  static async calculateFileChecksum(
    filePath: string,
    algorithm: string = 'sha256',
    chunkSize: number = this.DEFAULT_CHUNK_SIZE
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash(algorithm);
      const stream = createReadStream(filePath, { highWaterMark: chunkSize });

      stream.on('data', (data: string | Buffer) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * 验证分段文件
   */
  static async verifySegments(
    segments: DownloadSegment[],
    algorithm: string = 'sha256'
  ): Promise<SegmentVerificationResult[]> {
    const results: SegmentVerificationResult[] = [];

    for (const segment of segments) {
      try {
        const actualChecksum = await this.calculateFileChecksum(
          segment.filePath,
          algorithm
        );

        const isValid = segment.checksum
          ? actualChecksum.toLowerCase() === segment.checksum.toLowerCase()
          : true;

        results.push({
          segmentId: segment.id,
          isValid,
          actualChecksum,
          expectedChecksum: segment.checksum
        });

      } catch (error) {
        results.push({
          segmentId: segment.id,
          isValid: false,
          actualChecksum: '',
          expectedChecksum: segment.checksum,
          errorMessage: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * 实时校验和计算器
   */
  static createRealTimeVerifier(algorithm: string = 'sha256') {
    if (!this.isAlgorithmSupported(algorithm)) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }

    const hash = createHash(algorithm);
    let totalBytes = 0;

    return {
      update: (data: Buffer | Uint8Array) => {
        hash.update(data);
        totalBytes += data.length;
      },

      digest: () => {
        return hash.digest('hex');
      },

      getTotalBytes: () => totalBytes,

      reset: () => {
        // 注意：Node.js的Hash对象不能重置，需要创建新的
        throw new Error('Hash object cannot be reset. Create a new verifier instead.');
      }
    };
  }

  /**
   * 批量验证多个文件
   */
  static async verifyMultipleFiles(
    files: Array<{ path: string; expectedChecksum?: string }>,
    algorithm: string = 'sha256'
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // 并行验证（限制并发数）
    const concurrency = 3;
    const chunks = this.chunkArray(files, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(file =>
          this.verifyFile(file.path, {
            algorithm,
            expectedChecksum: file.expectedChecksum
          })
        )
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 生成文件校验和报告
   */
  static async generateChecksumReport(
    filePath: string,
    algorithms: string[] = ['md5', 'sha1', 'sha256']
  ): Promise<Record<string, string>> {
    const report: Record<string, string> = {};

    for (const algorithm of algorithms) {
      if (this.isAlgorithmSupported(algorithm)) {
        try {
          report[algorithm] = await this.calculateFileChecksum(filePath, algorithm);
        } catch (error) {
          report[algorithm] = `Error: ${(error as Error).message}`;
        }
      } else {
        report[algorithm] = `Error: Unsupported algorithm`;
      }
    }

    return report;
  }

  /**
   * 比较两个文件的校验和
   */
  static async compareFiles(
    filePath1: string,
    filePath2: string,
    algorithm: string = 'sha256'
  ): Promise<{
    areEqual: boolean;
    checksum1: string;
    checksum2: string;
    algorithm: string;
  }> {
    const [checksum1, checksum2] = await Promise.all([
      this.calculateFileChecksum(filePath1, algorithm),
      this.calculateFileChecksum(filePath2, algorithm)
    ]);

    return {
      areEqual: checksum1.toLowerCase() === checksum2.toLowerCase(),
      checksum1,
      checksum2,
      algorithm
    };
  }

  /**
   * 验证下载完整性（合并分段后）
   */
  static async verifyMergedFile(
    outputPath: string,
    segments: DownloadSegment[],
    algorithm: string = 'sha256'
  ): Promise<{
    fileValid: boolean;
    segmentsValid: boolean;
    fileChecksum: string;
    segmentResults: SegmentVerificationResult[];
    totalSize: number;
  }> {
    // 验证主文件
    const fileResult = await this.verifyFile(outputPath, { algorithm });

    // 验证分段文件
    const segmentResults = await this.verifySegments(segments, algorithm);

    // 计算总大小
    const totalSize = segments.reduce((sum, segment) => sum + (segment.end - segment.start + 1), 0);

    return {
      fileValid: fileResult.isValid,
      segmentsValid: segmentResults.every(result => result.isValid),
      fileChecksum: fileResult.actualChecksum,
      segmentResults,
      totalSize
    };
  }

  /**
   * 检查算法是否支持
   */
  static isAlgorithmSupported(algorithm: string): boolean {
    return this.SUPPORTED_ALGORITHMS.includes(algorithm.toLowerCase());
  }

  /**
   * 获取支持的算法列表
   */
  static getSupportedAlgorithms(): string[] {
    return [...this.SUPPORTED_ALGORITHMS];
  }

  /**
   * 格式化校验和显示
   */
  static formatChecksum(checksum: string, algorithm: string): string {
    const upperAlgorithm = algorithm.toUpperCase();
    const formattedChecksum = checksum.toLowerCase();

    // 按算法添加分隔符以提高可读性
    switch (algorithm.toLowerCase()) {
      case 'md5':
        return `${upperAlgorithm}: ${formattedChecksum.replace(/(.{8})/g, '$1 ').trim()}`;
      case 'sha1':
        return `${upperAlgorithm}: ${formattedChecksum.replace(/(.{8})/g, '$1 ').trim()}`;
      case 'sha256':
      case 'sha512':
        return `${upperAlgorithm}: ${formattedChecksum.replace(/(.{16})/g, '$1 ').trim()}`;
      default:
        return `${upperAlgorithm}: ${formattedChecksum}`;
    }
  }

  /**
   * 数组分块工具
   */
  private static chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
