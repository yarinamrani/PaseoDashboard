import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// פתיחת שבוע 06/09 במטבח פסאו + שיבוץ שוטפי כלים.
// נשאר טיוטה — הפונקציה לא מפרסמת את הרוטה בשום שלב.
//
// רצף מוגן (זהה ל-shift-open-week-dish):
//   1. יצירת רוטה
//   2. העתקת שורות מכסה משבוע המקור — בלעדיהן הגריד מופיע ריק
//   3. חסימה — אם אין מכסות, לא נכתב אף תא
//   4. כתיבת תאים
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const APP = 4283;
const SRC_WEEK = "2026-08-30", NEW_WEEK = "2026-09-06";
const R_DISH = 34937;
const BOKER = 16656, EREV = 21796;
const E = { JNATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255 };

// [day 0=ראשון, shift, employee|null, start, note]
type Row = [number, number, number | null, string, string];
const PLAN: Row[] = [
  // פתיחה — ג׳ונתן, 7 ימים (החלטת ירין 05/09)
  [0, BOKER, E.JNATHAN, "10:00", ""],
  [1, BOKER, E.JNATHAN, "10:00", ""],
  [2, BOKER, E.JNATHAN, "10:00", ""],
  [3, BOKER, E.JNATHAN, "10:00", ""],
  [4, BOKER, E.JNATHAN, "10:00", ""],
  [5, BOKER, E.JNATHAN, "08:00", ""],
  [6, BOKER, E.JNATHAN, "08:00", ""],
  // ערב — אנזו/פטל/הילרי לא לפני 18:00
  [0, EREV, E.ENZO,    "18:00", ""],
  [0, EREV, E.PATEL,   "18:00", ""],
  [1, EREV, E.ENZO,    "18:00", ""],
  [1, EREV, E.PATEL,   "18:00", ""],
  [2, EREV, E.ENZO,    "18:00", ""],
  [2, EREV, E.HILLARY, "18:00", ""],
  [3, EREV, E.ENZO,    "18:00", ""],
  [3, EREV, E.HILLARY, "18:00", ""],
  [4, EREV, E.ENZO,    "18:00", ""],
  [4, EREV, E.HILLARY, "18:00", ""],
  [4, EREV, E.TONY,    "19:00", ""],
  [5, EREV, E.ENZO,    "18:00", ""],
  [5, EREV, E.TONY,    "19:00", ""],
  [6, EREV, E.ENZO,    "18:00", ""],
  [6, EREV, E.HILLARY, "18:00", ""],
  [6, EREV, E.PATEL,   "18:00", ""],
  // כוח אדם — משבצות לאיוש חיצוני במקום הצהריים של אנזו בסופ״ש
  [5, EREV, null, "13:00", "כוח אדם — צהריים שישי, במקום אנזו 12:45"],
  [6, EREV, null, "16:00", "כוח אדם — צהריים שבת, במקום אנזו 16:00"],
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
function dateOf(day: number) {
  const d = new Date(NEW_WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
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
    const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: APP }), redirect: "manual" });
    eat(sw, jar);
    if (!sw.ok) return new Response(JSON.stringify({ error: `switch failed ${sw.status}` }), { status: 502 });

    // ---------- שלב 1: רוטה ----------
    let rotas = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json());
    let rota = rotas.find((r: any) => String(r.date).slice(0, 10) === NEW_WEEK && r.application === APP && !r.is_deleted);
    steps.push({ step: 1, name: "רוטה", existed: !!rota, id: rota?.id ?? null });

    if (!rota) {
      if (!go) return new Response(JSON.stringify({ dry: true, would: `create rota ${NEW_WEEK} + copy quotas from ${SRC_WEEK} + write ${PLAN.length} cells (draft, not published)`, steps }, null, 2), { headers: { "Content-Type": "application/json" } });
      const cr = await fetch(`${BASE}/api/rotas/`, { method: "POST", headers: hdrs(jar, true),
        body: JSON.stringify({ application: APP, date: NEW_WEEK, source: "manual" }) });
      const ct = await cr.text();
      if (!cr.ok) return new Response(JSON.stringify({ error: `rota create ${cr.status}`, body: ct.slice(0, 300), steps }), { status: 502 });
      try { rota = JSON.parse(ct); } catch { rota = null; }
      if (!rota?.id) {
        rotas = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json());
        rota = rotas.find((r: any) => String(r.date).slice(0, 10) === NEW_WEEK && r.application === APP && !r.is_deleted);
      }
      steps.push({ step: 1, name: "רוטה נוצרה", id: rota?.id ?? null });
    }
    if (!rota?.id) return new Response(JSON.stringify({ error: "no rota", steps }), { status: 502 });

    // ---------- שלב 2: מכסות ----------
    const qNew0 = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${NEW_WEEK}`, { headers: hdrs(jar) })).json());
    steps.push({ step: 2, name: "מכסות לפני", count: qNew0.length });

    if (qNew0.length < 60) {
      const qSrc = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${SRC_WEEK}`, { headers: hdrs(jar) })).json());
      steps.push({ step: 2, name: `מכסות במקור ${SRC_WEEK}`, count: qSrc.length });
      let ok = 0, bad = 0;
      for (const q of qSrc) {
        const body: any = { ...q, date: NEW_WEEK };
        delete body.id; delete body.version;
        const r = await fetch(`${BASE}/api/employees-quotas/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(body) });
        if (r.ok) ok++; else bad++;
        await r.text();
      }
      steps.push({ step: 2, name: "הועתקו", ok, failed: bad });
    }

    // ---------- שלב 3: חסימה ----------
    const qNow = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${NEW_WEEK}`, { headers: hdrs(jar) })).json());
    steps.push({ step: 3, name: "אימות מכסות", count: qNow.length, gate: qNow.length >= 60 ? "PASS" : "BLOCK" });

    if (qNow.length < 60) {
      return new Response(JSON.stringify({
        blocked: true,
        reason: "שורות המכסה לא נוצרו — לא נכתב אף תא. הגריד יופיע ריק בלעדיהן.",
        rota: rota.id, quotas: qNow.length, steps,
      }, null, 2), { status: 409, headers: { "Content-Type": "application/json" } });
    }

    // ---------- שלב 4: תאים ----------
    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === rota.id && !c.is_deleted);
    const used = new Map<string, Set<number>>();
    for (const c of live) {
      const g = `${c.day}|${c.role}`;
      if (!used.has(g)) used.set(g, new Set());
      used.get(g)!.add(Number(c.order || 0));
    }
    const nextOrder = (day: number, role: number) => {
      const g = `${day}|${role}`;
      if (!used.has(g)) used.set(g, new Set());
      const s = used.get(g)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start, note] of PLAN) {
      const date = dateOf(day);
      const dup = live.find((c: any) => c.day === day && c.role === R_DISH && Number(c.employee) === emp
        && String(c.planned_start || "").slice(0, 5) === start);
      if (dup) { skipped.push({ date, emp, start }); continue; }
      const order = nextOrder(day, R_DISH);
      const payload = {
        rota: rota.id, sub_rota: null, shift, day, date,
        role: R_DISH, employee: emp, order,
        planned_start: `${start}:00`, planned_end: null,
        planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null,
        work_code: 0, break_duration: 0, waiting: 0,
        absence: "", notes: note, highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
        created.push({ id: j?.id, date, emp, start, shift, order, note });
      } else failed.push({ date, emp, start, order, status: r.status, body: t.slice(0, 150) });
    }

    // ---------- שלב 5: אימות סופי ----------
    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === rota.id && !c.is_deleted);
    const rotaAfter = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json())
      .find((r: any) => r.id === rota.id);

    const byDay: Record<string, string[]> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const d = String(c.date).slice(0, 10);
      const who = c.employee ? (c.first_name || "") + (c.last_name ? " " + c.last_name : "") : (c.notes || "ריק");
      (byDay[d] ||= []).push(`${who} ${String(c.planned_start || "").slice(0, 5)}`);
    }

    return new Response(JSON.stringify({
      rota: rota.id, week: NEW_WEEK,
      is_published: rotaAfter?.is_published ?? null,
      quotas: qNow.length,
      created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
      cells_total: after.length,
      order_zero: after.filter((c: any) => Number(c.order) === 0).length,
      by_day: byDay,
      steps,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
