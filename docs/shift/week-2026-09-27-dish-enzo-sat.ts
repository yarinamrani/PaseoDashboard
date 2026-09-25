import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שוטפים 27/09–03/10 — שלוש מסעדות, הערות באנגלית (השוטפים מחו"ל): Paseo / Umino / Tala.
// ירין 25/09:
//   • פטל נשאר באומינו גם השבוע (כל ערבי אומינו כולל מוצ"ש 19:30), הילארי בפסאו. גובר על טבלת גיל.
//   • א'–ד' בערב: השוטף השני של פסאו (18:00) עובר לטאלה. שעת טאלה לא נמסרה → 18:00.
//   • ג'רמי פותח אומינו כל בוקר (א' 11:00), חופש בשבת.
// ירין: טאלה סגורה בשישי, פתוחה במוצ"ש. חמישי — לפי אותו כלל (השני בפסאו עובר לטאלה): טוני 19:00 → Tala.
//   מוצ"ש — אין שוטף פנוי (כולם ב-6 ימים) → תא ריק "Tala – חסר שוטף", שעה 18:00 ברירת מחדל.
// ירין: מוצ"ש — ג'רמי באומינו 19:30, פטל עובר לפסאו (19:30). ג'רמי 7 ימים השבוע.
// ירין: "תמחק tbd" — תא החסר של טאלה במוצ"ש נמחק.
// ירין: "שוטף אחד בכל מקום" — מוצ"ש: הילארי פסאו 16:00, פטל טאלה 19:30 (שעה ברירת מחדל), אנזו יורד. שישי ללא שינוי.
// ירין: אנזו לא בחופש בשבת → חוזר לפסאו 16:00, הילארי 18:00. יום החופש של אנזו נשאר ב'.
// Reconcile מול ROWS (PATCH/יצירה/מחיקה). לא מפרסם.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-27";
const P_APP = 4283, P_ROTA = 884123, DISH = 34937, B = 16656, E = 21796;
const W = { JONATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255, JEREMY: 829782 };
const P = "Paseo", U = "Umino", T = "Tala", T_GAP = "Tala – חסר שוטף";

type Row = [number, number, number | null, string, string];
const ROWS: Row[] = [
  [0, B, W.JONATHAN, "10:00", P], [0, B, W.JEREMY, "11:00", U],
  [0, E, W.HILLARY, "17:00", P], [0, E, W.ENZO, "18:00", T], [0, E, W.PATEL, "18:00", U],

  [1, B, W.JONATHAN, "10:00", P], [1, B, W.JEREMY, "10:00", U],
  [1, E, W.HILLARY, "17:00", P], [1, E, W.JONATHAN, "18:00", T], [1, E, W.PATEL, "18:00", U],

  [2, B, W.ENZO, "10:00", P], [2, B, W.JEREMY, "10:00", U],
  [2, E, W.HILLARY, "17:00", P], [2, E, W.JONATHAN, "18:00", T], [2, E, W.PATEL, "18:00", U],

  [3, B, W.ENZO, "10:00", P], [3, B, W.JEREMY, "10:00", U],
  [3, E, W.HILLARY, "17:00", P], [3, E, W.JONATHAN, "18:00", T], [3, E, W.PATEL, "18:00", U],

  [4, B, W.ENZO, "10:00", P], [4, B, W.JEREMY, "10:00", U],
  [4, E, W.ENZO, "17:00", P], [4, E, W.TONY, "19:00", T], [4, E, W.PATEL, "18:00", U],

  [5, B, W.JONATHAN, "08:00", P], [5, B, W.JEREMY, "10:00", U], [5, B, W.ENZO, "13:00", P],
  [5, E, W.HILLARY, "17:00", P], [5, E, W.TONY, "19:00", P],

  [6, B, W.JONATHAN, "08:00", P],
  [6, E, W.ENZO, "16:00", P], [6, E, W.HILLARY, "18:00", P], [6, E, W.PATEL, "19:30", T], [6, E, W.JEREMY, "19:30", U],
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
const same = (c: any, r: Row) => c.day === r[0] && c.shift === r[1] && Number(c.employee ?? 0) === Number(r[2] ?? 0) && hhmm(c.planned_start) === r[3] && String(c.notes || "") === r[4];

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);
    if (!pRota || pRota.is_deleted) return new Response(JSON.stringify({ error: "rota 884123 not found" }), { status: 404 });
    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted);
    const dish = live.filter((c: any) => c.role === DISH);

    // 1. התאמות מדויקות
    const freeLive = new Set(dish.map((c: any) => c.id));
    const todo: Row[] = [];
    for (const r of ROWS) {
      const hit = dish.find((c: any) => freeLive.has(c.id) && same(c, r));
      if (hit) freeLive.delete(hit.id); else todo.push(r);
    }
    // 2. PATCH לתא פנוי באותו יום+משמרת, אחרת יצירה; תאים שנשארו — מחיקה
    const byStart = (a: any, b: any) => String(a.planned_start).localeCompare(String(b.planned_start));
    const plan: any[] = [];
    for (const r of todo) {
      const cand = dish.filter((c: any) => freeLive.has(c.id) && c.day === r[0] && c.shift === r[1]).sort(byStart)[0];
      if (cand) { freeLive.delete(cand.id); plan.push({ op: "patch", cell: cand, row: r }); }
      else plan.push({ op: "create", row: r });
    }
    for (const id of freeLive) plan.push({ op: "delete", cell: dish.find((c: any) => c.id === id) });

    const desc = (p: any) => p.op === "delete" ? `מחיקה ${String(p.cell.date).slice(0, 10)} ${hhmm(p.cell.planned_start)} ${who(p.cell)}`
      : p.op === "patch" ? `${String(p.cell.date).slice(0, 10)} ${hhmm(p.cell.planned_start)} ${who(p.cell)}${p.cell.notes ? " (" + p.cell.notes + ")" : ""} → ${p.row[3]} ${p.row[2]}${p.row[4] ? " (" + p.row[4] + ")" : ""}`
      : `חדש d${p.row[0]} ${p.row[3]} ${p.row[2]}`;
    if (!go) return new Response(JSON.stringify({ dry: true, is_published: pRota.is_published, existing_dish: dish.length, target: ROWS.length, changes: plan.map(desc) }, null, 2),
      { headers: { "Content-Type": "application/json" } });

    const used = new Map<number, Set<number>>();
    for (const c of live) { if (!used.has(c.day)) used.set(c.day, new Set()); used.get(c.day)!.add(Number(c.order || 0)); }
    const nextOrder = (day: number) => { if (!used.has(day)) used.set(day, new Set()); const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o; };
    const done: string[] = [], failed: any[] = [];
    for (const p of plan) {
      if (p.op === "patch") {
        const [day, , emp, start, notes] = p.row; const date = String(p.cell.date).slice(0, 10);
        const res = await patchCell(jar, P_APP, p.cell, { employee: emp, notes, planned_start: `${start}:00`, planned_start_full: `${date}T${start}:00` });
        res.ok ? done.push(desc(p)) : failed.push({ c: desc(p), last: res.last });
      } else if (p.op === "create") {
        const [day, shift, emp, start, notes] = p.row; const date = dateOf(day);
        const payload = { rota: P_ROTA, sub_rota: null, shift, day, date, role: DISH, employee: emp, order: nextOrder(day),
          planned_start: `${start}:00`, planned_end: null, planned_start_full: `${date}T${start}:00`, planned_end_full: null,
          manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes, highlight: "" };
        const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
        const t = await r.text(); r.ok ? done.push(desc(p)) : failed.push({ c: desc(p), status: r.status, body: t.slice(0, 140) });
      } else {
        const r = await fetch(`${BASE}/api/cells/${p.cell.id}/?application=${P_APP}`, { method: "DELETE", headers: hdrs(jar, true) });
        await r.text();
        if (r.ok) done.push(desc(p));
        else { const res = await patchCell(jar, P_APP, p.cell, { is_deleted: true }); res.ok ? done.push(desc(p) + " (is_deleted)") : failed.push({ c: desc(p), last: res.last }); }
      }
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === DISH);
    const missing = ROWS.filter((r) => !after.some((c: any) => same(c, r))).length;
    const by: Record<string, string[]> = {}, per: Record<string, number> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || byStart(a, b))) {
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start)} ${who(c)}${c.notes ? " · " + c.notes : ""}`);
      per[who(c)] = (per[who(c)] || 0) + 1;
    }
    const rotaAfter = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);
    return new Response(JSON.stringify({ is_published: rotaAfter?.is_published ?? null, done: done.length, failed, dish_cells: after.length,
      target: ROWS.length, missing, per_person: per, by_day: by }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
