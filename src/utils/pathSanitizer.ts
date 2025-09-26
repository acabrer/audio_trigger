import RNFS from 'react-native-fs';

// React Native doesn't have path module, so we implement basic path utilities
const path = {
  normalize: (p: string) => p.replace(/\/\/+/g, '/').replace(/\/$/, ''),
  resolve: (...paths: string[]) => paths.join('/').replace(/\/\/+/g, '/'),
  basename: (p: string, ext?: string) => {
    const parts = p.split('/');
    let name = parts[parts.length - 1] || '';
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  },
  extname: (p: string) => {
    const lastDot = p.lastIndexOf('.');
    const lastSlash = p.lastIndexOf('/');
    if (lastDot > lastSlash) {
      return p.slice(lastDot);
    }
    return '';
  },
  join: (...paths: string[]) => paths.join('/').replace(/\/\/+/g, '/'),
};

/**
 * Path sanitization utilities for secure file operations
 */
export class PathSanitizer {
  private static readonly ALLOWED_EXTENSIONS = [
    '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'
  ];

  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly MAX_FILENAME_LENGTH = 255;

  /**
   * Sanitize and validate a file path
   */
  static sanitizePath(filePath: string, baseDir?: string): {
    isValid: boolean;
    sanitized?: string;
    error?: string;
  } {
    try {
      // Remove any null bytes
      let sanitized = filePath.replace(/\0/g, '');

      // Normalize the path
      sanitized = path.normalize(sanitized);

      // Prevent directory traversal
      if (sanitized.includes('..') || sanitized.includes('~')) {
        return {
          isValid: false,
          error: 'Path contains directory traversal patterns'
        };
      }

      // If base directory is provided, ensure the path is within it
      if (baseDir) {
        const resolvedPath = path.resolve(baseDir, sanitized);
        const resolvedBase = path.resolve(baseDir);

        if (!resolvedPath.startsWith(resolvedBase)) {
          return {
            isValid: false,
            error: 'Path escapes base directory'
          };
        }

        sanitized = resolvedPath;
      }

      // Validate filename length
      const filename = path.basename(sanitized);
      if (filename.length > this.MAX_FILENAME_LENGTH) {
        return {
          isValid: false,
          error: `Filename too long: ${filename.length} chars (max: ${this.MAX_FILENAME_LENGTH})`
        };
      }

      // Check for invalid characters in filename
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return {
          isValid: false,
          error: 'Filename contains invalid characters'
        };
      }

      return {
        isValid: true,
        sanitized
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Path sanitization error: ${error}`
      };
    }
  }

  /**
   * Validate file extension
   */
  static validateExtension(filePath: string): {
    isValid: boolean;
    error?: string;
  } {
    const ext = path.extname(filePath).toLowerCase();

    if (!ext) {
      return {
        isValid: false,
        error: 'File has no extension'
      };
    }

    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        isValid: false,
        error: `Invalid file extension: ${ext}. Allowed: ${this.ALLOWED_EXTENSIONS.join(', ')}`
      };
    }

    return {isValid: true};
  }

  /**
   * Validate file size
   */
  static async validateFileSize(filePath: string): Promise<{
    isValid: boolean;
    size?: number;
    error?: string;
  }> {
    try {
      const stat = await RNFS.stat(filePath);
      const size = typeof stat.size === 'string' ? parseInt(stat.size, 10) : stat.size;

      if (size > this.MAX_FILE_SIZE) {
        return {
          isValid: false,
          size,
          error: `File too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: ${this.MAX_FILE_SIZE / 1024 / 1024}MB)`
        };
      }

      return {
        isValid: true,
        size
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Cannot read file size: ${error}`
      };
    }
  }

  /**
   * Generate a safe filename from user input
   */
  static generateSafeFilename(originalName: string): string {
    // Get the extension
    const ext = path.extname(originalName).toLowerCase();
    let basename = path.basename(originalName, ext);

    // Remove or replace invalid characters
    basename = basename
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^[._-]+/, '') // Remove leading dots, underscores, dashes
      .replace(/[._-]+$/, ''); // Remove trailing dots, underscores, dashes

    // Ensure basename is not empty
    if (!basename) {
      basename = `audio_${Date.now()}`;
    }

    // Truncate if too long (leave room for extension)
    const maxBasenameLength = this.MAX_FILENAME_LENGTH - ext.length - 10; // Leave some buffer
    if (basename.length > maxBasenameLength) {
      basename = basename.substring(0, maxBasenameLength);
    }

    return `${basename}${ext}`;
  }

  /**
   * Create a safe file path
   */
  static createSafePath(directory: string, filename: string): {
    path: string;
    sanitizedFilename: string;
  } {
    const sanitizedFilename = this.generateSafeFilename(filename);
    const safePath = path.join(directory, sanitizedFilename);

    return {
      path: safePath,
      sanitizedFilename
    };
  }

  /**
   * Check if a path exists and is a file (not directory)
   */
  static async validateFile(filePath: string): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    try {
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        return {
          isValid: false,
          error: 'File does not exist'
        };
      }

      const stat = await RNFS.stat(filePath);
      if (stat.isDirectory()) {
        return {
          isValid: false,
          error: 'Path is a directory, not a file'
        };
      }

      return {isValid: true};
    } catch (error) {
      return {
        isValid: false,
        error: `File validation error: ${error}`
      };
    }
  }

  /**
   * Comprehensive file validation
   */
  static async validateAudioFile(filePath: string, baseDir?: string): Promise<{
    isValid: boolean;
    sanitizedPath?: string;
    error?: string;
  }> {
    // Sanitize path
    const pathResult = this.sanitizePath(filePath, baseDir);
    if (!pathResult.isValid) {
      return pathResult;
    }

    const sanitizedPath = pathResult.sanitized!;

    // Validate extension
    const extResult = this.validateExtension(sanitizedPath);
    if (!extResult.isValid) {
      return {
        isValid: false,
        error: extResult.error
      };
    }

    // Validate file exists
    const fileResult = await this.validateFile(sanitizedPath);
    if (!fileResult.isValid) {
      return {
        isValid: false,
        error: fileResult.error
      };
    }

    // Validate file size
    const sizeResult = await this.validateFileSize(sanitizedPath);
    if (!sizeResult.isValid) {
      return {
        isValid: false,
        error: sizeResult.error
      };
    }

    return {
      isValid: true,
      sanitizedPath
    };
  }
}

export default PathSanitizer;