import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  buildReports,
  parseThreadId,
  type ThreadComment,
  defaultThreadId as threadId,
} from './reports.ts'

const post = {
  id: threadId,
  permalink: '/r/pebble/comments/1sjk3c7/shipping_mega_thread/',
  title: 'Shipping Mega Thread',
  createdAt: new Date('2026-04-12T17:03:49Z'),
  score: 1,
  numberOfComments: 4,
}

function comment(
  authorName: string,
  body: string,
  day: number,
  parentId: string = threadId,
): ThreadComment {
  return {
    authorName,
    body,
    createdAt: new Date(Date.UTC(2026, 5, day)),
    parentId,
    permalink: `/r/pebble/comments/1sjk3c7/_/${authorName}${day}/`,
    score: 1,
  }
}

const waiting =
  'Model: Pebble Time 2\nOrdered: 2025-03-24\nBatch: 2\nDestination: Canada\nColor: Silver/Grey'
const delivered = `${waiting}\nConfirmation Email: 2026-05-27\nShipped: 2026-05-29\nArrived: 2026-06-06`

test('keeps the most advanced report per author', () => {
  const reports = buildReports(post, [
    comment('alice', delivered, 7),
    comment('alice', waiting, 8),
  ])
  assert.deepEqual(
    reports.entries.map(entry => [entry.author, entry.status]),
    [['alice', 'Delivered']],
  )
})

test('skips replies, deleted comments and chatter', () => {
  const reports = buildReports(post, [
    comment('bob', waiting, 1, 't1_parent'),
    comment('carol', '[deleted]', 2),
    comment('dave', 'Any news from the UK?', 3),
    comment('erin', waiting, 4),
  ])
  assert.deepEqual(
    reports.entries.map(entry => entry.author),
    ['erin'],
  )
})

test('parseThreadId accepts IDs and links', () => {
  for (const input of [
    't3_1sjk3c7',
    '1sjk3c7',
    ' 1SJK3C7 ',
    'https://www.reddit.com/r/pebble/comments/1sjk3c7/shipping_mega_thread/',
    'https://old.reddit.com/r/pebble/comments/1sjk3c7/',
    'reddit.com/comments/1sjk3c7',
    'https://redd.it/1sjk3c7',
  ])
    assert.equal(parseThreadId(input), 't3_1sjk3c7', input)
})

test('parseThreadId rejects other input', () => {
  for (const input of [
    '',
    'https://example.com/comments/1sjk3c7',
    'https://www.reddit.com/r/pebble/',
    'not a post',
  ])
    assert.equal(parseThreadId(input), undefined, input)
})

test('reports link to the thread they came from', () => {
  const reports = buildReports(post, [comment('a', waiting, 1)])
  assert.equal(reports.threadId, threadId)
  assert.equal(
    reports.source,
    'https://www.reddit.com/r/pebble/comments/1sjk3c7/shipping_mega_thread/',
  )
})
