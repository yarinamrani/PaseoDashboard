import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// טבחי פסאו — חול המועד סוכות 27/09–03/10. פתוחים מ-12:00, טבחים מ-10:00.
// זמינות (ירין, 25/09):
//   יעקב  — כפולות א',ב',ד',ה' · חופש ג',ו',ש'
//   מאיר  — א'–ה' משמרת אחת · ו' בוקר · ש' חופש   => בקרים בלבד
//   בני   — כל יום חוץ מא'
//   אביעד — עובד חדש, א'–ה', מ-17:00 (ירין)
//   עידו  — פתיחה כל בוקר א'–ו', ו' עד 15:00 (ירין אישר גם א')
//   אמג'ד — סופ"שים                                => כפולות ו'+ש'
//   מולו  — קבוע, אין רשומת עובד                   => null + notes "מולו", חופש ב'
// ניקולאי, מחמוד, ברק — עזבו.
// הפונקציה יוצרת את הרוטה (לא קיימת), מעתיקה מכסות עם שער >=60, וכותבת תאים. לא מפרסמת.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-27", SRC_WEEK = "2026-09-20";
const P_APP = 4283, COOK = 34771, B = 16656, E = 21796;
const C = { IDO: 847151, YAAKOV: 770028, MEIR: 851353, BENNY: 543969, AVIAD: 852125, AMJAD: 849311 };
const GAP = "חסר טבח", MOLU = "מולו", OPEN = "פתיחה";

