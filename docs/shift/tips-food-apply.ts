import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// גביית אוכל (28859) — פסאו רצפה 4281. כלי כללי: ENTRIES = [תאריך, טיפ, employee, cell, סכום, שם].
// לכל (תאריך, טיפ): אם נעול ו-mode 1 → שחרור; הזנה (POST/PATCH); שמור וחשב; אם היה נעול → נעילה מחדש.
// ירין 28/09 אישר שחרור נעילה והזנה בימים נעולים. ?mode=dry (ברירת מחדל) | go. לא נוגע בריצה mode 2.
// אצווה נוכחית: 19/09, 25/09 ערב, 26/09 ערב (ירין 28/09). אליאן 19/09 ערב: 15 (לבדוק אם 30).
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, FOOD = 28859, AM = 3594, PM = 3595;
type E = [string, number, number, number, number, string];
const ENTRIES: E[] = [
  ["2026-09-19", AM, 772521, 118185062, 25, "נעם עמיר"],
  ["2026-09-19", AM, 780767, 118202059, 15, "טליה סנואני"],
  ["2026-09-19", AM, 842357, 118584278, 15, "נועה כחלני"],
  ["2026-09-19", PM, 701901, 118185270, 20, "אורי משה"],
  ["2026-09-19", PM, 818813, 118584990, 15, "אליאן כהן"],
  ["2026-09-19", PM, 842063, 118597487, 15, "אמילי חיים"],
  ["2026-09-19", PM, 609648, 118202168, 15, "יצחק בזוב"],
  ["2026-09-19", PM, 840331, 118202165, 15, "יהלי בייגל"],
  ["2026-09-25", PM, 701901, 118761318, 10, "אורי משה"],
  ["2026-09-25", PM, 715595, 118406951, 20, "עמית מגן"],
  ["2026-09-26", PM, 701901, 118511503, 25, "אורי משה"],
  ["2026-09-26", PM, 842063, 118584545, 15, "אמילי חיים"],
  ["2026-09-26", PM, 842066, 118584544, 15, "איתי יעקב"],
  ["2026-09-26", PM, 784494, 118592988, 15, "אורן מזרחי"],
  ["2026-09-26", PM, 621451, 118603445, 15, "עמית בזיס"],
  ["2026-09-26", PM, 609648, 118584546, 15, "יצחק בזוב"],
  ["2026-09-26", PM, 715595, 118584538, 15, "עמית מגן"],
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
    const go = u.searchParams.get("mode") === "go";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    await switchApp(jar, F_APP);
    const api = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${BASE}/api/${path}`, { method, headers: hdrs(jar, method !== "GET"), body: body ? JSON.stringify(body) : undefined });
      const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch {}
      return { s: r.status, j };
    };
    const groups = new Map<string, E[]>();
    for (const e of ENTRIES) { const k = `${e[0]}|${e[1]}`; groups.set(k, [...(groups.get(k) ?? []), e]); }
    const report: any[] = [];
    for (const [k, list] of groups) {
      const [date, tipS] = k.split("|"); const tip = Number(tipS);
      const run = rowsOf((await api("GET", `tip-run/?application=${F_APP}&date=${date}`)).j).find((r: any) => r.date === date && r.tip === tip);
      const food = rowsOf((await api("GET", `tips-variable-values/?application=${F_APP}&date=${date}`)).j).filter((v: any) => v.date === date && v.variable === FOOD);
      const g: any = { date, tip: tip === AM ? "בוקר" : "ערב", run: run ? `${run.id} mode${run.mode} ${run.is_locked ? "נעול" : "פתוח"}` : "אין ריצה",
        entries: list.map((e) => `${e[5]} ${e[4]}${food.find((x: any) => x.employee === e[2] && x.cell === e[3]) ? " (קיים: " + food.find((x: any) => x.employee === e[2] && x.cell === e[3]).value + ")" : ""}`) };
      if (run?.mode === 2) { g.error = "mode 2 — דילוג"; report.push(g); continue; }
      if (!go) { report.push(g); continue; }
      const steps: any[] = [];
      const wasLocked = !!run?.is_locked;
      if (wasLocked) { const r = await api("PATCH", `tip-run/${run.id}/?application=${F_APP}`, { is_locked: false }); steps.push(`unlock ${r.s}`); if (r.s >= 300) { g.steps = steps; report.push(g); continue; } }
      for (const e of list) {
        const ex = food.find((x: any) => x.employee === e[2] && x.cell === e[3]);
        const r = ex ? await api("PATCH", `tips-variable-values/${ex.id}/?application=${F_APP}`, { value: String(e[4]) })
                     : await api("POST", `tips-variable-values/?application=${F_APP}`, { tip, variable: FOOD, employee: e[2], cell: e[3], date, value: String(e[4]) });
        if (r.s >= 300) steps.push(`${e[5]} ${r.s} ${JSON.stringify(r.j).slice(0, 150)}`);
      }
      const c = await api("POST", `tips-calculate/?application=${F_APP}`, { tip, date });
      const emps = rowsOf(c.j?.output?.employees ?? []);
      const applied = list.map((e) => { const x = emps.find((y: any) => y.id === e[2] && y.cell_id === e[3]); return `${e[5]}:${x ? x.food ?? x.allowance : "לא בחישוב"}`; });
      steps.push(`calc ${c.s}`);
      if (wasLocked) { const id = c.j?.run?.id ?? run.id; const r = await api("PATCH", `tip-run/${id}/?application=${F_APP}`, { is_locked: true }); steps.push(`relock ${r.s} ${r.j?.is_locked}`); }
      g.steps = steps; g.applied_in_calc = applied;
      report.push(g);
    }
    return new Response(JSON.stringify({ go, report }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
