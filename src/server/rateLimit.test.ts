import assert from 'node:assert/strict'
import {test} from 'node:test'
import {isRateLimited, withRateLimitRetry} from './rateLimit.ts'

const rateLimited = Error('8 RESOURCE_EXHAUSTED: 429 Too Many Requests')

function failing(errors: Error[]): {
  call: () => Promise<string>
  calls: number
} {
  const state = {
    calls: 0,
    call: async () => {
      state.calls++
      const err = errors.shift()
      if (err) throw err
      return 'ok'
    },
  }
  return state
}

test('recognises Devvit rate-limit errors', () => {
  assert.ok(isRateLimited(rateLimited))
  assert.ok(!isRateLimited(Error('13 INTERNAL: 500 Internal Server Error')))
})

test('retries a rate-limited call until it succeeds', async () => {
  const fake = failing([rateLimited, rateLimited])
  assert.equal(await withRateLimitRetry(fake.call, [1, 1, 1]), 'ok')
  assert.equal(fake.calls, 3)
})

test('rethrows other errors without retrying', async () => {
  const fake = failing([Error('not found')])
  await assert.rejects(withRateLimitRetry(fake.call, [1, 1]), /not found/)
  assert.equal(fake.calls, 1)
})

test('gives up once every backoff delay is used', async () => {
  const fake = failing([rateLimited, rateLimited, rateLimited])
  await assert.rejects(withRateLimitRetry(fake.call, [1, 1]), /429/)
  assert.equal(fake.calls, 3)
})
