import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// גביית אוכל 12/09/2026 — בוקר (נעול): פתיחת נעילה → הזנה → שמור וחשב → נעילה מחדש. ערב (פתוח): שמור וחשב בלבד.
// ירין 28/09: "לשחרר נעילת טיפים ולהזין בימים נעולים" — אישור כללי.
// אותו פרוטוקול כמו אפליקציית Shift (reports-controllers.js): PATCH tip-run {is_locked}, POST tips-variable-values, POST tips-calculate.
// ?mode=dry (ברירת מחדל) | go. לא נוגע ב-run במצב 2 (שם unlock = מחיקה).
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const F_APP = 4281, FOOD = 28859, TIP_AM = 3594, TIP_PM = 3595, DATE = "2026-09-12";
const AM: [string, number, number, number][] = [
  ["מאיה אמויאל", 682324, 117806006, 5],
  ["עמית מגן", 715595, 117795405, 20],
  ["אורי משה", 701901, 117806010, 25],
  ["אורן מזרחי", 784494, 117795404, 15],
];

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
    const go = u.searchParams.get("mode") === "go";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    await switchApp(jar, F_APP);
    const api = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${BASE}/api/${path}`, { method, headers: hdrs(jar, method !== "GET"), body: body ? JSON.stringify(body) : undefined });
      const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch {}
      return { s: r.status, j };
    };
    const runs = rowsOf((await api("GET", `tip-run/?application=${F_APP}&date=${DATE}`)).j).filter((r: any) => r.date === DATE);
    const am = runs.find((r: any) => r.tip === TIP_AM), pm = runs.find((r: any) => r.tip === TIP_PM);
    const food = rowsOf((await api("GET", `tips-variable-values/?application=${F_APP}&date=${DATE}`)).j).filter((v: any) => v.date === DATE && v.variable === FOOD);
    const out: Record<string, any> = { go, am_run: am && { id: am.id, mode: am.mode, locked: am.is_locked }, pm_run: pm && { id: pm.id, mode: pm.mode, locked: pm.is_locked },
      food_before: food.map((v: any) => `tip${v.tip} emp${v.employee} cell${v.cell} v=${v.value}`),
      plan_am: AM.map(([n, e, c, v]) => ({ n, v, existing: food.find((x: any) => x.employee === e && x.cell === c)?.value ?? null })) };
    if (!am || !pm) return new Response(JSON.stringify({ ...out, error: "run missing" }), { status: 409 });
    if (am.mode === 2) return new Response(JSON.stringify({ ...out, error: "morning run mode 2 — unlock would delete it; stopping" }), { status: 409 });
    if (!go) return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });

    const steps: any[] = [];
    const wasLocked = am.is_locked;
    if (wasLocked) { const r = await api("PATCH", `tip-run/${am.id}/?application=${F_APP}`, { is_locked: false }); steps.push({ unlock_am: r.s, locked_now: r.j?.is_locked }); if (r.s >= 300) return new Response(JSON.stringify({ ...out, steps }), { status: 502 }); }
    for (const [n, e, c, v] of AM) {
      const ex = food.find((x: any) => x.employee === e && x.cell === c);
      const r = ex ? await api("PATCH", `tips-variable-values/${ex.id}/?application=${F_APP}`, { value: String(v) })
                   : await api("POST", `tips-variable-values/?application=${F_APP}`, { tip: TIP_AM, variable: FOOD, employee: e, cell: c, date: DATE, value: String(v) });
      steps.push({ food: n, v, s: r.s });
    }
    const calcAm = await api("POST", `tips-calculate/?application=${F_APP}`, { tip: TIP_AM, date: DATE });
    steps.push({ calc_am: calcAm.s, run: calcAm.j?.run ? { id: calcAm.j.run.id, locked: calcAm.j.run.is_locked } : String(JSON.stringify(calcAm.j)).slice(0, 300) });
    const newAmId = calcAm.j?.run?.id ?? am.id;
    if (wasLocked) { const r = await api("PATCH", `tip-run/${newAmId}/?application=${F_APP}`, { is_locked: true }); steps.push({ relock_am: r.s, locked_now: r.j?.is_locked, run: newAmId }); }
    const calcPm = await api("POST", `tips-calculate/?application=${F_APP}`, { tip: TIP_PM, date: DATE });
    steps.push({ calc_pm: calcPm.s, run: calcPm.j?.run ? { id: calcPm.j.run.id, locked: calcPm.j.run.is_locked } : String(JSON.stringify(calcPm.j)).slice(0, 300) });
    const outSample = (o: any) => { const s = JSON.stringify(o ?? {}); return s.length > 2500 ? s.slice(0, 2500) : s; };
    out.steps = steps;
    out.calc_am_output = outSample(calcAm.j?.output);
    out.calc_pm_output = outSample(calcPm.j?.output);
    const after = rowsOf((await api("GET", `tips-variable-values/?application=${F_APP}&date=${DATE}`)).j).filter((v: any) => v.date === DATE && v.variable === FOOD);
    out.food_after = after.map((v: any) => `tip${v.tip} emp${v.employee} cell${v.cell} v=${v.value}`);
    const runsAfter = rowsOf((await api("GET", `tip-run/?application=${F_APP}&date=${DATE}`)).j).filter((r: any) => r.date === DATE);
    out.runs_after = runsAfter.map((r: any) => ({ id: r.id, tip: r.tip, locked: r.is_locked, mode: r.mode }));
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
