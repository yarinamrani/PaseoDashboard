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

// 1) Login screen
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: `${OUT}/login.png`, fullPage: true })
console.log('captured login')

// 2) Click "demo mode" to bypass auth and view the dashboard (mock data here)
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('מצב דמה'))
  if (b) { b.click(); return true }
  return false
})
await new Promise((r) => setTimeout(r, 8000)) // past supabase load timeout
await page.screenshot({ path: `${OUT}/after-login-owner.png`, fullPage: true })
console.log('captured dashboard via demo:', clicked)

await browser.close()
console.log('done')
