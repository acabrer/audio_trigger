/**
 * Error recovery utilities for robust service management
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class RetryManager {
  private config: RetryConfig;
  private attempts: Map<string, number> = new Map();

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      ...config
    };
  }

  /**
   * Execute a function with exponential backoff retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string
  ): Promise<T> {
    let currentAttempt = this.attempts.get(operationId) || 0;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        // Reset attempts on success
        this.attempts.delete(operationId);
        return result;
      } catch (error) {
        currentAttempt++;
        this.attempts.set(operationId, currentAttempt);

        if (attempt === this.config.maxAttempts - 1) {
          // Last attempt failed, throw the error
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt),
          this.config.maxDelay
        );

        console.warn(`Operation ${operationId} failed (attempt ${attempt + 1}/${this.config.maxAttempts}), retrying in ${delay}ms:`, error);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Operation ${operationId} failed after ${this.config.maxAttempts} attempts`);
  }

  /**
   * Reset retry count for an operation
   */
  resetRetries(operationId: string): void {
    this.attempts.delete(operationId);
  }

  /**
   * Get current attempt count for an operation
   */
  getAttemptCount(operationId: string): number {
    return this.attempts.get(operationId) || 0;
  }

  /**
   * Check if operation is in retry state
   */
  isRetrying(operationId: string): boolean {
    return this.attempts.has(operationId);
  }
}

/**
 * Circuit breaker pattern for service resilience
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
}

/**
 * Service health monitor
 */
export class HealthMonitor {
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();
  private healthStatus: Map<string, boolean> = new Map();
  private lastHealthCheck: Map<string, number> = new Map();

  registerHealthCheck(service: string, healthCheck: () => Promise<boolean>): void {
    this.healthChecks.set(service, healthCheck);
    this.healthStatus.set(service, true); // Assume healthy initially
  }

  async checkHealth(service: string): Promise<boolean> {
    const healthCheck = this.healthChecks.get(service);
    if (!healthCheck) {
      console.warn(`No health check registered for service: ${service}`);
      return true;
    }

    try {
      const isHealthy = await healthCheck();
      this.healthStatus.set(service, isHealthy);
      this.lastHealthCheck.set(service, Date.now());
      return isHealthy;
    } catch (error) {
      console.error(`Health check failed for service ${service}:`, error);
      this.healthStatus.set(service, false);
      this.lastHealthCheck.set(service, Date.now());
      return false;
    }
  }

  async checkAllServices(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const service of this.healthChecks.keys()) {
      results[service] = await this.checkHealth(service);
    }

    return results;
  }

  getServiceStatus(service: string): boolean | undefined {
    return this.healthStatus.get(service);
  }

  getAllStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [service, healthy] of this.healthStatus.entries()) {
      status[service] = healthy;
    }
    return status;
  }

  getLastHealthCheck(service: string): number | undefined {
    return this.lastHealthCheck.get(service);
  }
}

// Global instances
export const globalRetryManager = new RetryManager();
export const globalCircuitBreaker = new CircuitBreaker();
export const globalHealthMonitor = new HealthMonitor();