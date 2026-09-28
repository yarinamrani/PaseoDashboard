import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// אחמ"שים פסאו + טאלה 27/09–03/10 — ירין 27/09: לכתוב את הסקיצה לרוטת הפלור (4281, רוטה 882439, מפורסמת).
// פסאו = אחמש 34751, טאלה = אחמש טאלה 45483. ירין בוקר 11:00 כל יום; זיו בטאלה בימים שהגיש + שישי בוקר 09:00;
// עדי חופש בחמישי; 3 חוסרים (אחמ"ש שני בפסאו ה'/ו'/ש' ערב) כתאים ריקים עם הערה.
// 28/09 ירין: מנהל בוקר כל יום בלי שעה (ב'–ש').
// נוגע רק בתאי אחמש/אחמש טאלה של ירין/זיו/עדי ובתאים ריקים שהערתם מתחילה ב"חסר". לא מוחק תאים של אחרים. לא מפרסם.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-27";
const F_APP = 4281, ROTA = 882439, AM_P = 34751, AM_T = 45483, B = 16651, E = 16648;
const M = { YARIN: 460064, ZIV: 846387, ADI: 462134 };
const MISS = "חסר – אחמ\"ש שני";

// [day, shift, role, employee|null, start|null, notes]
type Row = [number, number, number, number | null, string | null, string];
const ROWS: Row[] = [
  // א' 27/09 (היום): במערכת כבר עדי אחמ"ש פסאו ערב — לא נוגעים בתאי היום; ירין לטאלה 17:00.
  [0, E, AM_T, M.YARIN, "17:00", ""],
  [1, B, AM_P, M.YARIN, null, ""], [1, E, AM_P, M.ADI, null, ""], [1, E, AM_T, M.ZIV, "17:00", ""],
  [2, B, AM_P, M.YARIN, null, ""], [2, E, AM_P, M.ADI, null, ""], [2, E, AM_T, M.YARIN, "17:00", ""],
  [3, B, AM_P, M.YARIN, null, ""], [3, E, AM_P, M.ADI, null, ""], [3, E, AM_T, M.ZIV, "17:00", ""],
  [4, B, AM_P, M.YARIN, null, ""], [4, E, AM_P, M.YARIN, null, ""], [4, E, AM_P, null, null, MISS], [4, E, AM_T, M.ZIV, "17:00", ""],
  [5, B, AM_P, M.ZIV, "09:00", ""], [5, B, AM_P, M.YARIN, null, ""], [5, E, AM_P, M.ADI, null, ""], [5, E, AM_P, null, null, MISS],
  [6, B, AM_P, M.YARIN, null, ""], [6, E, AM_P, M.ADI, null, ""], [6, E, AM_P, null, null, MISS], [6, E, AM_T, M.ZIV, "19:00", "אחרי צאת שבת"],
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
async function patchCell(jar: Record<string, string>, cur: any, fields: Record<string, unknown>) {
  let ver = Number(cur.version ?? 0), last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/api/cells/${cur.id}/?application=${F_APP}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...cur, version: ver, ...fields }) });
    const t = await r.text();
    if (r.ok) return { ok: true };
    last = `${r.status} ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`;
    if (r.status === 409) { try { const j = JSON.parse(t); if (typeof j?.version === "number") ver = j.version + 1; } catch { ver++; } }
    else break;
  }
  return { ok: false, last };
}

const hhmm = (s: any) => (s ? String(s).slice(0, 5) : null);
const NAMES: Record<number, string> = { [M.YARIN]: "ירין", [M.ZIV]: "זיו", [M.ADI]: "עדי" };
const who = (c: any) => c.employee ? (NAMES[c.employee] ?? ((c.first_name || "") + " " + (c.last_name || "")).trim()) : (c.notes || "ריק");
const same = (c: any, r: Row) => c.day === r[0] && c.shift === r[1] && c.role === r[2] && Number(c.employee ?? 0) === Number(r[3] ?? 0)
  && hhmm(c.planned_start) === r[4] && String(c.notes || "") === r[5];
