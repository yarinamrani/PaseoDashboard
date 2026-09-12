import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שוטפי כלים, שבוע 13/09 — העתקה אחד-לאחד של שבוע 30/08–05/09
// (בהוראת ירין 12/09: לא להתייחס לשבוע 06–12/09, שהיה שבוע חגים עם שינויי לו״ז).
// הרוטה 878290 כבר קיימת. נשאר טיוטה — הפונקציה לא מפרסמת.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const APP = 4283, ROTA = 878290, NEW_WEEK = "2026-09-13";
const R_DISH = 34937;
const BOKER = 16656, EREV = 21796;
const E = { JNATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255 };

// [day 0=ראשון, shift, employee, start] — זהה לשבוע 30/08
type Row = [number, number, number, string];
const PLAN: Row[] = [
  [0, BOKER, E.JNATHAN, "10:00"], [0, EREV, E.ENZO,    "17:00"], [0, EREV, E.PATEL,   "18:00"],
  [1, BOKER, E.JNATHAN, "10:00"], [1, EREV, E.ENZO,    "15:00"], [1, EREV, E.PATEL,   "19:00"],
  [2, BOKER, E.ENZO,    "10:00"], [2, EREV, E.PATEL,   "17:00"], [2, EREV, E.HILLARY, "19:00"],
  [3, BOKER, E.JNATHAN, "10:00"], [3, EREV, E.ENZO,    "17:00"], [3, EREV, E.HILLARY, "19:00"],
  [4, BOKER, E.JNATHAN, "10:00"], [4, EREV, E.HILLARY, "17:00"], [4, EREV, E.PATEL,   "18:00"], [4, EREV, E.ENZO, "19:00"],
  [5, BOKER, E.JNATHAN, "08:00"], [5, EREV, E.ENZO,    "12:45"], [5, EREV, E.PATEL,   "18:00"], [5, EREV, E.TONY, "19:00"],
  [6, BOKER, E.JNATHAN, "08:00"], [6, EREV, E.ENZO,    "16:00"], [6, EREV, E.HILLARY, "19:00"], [6, EREV, E.PATEL, "19:30"],
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
    if (!sw.ok) return new Response(JSON.stringify({ error: `switch ${sw.status}` }), { status: 502 });

    const rota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json())
      .find((r: any) => r.id === ROTA && !r.is_deleted);
    if (!rota) return new Response(JSON.stringify({ error: `rota ${ROTA} not found` }), { status: 502 });
    steps.push({ step: 1, name: "רוטה", id: ROTA, is_published: rota.is_published });

    const qNow = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${NEW_WEEK}`, { headers: hdrs(jar) })).json());
    steps.push({ step: 2, name: "אימות מכסות", count: qNow.length, gate: qNow.length >= 60 ? "PASS" : "BLOCK" });
    if (qNow.length < 60) {
      return new Response(JSON.stringify({ blocked: true, reason: "אין שורות מכסה לשבוע — לא נכתב אף תא. הגריד יופיע ריק.", quotas: qNow.length, steps }, null, 2),
        { status: 409, headers: { "Content-Type": "application/json" } });
    }

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === ROTA && !c.is_deleted);
    const used = new Map<string, Set<number>>();
    for (const c of live) {
      const g = `${c.day}|${c.role}`;
      if (!used.has(g)) used.set(g, new Set());
      used.get(g)!.add(Number(c.order || 0));
    }
    const nextOrder = (day: number) => {
      const g = `${day}|${R_DISH}`;
      if (!used.has(g)) used.set(g, new Set());
      const s = used.get(g)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    if (!go) {
      return new Response(JSON.stringify({ dry: true, rota: ROTA, quotas: qNow.length,
        existing_dish_cells: live.filter((c: any) => c.role === R_DISH).length,
        would_write: PLAN.length,
        rows: PLAN.map(([d, sh, e, st]) => ({ date: dateOf(d), emp: e, start: st, shift: sh === BOKER ? "בוקר" : "ערב" })) }, null, 2),
        { headers: { "Content-Type": "application/json" } });
    }

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start] of PLAN) {
      const date = dateOf(day);
      const dup = live.find((c: any) => c.day === day && c.role === R_DISH && Number(c.employee) === emp
        && String(c.planned_start || "").slice(0, 5) === start);
      if (dup) { skipped.push({ date, emp, start }); continue; }
      const order = nextOrder(day);
      const payload = {
        rota: ROTA, sub_rota: null, shift, day, date,
        role: R_DISH, employee: emp, order,
        planned_start: `${start}:00`, planned_end: null,
        planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null,
        work_code: 0, break_duration: 0, waiting: 0,
        absence: "", notes: "", highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
        created.push({ id: j?.id, date, emp, start, order });
      } else failed.push({ date, emp, start, order, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 160) });
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === ROTA && !c.is_deleted);
    const rotaAfter = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === ROTA);
    const byDay: Record<string, string[]> = {};
    for (const c of after.filter((c: any) => c.role === R_DISH)
                         .sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const d = String(c.date).slice(0, 10);
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      (byDay[d] ||= []).push(`${String(c.planned_start || "--:--").slice(0, 5)} ${who}${c.shift === BOKER ? " [בוקר]" : " [ערב]"}`);
    }

    return new Response(JSON.stringify({
      rota: ROTA, week: NEW_WEEK, is_published: rotaAfter?.is_published ?? null,
      created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
      dish_cells_total: after.filter((c: any) => c.role === R_DISH).length,
      order_zero: after.filter((c: any) => Number(c.order) === 0).length,
      by_day: byDay, steps,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
