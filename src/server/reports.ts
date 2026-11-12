import {reddit, settings} from '@devvit/web/server'
import type {T1, T3} from '@devvit/web/shared'
import type {ReportsRsp} from '../shared/api.ts'
import {
  type Entry,
  isLikelyReport,
  normalizeEntry,
  type ReportStatus,
} from '../shared/parser.js'
import {dbGetKnownComments, dbSetKnownComments} from './db.ts'

/** Must match the `settings.subreddit` key in devvit.json. */
export const megaThreadSetting = 'megaThread'
/** Used until a moderator sets megaThread; keep in step with devvit.json. */
export const defaultThreadId: T3 = 't3_1sjk3c7'

/**
 * Parses a mega thread reference into a post ID. Accepts a post ID with or
 * without the t3_ prefix, a reddit.com comments URL or a redd.it short link.
 */
export function parseThreadId(input: string): T3 | undefined {
  const value = input.trim()
  const id =
    value.match(/^(?:t3_)?([a-z0-9]{3,12})$/i)?.[1] ??
    value.match(
      /^(?:https?:\/\/)?(?:[a-z]+\.)?reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i,
    )?.[1] ??
    value.match(/^(?:https?:\/\/)?redd\.it\/([a-z0-9]+)/i)?.[1]
  return id ? `t3_${id.toLowerCase()}` : undefined
}

/** The configured mega thread, falling back to the default if unset or bad. */
export async function getThreadId(): Promise<T3> {
  const value = await settings.get<string>(megaThreadSetting)
  return (value && parseThreadId(value)) || defaultThreadId
}

/** The subset of a Devvit Comment the parser needs. */
export type ThreadComment = {
  id: string
  authorName: string
  body: string
  createdAt: Date
  parentId: string
  permalink: string
  score: number
  /** Set when a moderator removed it; an app that isn't a moderator sees false. */
  removed?: boolean
}

export type ThreadPost = {
  id: T3
  permalink: string
  title: string
  createdAt: Date
  score: number
  numberOfComments: number
}

const statusRank: {[status in ReportStatus]: number} = {
  Delivered: 4,
  Shipped: 3,
  Confirmed: 2,
  Waiting: 1,
  Unknown: 0,
}

/**
 * A report comment remembered between refreshes, so a scan that misses it can
 * recheck it by ID.
 */
export type KnownComment = Omit<ThreadComment, 'createdAt'> & {
  createdAt: string
  /** Consecutive refreshes where neither the scan nor a recheck found it. */
  failedChecks: number
}

// A getComments scan can silently miss top-level comments on a big thread:
// when a "load more" batch overflows, @devvit/reddit 0.15.3 drops the leftover
// IDs Reddit hands back. Batches of 100 lost ~30% here; ~50 loses far fewer.
// Rechecking by ID covers the rest.
const scanPageSize = 50
// A failed recheck (rate limit, outage) keeps the remembered copy, but only for
// this many refreshes (~15 min each), so deleted content leaves storage within
// ~1 h even if Reddit never reports it deleted.
const maxFailedChecks = 4
// Bounds API calls per refresh; Reddit rate-limits ~50 calls in a burst.
// Comments over the cap count as a failed check and go first next time.
const maxRechecks = 150
const recheckConcurrency = 5

/** Fetches every top-level comment on the mega thread and parses them. */
export async function fetchReports(threadId: T3): Promise<ReportsRsp> {
  const post = await reddit.getPostById(threadId)
  const scanned = await reddit
    .getComments({
      postId: threadId,
      depth: 1,
      limit: 10_000,
      pageSize: scanPageSize,
      sort: 'new',
    })
    .all()
  const seen = new Set<string>(scanned.map(c => c.id))
  const missed = (await dbGetKnownComments(threadId))
    .filter(k => !seen.has(k.id))
    .sort((a, b) => b.failedChecks - a.failedChecks)
  const recheck = await recheckComments(post.id, missed)

  const live = [...scanned, ...recheck.found]
  const known: KnownComment[] = [
    ...live.filter(c => toEntry(post.id, c)).map(c => toKnownComment(c, 0)),
    ...recheck.unverified,
  ]
  await dbSetKnownComments(threadId, known)
  // numberOfComments includes replies, so it bounds the top-level count.
  console.log(
    `${threadId}: scan found ${scanned.length} top-level comments; ` +
      `${missed.length} remembered reports missed, of which ` +
      `${recheck.found.length} still exist, ${recheck.gone.length} are gone, ` +
      `${recheck.unverified.length} unverified; ` +
      `thread total incl. replies ${post.numberOfComments}`,
  )
  if (missed.length)
    console.log(
      `${threadId} rechecks: still exist [${recheck.found.map(c => c.id).join(' ')}]; ` +
        `gone [${recheck.gone.join(' ')}]; ` +
        `unverified [${recheck.unverified.map(k => `${k.id}×${k.failedChecks}`).join(' ')}]`,
    )
  return buildReports(post, [...live, ...recheck.unverified.map(fromKnown)])
}

