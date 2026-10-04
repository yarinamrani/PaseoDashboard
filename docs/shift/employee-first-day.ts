import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: מחפש עובד לפי ?name= ו/או ?phone= בכל האפליקציות (?apps=4281,4283) ומחזיר תאריך משמרת ראשונה מתוכננת והחתמה ראשונה. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APPS = [4281, 4283];

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

const digits = (s: any) => String(s ?? "").replace(/\D/g, "").replace(/^972/, "0");

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const name = (u.searchParams.get("name") ?? "").trim(), phone = digits(u.searchParams.get("phone"));
    if (!name && !phone) return new Response(JSON.stringify({ error: "name or phone required" }), { status: 400 });
    const apps = (u.searchParams.get("apps") ?? APPS.join(",")).split(",").map(Number);
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const out: any[] = [];
    for (const app of apps) {
      if (!(await switchApp(jar, app))) { out.push({ app, error: "switch failed" }); continue; }
      const emps = rowsOf(await (await fetch(`${BASE}/api/employees/?application=${app}`, { headers: hdrs(jar) })).json());
      const hits = emps.filter((e: any) => {
        const full = `${e.user?.first_name ?? e.first_name ?? ""} ${e.user?.last_name ?? e.last_name ?? ""}`.trim();
        const ph = digits(e.user?.phone_number ?? e.phone_number);
        return (phone && ph && ph === phone) || (name && name.split(/\s+/).every((w) => full.includes(w)));
      });
      if (!hits.length) { out.push({ app, hits: 0 }); continue; }
      const cells = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json());
      // ‏/api/cells/ מחזיר חלון היסטוריה מוגבל — מדווחים את התאריך המוקדם בחלון כדי לדעת אם "משמרת ראשונה" אמיתית או חתוכה.
      const window_from = cells.map((c: any) => String(c.date).slice(0, 10)).sort()[0] ?? null;
      for (const e of hits) {
        const mine = cells.filter((c: any) => c.employee === e.id && !c.is_deleted).map((c: any) => ({ d: String(c.date).slice(0, 10), clk: !!(c.clock_start || c.manual_start) }))
          .sort((a: any, b: any) => a.d.localeCompare(b.d));
        out.push({ app, id: e.id, name: `${e.user?.first_name ?? e.first_name ?? ""} ${e.user?.last_name ?? e.last_name ?? ""}`.trim(),
          active: e.is_active ?? e.user?.is_active ?? null, created: e.created ?? e.date_joined ?? e.user?.date_joined ?? null,
          start_date: e.start_date ?? e.employment_start_date ?? e.hire_date ?? null,
          window_from, first_planned: mine[0]?.d ?? null, first_clock: mine.find((x: any) => x.clk)?.d ?? null, shifts: mine.length,
          keys: Object.keys(e).filter((k) => /date|start|creat|join|hire/i.test(k)) });
      }
    }
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
