import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שוטפים — חול המועד סוכות 27/09–03/10. הכל ברוטת מטבח פסאו 884123, משמרות אומינו עם הערה "אומינו".
// בסיס: הסידור של 20–26/09 (ירין: "אותו סידור כמו שבוע שעבר"), עם ההתאמות:
//   • כלל גיל — השבוע הילארי = ערבי אומינו, פטל = ערבי פסאו (בשבוע שעבר הפוך).
//     שישי ערב אומינו סגור → הילארי בפסאו 17:00.
//   • א'+ב' היו כיפור בשבוע שעבר → נבנו במבנה של ג'/ד'.
//   • ג' בשבוע שעבר היה חתונה (4 שוטפי ערב) → השבוע 2 פסאו + 1 אומינו.
//   • כל שוטף בוקר (ג'ונתן/ג'רמי/אנזו) מקבל יום חופש; אנזו חופש בא' (סגר מוצ"ש).
//   • ⚠ ג'רמי סוגר אומינו במוצ"ש 26/09 (19:30) ופותח אומינו בא' 10:00 — אין מי שלא סגר.
// הפונקציה לא מפרסמת. בנוסף מסמנת תאי שוטפים ריקים ברוטת אומינו 883895 "מנוהל בסידור פסאו".
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-27";
const P_APP = 4283, P_ROTA = 884123, DISH = 34937, B = 16656, E = 21796;
const U_APP = 5931, U_ROTA = 883895, U_ROLE = 52707;
const W = { JONATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255, JEREMY: 829782 };
const U = "אומינו", CLEAR_NOTE = "מנוהל בסידור פסאו";

type Row = [number, number, number, string, string];
const ROWS: Row[] = [
  [0, B, W.JONATHAN, "10:00", ""], [0, B, W.JEREMY, "10:00", U],
  [0, E, W.PATEL, "17:00", ""], [0, E, W.TONY, "18:00", ""], [0, E, W.HILLARY, "18:00", U],

  [1, B, W.JONATHAN, "10:00", ""], [1, B, W.ENZO, "10:00", U],
  [1, E, W.PATEL, "17:00", ""], [1, E, W.TONY, "18:00", ""], [1, E, W.HILLARY, "18:00", U],

  [2, B, W.JEREMY, "10:00", ""], [2, B, W.ENZO, "10:00", U],
  [2, E, W.PATEL, "17:00", ""], [2, E, W.ENZO, "18:00", ""], [2, E, W.HILLARY, "18:00", U],

  [3, B, W.JONATHAN, "10:00", ""], [3, B, W.JEREMY, "10:00", U],
  [3, E, W.PATEL, "17:00", ""], [3, E, W.ENZO, "18:00", ""], [3, E, W.HILLARY, "18:00", U],

  [4, B, W.JONATHAN, "10:00", ""], [4, B, W.JEREMY, "10:00", U],
  [4, E, W.ENZO, "17:00", ""], [4, E, W.TONY, "18:00", ""], [4, E, W.HILLARY, "18:00", U],

  [5, B, W.JONATHAN, "08:00", ""], [5, B, W.JEREMY, "10:00", U], [5, B, W.ENZO, "13:00", ""],
  [5, E, W.HILLARY, "17:00", ""], [5, E, W.PATEL, "18:00", ""],

  [6, B, W.JONATHAN, "08:00", ""],
  [6, E, W.ENZO, "16:00", ""], [6, E, W.PATEL, "18:00", ""], [6, E, W.JEREMY, "19:30", U],
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

    // ===== 1. אומינו — מה יש ברוטה 883895 (שעות פתיחה בחול המועד) =====
    if (!(await switchApp(jar, U_APP))) return new Response(JSON.stringify({ error: "switch 5931 failed" }), { status: 502 });
    const uRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === U_ROTA);
    const uLive = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted);
    const uMap = uLive.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))
      .map((c: any) => `${String(c.date).slice(0, 10)} ${c.role === U_ROLE ? "שוטף" : "role" + c.role} shift${c.shift} ${hhmm(c.planned_start)} ${who(c)}`);
    const uDish = uLive.filter((c: any) => c.role === U_ROLE);
    const uAssigned = uDish.filter((c: any) => c.employee !== null).map((c: any) => `${String(c.date).slice(0, 10)} ${who(c)}`);
    const uCleared: any[] = [], uFailed: any[] = [];
    for (const c of uDish.filter((c: any) => c.employee === null && String(c.notes || "") !== CLEAR_NOTE)) {
      if (!go) { uCleared.push({ id: c.id, dry: true }); continue; }
      const res = await patchCell(jar, U_APP, c, { notes: CLEAR_NOTE });
      if (res.ok) uCleared.push({ id: c.id }); else uFailed.push({ id: c.id, last: res.last });
    }

    // ===== 2. פסאו — כתיבת שוטפים לרוטה 884123 =====
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);
    if (!pRota || pRota.is_deleted) return new Response(JSON.stringify({ error: "rota 884123 not found" }), { status: 404 });
    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted);
    const liveDish = live.filter((c: any) => c.role === DISH);
    const used = new Map<number, Set<number>>();
    for (const c of live) { if (!used.has(c.day)) used.set(c.day, new Set()); used.get(c.day)!.add(Number(c.order || 0)); }
    const nextOrder = (day: number) => { if (!used.has(day)) used.set(day, new Set()); const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o; };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, shift, emp, start, notes] of ROWS) {
      const date = dateOf(day);
      const dup = liveDish.find((c: any) => c.day === day && c.shift === shift && Number(c.employee ?? 0) === emp
        && hhmm(c.planned_start) === start && String(c.notes || "") === notes);
      if (dup) { skipped.push({ date, emp, start }); continue; }
      if (!go) { created.push({ date, emp, start, notes, dry: true }); continue; }
      const payload = {
        rota: P_ROTA, sub_rota: null, shift, day, date, role: DISH, employee: emp, order: nextOrder(day),
        planned_start: `${start}:00`, planned_end: null, planned_start_full: `${date}T${start}:00`, planned_end_full: null,
        manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes, highlight: "",
      };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text();
      if (r.ok) created.push({ date, emp, start }); else failed.push({ date, emp, start, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
    }

    const after = go ? rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === DISH) : liveDish;
    const by: Record<string, string[]> = {}, per: Record<string, number> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start)} ${who(c)}${c.shift === B ? " [בוקר]" : " [ערב]"}${String(c.notes || "").includes(U) ? " ← אומינו" : ""}`);
      per[who(c)] = (per[who(c)] || 0) + 1;
    }
    const pAfter = go ? rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA) : pRota;

    return new Response(JSON.stringify({
      dry: !go, paseo: { rota: P_ROTA, is_published: pAfter?.is_published ?? null, existing_dish: liveDish.length,
        created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5), dish_cells: after.length, per_person: per, by_day: by },
      umino: { rota: U_ROTA, is_published: uRota?.is_published ?? null, cells: uLive.length, dish_assigned: uAssigned,
        notes_set: uCleared.length, notes_failed: uFailed, map: uMap },
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
