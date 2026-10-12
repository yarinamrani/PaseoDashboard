// תאים בשיפט: ?ids= קריאת תא מלא; ?emp=&date= תאים של עובד בתאריך; ?create=1&confirm=1&body=<json> → POST; ?patch=<id>&confirm=1&body=<json> → PATCH (נפרס בסלוט shift-open-week-dish, 12/10)
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
  const dall = u.searchParams.get("dayall"); // ?dayall=YYYY-MM-DD — כל התאים של היום עם שם תפקיד ומשמרת
  if (dall) {
    const get = async (p: string) => { const x = await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) }); const j = await x.json().catch(() => []); return Array.isArray(j) ? j : (j?.results ?? []); };
    const roles = new Map((await get(`roles/?application=${app}`)).map((x: any) => [x.id, x.name]));
    const shifts = new Map((await get(`shifts/?application=${app}`)).map((x: any) => [x.id, x.name]));
    const hm = (t: any) => t ? String(t).slice(0, 5) : "";
    out.dayall = (await get("cells/")).filter((c: any) => !c.is_deleted && String(c.date).slice(0, 10) === dall)
      .map((c: any) => ({ n: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(), emp: c.employee, role: roles.get(c.role) ?? c.role, shift: shifts.get(c.shift) ?? c.shift,
        p: `${hm(c.planned_start)}-${hm(c.planned_end)}`, c: `${hm(c.clock_start)}-${hm(c.clock_end)}`, m: `${hm(c.manual_start)}-${hm(c.manual_end)}`, abs: c.absence, notes: c.notes }));
  }
  const from = u.searchParams.get("scan"); // ?scan=YYYY-MM-DD — תאים עם יציאה בלי כניסה + שאר התאים של אותו עובד באותו יום
  if (from) {
    const j = await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json().catch(() => []);
    const rows = (Array.isArray(j) ? j : (j?.results ?? [])).filter((c: any) => !c.is_deleted && c.employee && String(c.date).slice(0, 10) >= from);
    const hm = (t: any) => t ? String(t).slice(0, 5) : "-";
    const sum = (c: any) => `${c.id} p${hm(c.planned_start)}-${hm(c.planned_end)} c${hm(c.clock_start)}-${hm(c.clock_end)} m${hm(c.manual_start)}-${hm(c.manual_end)}`;
    out.scan = rows.filter((c: any) => !c.clock_start && c.clock_end).map((c: any) => ({
      d: String(c.date).slice(0, 10), n: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(), cell: sum(c),
      sib: rows.filter((x: any) => x.employee === c.employee && x.date === c.date && x.id !== c.id).map(sum) }));
  }
  if (u.searchParams.get("create") === "1" && u.searchParams.get("confirm") === "1") {
    const p = await fetch(`${BASE}/api/cells/?application=${app}`, { method: "POST", headers: hdrs(jar, true), body: u.searchParams.get("body") ?? "{}" });
    const t = await p.text(); let jj: any = t; try { jj = JSON.parse(t); } catch { /* */ }
    out.create = { s: p.status, body: jj };
  }
  const pid = Number(u.searchParams.get("patch") ?? 0); // ?patch=<id>&confirm=1&body=<json> → PATCH (version נלקח מהתא)
  if (pid && u.searchParams.get("confirm") === "1") {
    const cur = await (await fetch(`${BASE}/api/cells/${pid}/?application=${app}`, { headers: hdrs(jar) })).json();
    const p = await fetch(`${BASE}/api/cells/${pid}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ ...JSON.parse(u.searchParams.get("body") ?? "{}"), version: cur.version }) });
    const t = await p.text(); let jj: any = t; try { jj = JSON.parse(t); } catch { /* */ }
    out.patch = { s: p.status, notes: jj?.notes, ms: jj?.manual_start, ce: jj?.clock_end };
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
});
