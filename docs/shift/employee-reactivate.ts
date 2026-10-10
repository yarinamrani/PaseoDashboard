import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// הפעלה מחדש של עובד רדום במטבח 4283 (?emp=). בלי confirm — קריאה בלבד: מצב העובד מול עובד פעיל להשוואה (?ref=), בלי פרטים אישיים.
// ?confirm=1 — מפעיל (user.is_active=true) ורק את זה. לא מדפיס טלפון/ת"ז/מייל/כתובת.
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


const PII = /phone|mobile|email|id_number|identity|passport|address|birth|bank|account|iban|password|token|salary|wage|rate|city|street/i;
function scrub(o: any, depth = 0): any {
  if (o === null || typeof o !== "object") return o;
  if (Array.isArray(o)) return o.slice(0, 8).map((x) => scrub(x, depth + 1));
  const r: any = {};
  for (const [k, v] of Object.entries(o)) r[k] = PII.test(k) ? (v ? "<set>" : v) : depth > 2 ? (typeof v === "object" ? "{…}" : v) : scrub(v, depth + 1);
  return r;
}
Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const emp = Number(u.searchParams.get("emp")), ref = Number(u.searchParams.get("ref") || 0), go = u.searchParams.get("confirm") === "1";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const get = async (id: number) => { const r = await fetch(`${BASE}/api/employees/${id}/?application=${P_APP}`, { headers: hdrs(jar) }); return { s: r.status, j: await r.json().catch(() => null) }; };
    const cur = await get(emp);
    if (!go) return new Response(JSON.stringify({ emp: { s: cur.s, j: scrub(cur.j) }, ref: ref ? scrub((await get(ref)).j) : null }, null, 1), { headers: { "Content-Type": "application/json" } });
    if (!cur.j) return new Response(JSON.stringify({ error: "not found", s: cur.s }), { status: 404 });
    // is_active יושב על user. קודם PATCH מינימלי, ואם לא נקלט — עם אובייקט user מלא (כמו שהאפליקציה שולחת).
    const tries: any[] = [];
    for (const body of [{ user: { id: cur.j.user.id, is_active: true } }, { user: { ...cur.j.user, is_active: true } }]) {
      const r = await fetch(`${BASE}/api/employees/${emp}/?application=${P_APP}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify(body) });
      const t = await r.text();
      const after = await get(emp);
      tries.push({ s: r.status, err: r.ok ? "" : t.replace(/<[^>]*>/g, " ").slice(0, 200), active: after.j?.user?.is_active ?? null });
      if (after.j?.user?.is_active) break;
    }
    return new Response(JSON.stringify({ tries }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
