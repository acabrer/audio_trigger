/**
 * Tests for error recovery utilities
 */
import { RetryManager, CircuitBreaker, HealthMonitor } from '../../src/utils/errorRecovery';

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2
    });
  });

  it('should succeed on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await retryManager.executeWithRetry(operation, 'test-op');

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retryManager.executeWithRetry(operation, 'test-op');

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should fail after max attempts', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(
      retryManager.executeWithRetry(operation, 'test-op')
    ).rejects.toThrow('persistent failure');

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should track attempt counts', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    try {
      await retryManager.executeWithRetry(operation, 'test-op');
    } catch (e) {
      // Expected to fail
    }

    expect(retryManager.getAttemptCount('test-op')).toBe(3);
    expect(retryManager.isRetrying('test-op')).toBe(true);
  });

  it('should reset attempts on success', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    await retryManager.executeWithRetry(operation, 'test-op');

    expect(retryManager.getAttemptCount('test-op')).toBe(0);
    expect(retryManager.isRetrying('test-op')).toBe(false);
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(2, 1000); // 2 failures, 1 second timeout
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should open after threshold failures', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    // First failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    expect(circuitBreaker.getState()).toBe('CLOSED');

    // Second failure - should open
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    expect(circuitBreaker.getState()).toBe('OPEN');
  });

  it('should reject immediately when OPEN', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    // Trigger opening
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();

    // Should be open now
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Next call should fail immediately without calling operation
    operation.mockClear();
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    expect(operation).not.toHaveBeenCalled();
  });

  it('should reset on success', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    await circuitBreaker.execute(operation);

    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should allow manual reset', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Reset
    circuitBreaker.reset();
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });
});

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    healthMonitor = new HealthMonitor();
  });

  it('should register and check health', async () => {
    const healthCheck = jest.fn().mockResolvedValue(true);
    healthMonitor.registerHealthCheck('service1', healthCheck);

    const isHealthy = await healthMonitor.checkHealth('service1');

    expect(isHealthy).toBe(true);
    expect(healthCheck).toHaveBeenCalled();
  });

  it('should handle health check failures', async () => {
    const healthCheck = jest.fn().mockRejectedValue(new Error('health check failed'));
    healthMonitor.registerHealthCheck('service1', healthCheck);

    const isHealthy = await healthMonitor.checkHealth('service1');

    expect(isHealthy).toBe(false);
  });

  it('should check all services', async () => {
    const healthCheck1 = jest.fn().mockResolvedValue(true);
    const healthCheck2 = jest.fn().mockResolvedValue(false);

    healthMonitor.registerHealthCheck('service1', healthCheck1);
    healthMonitor.registerHealthCheck('service2', healthCheck2);

    const results = await healthMonitor.checkAllServices();

    expect(results).toEqual({
      service1: true,
      service2: false
    });
  });

  it('should track service status', async () => {
    const healthCheck = jest.fn().mockResolvedValue(true);
    healthMonitor.registerHealthCheck('service1', healthCheck);

    await healthMonitor.checkHealth('service1');

    expect(healthMonitor.getServiceStatus('service1')).toBe(true);
    expect(healthMonitor.getLastHealthCheck('service1')).toBeGreaterThan(0);
  });

  it('should return all status', () => {
    const healthCheck1 = jest.fn().mockResolvedValue(true);
    const healthCheck2 = jest.fn().mockResolvedValue(false);

    healthMonitor.registerHealthCheck('service1', healthCheck1);
    healthMonitor.registerHealthCheck('service2', healthCheck2);

    // Initially services are assumed healthy
    const status = healthMonitor.getAllStatus();
    expect(status.service1).toBe(true);
    expect(status.service2).toBe(true);
  });

  it('should handle non-existent service health check', async () => {
    const isHealthy = await healthMonitor.checkHealth('non-existent');
    expect(isHealthy).toBe(true); // Default to healthy
  });
});