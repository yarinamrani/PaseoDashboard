import puppeteer from 'puppeteer'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:4173'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
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

// Each entry: route, button text to click, output name
const shots = [
  ['/events', 'ליד חדש', 'form-lead'],
  ['/sales', 'סיכום יומי', 'form-sales'],
  ['/maintenance', 'תקלה חדשה', 'form-maintenance'],
]

for (const [route, btnText, name] of shots) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, 7500)) // past supabase load timeout
  // click the add button by its text
  const clicked = await page.evaluate((txt) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(txt))
    if (btn) { btn.click(); return true }
    return false
  }, btnText)
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('captured', name, clicked ? '(modal opened)' : '(BUTTON NOT FOUND)')
}

await browser.close()
console.log('done')
