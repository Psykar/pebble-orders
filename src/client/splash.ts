import {requestExpandedMode} from '@devvit/web/client'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import {Endpoint, type ReportsRsp} from '../shared/api.ts'
import type {Entry, ReportStatus} from '../shared/parser.js'

Chart.register(
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)

const batchNames = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5']
// Values must match the device names parser.js emits. Round 2 is the default
// because the other models have mostly delivered.
const devices = [
  {device: 'Pebble Round', label: 'Round 2'},
  {device: 'Pebble Time 2', label: 'Time 2'},
  {device: 'Pebble Duo 2', label: 'Duo 2'},
  {device: 'Pebble Index', label: 'Index'},
] as const
const allDevices = 'All'
type DeviceFilter = (typeof devices)[number]['device'] | typeof allDevices
const defaultDevice: DeviceFilter = 'Pebble Round'
// Order matters: segments render left to right, most advanced first.
const statuses = [
  {status: 'Delivered', cls: 'delivered'},
  {status: 'Shipped', cls: 'shipped'},
  {status: 'Confirmed', cls: 'confirmed'},
  {status: 'Waiting', cls: 'waiting'},
] as const satisfies readonly {status: ReportStatus; cls: string}[]

function el(id: string): HTMLElement {
  const elem = document.getElementById(id)
  if (!elem) throw Error(`missing #${id} in splash.html`)
  return elem
}

el('open-btn').addEventListener('click', ev =>
  requestExpandedMode(ev, 'dashboard'),
)

function countBy(entries: readonly Entry[]): Record<ReportStatus, number> {
  const counts = {
    Delivered: 0,
    Shipped: 0,
    Confirmed: 0,
    Waiting: 0,
    Unknown: 0,
  }
  for (const e of entries) counts[e.status]++
  return counts
}

function barHtml(entries: readonly Entry[]): string {
  const counts = countBy(entries)
  const pct = (n: number): number =>
    entries.length ? (n / entries.length) * 100 : 0
  return [
    ...statuses.map(s => [s.cls, counts[s.status]] as const),
    ['unknown', counts.Unknown] as const,
  ]
    .map(
      ([cls, n]) => `<span class="seg ${cls}" style="width:${pct(n)}%"></span>`,
    )
    .join('')
}

function pastConfirmation(entries: readonly Entry[]): number {
  const c = countBy(entries)
  return c.Delivered + c.Shipped + c.Confirmed
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'updated just now'
  if (mins < 60) return `updated ${mins} min ago`
  const hours = Math.round(mins / 60)
  return `updated ${hours} h ago`
}

