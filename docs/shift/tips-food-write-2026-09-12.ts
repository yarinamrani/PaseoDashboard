import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// "גביית אוכל" (משתנה 28859) — פסאו רצפה 4281, 12/09/2026 ערב בלבד (ירין 28/09). בוקר נעול — לא נוגעים.
// mode=sample: קריאת שורת גביית אוכל קיימת (24/09) להבנת הפורמט. mode=one: נאור בלבד. mode=rest: כל השאר. בלי mode: dry.
// לא מריץ "שמור וחשב" ולא נועל.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, FOOD = 28859, TIP_EVE = 3595, DATE = "2026-09-12";
// [שם, employee, cell, value]
const ROWS: [string, number, number, number][] = [
  ["נאור קיזמן", 723393, 117806019, 15],
  ["אליאן כהן", 818813, 117610952, 15],
  ["יהלי בייגל", 840331, 117806023, 20],
  ["אורי משה", 701901, 117805993, 15],
  ["אמילי חיים", 842063, 117806022, 15],
];

async function cfg(k: string): Promise<string> { const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
function eat(res: Response, jar: Record<string, string>) {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  const list: string[] = raw.length ? raw : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const c of list) { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
}
const jarStr = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
function hdrs(jar: Record<string, string>, post = false) {
  const h: Record<string, string> = { "User-Agent": UA, "Accept": "application/json", "Cookie": jarStr(jar), "Referer": `${BASE}/app/home/` };
  if (post) { h["Content-Type"] = "application/json"; h["Origin"] = BASE; }
  if (jar["csrftoken"]) h["X-CSRFToken"] = jar["csrftoken"];
  return h;
}
async function login(jar: Record<string, string>) {
  const g = await fetch(`${BASE}/app/login/`, { headers: { "User-Agent": UA }, redirect: "manual" }); eat(g, jar);
  const r = await fetch(`${BASE}/api/auth/login/`, { method: "POST", headers: { ...hdrs(jar, true), "Referer": `${BASE}/app/login/` },
    body: JSON.stringify({ username: await cfg("SHIFT_USERNAME"), company: await cfg("SHIFT_COMPANY"), password: await cfg("SHIFT_PASSWORD") }), redirect: "manual" });
  eat(r, jar); return r.ok;
}
async function switchApp(jar: Record<string, string>, app: number) {
  const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(sw, jar); return sw.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const mode = u.searchParams.get("mode") ?? "dry";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    await switchApp(jar, F_APP);
    const readFood = async (d: string) => rowsOf(await (await fetch(`${BASE}/api/tips-variable-values/?application=${F_APP}&date=${d}`, { headers: hdrs(jar) })).json())
      .filter((v: any) => v.date === d && v.variable === FOOD);
    const runs = rowsOf(await (await fetch(`${BASE}/api/tip-run/?application=${F_APP}&date=${DATE}`, { headers: hdrs(jar) })).json()).filter((r: any) => r.date === DATE);
    const eve = runs.find((r: any) => r.tip === TIP_EVE);
    const out: Record<string, any> = { mode, evening_run: eve ? { id: eve.id, locked: eve.is_locked } : null };
    if (mode === "sample") {
      const s = await readFood("2026-09-24");
      out.sample_rows = s.slice(0, 3);
      return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
    }
    if (!eve || eve.is_locked) return new Response(JSON.stringify({ ...out, error: "evening run missing or locked — not writing" }), { status: 409 });
    const before = await readFood(DATE);
    const pick = mode === "one" ? ROWS.slice(0, 1) : mode === "rest" ? ROWS.slice(1) : ROWS;
    const plan = pick.map(([n, emp, cell, v]) => ({ n, emp, cell, v, existing: before.find((x: any) => x.employee === emp && x.cell === cell) ?? null }));
    if (mode === "dry") return new Response(JSON.stringify({ ...out, before: before.length, plan }, null, 1), { headers: { "Content-Type": "application/json" } });
    const results: any[] = [];
    for (const p of plan) {
      const body = { tip: TIP_EVE, variable: FOOD, employee: p.emp, cell: p.cell, date: DATE, value: String(p.v) };
      const url = p.existing ? `${BASE}/api/tips-variable-values/${p.existing.id}/?application=${F_APP}` : `${BASE}/api/tips-variable-values/?application=${F_APP}`;
      const r = await fetch(url, { method: p.existing ? "PATCH" : "POST", headers: hdrs(jar, true), body: JSON.stringify(p.existing ? { value: String(p.v) } : body) });
      results.push({ n: p.n, status: r.status, body: (await r.text()).slice(0, 300) });
    }
    const after = await readFood(DATE);
    out.results = results;
    out.after = after.map((x: any) => `emp${x.employee} cell${x.cell} tip${x.tip} v=${x.value}`);
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
