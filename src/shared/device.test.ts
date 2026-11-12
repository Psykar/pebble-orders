import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {normalizeEntry} from './parser.js'

function device(body: string): string {
  return normalizeEntry({
    author: 'test_user',
    body,
    created: '2026-11-01T00:00:00Z',
    score: 0,
    permalink: null,
  }).device
}

const template = (model: string): string =>
  `Model: ${model}\nOrdered: 2025-03-18\nBatch: 3\nDestination: UK\nColor: Black`

test('a switch to Round 2 wins over the original Time 2 order', () => {
  for (const model of [
    'Pebble Time 2 (changed to Round 2)',
    'Pebble Time 2, switched to Pebble Round 2',
    'Time2 -> Round2',
    'Time 2 → Round 2',
    'Round 2 (changed from Time 2)',
  ])
    assert.equal(device(template(model)), 'Pebble Round', model)
  assert.equal(
    device(
      `${template('Pebble Round 2')}\nI ordered a Time2 and then changed it to Round2.`,
    ),
    'Pebble Round',
  )
  assert.equal(
    device(`${template('Pebble Time 2')}\nUpdate: changed my order to PR2`),
    'Pebble Round',
  )
})

test('a Round 2 model line with a PT2-to-PR2 note in the order line', () => {
  assert.equal(
    device(
      'Model: Pebble Round 2\n\nOrdered: 3/18/2025 09:02:29 PM UTC (PT2. Switched to PR2)\n\nBatch: 1\n\nDestination: EU - Germany\n\nColor: Black / 20mm\n\nConfirmation Email: No\n\nShipped: No\n\nArrived: No',
    ),
    'Pebble Round',
  )
})

test('the model line wins over other devices mentioned in passing', () => {
  assert.equal(
    device(`${template('Pebble Round 2')}\nMy Time 2 arrived last month.`),
    'Pebble Round',
  )
})

test('the last switch wins', () => {
  assert.equal(
    device(template('Time 2, changed to Round 2, then changed back to Time 2')),
    'Pebble Time 2',
  )
})

test('Time 2 without a space is recognised', () => {
  assert.equal(device(template('Pebble Time2')), 'Pebble Time 2')
})