function renderSummary(entries: readonly Entry[], generatedAt: string): void {
  const done = pastConfirmation(entries)
  const pct = entries.length ? Math.round((done / entries.length) * 100) : 0
  el('meta').textContent = [
    `${entries.length} reports`,
    `${pct}% past confirmation`,
    relativeTime(generatedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  el('progress').innerHTML = barHtml(entries)
  const counts = countBy(entries)
  el('legend').innerHTML = statuses
    .map(
      s =>
        `<span><i class="dot ${s.cls}"></i><strong>${counts[s.status]}</strong> ${s.status}</span>`,
    )
    .join('')
}

function renderBatches(entries: readonly Entry[]): void {
  const rows = batchNames
    .map(batch => ({batch, rows: entries.filter(e => e.batch === batch)}))
    .filter(b => b.rows.length)
  el('batches').innerHTML = rows.length
    ? rows
        .map(({batch, rows}) => {
          const pct = Math.round((pastConfirmation(rows) / rows.length) * 100)
          return `<div class="batch">
            <div class="batch-head">${batch} <span><strong>${pct}%</strong> of ${rows.length}</span></div>
            <div class="bar" aria-label="${batch}: ${pct}% past confirmation">${barHtml(rows)}</div>
          </div>`
        })
        .join('')
    : '<p id="status">No batch data yet.</p>'
}

/** Day key (YYYY-MM-DD) for a parsed date, or null if missing or in future. */
function dayKey(value: string | null, today: string): string | null {
  const key = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return key && key <= today ? key : null
}

let timeline: Chart<'line'> | undefined

function renderTimeline(entries: readonly Entry[]): void {
  timeline?.destroy()
  timeline = undefined
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // Delivered reports rarely carry an arrival date, so the dashboard plots
  // them on their ship date (or post date); keep the two charts in agreement.
  const series = [
    {label: 'Confirmed', color: '#74c0fc', day: (e: Entry) => e.confirmDate},
    {label: 'Shipped', color: '#69db7c', day: (e: Entry) => e.shippingDate},
    {
      label: 'Delivered',
      color: '#4ecdc4',
      day: (e: Entry) =>
        e.status === 'Delivered' ? (e.shippingDate ?? e.created) : null,
    },
  ]
  const perDay = series.map(s => {
    const days = new Map<string, number>()
    for (const e of entries) {
      const d = dayKey(s.day(e), today)
      if (d) days.set(d, (days.get(d) ?? 0) + 1)
    }
    return days
  })
  const dates = [...new Set(perDay.flatMap(m => [...m.keys()]))].sort()
  el('timeline-panel').hidden = !dates.length
  if (!dates.length) return

  timeline = new Chart(el('timeline') as HTMLCanvasElement, {
    type: 'line',
    data: {
      labels: dates.map(d =>
        new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
      ),
      datasets: series.map((s, i) => {
        let total = 0
        return {
          label: s.label,
          data: dates.map(d => (total += perDay[i]?.get(d) ?? 0)),
          borderColor: s.color,
          backgroundColor: `${s.color}1f`,
          fill: s.label !== 'Delivered',
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 2,
        }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {intersect: false, mode: 'index'},
      color: '#8888aa',
      font: {
        family:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {boxWidth: 8, usePointStyle: true, font: {size: 11}},
        },
        tooltip: {
          backgroundColor: 'rgba(15, 15, 30, 0.95)',
          borderColor: '#353557',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: {display: false},
          ticks: {color: '#8888aa', maxTicksLimit: 6, maxRotation: 0},
        },
        y: {
          grid: {color: '#26263f'},
          border: {display: false},
          ticks: {color: '#8888aa', precision: 0, maxTicksLimit: 5},
        },
      },
    },
  })
}

function renderDeviceChips(
  entries: readonly Entry[],
  selected: DeviceFilter,
  onSelect: (device: DeviceFilter) => void,
): void {
  const options: {device: DeviceFilter; label: string; count: number}[] = [
    ...devices
      .map(d => ({
        ...d,
        count: entries.filter(e => e.device === d.device).length,
      }))
      .filter(d => d.count),
    {device: allDevices, label: 'All', count: entries.length},
  ]
  const chips = el('devices')
  chips.replaceChildren(
    ...options.map(({device, label, count}) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.setAttribute('aria-pressed', String(device === selected))
      chip.innerHTML = `${label} <span>${count}</span>`
      chip.addEventListener('click', () => onSelect(device))
      return chip
    }),
  )
}

function render(data: ReportsRsp, device: DeviceFilter): void {
  const entries =
    device === allDevices
      ? data.entries
      : data.entries.filter(e => e.device === device)
  renderDeviceChips(data.entries, device, next => render(data, next))
  renderSummary(entries, data.generatedAt)
  renderBatches(entries)
  renderTimeline(entries)
}

async function init(): Promise<void> {
  try {
    const rsp = await fetch(Endpoint.GetReports, {
      headers: {Accept: 'application/json'},
    })
    if (!rsp.ok) throw Error(`HTTP status ${rsp.status}`)
    const data = (await rsp.json()) as ReportsRsp
    const hasDefault = data.entries.some(e => e.device === defaultDevice)
    render(data, hasDefault ? defaultDevice : allDevices)
  } catch (err) {
    console.error(err)
    el('meta').textContent = 'Reports unavailable right now.'
    el('batches').innerHTML = ''
    el('timeline-panel').hidden = true
  }
}

void init()
