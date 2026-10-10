import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שוטפים 11–17/10 (רוטה 889255) — ירין 10/10: "תמחק את גרמי ואת האומינו מהסידור שוטפים".
// מוחק: כל תאי גרמי (Germay `778534`) + כל תא שוטף עם הערה umino/אומינו + תא אנזו ד' 10:30 בלי הערה
// (אותו תא אומינו כמו ג' 10:30 [umino]; בפסאו יש בבוקר אמצע שבוע שוטף אחד, ג'ונתן 10:00).
// בלי confirm — רק מציג מה יימחק ואת מצב השוטפים. ?confirm=1 למחיקה. לא מפרסם.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, P_ROTA = 889255, DISH = 34937, B = 16656;
const GERMAY = 778534, EXTRA_IDS = [119637722];

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
    const go = u.searchParams.get("confirm") === "1";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const load = async () => rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === DISH);
    const show = (l: any[]) => l.sort((x: any, y: any) => x.day - y.day || x.shift - y.shift || String(x.planned_start).localeCompare(String(y.planned_start)))
      .map((c: any) => `d${c.day} ${c.shift === B ? "B" : "E"} ${hhmm(c.planned_start)}${c.planned_end ? "-" + hhmm(c.planned_end) : ""} ${who(c)}${c.notes ? " [" + c.notes + "]" : ""} #${c.id}`);
    const cells = await load();
    const del = cells.filter((c: any) => c.employee === GERMAY || /umino|אומינו/i.test(String(c.notes || "")) || EXTRA_IDS.includes(c.id));
    if (!go) return new Response(JSON.stringify({ dry: true, delete: show([...del]), all: show(cells) }, null, 1), { headers: { "Content-Type": "application/json" } });
    const res: any[] = [];
    for (const c of del) {
      const r = await fetch(`${BASE}/api/cells/${c.id}/?application=${P_APP}`, { method: "DELETE", headers: hdrs(jar, true) });
      await r.text(); res.push({ id: c.id, s: r.status });
    }
    return new Response(JSON.stringify({ res, after: show(await load()) }, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
