import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// יעקב יוסיפוב — ערבים בלבד באמצע השבוע (החלטת ירין 05/09).
// מוחק את תאי הבוקר שלו בימים א׳–ה׳ ברוטה 875579. תאי הערב 18:00 נשארים
// ומשנים משמעות: מסמן של כפולה -> משמרת ערב רגילה.
// שישי (בוקר, לפי הגשתו) לא נוגעים בו.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const APP = 4283, ROTA = 875579;
const R_COOK = 34771, BOKER = 16656;
const YAAKOV = 770028;
const DAYS = [1, 2, 3, 4];   // שני–חמישי. ראשון לא נכלל: התא נערך ידנית ל-15:00 (כשניקולאי יורד). שישי נשאר בוקר.

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
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: APP }), redirect: "manual" });
    eat(sw, jar);
    if (!sw.ok) return new Response(JSON.stringify({ error: `switch failed ${sw.status}` }), { status: 502 });

    const all = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === ROTA && !c.is_deleted);
    const targets = all.filter((c: any) => c.role === R_COOK && Number(c.employee) === YAAKOV
      && c.shift === BOKER && DAYS.includes(Number(c.day)));

    if (!go) {
      return new Response(JSON.stringify({ dry: true, would_delete: targets.map((c: any) => ({ id: c.id, date: c.date, start: c.planned_start })) }, null, 2),
        { headers: { "Content-Type": "application/json" } });
    }

    const deleted: any[] = [], failed: any[] = [];
    for (const c of targets) {
      let r = await fetch(`${BASE}/api/cells/${c.id}/?application=${APP}`, { method: "DELETE", headers: hdrs(jar, true) });
      let how = "DELETE";
      if (!r.ok) {
        r = await fetch(`${BASE}/api/cells/${c.id}/?application=${APP}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ is_deleted: true }) });
        how = "PATCH";
      }
      const t = await r.text();
      if (r.ok) deleted.push({ id: c.id, date: c.date, start: c.planned_start, how });
      else failed.push({ id: c.id, date: c.date, status: r.status, body: t.slice(0, 150) });
    }

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === ROTA && !c.is_deleted);
    const byDay: Record<string, string[]> = {};
    for (const c of after.filter((c: any) => c.role === R_COOK || c.role === 34770)
                         .sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const d = String(c.date).slice(0, 10);
      const who = c.employee ? (c.first_name || "") + (c.last_name ? " " + c.last_name : "") : (c.notes || "ריק");
      (byDay[d] ||= []).push(`${who} ${String(c.planned_start || "").slice(0, 5)}${c.shift === BOKER ? " [בוקר]" : " [ערב]"}`);
    }

    return new Response(JSON.stringify({
      rota: ROTA, deleted: deleted.length, failed: failed.length,
      details: deleted, failures: failed,
      cells_total: after.length, by_day: byDay,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
