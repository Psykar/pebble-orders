import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {Endpoint, type ErrorRsp, type ReportsRsp} from '../shared/api.ts'
import {threadId} from './reports.ts'
import {onReq} from './server.ts'

let server: Server
let serverURL: string
let commentFetches = 0
const redisValues = new Map<string, string>()
const redisGet = redis.get.bind(redis)
const redisSet = redis.set.bind(redis)
const redditGetPostById = reddit.getPostById.bind(reddit)
const redditGetComments = reddit.getComments.bind(reddit)

const reportBody =
  'Model: Pebble Time 2\nOrdered: 2025-03-24\nBatch: 2\nDestination: Canada\nColor: Silver/Grey'

before(async () => {
  redis.get = async key => redisValues.get(key)
  redis.set = async (key, value) => {
    redisValues.set(key, value)
    return 'OK'
  }
  reddit.getPostById = (async () => ({
    title: 'Shipping Mega Thread',
    createdAt: new Date('2026-04-12T17:03:49Z'),
    score: 117,
    numberOfComments: 2,
  })) as unknown as typeof reddit.getPostById
  reddit.getComments = (() => {
    commentFetches++
    return {
      all: async () => [
        {
          authorName: 'test_user',
          body: reportBody,
          createdAt: new Date('2026-05-01T00:00:00Z'),
          parentId: threadId,
          permalink: '/r/pebble/comments/1sjk3c7/_/abc123/',
          score: 1,
        },
        {
          authorName: 'chatty_user',
          body: 'Any news from the UK?',
          createdAt: new Date('2026-05-02T00:00:00Z'),
          parentId: threadId,
          permalink: '/r/pebble/comments/1sjk3c7/_/def456/',
          score: 1,
        },
      ],
    }
  }) as unknown as typeof reddit.getComments

  server = createServer(async (req, rsp) => {
    await runWithContext(
      {
        appName: 'pebble-orders',
        postId: 't3_123',
        userId: 't2_123',
        username: 'username',
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const info = server.address() as AddressInfo
  serverURL = `http://127.0.0.1:${info.port}`
})

after(async () => {
  redis.get = redisGet
  redis.set = redisSet
  reddit.getPostById = redditGetPostById
  reddit.getComments = redditGetComments
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  redisValues.clear()
  commentFetches = 0
})

test('get reports fetches once then serves the cache', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.GetReports}`)
  assert.equal(rsp.status, 200)
  assert.equal(rsp.headers.get('Content-Type'), 'application/json')
  const reports = (await rsp.json()) as ReportsRsp
  assert.equal(reports.post.numComments, 2)
  assert.deepEqual(
    reports.entries.map(entry => [entry.author, entry.permalink]),
    [
      [
        'test_user',
        'https://www.reddit.com/r/pebble/comments/1sjk3c7/_/abc123/',
      ],
    ],
  )

  await fetch(`${serverURL}/${Endpoint.GetReports}`)
  assert.equal(commentFetches, 1)
})

test('refresh task updates the cache', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.OnRefreshTask}`, {
    method: 'POST',
  })
  assert.equal(rsp.status, 200)
  assert.equal(commentFetches, 1)
  assert.ok(redisValues.size > 0)
})

test('wrong method', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.OnRefreshTask}`)
  assert.equal(rsp.status, 404)
  assert.deepEqual<ErrorRsp>(await rsp.json(), {
    error: 'not found',
    status: 404,
  })
})

test('404', async () => {
  const rsp = await fetch(serverURL)
  assert.equal(rsp.status, 404)
  assert.deepEqual<ErrorRsp>(await rsp.json(), {
    error: 'not found',
    status: 404,
  })
})
