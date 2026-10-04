import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// טבחים 09/10 — ירין 04/10: זיו טבח חדש (עוד לא קיים בשיפט) — תא ערב ריק 16:00–00:00 עם הערה. ?confirm=1 לכתיבה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, P_ROTA = 886527, COOK = 34771, B = 16656, E = 21796;
const WEEK = "2026-10-04";
const NOTE = "זיו – טבח חדש";
// [day, shift, employee, start, end, notes]
const CREATES: [number, number, number | null, string, string, string][] = [[5, E, null, "16:00", "00:00", NOTE]];
const nextDay = (date: string) => { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
function dateOf(day: number) { const d = new Date(WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day); return d.toISOString().slice(0, 10); }

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
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK);
    const show = (l: any[]) => l.filter((c: any) => c.day === 5).sort((x: any, y: any) => String(x.planned_start).localeCompare(String(y.planned_start)))
      .map((c: any) => `${c.shift === B ? "B" : "E"} ${hhmm(c.planned_start)}${c.planned_end ? "-" + hhmm(c.planned_end) : ""} ${who(c)}${c.notes ? " [" + c.notes + "]" : ""}`);
    const cells = await load();
    const dupC = CREATES.filter(([d, sh, , st]) => cells.some((c: any) => c.day === d && c.shift === sh && hhmm(c.planned_start) === st && String(c.notes || "").includes("זיו")));
    if (dupC.length) return new Response(JSON.stringify({ error: "create exists", dupC, now: show(cells) }), { status: 409 });
    if (!go) return new Response(JSON.stringify({ dry: true, creates: CREATES.length, now: show(cells) }, null, 1), { headers: { "Content-Type": "application/json" } });
    const res: any[] = [];
    for (const [day, shift, emp, start, end, notes] of CREATES) {
      const date = dateOf(day);
      const orders = new Set(cells.filter((c: any) => c.day === day).map((c: any) => Number(c.order || 0))); let o = 1; while (orders.has(o)) o++;
      const payload = { rota: P_ROTA, sub_rota: null, shift, day, date, role: COOK, employee: emp, order: o,
        planned_start: `${start}:00`, planned_end: `${end}:00`, planned_start_full: `${date}T${start}:00`,
        planned_end_full: `${end < start ? nextDay(date) : date}T${end}:00`,
        manual_start: null, manual_end: null, work_code: 0, break_duration: 0, waiting: 0, absence: "", notes, highlight: "" };
      const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
      const t = await r.text(); res.push({ d: day, create: r.status, body: t.slice(0, 300) });
      cells.push({ day, order: o });
    }
    return new Response(JSON.stringify({ res, after: show(await load()) }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
