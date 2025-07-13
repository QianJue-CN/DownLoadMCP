import { z } from 'zod';
import { IntegrityVerifier, VerificationOptions } from '../core/integrity-verifier.js';
import { promises as fs } from 'fs';

// 验证单个文件的参数schema
const VerifyFileSchema = z.object({
  filePath: z.string().describe('要验证的文件路径'),
  algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256').describe('哈希算法'),
  expectedChecksum: z.string().optional().describe('期望的校验和（可选）'),
  enableRealTime: z.boolean().default(false).describe('是否启用实时验证')
});

// 批量验证文件的参数schema
const VerifyMultipleFilesSchema = z.object({
  files: z.array(z.object({
    path: z.string().describe('文件路径'),
    expectedChecksum: z.string().optional().describe('期望的校验和（可选）')
  })).describe('要验证的文件列表'),
  algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256').describe('哈希算法'),
  maxConcurrency: z.number().min(1).max(10).default(3).describe('最大并发验证数')
});

// 生成校验和报告的参数schema
const GenerateReportSchema = z.object({
  filePath: z.string().describe('要生成报告的文件路径'),
  algorithms: z.array(z.enum(['md5', 'sha1', 'sha256', 'sha512'])).default(['md5', 'sha1', 'sha256']).describe('要使用的哈希算法列表'),
  outputFormat: z.enum(['json', 'text']).default('json').describe('输出格式')
});

// 比较文件的参数schema
const CompareFilesSchema = z.object({
  filePath1: z.string().describe('第一个文件路径'),
  filePath2: z.string().describe('第二个文件路径'),
  algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256').describe('哈希算法')
});

/**
 * 验证单个文件的完整性
 */
export async function verifyFile(args: z.infer<typeof VerifyFileSchema>) {
  try {
    const { filePath, algorithm, expectedChecksum, enableRealTime } = args;

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return {
        success: false,
        error: `文件不存在: ${filePath}`
      };
    }

    const options: VerificationOptions = {
      algorithm,
      expectedChecksum,
      enableRealTimeVerification: enableRealTime
    };

    const result = await IntegrityVerifier.verifyFile(filePath, options);

    if (result.errorMessage) {
      return {
        success: false,
        error: result.errorMessage
      };
    }

    return {
      success: true,
      result: {
        isValid: result.isValid,
        actualChecksum: result.actualChecksum,
        expectedChecksum: result.expectedChecksum,
        algorithm: result.algorithm,
        fileSize: result.fileSize,
        verificationTime: result.verificationTime,
        formattedChecksum: IntegrityVerifier.formatChecksum(result.actualChecksum, result.algorithm)
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `验证失败: ${(error as Error).message}`
    };
  }
}

/**
 * 批量验证多个文件
 */
export async function verifyMultipleFiles(args: z.infer<typeof VerifyMultipleFilesSchema>) {
  try {
    const { files, algorithm } = args;

    // 检查所有文件是否存在
    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        return {
          success: false,
          error: `文件不存在: ${file.path}`
        };
      }
    }

    // 限制并发数进行批量验证
    const results = await IntegrityVerifier.verifyMultipleFiles(files, algorithm);

    const summary = {
      total: results.length,
      valid: results.filter(r => r.isValid).length,
      invalid: results.filter(r => !r.isValid).length,
      errors: results.filter(r => r.errorMessage).length
    };

    return {
      success: true,
      summary,
      results: results.map(result => ({
        isValid: result.isValid,
        actualChecksum: result.actualChecksum,
        expectedChecksum: result.expectedChecksum,
        algorithm: result.algorithm,
        fileSize: result.fileSize,
        verificationTime: result.verificationTime,
        errorMessage: result.errorMessage,
        formattedChecksum: result.errorMessage
          ? null
          : IntegrityVerifier.formatChecksum(result.actualChecksum, result.algorithm)
      }))
    };

  } catch (error) {
    return {
      success: false,
      error: `批量验证失败: ${(error as Error).message}`
    };
  }
}

