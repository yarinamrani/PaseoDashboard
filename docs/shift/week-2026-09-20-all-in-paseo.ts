import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// לפי בקשת ירין: כל שיבוץ השוטפים — שתי המסעדות — יושב ברוטת פסאו,
// ומשמרות אומינו מסומנות בהערה "אומינו". כך אין צורך להחליף טאבים.
// התאים המקבילים באומינו מרוקנים (employee=null) כדי שלא תהיה ספירה כפולה,
// ומקבלים הערה שמפנה לסידור פסאו.
// הכל נשאר טיוטה — הפונקציה לא מפרסמת שום רוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-20";
const P_APP = 4283, P_ROTA = 881056, P_ROLE = 34937, P_BOKER = 16656, P_EREV = 21796;
const U_APP = 5931, U_ROTA = 880896, U_ROLE = 52707;

const E = { JONATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255, JEREMY: 829782 };
const TAG = "אומינו";

// משמרות אומינו שעוברות לרוטת פסאו: [day, shift, employee, start]
const MOVE: [number, number, number, string][] = [
  [0, P_BOKER, E.JEREMY,   "10:00"], [1, P_BOKER, E.JONATHAN, "10:00"],
  [2, P_BOKER, E.ENZO,     "10:00"], [3, P_BOKER, E.JEREMY,   "10:00"],
  [4, P_BOKER, E.JONATHAN, "10:00"], [5, P_BOKER, E.ENZO,     "10:00"],
  [0, P_EREV,  E.PATEL,   "18:00"], [1, P_EREV, E.HILLARY, "18:00"],
  [2, P_EREV,  E.PATEL,   "18:00"], [3, P_EREV, E.HILLARY, "18:00"],
  [4, P_EREV,  E.PATEL,   "18:00"],
  [6, P_EREV,  E.TONY,    "19:30"],   // מוצ״ש — מטבח אומינו נפתח 19:50
];

// התאים באומינו שמרוקנים (אותם 12 שעודכנו קודם)
const UMINO_CLEAR = [
  118509440, 118509441, 118509442, 118509443, 118509444, 118509445,
  118509454, 118509455, 118509456, 118509457, 118509458, 118509460,
];
const CLEAR_NOTE = "מנוהל בסידור פסאו";

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
function dateOf(day: number) {
  const d = new Date(WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}
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

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";
    const steps: any[] = [];

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });

    // ============ 1. הוספת משמרות אומינו לרוטת פסאו ============
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted);
    steps.push({ step: "פסאו — תאים קיימים", count: live.length });

    const used = new Map<string, Set<number>>();
    for (const c of live) {
      const g = `${c.day}|${c.role}`;
      if (!used.has(g)) used.set(g, new Set());
      used.get(g)!.add(Number(c.order || 0));
    }
    const nextOrder = (day: number) => {
      const g = `${day}|${P_ROLE}`;
      if (!used.has(g)) used.set(g, new Set());
      const s = used.get(g)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start] of MOVE) {
      const date = dateOf(day);
      const dup = live.find((c: any) => c.day === day && c.role === P_ROLE && Number(c.employee) === Number(emp)
        && String(c.planned_start || "").slice(0, 5) === start && String(c.notes || "").includes(TAG));
      if (dup) { skipped.push({ date, emp, start, id: dup.id }); continue; }
      if (!go) { created.push({ date, emp, start, notes: TAG, dry: true }); continue; }
      const payload = {
        rota: P_ROTA, sub_rota: null, shift, day, date, role: P_ROLE, employee: emp, order: nextOrder(day),
        planned_start: `${start}:00`, planned_end: null,
        planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null,
        work_code: 0, break_duration: 0, waiting: 0,
        absence: "", notes: TAG, highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ } created.push({ id: j?.id, date, emp, start }); }
      else failed.push({ date, emp, start, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
    }

    // ============ 2. ריקון התאים המקבילים באומינו ============
    if (!(await switchApp(jar, U_APP))) return new Response(JSON.stringify({ error: "switch 5931 failed", steps }), { status: 502 });
    const uLive = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted);

    const cleared: any[] = [], clearFailed: any[] = [];
    for (const id of UMINO_CLEAR) {
      const cur = uLive.find((c: any) => c.id === id);
      if (!cur) { clearFailed.push({ id, why: "not found" }); continue; }
      if (cur.employee === null && String(cur.notes || "") === CLEAR_NOTE) { cleared.push({ id, how: "already" }); continue; }
      if (!go) { cleared.push({ id, dry: true }); continue; }
      const res = await patchCell(jar, U_APP, cur, { employee: null, notes: CLEAR_NOTE });
      if (res.ok) cleared.push({ id }); else clearFailed.push({ id, last: res.last });
    }

    if (!go) {
      return new Response(JSON.stringify({ dry: true, week: WEEK,
        paseo: { rota: P_ROTA, existing: live.length, would_add: created.length, already_there: skipped.length },
        umino: { rota: U_ROTA, would_clear: cleared.length, problems: clearFailed },
        steps }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    // ============ אימות ============
    const uRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === U_ROTA);
    const uAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted && c.role === U_ROLE && c.employee !== null);

    await switchApp(jar, P_APP);
    const pAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);

    const by: Record<string, string[]> = {};
    for (const c of pAfter.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const d = String(c.date).slice(0, 10);
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      const tag = c.employee && String(c.notes || "").includes(TAG) ? "  ← אומינו" : "";
      (by[d] ||= []).push(`${String(c.planned_start || "--:--").slice(0, 5)} ${who}${c.shift === P_BOKER ? " [בוקר]" : " [ערב]"}${tag}`);
    }

    return new Response(JSON.stringify({
      week: WEEK,
      paseo: { rota: P_ROTA, is_published: pRota?.is_published ?? null,
               added: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
               total_cells: pAfter.length, by_day: by },
      umino: { rota: U_ROTA, is_published: uRota?.is_published ?? null,
               cleared: cleared.length, clear_failed: clearFailed.length, problems: clearFailed.slice(0, 5),
               still_assigned: uAfter.length },
      steps,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
