import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// מטבח פסאו — שבוע רגיל 04/10–10/10 (חול המועד נגמר: פתיחה 10:00, ו'+ש' 08:00/09:00).
// ירין 01/10: יעקב א',ב',ג' ערב · ד' חופש · ה' ערב · ו' בוקר · ש' ערב. בני רגיל (חופש א').
// שוטפים כמו 27/09 — רק פסאו + טאלה (מ-04/10 אומינו של גיל, לא משבצים).
// שאר הטבחים לפי תבנית 27/09: עידו פתיחה א'–ו' · מאיר בקרים א'–ו' · מולו ערבים + ש' בוקר (חופש ב') ·
// אמג'ד ו' ערב + ש' כפולה · אביעד טאלה א'–ה' 17:00. חורים: ב' + ד' ערב טבח שלישי.
// יוצר רוטה (טיוטה), מעתיק מכסות (שער >=60), כותב תאים. לא מפרסם. ?confirm=1 לכתיבה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-10-04", SRC_WEEK = "2026-09-27";
const P_APP = 4283, COOK = 34771, DISH = 34937, B = 16656, E = 21796;
const C = { IDO: 847151, YAAKOV: 770028, MEIR: 851353, BENNY: 543969, AVIAD: 852125, AMJAD: 849311, MOLU: 853229 };
const D = { JON: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241 };
const GAP = "חסר טבח", OPEN = "פתיחה", P = "Paseo", T = "Tala";

