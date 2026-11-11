import assert from 'node:assert/strict'
import {test} from 'node:test'
import {buildReports, type ThreadComment, threadId} from './reports.ts'

const post = {
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
