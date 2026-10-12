// תאים בשיפט: ?ids= קריאת תא מלא; ?emp=&date= תאים של עובד בתאריך; ?create=1&confirm=1&body=<json> → POST /api/cells/ (נפרס בסלוט shift-open-week-dish, 12/10)
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
async function cfg(k: string) { const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
function eat(res: Response, jar: Record<string, string>) {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of raw) { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
}
const jarStr = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
function hdrs(jar: Record<string, string>, post = false) {
  const h: Record<string, string> = { "User-Agent": UA, "Accept": "application/json", "Cookie": jarStr(jar), "Referer": `${BASE}/app/home/` };
  if (post) { h["Content-Type"] = "application/json"; h["Origin"] = BASE; }
  if (jar["csrftoken"]) h["X-CSRFToken"] = jar["csrftoken"];
  return h;
}
// קריאה: ?ids=..  מחזיר תא מלא; ?emp=&date= מחזיר תאים של עובד בתאריך. כתיבה: ?create=1&confirm=1&body=<json> → POST /api/cells/
Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
  const app = Number(u.searchParams.get("app") ?? 4283), jar: Record<string, string> = {};
  const g = await fetch(`${BASE}/app/login/`, { headers: { "User-Agent": UA }, redirect: "manual" }); eat(g, jar);
  const r = await fetch(`${BASE}/api/auth/login/`, { method: "POST", headers: { ...hdrs(jar, true), "Referer": `${BASE}/app/login/` }, body: JSON.stringify({ username: await cfg("SHIFT_USERNAME"), company: await cfg("SHIFT_COMPANY"), password: await cfg("SHIFT_PASSWORD") }), redirect: "manual" }); eat(r, jar);
  const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" }); eat(sw, jar);
  const out: any = {};
  for (const id of (u.searchParams.get("ids") ?? "").split(",").filter(Boolean)) {
    const x = await fetch(`${BASE}/api/cells/${id}/?application=${app}`, { headers: hdrs(jar) }); out[id] = x.ok ? await x.json() : x.status;
  }
  const emp = Number(u.searchParams.get("emp") ?? 0), date = u.searchParams.get("date");
  if (emp && date) {
    const j = await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json().catch(() => []);
    const rows = Array.isArray(j) ? j : (j?.results ?? []);
    out.day = rows.filter((c: any) => c.employee === emp && String(c.date).slice(0, 10) === date)
      .map((c: any) => ({ id: c.id, is_deleted: c.is_deleted, ps: c.planned_start, cs: c.clock_start, ce: c.clock_end, ms: c.manual_start, me: c.manual_end, msf: c.manual_start_full, mef: c.manual_end_full, role: c.role, shift: c.shift }));
  }
  if (u.searchParams.get("create") === "1" && u.searchParams.get("confirm") === "1") {
    const p = await fetch(`${BASE}/api/cells/?application=${app}`, { method: "POST", headers: hdrs(jar, true), body: u.searchParams.get("body") ?? "{}" });
    const t = await p.text(); let jj: any = t; try { jj = JSON.parse(t); } catch { /* */ }
    out.create = { s: p.status, body: jj };
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
});
