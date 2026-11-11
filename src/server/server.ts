import type {IncomingMessage, ServerResponse} from 'node:http'
import {reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
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
import {fetchReports} from './reports.ts'

const postTitle = 'Pebble Shipping Dashboard'

type AnyRsp = ReportsRsp | UiResponse | TriggerResponse | ErrorRsp

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
        await refreshReports()
        rsp = {}
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
  // The scheduled task keeps this fresh; only the very first view fetches.
  return (await dbGetReports()) ?? (await refreshReports())
}

async function refreshReports(): Promise<ReportsRsp> {
  const reports = await fetchReports()
  await dbSetReports(reports)
  return reports
}

async function routeMenuRefresh(): Promise<UiResponse> {
  const reports = await refreshReports()
  return {
    showToast: {
      text: `Refreshed ${reports.entries.length} reports.`,
      appearance: 'success',
    },
  }
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: postTitle})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await refreshReports()
  await reddit.submitCustomPost({title: postTitle})
  return {}
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
