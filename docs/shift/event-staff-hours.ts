import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: לכל תאריך ב-?dates= — כל התאים בסידור רצפה (4281) ומטבח (4283): מתוכנן + החתמה בפועל + שעות.
// משמש לספירת צוות ושעות ליום אירוע. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APPS: Record<number, string> = { 4281: "רצפה", 4283: "מטבח" };

async function cfg(k: string): Promise<string> { const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
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
const hm = (t: any) => (t ? String(t).slice(0, 5) : "");
function hours(s: any, e: any) {
  if (!s || !e) return null;
  const [sh, sm] = String(s).split(":").map(Number), [eh, em] = String(e).split(":").map(Number);
  let m = eh * 60 + em - (sh * 60 + sm); if (m < 0) m += 1440;
  return Math.round(m / 6) / 10;
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const dates = (u.searchParams.get("dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const out: Record<string, any> = {};
    for (const [appS, appName] of Object.entries(APPS)) {
      const app = Number(appS);
      await switchApp(jar, app);
      const g = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json().catch(() => []));
      const roles: Record<number, string> = {}, shifts: Record<number, string> = {};
      for (const r of await g(`roles/?application=${app}`)) roles[r.id] = r.name;
      for (const s of await g(`shifts/?application=${app}`)) shifts[s.id] = s.name;
      const cells = await g("cells/");
      for (const date of dates) {
        const only = (u.searchParams.get("emps") ?? "").split(",").filter(Boolean).map(Number);
        const day = cells.filter((c: any) => String(c.date).slice(0, 10) === date && !c.is_deleted && c.employee && (!only.length || only.includes(c.employee)));
        if (u.searchParams.get("keys") && day[0]) out[`keys_${app}`] = Object.keys(day[0]);
        (out[date] ??= {})[appName] = day.map((c: any) => {
          const s = c.clock_start ?? c.manual_start, e = c.clock_end ?? c.manual_end;
          return {
            name: `${c.first_name} ${c.last_name}`, emp: c.employee, cell: c.id,
            role: roles[c.role] ?? c.role, shift: shifts[c.shift] ?? c.shift,
            plan: `${hm(c.start)}-${hm(c.end)}`, actual: s ? `${hm(s)}-${hm(e)}` : "", hours: hours(s, e),
            manual: !c.clock_start && !!c.manual_start, note: c.note ?? c.comment ?? "",
            ...(u.searchParams.get("raw") ? { raw: { cs: c.clock_start_full, ce: c.clock_end_full, ms: c.manual_start_full, me: c.manual_end_full, cut_s: c.cut_start, cut_e: c.cut_end, brk: c.break_duration, wait: c.waiting, ps: c.planned_start_full, pe: c.planned_end_full, absence: c.absence, work_code: c.work_code, extras: c.extras } } : {}),
          };
        }).sort((a: any, b: any) => String(a.actual || a.plan).localeCompare(String(b.actual || b.plan)));
      }
    }
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
