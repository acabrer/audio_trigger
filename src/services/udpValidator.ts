/**
 * UDP Message Validator for security and rate limiting
 */

export interface ValidationConfig {
  allowedDeviceIds?: string[];
  maxMessageLength: number;
  maxMessagesPerMinute: number;
  maxDeviceIdLength: number;
}

export class UDPMessageValidator {
  private config: ValidationConfig;
  private messageCount: Map<string, {count: number; resetTime: number}> = new Map();
  private blockedDevices: Set<string> = new Set();

  constructor(config?: Partial<ValidationConfig>) {
    this.config = {
      allowedDeviceIds: undefined, // If undefined, all devices are allowed
      maxMessageLength: 1024, // 1KB max message size
      maxMessagesPerMinute: 60,
      maxDeviceIdLength: 50,
      ...config
    };

    // Clean up rate limit counters every minute
    setInterval(() => this.cleanupRateLimits(), 60 * 1000);
  }

  /**
   * Validate incoming UDP message
   */
  validateMessage(message: string, deviceId?: string): {
    isValid: boolean;
    error?: string;
  } {
    // Check message length
    if (message.length > this.config.maxMessageLength) {
      return {
        isValid: false,
        error: `Message too long: ${message.length} bytes (max: ${this.config.maxMessageLength})`
      };
    }

    // Validate device ID if provided
    if (deviceId) {
      const deviceValidation = this.validateDeviceId(deviceId);
      if (!deviceValidation.isValid) {
        return deviceValidation;
      }

      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit(deviceId);
      if (!rateLimitCheck.isValid) {
        return rateLimitCheck;
      }
    }

    // Validate message format
    const formatValidation = this.validateMessageFormat(message);
    if (!formatValidation.isValid) {
      return formatValidation;
    }

    return {isValid: true};
  }

  /**
   * Validate device ID
   */
  private validateDeviceId(deviceId: string): {
    isValid: boolean;
    error?: string;
  } {
    // Check if device is blocked
    if (this.blockedDevices.has(deviceId)) {
      return {
        isValid: false,
        error: `Device ${deviceId} is blocked`
      };
    }

    // Check device ID length
    if (deviceId.length > this.config.maxDeviceIdLength) {
      return {
        isValid: false,
        error: `Device ID too long: ${deviceId.length} chars (max: ${this.config.maxDeviceIdLength})`
      };
    }

    // Check if device ID contains only safe characters (alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
      return {
        isValid: false,
        error: `Invalid device ID format: ${deviceId}`
      };
    }

    // Check against whitelist if configured
    if (this.config.allowedDeviceIds && this.config.allowedDeviceIds.length > 0) {
      if (!this.config.allowedDeviceIds.includes(deviceId)) {
        return {
          isValid: false,
          error: `Device ${deviceId} not in whitelist`
        };
      }
    }

    return {isValid: true};
  }

  /**
   * Check rate limiting for device
   */
  private checkRateLimit(deviceId: string): {
    isValid: boolean;
    error?: string;
  } {
    const now = Date.now();
    const deviceLimits = this.messageCount.get(deviceId);

    if (!deviceLimits || now > deviceLimits.resetTime) {
      // Reset counter
      this.messageCount.set(deviceId, {
        count: 1,
        resetTime: now + 60 * 1000 // Reset in 1 minute
      });
      return {isValid: true};
    }

    if (deviceLimits.count >= this.config.maxMessagesPerMinute) {
      // Block device temporarily if it exceeds rate limit too often
      if (deviceLimits.count > this.config.maxMessagesPerMinute * 2) {
        this.blockDevice(deviceId, 5); // Block for 5 minutes
      }

      return {
        isValid: false,
        error: `Rate limit exceeded for device ${deviceId}: ${deviceLimits.count} messages/min`
      };
    }

    deviceLimits.count++;
    return {isValid: true};
  }

  /**
   * Validate message format
   */
  private validateMessageFormat(message: string): {
    isValid: boolean;
    error?: string;
  } {
    // Check for null bytes or control characters
    if (/[\x00-\x08\x0E-\x1F]/.test(message)) {
      return {
        isValid: false,
        error: 'Message contains invalid control characters'
      };
    }

    // Try to parse as ESP format or JSON
    if (message.startsWith('BUTTON:')) {
      const parts = message.split(':');
      if (parts.length < 3) {
        return {
          isValid: false,
          error: 'Invalid ESP message format'
        };
      }

      // Validate button state
      const state = parts[2].trim();
      if (state !== '0' && state !== '1') {
        return {
          isValid: false,
          error: `Invalid button state: ${state}`
        };
      }
    } else {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(message);

        // Validate required fields
        if (typeof parsed.deviceId !== 'string') {
          return {
            isValid: false,
            error: 'Missing or invalid deviceId in JSON'
          };
        }

        if (typeof parsed.buttonPressed !== 'boolean') {
          return {
            isValid: false,
            error: 'Missing or invalid buttonPressed in JSON'
          };
        }

        // Validate optional fields
        if (parsed.batteryLevel !== undefined) {
          if (typeof parsed.batteryLevel !== 'number' ||
              parsed.batteryLevel < 0 ||
              parsed.batteryLevel > 1) {
            return {
              isValid: false,
              error: 'Invalid batteryLevel value (must be 0-1)'
            };
          }
        }
      } catch (error) {
        return {
          isValid: false,
          error: 'Message is not valid ESP format or JSON'
        };
      }
    }

    return {isValid: true};
  }

  /**
   * Block a device temporarily
   */
  blockDevice(deviceId: string, minutes: number = 5): void {
    this.blockedDevices.add(deviceId);
    console.warn(`Blocked device ${deviceId} for ${minutes} minutes`);

    setTimeout(() => {
      this.blockedDevices.delete(deviceId);
      console.log(`Unblocked device ${deviceId}`);
    }, minutes * 60 * 1000);
  }

  /**
   * Unblock a device
   */
  unblockDevice(deviceId: string): void {
    this.blockedDevices.delete(deviceId);
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupRateLimits(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [deviceId, limits] of this.messageCount.entries()) {
      if (now > limits.resetTime) {
        keysToDelete.push(deviceId);
      }
    }

    for (const key of keysToDelete) {
      this.messageCount.delete(key);
    }
  }

  /**
   * Update allowed devices whitelist
   */
  setAllowedDevices(deviceIds: string[]): void {
    this.config.allowedDeviceIds = deviceIds;
  }

  /**
   * Get current statistics
   */
  getStats(): {
    blockedDevices: string[];
    activeRateLimits: number;
    allowedDevices: string[] | undefined;
  } {
    return {
      blockedDevices: Array.from(this.blockedDevices),
      activeRateLimits: this.messageCount.size,
      allowedDevices: this.config.allowedDeviceIds
    };
  }
}

export default UDPMessageValidator;