type Row = [number, number, number | null, string, string];
const ROWS: Row[] = [
  [0, B, C.IDO, "10:00", OPEN], [0, B, C.YAAKOV, "10:30", ""], [0, B, C.MEIR, "11:00", ""],
  [0, E, C.AVIAD, "17:00", ""], [0, E, null, "17:00", MOLU], [0, E, C.YAAKOV, "18:00", ""],

  [1, B, C.IDO, "10:00", OPEN], [1, B, C.YAAKOV, "10:30", ""], [1, B, C.MEIR, "11:00", ""],
  [1, E, C.AVIAD, "17:00", ""], [1, E, C.YAAKOV, "18:00", ""], [1, E, C.BENNY, "18:00", ""],

  [2, B, C.IDO, "10:00", OPEN], [2, B, C.MEIR, "10:30", ""], [2, B, C.BENNY, "12:00", ""],
  [2, E, C.AVIAD, "17:00", ""], [2, E, null, "17:00", MOLU], [2, E, C.BENNY, "18:00", ""],

  [3, B, C.IDO, "10:00", OPEN], [3, B, C.YAAKOV, "10:30", ""], [3, B, C.MEIR, "11:00", ""], [3, B, C.BENNY, "12:00", ""],
  [3, E, C.AVIAD, "17:00", ""], [3, E, null, "18:00", MOLU], [3, E, C.YAAKOV, "18:00", ""],

  [4, B, C.IDO, "10:00", OPEN], [4, B, C.YAAKOV, "10:30", ""], [4, B, C.MEIR, "11:00", ""], [4, B, C.BENNY, "12:00", ""],
  [4, E, C.AVIAD, "17:00", ""], [4, E, null, "17:00", MOLU], [4, E, C.YAAKOV, "18:00", ""], [4, E, C.BENNY, "18:00", ""],

  [5, B, C.IDO, "08:00", "פתיחה · עד 15:00"], [5, B, C.MEIR, "09:00", ""], [5, B, C.BENNY, "11:00", ""], [5, B, C.AMJAD, "13:00", ""],
  [5, E, C.AMJAD, "17:00", ""], [5, E, null, "17:00", MOLU], [5, E, C.BENNY, "18:00", ""],

  [6, B, C.AMJAD, "09:00", OPEN], [6, B, null, "10:00", GAP], [6, B, C.BENNY, "11:00", ""],
  [6, E, C.AMJAD, "17:00", ""], [6, E, null, "17:00", MOLU], [6, E, C.BENNY, "18:00", ""],
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
const findRota = async (jar: Record<string, string>) =>
  rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json())
    .find((r: any) => String(r.date).slice(0, 10) === WEEK && r.application === P_APP && !r.is_deleted);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";
    const steps: any[] = [];

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    let rota = await findRota(jar);
    steps.push({ step: "רוטה", existed: !!rota, id: rota?.id ?? null });
    if (!rota && go) {
      const cr = await fetch(`${BASE}/api/rotas/`, { method: "POST", headers: hdrs(jar, true),
        body: JSON.stringify({ application: P_APP, date: WEEK, source: "manual" }) });
      const ct = await cr.text();
      if (!cr.ok) return new Response(JSON.stringify({ error: `rota create ${cr.status}`, body: ct.slice(0, 300) }), { status: 502 });
      try { rota = JSON.parse(ct); } catch { rota = null; }
      if (!rota?.id) rota = await findRota(jar);
      steps.push({ step: "רוטה נוצרה", id: rota?.id ?? null });
    }

    let quotas = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${WEEK}`, { headers: hdrs(jar) })).json()).length;
    if (go && quotas < 60) {
      const src = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${SRC_WEEK}`, { headers: hdrs(jar) })).json());
      let ok = 0;
      for (const q of src) {
        const body: any = { ...q, date: WEEK }; delete body.id; delete body.version;
        const r = await fetch(`${BASE}/api/employees-quotas/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(body) });
        if (r.ok) ok++; await r.text();
      }
      quotas = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${WEEK}`, { headers: hdrs(jar) })).json()).length;
      steps.push({ step: "מכסות הועתקו", copied: ok, src: src.length, now: quotas });
    }
    steps.push({ step: "שער מכסות", count: quotas, gate: quotas >= 60 ? "PASS" : "BLOCK" });

    if (!go) return new Response(JSON.stringify({ dry: true, would_write: ROWS.length,
      filled: ROWS.filter((r) => r[2] !== null && r[4] !== MOLU).length,
      molu: ROWS.filter((r) => r[4] === MOLU).length, gaps: ROWS.filter((r) => r[4] === GAP).length, steps }, null, 2),
      { headers: { "Content-Type": "application/json" } });
    if (quotas < 60) return new Response(JSON.stringify({ blocked: true, reason: "מכסות לא נוצרו — לא נכתב אף תא", quotas, steps }, null, 2), { status: 409 });

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === rota.id && !c.is_deleted && c.role === COOK);
    const used = new Map<number, Set<number>>();
    for (const c of live) { if (!used.has(c.day)) used.set(c.day, new Set()); used.get(c.day)!.add(Number(c.order || 0)); }
    const nextOrder = (day: number) => {
      if (!used.has(day)) used.set(day, new Set());
      const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start, notes] of ROWS) {
      const date = dateOf(day);
      const dup = live.find((c: any) => c.day === day && c.shift === shift && Number(c.employee ?? 0) === Number(emp ?? 0)
        && hhmm(c.planned_start) === start && String(c.notes || "") === notes);
      if (dup) { skipped.push({ date, emp, start }); continue; }
      const payload = {
        rota: rota.id, sub_rota: null, shift, day, date, role: COOK, employee: emp, order: nextOrder(day),
        planned_start: `${start}:00`, planned_end: null,
        planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0,
        absence: "", notes, highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) created.push({ date, emp, start });
      else failed.push({ date, emp, start, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === rota.id && !c.is_deleted && c.role === COOK);
    const rotaAfter = await findRota(jar);
    const per: Record<string, number> = {};
    for (const c of after) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      per[who] = (per[who] || 0) + 1;
    }
    return new Response(JSON.stringify({ rota: rota.id, is_published: rotaAfter?.is_published ?? null, quotas,
      created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
      cook_cells: after.length, per_person: per, steps }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
