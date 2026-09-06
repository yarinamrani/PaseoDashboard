import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// רום שטרית (833561, שעון 688) — טבח פסאו, אוגוסט 2026, 13 משמרות ערב.
// הוזן ידנית מדוח השעון של העובד (CSV שסיפק ירין 06/09).
// מדלג על תאריכים שכבר קיימים — בטוח להרצה חוזרת. זהה בבנייתו ל-shift-rom-july.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APP = 4283, EMP = 833561, ROLE = 34771, SHIFT = 21796, TZ = "+03:00";

type R = { date: string; day: number; rota: number; s: string; e: string; eDate?: string };
const ROWS: R[] = [
  { date: "2026-08-05", day: 3, rota: 860691, s: "18:21", e: "23:28" },
  { date: "2026-08-06", day: 4, rota: 860691, s: "20:11", e: "22:05" },
  { date: "2026-08-11", day: 2, rota: 861837, s: "18:19", e: "23:47" },
  { date: "2026-08-12", day: 3, rota: 861837, s: "17:56", e: "23:16" },
  { date: "2026-08-13", day: 4, rota: 861837, s: "18:05", e: "00:25", eDate: "2026-08-14" },
  { date: "2026-08-17", day: 1, rota: 866821, s: "18:00", e: "23:12" },
  { date: "2026-08-18", day: 2, rota: 866821, s: "18:10", e: "23:30" },
  { date: "2026-08-19", day: 3, rota: 866821, s: "18:06", e: "23:33" },
  { date: "2026-08-24", day: 1, rota: 861830, s: "17:40", e: "23:34" },
  { date: "2026-08-25", day: 2, rota: 861830, s: "18:15", e: "23:35" },
  { date: "2026-08-26", day: 3, rota: 861830, s: "18:00", e: "23:45" },
  { date: "2026-08-30", day: 0, rota: 872624, s: "18:05", e: "23:38" },
  { date: "2026-08-31", day: 1, rota: 872624, s: "18:16", e: "23:24" },
];

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
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
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
const mins = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const dur = (s: string, e: string) => { let d = mins(e) - mins(s); if (d <= 0) d += 1440; return d / 60; };

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: APP }), redirect: "manual" });
    eat(sw, jar);
    if (!sw.ok) return new Response(JSON.stringify({ error: `switch ${sw.status}` }), { status: 502 });

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json()).filter((c: any) => !c.is_deleted);
    const have = new Set(live.filter((c: any) => Number(c.employee) === EMP).map((c: any) => String(c.date).slice(0, 10)));
    const todo = ROWS.filter((r) => !have.has(r.date));
    const skipped = ROWS.filter((r) => have.has(r.date)).map((r) => r.date);

    const plan: any[] = [];
    for (const r of todo) {
      const slot = live.filter((c: any) => c.rota === r.rota && c.day === r.day && c.shift === SHIFT && c.role === ROLE);
      const ord = slot.length ? Math.max(...slot.map((c: any) => Number(c.order) || 0)) + 1 : 1;
      const eDate = r.eDate ?? r.date;
      plan.push({ ...r, order: ord, hours: Number(dur(r.s, r.e).toFixed(2)),
        body: { rota: r.rota, sub_rota: null, shift: SHIFT, day: r.day, date: r.date,
          role: ROLE, employee: EMP, order: ord,
          planned_start: `${r.s}:00`, planned_end: `${r.e}:00`,
          planned_start_full: `${r.date}T${r.s}:00${TZ}`, planned_end_full: `${eDate}T${r.e}:00${TZ}`,
          manual_start: `${r.s}:00`, manual_end: `${r.e}:00`,
          manual_start_full: `${r.date}T${r.s}:00${TZ}`, manual_end_full: `${eDate}T${r.e}:00${TZ}`,
          clock_start: null, clock_end: null, clock_start_full: null, clock_end_full: null,
          cut_start: false, cut_end: false, waiting: 0, break_duration: 0,
          absence: "", work_code: 0, highlight: "", extras: [], is_locked: false, area: null,
          notes: "הוזן לפי דוח השעון של העובד" } });
    }

    if (!go) return new Response(JSON.stringify({ dry: true, already_in: skipped, to_insert: plan.length,
      total_hours: Number(plan.reduce((a, p) => a + p.hours, 0).toFixed(2)),
      rows: plan.map((p) => ({ date: p.date, order: p.order, times: `${p.s}-${p.e}`, hours: p.hours })) }, null, 2),
      { headers: { "Content-Type": "application/json" } });

    const done: any[] = [], failed: any[] = [];
    for (const p of plan) {
      const r = await fetch(`${BASE}/api/cells/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(p.body) });
      const t = await r.text();
      if (r.ok) done.push({ date: p.date, times: `${p.s}-${p.e}`, hours: p.hours });
      else failed.push({ date: p.date, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 200) });
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => !c.is_deleted && Number(c.employee) === EMP);
    const verified = after.map((c: any) => ({ date: String(c.date).slice(0, 10),
      start: String(c.manual_start || "").slice(0, 5), end: String(c.manual_end || "").slice(0, 5) }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    const aug = verified.filter((c: any) => c.date.startsWith("2026-08"));
    const augHours = aug.reduce((a: number, c: any) => a + (c.start && c.end ? dur(c.start, c.end) : 0), 0);

    return new Response(JSON.stringify({ skipped_existing: skipped.length, inserted: done.length,
      failed: failed.length, failures: failed.slice(0, 4),
      august_cells: aug.length, august_hours: Number(augHours.toFixed(2)),
      all_cells: verified.length, rows: aug }, null, 2),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
