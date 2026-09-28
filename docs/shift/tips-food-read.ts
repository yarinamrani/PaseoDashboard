import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: לתאריך נתון (?date=YYYY-MM-DD) — ריצות הטיפים של פסאו רצפה (4281), העובדים בכל ריצה
// (שם מלא, תא, משמרת, תפקיד), ערך "גביית אוכל" (משתנה 28859) הקיים, והאם הריצה נעולה. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, FOOD = 28859;
const TIPS: Record<number, string> = { 3594: "בוקר", 3595: "ערב", 3798: "סושי בוקר", 3656: "סושי ערב" };

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
    const date = u.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("date=YYYY-MM-DD required", { status: 400 });
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, F_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });
    const g = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json().catch(() => []));

    const runs = (await g(`tip-run/?application=${F_APP}&date=${date}`)).filter((r: any) => r.date === date);
    const vals = (await g(`tips-variable-values/?application=${F_APP}&date=${date}`)).filter((v: any) => v.date === date);
    const food = vals.filter((v: any) => v.variable === FOOD);
    const out: any[] = [];
    for (const r of runs) {
      const res = (await g(`tip-run-results/?application=${F_APP}&run=${r.id}`)).filter((x: any) => x.run === r.id && x.employee);
      out.push({ run: r.id, tip: r.tip, tip_name: TIPS[r.tip] ?? String(r.tip), locked: r.is_locked, locked_at: r.locked_at,
        employees: res.map((x: any) => {
          const f = food.filter((v: any) => v.employee === x.employee && (v.cell === x.result?.cell_id || !v.cell));
          return { emp: x.employee, name: x.result?.employee, cell: x.result?.cell_id, shift: x.result?.shift, role: x.result?.role,
            start: String(x.result?.start ?? "").slice(11, 16), end: String(x.result?.end ?? "").slice(11, 16), food_now: f.map((v: any) => v.value) };
        }) });
    }
    const orphanFood = food.filter((v: any) => !out.some((r: any) => r.employees.some((e: any) => e.emp === v.employee))).map((v: any) => `emp${v.employee} cell${v.cell} tip${v.tip} v=${v.value}`);
    return new Response(JSON.stringify({ date, runs: out, food_rows_total: food.length, food_without_run: orphanFood, food_row_keys: food[0] ? Object.keys(food[0]) : [] }, null, 1),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
