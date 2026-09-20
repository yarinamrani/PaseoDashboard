import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// טבחי פסאו לשבוע 20–26/09, לתוך רוטה 881056 (שם כבר יושבים השוטפים).
// זמינות שירין מסר 20/09:
//   יעקב  — א' לא עובד · ב' צאת כיפור 21:00 · ג'+ד' כפולה · ה' ערב · ו' בוקר · ש' ערב
//   בני   — "כרגיל" = כפולה כמעט כל יום, בוקר 11:00-12:00 + ערב 18:00
//   עידו  — בקרים בלבד, פתיחה כל בוקר; שישי עד 15:00
//   מאיר  — ג'/ד'/ה', ערבים (לפי החלטת ירין)
// ניקולאי (774873) ומחמוד (797565) עזבו — לא משובצים.
// מולו / ברק / אמג'ד טרם עדכנו — המשבצות שלהם נוצרות ריקות עם הערה "חסר טבח".
// ראשון 20/09 סגור (כיפור) — אין תאים. הרוטה נשארת טיוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-20";
const P_APP = 4283, P_ROTA = 881056, COOK = 34771, BOKER = 16656, EREV = 21796;
const C = { YAAKOV: 770028, BENNY: 543969, IDO: 847151, MEIR: 851353 };
const GAP = "חסר טבח";

// [day, shift, employee|null, start, notes]
type Row = [number, number, number | null, string, string];
const ROWS: Row[] = [
  // ב' 21/09 — פתיחה 20:00 אחרי הצום
  [1, EREV,  C.BENNY,  "20:00", ""],
  [1, EREV,  C.YAAKOV, "21:00", "צאת כיפור"],
  // ג' 22/09
  [2, BOKER, C.IDO,    "10:00", "פתיחה"],
  [2, BOKER, C.YAAKOV, "10:30", ""],
  [2, BOKER, C.BENNY,  "12:00", ""],
  [2, EREV,  C.MEIR,   "17:00", ""],
  [2, EREV,  C.YAAKOV, "18:00", ""],
  [2, EREV,  C.BENNY,  "18:00", ""],
  // ד' 23/09
  [3, BOKER, C.IDO,    "10:00", "פתיחה"],
  [3, BOKER, C.YAAKOV, "10:30", ""],
  [3, BOKER, C.BENNY,  "12:00", ""],
  [3, EREV,  C.MEIR,   "17:00", ""],
  [3, EREV,  C.YAAKOV, "18:00", ""],
  [3, EREV,  C.BENNY,  "18:00", ""],
  // ה' 24/09
  [4, BOKER, C.IDO,    "10:00", "פתיחה"],
  [4, BOKER, C.BENNY,  "12:00", ""],
  [4, EREV,  C.MEIR,   "17:00", ""],
  [4, EREV,  C.YAAKOV, "18:00", ""],
  [4, EREV,  C.BENNY,  "18:00", ""],
  // ו' 25/09
  [5, BOKER, C.IDO,    "08:00", "פתיחה · עד 15:00"],
  [5, BOKER, C.YAAKOV, "09:00", ""],
  [5, BOKER, C.BENNY,  "11:00", ""],
  [5, EREV,  C.BENNY,  "18:00", ""],
  [5, EREV,  null,     "17:00", GAP],
  [5, EREV,  null,     "17:00", GAP],
  [5, EREV,  null,     "17:00", GAP],
  // ש' 26/09
  [6, BOKER, null,     "10:00", `${GAP} — פתיחה`],
  [6, BOKER, null,     "10:00", GAP],
  [6, BOKER, C.BENNY,  "11:00", ""],
  [6, EREV,  null,     "17:00", GAP],
  [6, EREV,  C.YAAKOV, "17:00", ""],
  [6, EREV,  C.BENNY,  "18:00", ""],
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
async function switchApp(jar: Record<string, string>, app: number) {
  const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(sw, jar); return sw.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
const hhmm = (s: any) => String(s || "").slice(0, 5);
function dateOf(day: number) {
  const d = new Date(WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    // שער הגנה: בלי מכסות הגריד נפתח ריק
    const quotas = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${WEEK}`, { headers: hdrs(jar) })).json()).length;
    if (quotas < 60) {
      return new Response(JSON.stringify({ blocked: true, reason: "מכסות חסרות — לא נכתב אף תא", quotas }, null, 2), { status: 409 });
    }

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted);
    const cooksNow = live.filter((c: any) => c.role === COOK);

    const used = new Map<number, Set<number>>();
    for (const c of live.filter((x: any) => x.role === COOK)) {
      if (!used.has(c.day)) used.set(c.day, new Set());
      used.get(c.day)!.add(Number(c.order || 0));
    }
    const nextOrder = (day: number) => {
      if (!used.has(day)) used.set(day, new Set());
      const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start, notes] of ROWS) {
      const date = dateOf(day);
      const dup = cooksNow.find((c: any) => c.day === day && c.shift === shift
        && Number(c.employee ?? 0) === Number(emp ?? 0) && hhmm(c.planned_start) === start
        && String(c.notes || "") === notes);
      if (dup) { skipped.push({ date, emp, start, why: "כבר קיים" }); continue; }
      if (!go) { created.push({ date, emp, start, notes, dry: true }); continue; }
      const payload = {
        rota: P_ROTA, sub_rota: null, shift, day, date, role: COOK, employee: emp, order: nextOrder(day),
        planned_start: `${start}:00`, planned_end: null,
        planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null,
        work_code: 0, break_duration: 0, waiting: 0,
        absence: "", notes, highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ } created.push({ id: j?.id, date, emp, start, notes }); }
      else failed.push({ date, emp, start, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
    }

    if (!go) {
      return new Response(JSON.stringify({ dry: true, quotas, cooks_already: cooksNow.length,
        would_create: created.length, filled: ROWS.filter((r) => r[2] !== null).length,
        gaps: ROWS.filter((r) => r[2] === null).length, skipped }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);

    const by: Record<string, string[]> = {}; const per: Record<string, number> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      if (c.employee) per[who] = (per[who] || 0) + 1;
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start) || "--:--"} ${who}${c.shift === BOKER ? " [בוקר]" : " [ערב]"}`);
    }
    return new Response(JSON.stringify({
      created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
      is_published: pRota?.is_published ?? null,
      cook_cells: after.length, assigned: after.filter((c: any) => c.employee).length,
      gaps: after.filter((c: any) => !c.employee).length,
      per_person: per, by_day: by,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
