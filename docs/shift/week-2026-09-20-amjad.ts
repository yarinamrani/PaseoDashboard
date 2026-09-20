import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// אמג'ד — פנוי שישי ושבת, כפולות (ירין, 20/09).
// משתמשים ברשומת העובד האמיתית 849311 ("אמגד כוח אדם") ולא בתא ריק עם הערה,
// כדי שהשעות יזרמו לשכר. עד היום הוא שובץ תמיד כ-null+notes.
//   ו' 25/09 בוקר 13:00 — תא חדש (הדפוס שלו מ-18/09)
//   ו' 25/09 ערב  17:00 — ממלא אחד משלושת החורים
//   ש' 26/09 בוקר 10:00 — ממלא את חור הפתיחה
//   ש' 26/09 ערב  17:00 — ממלא את החור
// אחרי זה: 6 חורים -> 3. הרוטה נשארת טיוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-20";
const P_APP = 4283, P_ROTA = 881056, COOK = 34771, BOKER = 16656, EREV = 21796;
const AMJAD = 849311;

type Op = { label: string; day: number; shift: number; start: string; notes: string; create?: boolean };
const OPS: Op[] = [
  { label: "ו' בוקר 13:00 — תא חדש לאמג'ד", day: 5, shift: BOKER, start: "13:00", notes: "", create: true },
  { label: "ו' ערב 17:00 — חור -> אמג'ד",   day: 5, shift: EREV,  start: "17:00", notes: "חסר טבח" },
  { label: "ש' בוקר 10:00 פתיחה -> אמג'ד",  day: 6, shift: BOKER, start: "10:00", notes: "חסר טבח — פתיחה" },
  { label: "ש' ערב 17:00 — חור -> אמג'ד",   day: 6, shift: EREV,  start: "17:00", notes: "חסר טבח" },
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
async function patchCell(jar: Record<string, string>, app: number, cur: any, fields: Record<string, unknown>) {
  let ver = Number(cur.version ?? 0), last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/api/cells/${cur.id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...cur, version: ver, ...fields }) });
    const t = await r.text();
    if (r.ok) return { ok: true };
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

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    let live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK);

    const used = new Map<number, Set<number>>();
    for (const c of live) {
      if (!used.has(c.day)) used.set(c.day, new Set());
      used.get(c.day)!.add(Number(c.order || 0));
    }
    const nextOrder = (day: number) => {
      if (!used.has(day)) used.set(day, new Set());
      const s = used.get(day)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
    };

    const plan: any[] = [], done: any[] = [], skipped: any[] = [], failed: any[] = [];
    for (const op of OPS) {
      const date = dateOf(op.day);
      const already = live.find((c: any) => c.day === op.day && c.shift === op.shift
        && Number(c.employee) === AMJAD && hhmm(c.planned_start) === op.start);
      if (already) { skipped.push({ op: op.label, why: "כבר משובץ" }); continue; }

      if (op.create) {
        plan.push({ op: op.label, action: "CREATE" });
        if (!go) continue;
        const payload = {
          rota: P_ROTA, sub_rota: null, shift: op.shift, day: op.day, date, role: COOK,
          employee: AMJAD, order: nextOrder(op.day),
          planned_start: `${op.start}:00`, planned_end: null,
          planned_start_full: `${date}T${op.start}:00`, planned_end_full: null,
          manual_start: null, manual_end: null,
          work_code: 0, break_duration: 0, waiting: 0,
          absence: "", notes: op.notes, highlight: "",
        };
        const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
        const t = await r.text();
        if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ } done.push({ op: op.label, id: j?.id }); }
        else failed.push({ op: op.label, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 160) });
        continue;
      }

      const hole = live.find((c: any) => c.day === op.day && c.shift === op.shift
        && c.employee === null && hhmm(c.planned_start) === op.start && String(c.notes || "") === op.notes);
      if (!hole) { skipped.push({ op: op.label, why: "לא נמצא חור תואם" }); continue; }
      plan.push({ op: op.label, action: "PATCH", id: hole.id });
      if (!go) continue;
      const res = await patchCell(jar, P_APP, hole, { employee: AMJAD, notes: "" });
      if (res.ok) { done.push({ op: op.label, id: hole.id }); hole.employee = AMJAD; hole.notes = ""; }
      else failed.push({ op: op.label, id: hole.id, err: res.last });
    }

    if (!go) return new Response(JSON.stringify({ dry: true, plan, skipped }, null, 2), { headers: { "Content-Type": "application/json" } });

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
      done: done.length, skipped, failed, is_published: pRota?.is_published ?? null,
      cook_cells: after.length, assigned: after.filter((c: any) => c.employee).length,
      gaps: after.filter((c: any) => !c.employee).length,
      per_person: per, by_day: by,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
