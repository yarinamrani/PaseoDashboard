import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: אחמ"שים בפלור 4281 — רוטות לשבוע ?week=, תאי אחמש פסאו 34751 / טאלה 45483 ותאים בלי תפקיד (בלת"ם) בטווח ?from=&to=,
// ואילוצים (/api/requests/) של המנהלים לשבוע. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, AM_P = 34751, AM_T = 45483;
const M: Record<number, string> = { 460064: "ירין", 846387: "זיו", 462134: "עדי", 854534: "אור" };

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
    const from = u.searchParams.get("from") ?? "", to = u.searchParams.get("to") ?? "", week = u.searchParams.get("week") ?? "";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, F_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const g = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json().catch(() => []));
    const rotas = (await g("rotas/")).filter((r: any) => r.application === F_APP && String(r.date).slice(0, 10) === week)
      .map((r: any) => ({ id: r.id, pub: r.is_published, del: r.is_deleted }));
    const cells = (await g("cells/")).filter((c: any) => !c.is_deleted && String(c.date).slice(0, 10) >= from && String(c.date).slice(0, 10) <= to
        && ([AM_P, AM_T].includes(c.role) || M[c.employee] || (!c.role && /אחמ|מנהל|חסר/.test(String(c.notes || "")))))
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)) || String(a.planned_start).localeCompare(String(b.planned_start)))
      .map((c: any) => `${String(c.date).slice(5, 10)} ${c.role === AM_P ? "P" : c.role === AM_T ? "T" : "r" + c.role} s${c.shift} ${hhmm(c.planned_start)}-${hhmm(c.planned_end)} ${who(c)}${c.notes ? " [" + c.notes + "]" : ""} cs=${hhmm(c.clock_start)} r${c.rota} #${c.id}`);
    const reqs: any[] = [];
    for (const id of Object.keys(M).map(Number)) {
      const rs = (await g(`requests/?application=${F_APP}&employee=${id}`)).filter((r: any) => String(r.date ?? r.week ?? "").slice(0, 10) >= from && String(r.date ?? r.week ?? "").slice(0, 10) <= to);
      reqs.push({ who: M[id], n: rs.length, rs: rs.slice(0, 20).map((r: any) => ({ d: r.date, s: r.availability_shift, st: r.state, note: r.notes ?? r.comment ?? "" })) });
    }
    return new Response(JSON.stringify({ rotas, cells, reqs }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
