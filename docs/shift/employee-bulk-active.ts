// השבתה / הפעלה מרוכזת של עובדים בשיפט ("עובדים רדומים").
// ?app=4281|4283&ids=1,2,3 — בלי confirm: קריאה בלבד (שם + מצב נוכחי). &confirm=1 — קובע user.is_active (&active=1 להפעלה, ברירת מחדל השבתה).
// חבילות של עד ~25 עובדים לקריאה (זמן ריצה). לא מדפיס פרטים אישיים.
import { createClient } from "jsr:@supabase/supabase-js@2";

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
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("secret") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
    const app = Number(u.searchParams.get("app")), want = u.searchParams.get("active") === "1", go = u.searchParams.get("confirm") === "1";
    const ids = (u.searchParams.get("ids") ?? "").split(",").map(Number).filter(Boolean);
    if (![4281, 4283, 5930, 5931].includes(app) || !ids.length) return json({ error: "app/ids" }, 400);
    const jar: Record<string, string> = {};
    if (!(await login(jar)) || !(await switchApp(jar, app))) return json({ error: "login/switch failed" }, 502);
    const get = async (id: number) => { const r = await fetch(`${BASE}/api/employees/${id}/?application=${app}`, { headers: hdrs(jar) }); return r.ok ? await r.json() : null; };
    const out: any[] = [];
    for (const id of ids) {
      const cur = await get(id);
      const name = cur ? `${cur.user?.first_name ?? ""} ${cur.user?.last_name ?? ""}`.trim() : null;
      if (!cur) { out.push({ id, err: "not found" }); continue; }
      if (cur.user?.is_active === want) { out.push({ id, name, already: true }); continue; }
      if (!go) { out.push({ id, name, active: cur.user?.is_active }); continue; }
      const r = await fetch(`${BASE}/api/employees/${id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ user: { id: cur.user.id, is_active: want } }) });
      const after = await get(id);
      out.push({ id, name, s: r.status, ok: after?.user?.is_active === want });
    }
    return json({ app, want, go, n: out.length, ok: out.filter((x) => x.ok || x.already).length, fail: out.filter((x) => go && !x.ok && !x.already), out });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
