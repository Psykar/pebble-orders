import {requestExpandedMode} from '@devvit/web/client'
import {Endpoint, type ReportsRsp} from '../shared/api.ts'

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
startBtn.addEventListener('click', ev => requestExpandedMode(ev, 'dashboard'))

async function showSummary(): Promise<void> {
  const summary = document.getElementById('summary') as HTMLParagraphElement
  try {
    const rsp = await fetch(Endpoint.GetReports, {
      headers: {Accept: 'application/json'},
    })
    if (!rsp.ok) throw Error(`HTTP status ${rsp.status}`)
    const {entries} = (await rsp.json()) as ReportsRsp
    const delivered = entries.filter(e => e.status === 'Delivered').length
    summary.textContent = `${entries.length} reports · ${delivered} delivered`
  } catch (err) {
    console.error(err)
    summary.textContent = 'Reports unavailable right now.'
  }
}

void showSummary()