async function recheckComments(
  postId: T3,
  missed: readonly KnownComment[],
): Promise<{
  found: ThreadComment[]
  gone: string[]
  unverified: KnownComment[]
}> {
  const found: ThreadComment[] = []
  const unverified: KnownComment[] = []
  const gone: string[] = []
  const failCheck = (k: KnownComment): void => {
    if (k.failedChecks + 1 < maxFailedChecks)
      unverified.push({...k, failedChecks: k.failedChecks + 1})
    else gone.push(k.id)
  }

  const queue = missed.slice(0, maxRechecks)
  for (const k of missed.slice(maxRechecks)) failCheck(k)
  const worker = async (): Promise<void> => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      let comment: ThreadComment
      try {
        comment = await reddit.getCommentById(k.id as T1)
      } catch {
        failCheck(k)
        continue
      }
      if (toEntry(postId, comment)) found.push(comment)
      else gone.push(k.id)
    }
  }
  await Promise.all(Array.from({length: recheckConcurrency}, worker))
  return {found, gone, unverified}
}

function toKnownComment(c: ThreadComment, failedChecks: number): KnownComment {
  return {
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    parentId: c.parentId,
    permalink: c.permalink,
    score: c.score,
    failedChecks,
  }
}

function fromKnown(k: KnownComment): ThreadComment {
  return {...k, createdAt: new Date(k.createdAt)}
}

/** The comment's report, or undefined if it isn't a live top-level report. */
function toEntry(
  postId: T3,
  comment: Readonly<ThreadComment>,
): Entry | undefined {
  if (comment.parentId !== postId || comment.removed) return
  // Deleted accounts all share the name [deleted], which would merge their
  // reports when deduping by author.
  if (!comment.authorName || comment.authorName === '[deleted]') return
  if (!comment.body) return
  if (comment.body === '[deleted]' || comment.body === '[removed]') return
  const entry = normalizeEntry({
    author: comment.authorName,
    body: comment.body,
    created: comment.createdAt.toISOString(),
    score: comment.score,
    permalink: absolutePermalink(comment.permalink),
    device: 'Unknown',
    color: 'Unknown',
    country: 'Unknown',
    batch: 'Unknown',
    status: 'Unknown',
    orderDate: null,
    confirmDate: null,
    shippingDate: null,
  })
  return isLikelyReport(entry) ? entry : undefined
}

export function buildReports(
  post: Readonly<ThreadPost>,
  comments: readonly Readonly<ThreadComment>[],
): ReportsRsp {
  const parsed: Entry[] = []
  for (const comment of comments) {
    const entry = toEntry(post.id, comment)
    if (entry) parsed.push(entry)
  }

  return {
    threadId: post.id,
    post: {
      title: post.title,
      created: post.createdAt.toISOString(),
      score: post.score,
      numComments: post.numberOfComments,
    },
    entries: dedupeByAuthorAndDevice(parsed),
    source: absolutePermalink(post.permalink),
    generatedAt: new Date().toISOString(),
  }
}

function absolutePermalink(permalink: string): string {
  return permalink.startsWith('/')
    ? `https://www.reddit.com${permalink}`
    : permalink
}

function compareEntries(a: Readonly<Entry>, b: Readonly<Entry>): number {
  const rankDiff = statusRank[a.status] - statusRank[b.status]
  if (rankDiff !== 0) return rankDiff
  const aTime = a.created ? Date.parse(a.created) : 0
  const bTime = b.created ? Date.parse(b.created) : 0
  if (aTime !== bTime) return aTime - bTime
  return a.score - b.score
}

function bestEntry(entries: readonly Entry[]): Entry | undefined {
  let best: Entry | undefined
  for (const entry of entries)
    if (!best || compareEntries(entry, best) > 0) best = entry
  return best
}

/**
 * One entry per author, keeping their most advanced report. Authors who
 * reported several different devices keep one entry per device.
 */
function dedupeByAuthorAndDevice(entries: readonly Entry[]): Entry[] {
  const byAuthor = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = entry.author.toLowerCase()
    byAuthor.set(key, [...(byAuthor.get(key) ?? []), entry])
  }

  const deduped: Entry[] = []
  for (const authorEntries of byAuthor.values()) {
    const known = authorEntries.filter(entry => entry.device !== 'Unknown')
    const devices = new Set(known.map(entry => entry.device))
    const groups =
      devices.size > 1
        ? [...devices].map(device => known.filter(e => e.device === device))
        : [authorEntries]
    for (const group of groups) {
      const best = bestEntry(group)
      if (best) deduped.push(best)
    }
  }
  return deduped
}