const mineCell = (c: any) => [AM_P, AM_T].includes(c.role) && (Object.values(M).includes(c.employee) || (!c.employee && String(c.notes || "").startsWith("חסר")));

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, F_APP))) return new Response(JSON.stringify({ error: "switch 4281 failed" }), { status: 502 });
    const rota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === ROTA);
    if (!rota || rota.is_deleted) return new Response(JSON.stringify({ error: "rota 882439 not found" }), { status: 404 });
    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json()).filter((c: any) => c.rota === ROTA && !c.is_deleted);
    const mine = live.filter(mineCell);
    const othersAM = live.filter((c: any) => [AM_P, AM_T].includes(c.role) && !mineCell(c)).map((c: any) => `${String(c.date).slice(0, 10)} r${c.role} ${hhmm(c.planned_start)} ${who(c)}`);

    const free = new Set(mine.map((c: any) => c.id));
    const todo: Row[] = [];
    for (const r of ROWS) { const hit = mine.find((c: any) => free.has(c.id) && same(c, r)); if (hit) free.delete(hit.id); else todo.push(r); }
    for (const c of mine) if (c.day === 0) free.delete(c.id);   // היום — לא משנים ולא מוחקים תאים קיימים
    const plan: any[] = [];
    for (const r of todo) {
      const pool = mine.filter((c: any) => free.has(c.id) && c.day === r[0] && c.shift === r[1] && c.role === r[2]);
      const cand = pool.find((c: any) => Number(c.employee ?? 0) === Number(r[3] ?? 0)) ?? pool[0];
      if (cand) { free.delete(cand.id); plan.push({ op: "patch", cell: cand, row: r }); } else plan.push({ op: "create", row: r });
    }
    for (const id of free) plan.push({ op: "delete", cell: mine.find((c: any) => c.id === id) });
    const rn = (r: Row) => `${dateOf(r[0])} ${r[1] === B ? "בוקר" : "ערב"} ${r[2] === AM_T ? "טאלה" : "פסאו"} ${r[4] ?? "--:--"} ${r[3] ? NAMES[r[3]] : r[5]}`;
    const desc = (p: any) => p.op === "create" ? `חדש ${rn(p.row)}` : p.op === "delete" ? `מחיקה ${String(p.cell.date).slice(0, 10)} ${who(p.cell)}` : `עדכון ${String(p.cell.date).slice(0, 10)} ${who(p.cell)} → ${rn(p.row)}`;
    if (!go) return new Response(JSON.stringify({ dry: true, is_published: rota.is_published, existing_mine: mine.length, target: ROWS.length, others_am_untouched: othersAM, changes: plan.map(desc) }, null, 1), { headers: { "Content-Type": "application/json" } });

    const used = new Map<number, Set<number>>();
    for (const c of live) { if (!used.has(c.day)) used.set(c.day, new Set()); used.get(c.day)!.add(Number(c.order || 0)); }
    const nextOrder = (day: number) => { if (!used.has(day)) used.set(day, new Set()); const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o; };
    const done: string[] = [], failed: any[] = [];
    for (const p of plan) {
      if (p.op === "patch") {
        const [, shift, role, emp, start, notes] = p.row; const date = String(p.cell.date).slice(0, 10);
        const res = await patchCell(jar, p.cell, { shift, role, employee: emp, notes, planned_start: start ? `${start}:00` : null, planned_start_full: start ? `${date}T${start}:00` : null });
        res.ok ? done.push(desc(p)) : failed.push({ c: desc(p), last: res.last });
      } else if (p.op === "create") {
        const [day, shift, role, emp, start, notes] = p.row; const date = dateOf(day);
        const payload = { rota: ROTA, sub_rota: null, shift, day, date, role, employee: emp, order: nextOrder(day),
          planned_start: start ? `${start}:00` : null, planned_end: null, planned_start_full: start ? `${date}T${start}:00` : null, planned_end_full: null,
          manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes, highlight: "" };
        const r = await fetch(`${BASE}/api/cells/?application=${F_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
        const t = await r.text(); r.ok ? done.push(desc(p)) : failed.push({ c: desc(p), status: r.status, body: t.slice(0, 200) });
      } else {
        const r = await fetch(`${BASE}/api/cells/${p.cell.id}/?application=${F_APP}`, { method: "DELETE", headers: hdrs(jar, true) });
        await r.text(); r.ok ? done.push(desc(p)) : failed.push({ c: desc(p), status: r.status });
      }
    }
    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json()).filter((c: any) => c.rota === ROTA && !c.is_deleted && mineCell(c));
    const missing = ROWS.filter((r) => !after.some((c: any) => same(c, r))).map(rn);
    const rotaAfter = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === ROTA);
    return new Response(JSON.stringify({ is_published: rotaAfter?.is_published ?? null, done: done.length, failed, cells: after.length, target: ROWS.length, missing }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
