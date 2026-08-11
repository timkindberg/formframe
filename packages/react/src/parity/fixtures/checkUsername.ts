/**
 * Controllable async username availability mock for the account-signup parity
 * fixtures (#118 / #125).
 *
 * Outcomes:
 *   - `available` — resolves true
 *   - `taken`     — resolves false (schema maps to field-invalid)
 *   - `throw`     — rejects (schema maps to run-failure field error)
 *
 * Queue `enqueue({ delay, outcome })` for stale-result races: the next N calls
 * consume the queue FIFO; after that the default delay/outcome apply.
 */

export type UsernameOutcome = 'available' | 'taken' | 'throw'

export interface UsernameCallConfig {
  delay: number
  outcome: UsernameOutcome
}

export interface UsernameChecker {
  checkUsername: (name: string) => Promise<boolean>
  setDelay: (ms: number) => void
  setOutcome: (outcome: UsernameOutcome) => void
  /** Schedule the next call(s). Consumed FIFO before the default config. */
  enqueue: (...calls: UsernameCallConfig[]) => void
  reset: () => void
  /** Completed (or in-flight started) call log, oldest first. */
  readonly calls: ReadonlyArray<{ name: string; at: number }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createUsernameChecker(
  initial: Partial<UsernameCallConfig> = {}
): UsernameChecker {
  let delay = initial.delay ?? 0
  let outcome: UsernameOutcome = initial.outcome ?? 'available'
  const queue: UsernameCallConfig[] = []
  const calls: { name: string; at: number }[] = []

  return {
    calls,
    setDelay(ms) {
      delay = ms
    },
    setOutcome(next) {
      outcome = next
    },
    enqueue(...configs) {
      queue.push(...configs)
    },
    reset() {
      delay = initial.delay ?? 0
      outcome = initial.outcome ?? 'available'
      queue.length = 0
      calls.length = 0
    },
    async checkUsername(name: string) {
      const cfg = queue.shift() ?? { delay, outcome }
      calls.push({ name, at: Date.now() })
      await sleep(cfg.delay)
      if (cfg.outcome === 'throw') {
        throw new Error('Username availability check failed')
      }
      return cfg.outcome === 'available'
    },
  }
}
