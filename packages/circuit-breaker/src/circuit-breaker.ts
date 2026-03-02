import CircuitBreaker from 'opossum';
import { Gauge } from 'prom-client';
import { getLogger } from '@idempo/observability';

const logger = getLogger('circuit-breaker');

export interface CircuitBreakerOptions {
  /** Service name — used in logs and metrics labels */
  name: string;
  /** Failure rate % to open the circuit. Default: 50 */
  errorThresholdPercentage?: number;
  /** Request timeout in ms. Default: 3000 */
  timeout?: number;
  /** How long to stay OPEN before testing again (ms). Default: 5000 */
  resetTimeout?: number;
  /** Minimum requests before calculating failure rate. Default: 5 */
  volumeThreshold?: number;
}

/**
 * Creates an opossum circuit breaker wrapping `fn` with Prometheus gauge export
 * and structured logging for state transitions.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED  (SPEC.md §7.1)
 *
 * Usage:
 *   const breaker = createCircuitBreaker(walletClient.debit.bind(walletClient), {
 *     name: 'wallet',
 *     errorThresholdPercentage: 50,
 *     timeout: 3000,
 *   });
 *   const result = await breaker.fire(args);
 */
export function createCircuitBreaker<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: CircuitBreakerOptions,
): CircuitBreaker<TArgs, TReturn> {
  const breaker = new CircuitBreaker(fn, {
    name: options.name,
    errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
    timeout: options.timeout ?? 3000,
    resetTimeout: options.resetTimeout ?? 5000,
    volumeThreshold: options.volumeThreshold ?? 5,
  });

  // ── State transition logging ─────────────────────────────────────────────
  breaker.on('open', () => {
    logger.warn({ service: options.name }, 'Circuit OPEN — rejecting requests');
    recordState(options.name, 'open');
  });

  breaker.on('halfOpen', () => {
    logger.info({ service: options.name }, 'Circuit HALF_OPEN — probing');
    recordState(options.name, 'half_open');
  });

  breaker.on('close', () => {
    logger.info({ service: options.name }, 'Circuit CLOSED — resuming normal traffic');
    recordState(options.name, 'closed');
  });

  breaker.on('fallback', (result) => {
    logger.warn({ service: options.name, fallback: result }, 'Circuit fallback triggered');
  });

  return breaker;
}

/**
 * Export circuit breaker state as a Prometheus gauge.
 * Shape: circuit_breaker_state{service="wallet",state="open"} 1
 * Requires prom-client to be initialised (MetricsModule).
 */
function recordState(service: string, state: 'open' | 'half_open' | 'closed'): void {
  try {
    const gauge = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Current state of a circuit breaker (1 = active)',
      labelNames: ['service', 'state'],
    });
    gauge.set({ service, state }, 1);
  } catch {
    // prom-client registry conflict on hot reload — skip
  }
}
