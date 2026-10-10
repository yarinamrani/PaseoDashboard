import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: טבחים במטבח 4283 — עובדים לפי ?names=a,b (כל התפקידים, כולל לא פעילים) + כל תאי הטבח/שוטף בטווח ?from=&to= + רוטות לשבוע ?week=. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, COOK = 34771, DISH = 34937;
const EMPS = [847151, 770028, 851353, 543969, 852125, 849311, 853229, 765292, 765295, 732289, 808241, 811255, 829782];

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
const who = (c: any) => c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() || String(c.employee) : "—";


Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const names = (u.searchParams.get("names") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "", week = u.searchParams.get("week") ?? "";
    const roles: Record<number, string> = {};
    for (const r of rowsOf(await (await fetch(`${BASE}/api/roles/?application=${P_APP}`, { headers: hdrs(jar) })).json())) roles[r.id] = r.name;
    const emps = rowsOf(await (await fetch(`${BASE}/api/employees/?application=${P_APP}`, { headers: hdrs(jar) })).json())
      .map((e: any) => ({ id: e.id, name: `${e.user?.first_name ?? e.first_name ?? ""} ${e.user?.last_name ?? e.last_name ?? ""}`.trim(),
        roles: (e.roles ?? []).map((r: any) => roles[typeof r === "object" ? r.id ?? r.role : r] ?? r), active: e.is_active ?? e.user?.is_active ?? null }))
      .filter((e: any) => names.some((n) => e.name.toLowerCase().includes(n)));
    const rotas = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json())
      .filter((r: any) => r.application === P_APP && week && String(r.date).slice(0, 10) === week)
      .map((r: any) => ({ id: r.id, date: r.date, pub: r.is_published, del: r.is_deleted }));
    const cells = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => !c.is_deleted && String(c.date).slice(0, 10) >= from && String(c.date).slice(0, 10) <= to)
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || a.shift - b.shift || String(a.planned_start).localeCompare(String(b.planned_start)))
      .map((c: any) => `${String(c.date).slice(5, 10)} ${c.role === COOK ? "C" : c.role === DISH ? "D" : "R" + c.role} ${c.shift === 16656 ? "AM" : c.shift === 21796 ? "PM" : "s" + c.shift} ${hhmm(c.planned_start)}-${hhmm(c.planned_end)} ${who(c)}${c.notes ? " [" + c.notes + "]" : ""} #${c.id} r${c.rota}`);
    return new Response(JSON.stringify({ emps, rotas, cells }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
