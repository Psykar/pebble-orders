// Reddit rate-limits the whole app, not one call, so every caller shares one
// cooldown; otherwise parallel calls keep hitting the limit while one backs
// off. Delays stay short because Devvit caps how long a server request runs.
const defaultBackoffMs = [1_000, 2_000, 4_000]
let cooldownUntil = 0

export function isRateLimited(err: unknown): boolean {
  return /RESOURCE_EXHAUSTED|\b429\b/.test(String(err))
}

/**
 * Runs a Reddit API call, waiting out any shared cooldown first and retrying
 * after each backoff delay when it is rate-limited. Other errors, and a rate
 * limit that outlasts every delay, are rethrown.
 */
export async function withRateLimitRetry<T>(
  call: () => Promise<T>,
  backoffMs: readonly number[] = defaultBackoffMs,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = cooldownUntil - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    try {
      return await call()
    } catch (err) {
      const delay = backoffMs[attempt]
      if (delay === undefined || !isRateLimited(err)) throw err
      cooldownUntil = Math.max(cooldownUntil, Date.now() + delay)
      console.log(`rate limited; retrying in ${delay} ms`)
    }
  }
}
