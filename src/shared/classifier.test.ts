// Real mega-thread comments the parser used to misclassify.
import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {type Entry, isLikelyReport, normalizeEntry} from './parser.js'

function parse(body: string, created = '2026-05-05T00:00:00Z'): Entry {
  return normalizeEntry({author: 'x', body, created, score: 0, permalink: null})
}

function assertReport(body: string, expected: Partial<Entry>): void {
  const entry = parse(body)
  assert.ok(isLikelyReport(entry), `not a report: ${body}`)
  for (const [key, value] of Object.entries(expected))
    assert.equal(entry[key as keyof Entry], value, key)
}

test('status from wording without a date', () => {
  assertReport('Pebble Time 2\nSpain\nShipped today', {
    device: 'Pebble Time 2',
    status: 'Shipped',
  })
  assertReport('Got the shipping notification yesterday. Batch 1, Sweden.', {
    status: 'Shipped',
  })
  assertReport('It happened! Silver grey confirmation!!', {
    color: 'Silver/Grey',
    status: 'Confirmed',
  })
  assertReport(
    'Pt2 Black grey 3/18 10:46am pst. No email.\n*update\nReceived email 4/22, confirmed, shipping notification 4/23, arrived 5/1!',
    {status: 'Delivered'},
  )
})

test('a wave is a batch', () => {
  assertReport('2025-12-23\nUS\nWave 4\nNo email yet', {
    batch: 'Batch 4',
    country: 'US',
  })
})

test('a dated timeline counts without a device, colour or country', () => {
  assertReport(
    'Ordered: 3/18/2025 05:47:15 PM UTC\nConfirmation: 4/25/2026 08:23 AM UTC\nShipped: 4/27/2026 02:51 PM UTC\nDelivered: 5/4/2026',
    {status: 'Delivered', arrivalDate: '2026-05-04'},
  )
  assertReport('Ordered 24/03/2026, batch 5. Looong way to go~ Chill.', {
    batch: 'Batch 5',
    orderDate: '2026-03-24',
  })
})

test('USA in free text and a Delivery: line', () => {
  assertReport(
    '1 of each color ordered, USA\nOrdered 3/18/2025 04:04:04 PM UTC\nConfirmation email received 4/25 3:04 am est\nDelivery: 5/4/26 12:00 pm est',
    {country: 'US', status: 'Delivered', arrivalDate: '2026-05-04'},
  )
})

test('a delivered line beats an estimated delivery line', () => {
  assertReport(
    'PT2 silver/gray ordered 2025-03-18 19:24 UTC\nReceived confirmation email 2026-04-25 07:24 UTC\nDelivery date set on 2026-05-01, estimated arrival 2026-05-05\nDelivered 2026-05-04\nUSA',
    {arrivalDate: '2026-05-04'},
  )
})

test('the first country code mentioned wins', () => {
  assertReport(
    'PT2 - batch 5 should be shipping in August. I’m based in the UK. Support said: register here, USA preferred.',
    {country: 'UK'},
  )
})

// "Order confirmation" is also the receipt sent on the day of ordering.
test('chatter stays out', () => {
  for (const body of [
    'So, as we head into the back half of April, the window for wave 1 shipments is closing. The last "update" on shipments going out for us was March-April.',
    'Has anyone who pre-ordered the pebble round 2 got their hands on it yet?',
    'Anyone got the silver/blue yet?',
    "just confused why batch 1 rounds haven't received emails yet",
  ])
    assert.ok(!isLikelyReport(parse(body)), body)
})

test('lowercase "us" is not the United States', () => {
  assert.equal(parse('shipments going out for us was March').country, 'Unknown')
})
