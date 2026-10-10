import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// טבחים 11–17/10 (רוטה 889255, טיוטה אוטומטית של 08/10) — ירין 10/10:
// מולו כל השבוע חוץ מא' ומש' בוקר (כפולות מותר) · יעקב א',ב',ד',ה' ערב, ג' חופש, ו' בוקר, ש' ערב ·
// עידו ("עידן") א'–ה' בוקר בלבד · עמנואל (טבח חדש, אין משתמש) ו' בוקר + מוצ"ש · אביעד סיים ·
// אקסטרות לפי צורך: קיראן ו' ערב + ש' כל היום, יוסף טוויל ו' ערב + ש' ערב · מאיר עוד לא הגיש → החורים נשארים.
// (סבב 1 — 13 PATCH של 10/10 — בהיסטוריית git של הקובץ.)
// כל פעולה לפי id + מצב צפוי (עובד/הערה); אם התא השתנה — עוצר בלי לכתוב. לא מפרסם. ?confirm=1 לכתיבה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, P_ROTA = 889255, COOK = 34771, B = 16656, GAP = "חסר טבח";
const C = { IDO: 847151, YAAKOV: 770028, MOLU: 853229, KIRAN: 856102, YOSEF: 726883, MEIR: 851353, EMANUEL: 587613 };
const EMANUEL = "עמנואל – טבח חדש";
// [cell id, עובד צפוי (null = תא ריק), הערה צפויה, שינוי]
type Op = [number, number | null, string, { employee?: number | null; notes?: string; clearEnd?: boolean }];
// סבב 6 — ירין 10/10: עמנואל = עמנואל בבקוב `587613` (רדום, הופעל מחדש — employee-reactivate.ts) → לתאים עם ההערה.
// (סבב 5 — ה' ערב מאיר 16:00 ↔ יעקב 17:00 — בהיסטוריית git.)
const OPS: Op[] = [
  [119638216, null, EMANUEL, { employee: C.EMANUEL, notes: "" }],       // ו' בוקר 10:00
  [119638228, null, EMANUEL, { employee: C.EMANUEL, notes: "" }],       // ש' ערב 17:00
];
// [day, shift, employee, start]
const CREATES: [number, number, number, string][] = [];
const WEEK = "2026-10-11";
function dateOf(day: number) { const d = new Date(WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day); return d.toISOString().slice(0, 10); }

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
async function switchApp(jar: Record<string, string>, app: number) {
  const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(sw, jar); return sw.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
// PATCH עם נעילה אופטימית — ה-API דורש version תואם, אחרת 409.
async function patchCell(jar: Record<string, string>, app: number, cur: any, fields: Record<string, unknown>) {
  let ver = Number(cur.version ?? 0), last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/api/cells/${cur.id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...cur, version: ver, ...fields }) });
    const t = await r.text();
    if (r.ok) return { ok: true, how: `attempt${attempt}` };
    last = `${r.status} ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`;
    if (r.status === 409) { try { const j = JSON.parse(t); if (typeof j?.version === "number") ver = j.version + 1; } catch { ver++; } }
    else break;
  }
  return { ok: false, last };
}

const hhmm = (s: any) => String(s || "").slice(0, 5);
const who = (c: any) => c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() || String(c.employee) : (c.notes || "ריק");

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const load = async () => rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK);
    const show = (l: any[]) => l.sort((x: any, y: any) => x.day - y.day || String(x.planned_start).localeCompare(String(y.planned_start)))
      .map((c: any) => `d${c.day} ${c.shift === B ? "B" : "E"} ${hhmm(c.planned_start)}${c.planned_end ? "-" + hhmm(c.planned_end) : ""} ${who(c)}${c.notes ? " [" + c.notes + "]" : ""}`);
    const cells = await load();
    const bad: string[] = [];
    const plan = OPS.map(([id, emp, notes, act]) => {
      const cur = cells.find((c: any) => c.id === id);
      if (!cur) bad.push(`${id} חסר`);
      else if ((cur.employee ?? null) !== emp || String(cur.notes || "") !== notes) bad.push(`${id} עכשיו: ${who(cur)} [${cur.notes || ""}]`);
      return { cur, act };
    });
    for (const [d, sh, e, st] of CREATES)
      if (cells.some((c: any) => c.day === d && c.shift === sh && c.employee === e && hhmm(c.planned_start) === st)) bad.push(`יצירה d${d} ${e} ${st} כבר קיימת`);
    if (bad.length) return new Response(JSON.stringify({ error: "mismatch — לא נכתב כלום", bad, now: show(cells) }, null, 1), { status: 409 });
    if (!go) return new Response(JSON.stringify({ dry: true, ops: plan.length, now: show(cells) }, null, 1), { headers: { "Content-Type": "application/json" } });
    const res: any[] = [];
    for (const p of plan) {
      const f: any = {};
      if ("employee" in p.act) f.employee = p.act.employee;
      if ("notes" in p.act) f.notes = p.act.notes;
      if (p.act.clearEnd) { f.planned_end = null; f.planned_end_full = null; }
      res.push({ id: p.cur.id, ...(await patchCell(jar, P_APP, p.cur, f)) });
    }
    for (const [day, shift, emp, start] of CREATES) {
      const date = dateOf(day);
      const orders = new Set(cells.filter((c: any) => c.day === day).map((c: any) => Number(c.order || 0))); let o = 1; while (orders.has(o)) o++;
      const payload = { rota: P_ROTA, sub_rota: null, shift, day, date, role: COOK, employee: emp, order: o,
        planned_start: `${start}:00`, planned_end: null, planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes: "", highlight: "" };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      await r.text(); res.push({ d: day, create: r.status });
      cells.push({ day, order: o });
    }
    return new Response(JSON.stringify({ res, after: show(await load()) }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