type Row = [number, number, number, number | null, string, string];
const ROWS: Row[] = [
  // א' 04/10
  [0, COOK, B, C.IDO, "10:00", OPEN], [0, COOK, B, C.MEIR, "10:30", ""],
  [0, COOK, E, C.YAAKOV, "16:00", ""], [0, COOK, E, C.MOLU, "17:00", ""], [0, COOK, E, C.AVIAD, "17:00", T],
  [0, DISH, B, D.JON, "10:00", P], [0, DISH, E, D.HILLARY, "17:00", P], [0, DISH, E, D.ENZO, "18:00", T],
  // ב' 05/10
  [1, COOK, B, C.IDO, "10:00", OPEN], [1, COOK, B, C.MEIR, "10:30", ""],
  [1, COOK, E, C.YAAKOV, "16:00", ""], [1, COOK, E, null, "17:00", GAP], [1, COOK, E, C.BENNY, "18:00", ""], [1, COOK, E, C.AVIAD, "17:00", T],
  [1, DISH, B, D.JON, "10:00", P], [1, DISH, E, D.ENZO, "17:00", P], [1, DISH, E, D.PATEL, "18:00", T],
  // ג' 06/10
  [2, COOK, B, C.IDO, "10:00", OPEN], [2, COOK, B, C.MEIR, "10:30", ""],
  [2, COOK, E, C.BENNY, "15:00", ""], [2, COOK, E, C.YAAKOV, "16:00", ""], [2, COOK, E, C.MOLU, "17:00", ""], [2, COOK, E, C.AVIAD, "17:00", T],
  [2, DISH, B, D.JON, "10:00", P], [2, DISH, E, D.ENZO, "17:00", P], [2, DISH, E, D.PATEL, "18:00", T],
  // ד' 07/10 — יעקב חופש
  [3, COOK, B, C.IDO, "10:00", OPEN], [3, COOK, B, C.MEIR, "10:30", ""],
  [3, COOK, E, C.BENNY, "16:00", ""], [3, COOK, E, null, "17:00", GAP], [3, COOK, E, C.MOLU, "18:00", ""], [3, COOK, E, C.AVIAD, "17:00", T],
  [3, DISH, B, D.JON, "10:00", P], [3, DISH, E, D.HILLARY, "17:00", P], [3, DISH, E, D.PATEL, "18:00", T],
  // ה' 08/10
  [4, COOK, B, C.IDO, "10:00", OPEN], [4, COOK, B, C.MEIR, "10:30", ""], [4, COOK, B, C.BENNY, "15:00", ""],
  [4, COOK, E, C.YAAKOV, "16:00", ""], [4, COOK, E, C.MOLU, "17:00", ""], [4, COOK, E, C.BENNY, "18:00", ""], [4, COOK, E, C.AVIAD, "17:00", T],
  [4, DISH, B, D.ENZO, "10:00", P], [4, DISH, E, D.PATEL, "17:00", P], [4, DISH, E, D.HILLARY, "18:00", P], [4, DISH, E, D.ENZO, "18:00", T],
  // ו' 09/10 — טאלה סגורה
  [5, COOK, B, C.IDO, "08:00", "פתיחה · עד 15:00"], [5, COOK, B, C.MEIR, "09:00", ""], [5, COOK, B, C.YAAKOV, "10:00", ""], [5, COOK, B, C.BENNY, "11:00", ""],
  [5, COOK, E, C.AMJAD, "17:00", ""], [5, COOK, E, C.MOLU, "17:00", ""], [5, COOK, E, C.BENNY, "18:00", ""],
  [5, DISH, B, D.JON, "08:00", P], [5, DISH, B, D.ENZO, "13:00", P], [5, DISH, E, D.HILLARY, "17:00", P],
  // ש' 10/10 — טאלה מ-19:30
  [6, COOK, B, C.AMJAD, "09:00", OPEN], [6, COOK, B, C.MOLU, "10:00", ""], [6, COOK, B, C.BENNY, "11:00", ""],
  [6, COOK, E, C.YAAKOV, "16:00", ""], [6, COOK, E, C.AMJAD, "17:00", ""], [6, COOK, E, C.BENNY, "18:00", ""],
  [6, DISH, B, D.JON, "08:00", P], [6, DISH, E, D.ENZO, "16:00", P], [6, DISH, E, D.HILLARY, "19:30", T],
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
      cooks: ROWS.filter((r) => r[1] === COOK).length, dish: ROWS.filter((r) => r[1] === DISH).length,
      gaps: ROWS.filter((r) => r[5] === GAP).length, steps }, null, 2),
      { headers: { "Content-Type": "application/json" } });
    if (quotas < 60) return new Response(JSON.stringify({ blocked: true, reason: "מכסות לא נוצרו — לא נכתב אף תא", quotas, steps }, null, 2), { status: 409 });

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === rota.id && !c.is_deleted);
    const used = new Map<number, Set<number>>();
    for (const c of live) { if (!used.has(c.day)) used.set(c.day, new Set()); used.get(c.day)!.add(Number(c.order || 0)); }
    const nextOrder = (day: number) => {
      if (!used.has(day)) used.set(day, new Set());
      const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const created: any[] = [], failed: any[] = [], skipped: any[] = [];
    for (const [day, role, shift, emp, start, notes] of ROWS) {
      const date = dateOf(day);
      const dup = live.find((c: any) => c.day === day && c.role === role && c.shift === shift && Number(c.employee ?? 0) === Number(emp ?? 0)
        && hhmm(c.planned_start) === start && String(c.notes || "") === notes);
      if (dup) { skipped.push({ date, emp, start }); continue; }
      const payload = {
        rota: rota.id, sub_rota: null, shift, day, date, role, employee: emp, order: nextOrder(day),
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
      .filter((c: any) => c.rota === rota.id && !c.is_deleted);
    const rotaAfter = await findRota(jar);
    const per: Record<string, number> = {};
    for (const c of after) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      per[who] = (per[who] || 0) + 1;
    }
    return new Response(JSON.stringify({ rota: rota.id, is_published: rotaAfter?.is_published ?? null, quotas,
      created: created.length, skipped: skipped.length, failed: failed.length, failures: failed.slice(0, 5),
      cells: after.length, per_person: per, steps }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