/**
 * 生成文件校验和报告
 */
export async function generateReport(args: z.infer<typeof GenerateReportSchema>) {
  try {
    const { filePath, algorithms, outputFormat } = args;

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return {
        success: false,
        error: `文件不存在: ${filePath}`
      };
    }

    const report = await IntegrityVerifier.generateChecksumReport(filePath, algorithms);
    const stats = await fs.stat(filePath);

    const reportData = {
      filePath,
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
      checksums: report,
      generatedAt: new Date().toISOString()
    };

    if (outputFormat === 'text') {
      const textReport = [
        `文件完整性报告`,
        `================`,
        `文件路径: ${filePath}`,
        `文件大小: ${stats.size} bytes`,
        `最后修改: ${stats.mtime.toISOString()}`,
        `生成时间: ${reportData.generatedAt}`,
        ``,
        `校验和:`,
        ...algorithms.map(algo => {
          const checksum = report[algo];
          if (!checksum) {
            return `${algo.toUpperCase()}: Error: No checksum generated`;
          }
          return checksum.startsWith('Error:')
            ? `${algo.toUpperCase()}: ${checksum}`
            : IntegrityVerifier.formatChecksum(checksum, algo);
        })
      ].join('\n');

      return {
        success: true,
        report: textReport,
        format: 'text'
      };
    }

    return {
      success: true,
      report: reportData,
      format: 'json'
    };

  } catch (error) {
    return {
      success: false,
      error: `生成报告失败: ${(error as Error).message}`
    };
  }
}

/**
 * 比较两个文件的校验和
 */
export async function compareFiles(args: z.infer<typeof CompareFilesSchema>) {
  try {
    const { filePath1, filePath2, algorithm } = args;

    // 检查文件是否存在
    for (const filePath of [filePath1, filePath2]) {
      try {
        await fs.access(filePath);
      } catch {
        return {
          success: false,
          error: `文件不存在: ${filePath}`
        };
      }
    }

    const comparison = await IntegrityVerifier.compareFiles(filePath1, filePath2, algorithm);

    return {
      success: true,
      result: {
        areEqual: comparison.areEqual,
        file1: {
          path: filePath1,
          checksum: comparison.checksum1,
          formattedChecksum: IntegrityVerifier.formatChecksum(comparison.checksum1, algorithm)
        },
        file2: {
          path: filePath2,
          checksum: comparison.checksum2,
          formattedChecksum: IntegrityVerifier.formatChecksum(comparison.checksum2, algorithm)
        },
        algorithm: comparison.algorithm
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `文件比较失败: ${(error as Error).message}`
    };
  }
}

/**
 * 获取支持的哈希算法
 */
export async function getSupportedAlgorithms() {
  return {
    success: true,
    algorithms: IntegrityVerifier.getSupportedAlgorithms(),
    description: '支持的哈希算法列表'
  };
}

// 导出工具定义
export const tools = [
  {
    name: 'verify_file_integrity',
    description: '验证单个文件的完整性，支持多种哈希算法',
    inputSchema: VerifyFileSchema,
    handler: verifyFile
  },
  {
    name: 'verify_multiple_files',
    description: '批量验证多个文件的完整性',
    inputSchema: VerifyMultipleFilesSchema,
    handler: verifyMultipleFiles
  },
  {
    name: 'generate_checksum_report',
    description: '生成文件的详细校验和报告',
    inputSchema: GenerateReportSchema,
    handler: generateReport
  },
  {
    name: 'compare_files',
    description: '比较两个文件的校验和是否相同',
    inputSchema: CompareFilesSchema,
    handler: compareFiles
  },
  {
    name: 'get_supported_algorithms',
    description: '获取支持的哈希算法列表',
    inputSchema: z.object({}),
    handler: getSupportedAlgorithms
  }
];
