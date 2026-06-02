import puppeteer from 'puppeteer'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:4173'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const pages = [
  ['owner-control', '/'],
  ['ceo-dashboard', '/ceo'],
  ['weekly-kpi', '/weekly'],
  ['automations', '/automations'],
  ['sales', '/sales'],
  ['events', '/events'],
  ['marketing', '/marketing'],
  ['reviews', '/reviews'],
  ['maintenance', '/maintenance'],
  ['employees', '/employees'],
  ['suppliers', '/suppliers'],
]

// wait for the preview server to be ready (node timers, not shell sleep)
async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('server not ready: ' + url)
}
await waitForServer(BASE + '/')

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })

for (const [name, path] of pages) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  // wait past the Supabase load timeout (6s) so the data layer settles,
  // then give recharts/fonts a beat
  await new Promise((r) => setTimeout(r, 7500))
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('captured', name)
}

await browser.close()
console.log('done')
