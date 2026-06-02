import puppeteer from 'puppeteer'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:4173'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('server not ready')
}
await waitForServer(BASE + '/')

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })

// Bypass auth via the demo link (sandbox can't reach supabase)
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 1200))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('מצב דמה'))
  b && b.click()
})
await new Promise((r) => setTimeout(r, 8000)) // past load timeout

const routes = [
  ['/', 'final-owner'],
  ['/ceo', 'final-ceo'],
  ['/weekly', 'final-weekly'],
  ['/automations', 'final-automations'],
  ['/sales', 'final-sales'],
  ['/events', 'final-events'],
  ['/marketing', 'final-marketing'],
  ['/reviews', 'final-reviews'],
  ['/maintenance', 'final-maintenance'],
  ['/employees', 'final-employees'],
  ['/suppliers', 'final-suppliers'],
]

for (const [path, name] of routes) {
  // SPA-navigate by clicking the sidebar link (preserves demo state)
  const ok = await page.evaluate((p) => {
    const a = document.querySelector(`a[href="${p}"]`)
    if (a) { a.click(); return true }
    return false
  }, path)
  await new Promise((r) => setTimeout(r, 1100))
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('captured', name, ok ? '' : '(LINK NOT FOUND)')
}

await browser.close()
console.log('done')
