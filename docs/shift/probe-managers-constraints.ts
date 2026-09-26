import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: אילוצי מנהלים (/api/requests/) לזיו/עדי/ירין, רוטות פלור פסאו (4281) ותאי אחמש (34751). לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, AM = 34751;

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

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, F_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });

    const AMS: Record<number, string> = { 846387: "ziv", 462134: "adi", 460064: "yarin" };
    const g = async (p: string) => { const r = await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) }); const t = await r.text(); try { return JSON.parse(t); } catch { return `${r.status} ${t.slice(0, 200)}`; } };
    const dOf = (r: any) => String(r.start_date ?? r.date ?? r.week_start ?? "");
    const rotasAll = rowsOf(await g("rotas/")).filter((r: any) => !r.is_deleted && dOf(r) >= "2026-08-30");
    const rotas = rotasAll.map((r: any) => ({ id: r.id, app: r.application, start: dOf(r), pub: r.is_published, keys: Object.keys(r).join(",") }));
    // כל הבקשות של שלושת המנהלים מ-30/08, מקובצות לפי שבוע
    const reqs: Record<string, string[]> = {};
    for (const e of Object.keys(AMS)) {
      const rows = rowsOf(await g(`requests/?application=${F_APP}&employee=${e}`)).filter((x: any) => String(x.employee) === e && String(x.date) >= "2026-08-30");
      for (const x of rows) (reqs[`${AMS[+e]} ${x.date}`] ||= []).push(`d${x.day} s${x.availability_shift} st${x.state}${x.is_default ? "" : " MANUAL"} ${Object.keys(x).filter((k) => !["id","application","date","day","employee","availability_shift","state","is_default"].includes(k)).map((k) => k + "=" + JSON.stringify(x[k])).join(" ")}`);
    }
    // השוואה: עובד אחר עם בקשות לשבוע 27/09 (להבין state)
    const all = rowsOf(await g(`requests/?application=${F_APP}&date=2026-09-27`)).filter((x: any) => x.date === "2026-09-27");
    const states: Record<string, number> = {};
    for (const x of all) { const k = `s${x.availability_shift} st${x.state} ${x.is_default ? "def" : "manual"}`; states[k] = (states[k] || 0) + 1; }
    const perEmp: Record<string, number> = {};
    for (const x of all) perEmp[x.employee] = (perEmp[x.employee] || 0) + 1;
    const cellsAll = rowsOf(await g("cells/"));
    const cells = cellsAll.filter((c: any) => rotasAll.some((r: any) => r.id === c.rota) && !c.is_deleted && (c.role === AM || [846387, 462134, 460064].includes(c.employee)))
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.planned_start).localeCompare(String(b.planned_start)))
      .map((c: any) => `${c.rota} ${String(c.date).slice(0, 10)} d${c.day} s${c.shift} r${c.role} ${String(c.planned_start || "").slice(0, 5)}-${String(c.planned_end || "").slice(0, 5)} ${c.employee ? (c.first_name || "") + " " + (c.last_name || "") : "—"}${c.notes ? " [" + c.notes + "]" : ""}`);
    return new Response(JSON.stringify({ rotas, reqs, week27_states: states, week27_emps: Object.keys(perEmp).length, week27_per_emp_sample: Object.entries(perEmp).slice(0, 10), am_cells: cells }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
