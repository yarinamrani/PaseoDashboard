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
    const roles = rowsOf(await g(`roles/?application=${F_APP}`)).map((r: any) => `${r.id}=${r.name}`);
    const cellsAll = rowsOf(await g("cells/"));
    // שישי/שבת בוקר (משמרות פתיחה 16650 / בוקר 16651 או כל תא לפני 15:00) — כל התפקידים חוץ ממלצר
    const wk = cellsAll.filter((c: any) => rotasAll.some((r: any) => r.id === c.rota) && !c.is_deleted && [5, 6].includes(c.day)
      && ([16650, 16651, 16652].includes(c.shift) || (c.planned_start && String(c.planned_start) < "15:00")) && c.role !== 34749)
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.planned_start).localeCompare(String(b.planned_start)))
      .map((c: any) => `${String(c.date).slice(0, 10)} d${c.day} s${c.shift} r${c.role} ${String(c.planned_start || "").slice(0, 5)} ${c.employee ? (c.first_name || "") + " " + (c.last_name || "") : "—"}${c.notes ? " [" + c.notes + "]" : ""}`);
    return new Response(JSON.stringify({ roles, fri_sat_mornings: wk }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
