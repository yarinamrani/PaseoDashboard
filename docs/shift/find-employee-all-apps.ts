import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: כל התאים של עובד לפי שם (?q=) בכל האפליקציות (פסאו + אומינו) בטווח תאריכים — משובץ מול החתמות.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

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
const nm = (c: any) => c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : ("—" + (c.notes ? "[" + c.notes + "]" : ""));

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const q = (u.searchParams.get("q") ?? "").toLowerCase(), from = u.searchParams.get("from") ?? "2026-09-27", to = u.searchParams.get("to") ?? "2026-10-17";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const out: Record<string, string[]> = {};
    for (const app of [4281, 4283, 5930, 5931]) {
      if (!(await switchApp(jar, app))) { out[app] = ["switch failed"]; continue; }
      const cells = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json());
      out[app] = cells.filter((c: any) => !c.is_deleted && String(c.date).slice(0, 10) >= from && String(c.date).slice(0, 10) <= to
          && (nm(c).toLowerCase().includes(q) || String(c.notes || "").toLowerCase().includes(q)))
        .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
        .map((c: any) => `${String(c.date).slice(0, 10)} emp${c.employee} ${nm(c)} plan ${hhmm(c.planned_start)} clock ${hhmm(c.clock_start)}-${hhmm(c.clock_end)} man ${hhmm(c.manual_start)}-${hhmm(c.manual_end)}${c.notes ? " [" + c.notes + "]" : ""}`);
    }
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
