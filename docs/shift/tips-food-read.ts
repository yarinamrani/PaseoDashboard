import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: לכל תאריך ב-?dates=YYYY-MM-DD,YYYY-MM-DD — עובדי פסאו רצפה (4281) שהחתימו (שם, משמרת, תפקיד, שעות, תא),
// ריצות הטיפים (נעילה/mode), וערכי "גביית אוכל" (28859) קיימים. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, FOOD = 28859;
const TIPS: Record<number, string> = { 3594: "בוקר", 3595: "ערב", 3798: "סושי בוקר", 3656: "סושי ערב" };
const SH: Record<number, string> = { 16650: "פתיחה", 16651: "בוקר", 16647: "פתיחה ערב", 16648: "ערב", 16649: "סגירה", 16652: "SB" };
const RL: Record<number, string> = { 34749: "מלצר", 34750: "בר", 34751: "אחמש", 34752: "מתלמד מלצר", 34753: "מתלמד בר", 34754: "מארחת", 34756: "מתלמדת מארחת", 35342: "מלצר טאלה", 45481: "ראנר טאלה", 45482: "מתלמד טאלה", 45483: "אחמש טאלה", 50791: "מארחת טאלה", 51036: "בר טאלה", 34755: "מארחת למעלה" };

async function cfg(k: string): Promise<string> { const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
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
    const dates = (u.searchParams.get("dates") ?? "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    await switchApp(jar, F_APP);
    const g = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json().catch(() => []));
    const cells = await g("cells/");
    const out: Record<string, any> = {};
    for (const date of dates) {
      const day = cells.filter((c: any) => String(c.date).slice(0, 10) === date && !c.is_deleted && c.employee && (c.clock_start || c.manual_start))
        .sort((a: any, b: any) => String(a.clock_start ?? a.manual_start).localeCompare(String(b.clock_start ?? b.manual_start)));
      const runs = (await g(`tip-run/?application=${F_APP}&date=${date}`)).filter((r: any) => r.date === date);
      const food = (await g(`tips-variable-values/?application=${F_APP}&date=${date}`)).filter((v: any) => v.date === date && v.variable === FOOD);
      out[date] = {
        runs: runs.map((r: any) => `${TIPS[r.tip] ?? r.tip} run${r.id} mode${r.mode} ${r.is_locked ? "נעול" : "פתוח"}`),
        worked: day.map((c: any) => `${String(c.clock_start ?? c.manual_start).slice(0, 5)}-${String(c.clock_end ?? c.manual_end ?? "").slice(0, 5)} | ${c.first_name} ${c.last_name} | ${SH[c.shift] ?? c.shift} | ${RL[c.role] ?? c.role} | emp${c.employee} cell${c.id}`),
        food: food.map((v: any) => `${TIPS[v.tip] ?? v.tip} emp${v.employee} cell${v.cell} v=${v.value}`),
      };
    }
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
