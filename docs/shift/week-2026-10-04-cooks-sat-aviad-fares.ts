import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// טבחים 10/10 — ירין 03/10: אביעד במוצ"ש (תא "חסר טבח" 17:00 → אביעד) + פארס כפולה (ערב 17:00 בנוסף לבוקר 10:00).
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, P_ROTA = 886527, COOK = 34771, E = 21796, FARES = 849312, AVIAD = 852125, GAP = "חסר טבח";

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
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const load = async () => rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK && (c.day === 0 || c.day === 6));
    const show = (l: any[]) => l.sort((x: any, y: any) => x.day - y.day || String(x.planned_start).localeCompare(String(y.planned_start)))
      .map((c: any) => `d${c.day} s${c.shift} ${hhmm(c.planned_start)} ${who(c)} [${c.notes || ""}] id${c.id}`);
    const cells = await load();
    const sat = cells.filter((c: any) => c.day === 6);
    const gap = sat.filter((c: any) => c.shift === E && !c.employee && c.notes === GAP && hhmm(c.planned_start) === "17:00");
    const faresEve = sat.some((c: any) => c.shift === E && c.employee === FARES);
    if (gap.length !== 1) return new Response(JSON.stringify({ error: "gap not found", before: show(sat) }), { status: 409 });
    if (!go) return new Response(JSON.stringify({ dry: true, faresEve, before: show(sat) }, null, 1), { headers: { "Content-Type": "application/json" } });
    const res: any[] = [await patchCell(jar, P_APP, gap[0], { employee: AVIAD, notes: "" })];
    if (!faresEve) {
      const orders = new Set(sat.map((c: any) => Number(c.order || 0))); let o = 1; while (orders.has(o)) o++;
      const payload = { rota: P_ROTA, sub_rota: null, shift: E, day: 6, date: "2026-10-10", role: COOK, employee: FARES, order: o,
        planned_start: "17:00:00", planned_end: null, planned_start_full: "2026-10-10T17:00:00", planned_end_full: null,
        manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes: "", highlight: "" };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      res.push({ create: r.status, body: (await r.text()).slice(0, 120) });
    }
    return new Response(JSON.stringify({ res, after: show((await load()).filter((c: any) => c.day === 6)) }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
