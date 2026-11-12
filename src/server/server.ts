import type {IncomingMessage, ServerResponse} from 'node:http'
import {reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  SettingsValidationRequest,
  SettingsValidationResponse,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type ReportsRsp,
} from '../shared/api.ts'
import {dbGetReports, dbSetReports} from './db.ts'
import {fetchReports, getThreadId, parseThreadId} from './reports.ts'

const postTitle = 'Pebble Shipping Dashboard'

type AnyRsp =
  | ReportsRsp
  | UiResponse
  | TriggerResponse
  | SettingsValidationResponse
  | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.GetReports:
        rsp = await routeGetReports()
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnMenuRefresh:
        rsp = await routeMenuRefresh()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      case Endpoint.OnRefreshTask:
        await refreshReports('scheduled')
        rsp = {}
        break
      case Endpoint.OnValidateMegaThread:
        rsp = await routeValidateMegaThread(await readJson(reqMsg))
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function routeGetReports(): Promise<ReportsRsp> {
  // The scheduled task keeps this fresh; only the first view after install or
  // after a moderator changes the mega thread setting fetches.
  const threadId = await getThreadId()
  const cached = await dbGetReports()
  return cached?.threadId === threadId
    ? cached
    : await refreshReports('view', threadId)
}

type RefreshTrigger = 'scheduled' | 'view' | 'menu' | 'install'

async function refreshReports(
  trigger: RefreshTrigger,
  threadId?: `t3_${string}`,
): Promise<ReportsRsp> {
  const start = Date.now()
  console.log(`refresh started (${trigger})`)
  try {
    const reports = await fetchReports(threadId ?? (await getThreadId()))
    await dbSetReports(reports)
    console.log(
      `refresh finished (${trigger}) in ${Date.now() - start} ms: ${reports.entries.length} reports`,
    )
    return reports
  } catch (err) {
    console.log(
      `refresh failed (${trigger}) after ${Date.now() - start} ms: ${err}`,
    )
    throw err
  }
}

async function routeMenuRefresh(): Promise<UiResponse> {
  const reports = await refreshReports('menu')
  return {
    showToast: {
      text: `Refreshed ${reports.entries.length} reports.`,
      appearance: 'success',
    },
  }
}

async function routeValidateMegaThread(
  req: SettingsValidationRequest<string>,
): Promise<SettingsValidationResponse> {
  if (!req.value?.trim()) return {success: true}
  const threadId = parseThreadId(req.value)
  if (!threadId)
    return {
      success: false,
      error: 'Enter a Reddit post link (…/comments/abc123/…) or post ID.',
    }
  try {
    await reddit.getPostById(threadId)
  } catch {
    return {success: false, error: `Couldn't find post ${threadId}.`}
  }
  return {success: true}
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: postTitle})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await refreshReports('install')
  await reddit.submitCustomPost({title: postTitle})
  return {}
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}') as T
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
