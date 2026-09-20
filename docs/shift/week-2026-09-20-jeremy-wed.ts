import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שוטף שלישי לפסאו ברביעי 23/09. טוני לא זמין; אנזו כבר בערב של רביעי,
// ולכן כפולה שלו שם לא מוסיפה גוף לערב. נשארו ג'ונתן או ג'רמי — מחיר זהה
// (שניהם סוגרים ד' ופותחים ה' ב-10:00). נבחר ג'רמי כי הוא פחות עמוס (5 מול 6).
// ג'רמי כבר עובד ד' בוקר באומינו 10:00 -> מוסיפים לו פסאו ערב 19:00.
// פסאו ערב רביעי יעבור מ-2 ל-3: הילארי 17:00 · אנזו 18:00 · ג'רמי 19:00.
// הרוטה נשארת טיוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-20";
const P_APP = 4283, P_ROTA = 881056, DISH = 34937, EREV = 21796, BOKER = 16656;
const JEREMY = 829782;
const WED = 3, START = "19:00";

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
const isU = (c: any) => String(c.notes || "").includes("אומינו");
function dateOf(day: number) {
  const d = new Date(WEEK + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === DISH);

    const dup = live.find((c: any) => c.day === WED && c.shift === EREV
      && Number(c.employee) === JEREMY && hhmm(c.planned_start) === START);
    if (dup) return new Response(JSON.stringify({ skipped: "ג'רמי כבר משובץ ד' ערב 19:00", id: dup.id }, null, 2),
      { headers: { "Content-Type": "application/json" } });

    const date = dateOf(WED);
    const orders = new Set(live.filter((c: any) => c.day === WED).map((c: any) => Number(c.order || 0)));
    let order = 1; while (orders.has(order)) order++;

    if (!go) {
      return new Response(JSON.stringify({ dry: true, would_create: { date, emp: JEREMY, start: START, order },
        wednesday_now: live.filter((c: any) => c.day === WED).map((c: any) =>
          `${hhmm(c.planned_start)} ${c.employee}${isU(c) ? " (אומינו)" : ""}${c.shift === BOKER ? " [בוקר]" : " [ערב]"}`) }, null, 2),
        { headers: { "Content-Type": "application/json" } });
    }

    const payload = {
      rota: P_ROTA, sub_rota: null, shift: EREV, day: WED, date, role: DISH, employee: JEREMY, order,
      planned_start: `${START}:00`, planned_end: null,
      planned_start_full: `${date}T${START}:00`, planned_end_full: null,
      manual_start: null, manual_end: null,
      work_code: 0, break_duration: 0, waiting: 0,
      absence: "", notes: "", highlight: "",
    };
    const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
    const t = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: `create ${r.status}`, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 200) }), { status: 502 });

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === DISH);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r2: any) => r2.id === P_ROTA);

    const by: Record<string, string[]> = {}; const per: Record<string, number> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      if (c.employee) per[who] = (per[who] || 0) + 1;
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start)} ${who}${c.shift === BOKER ? " [בוקר]" : " [ערב]"}${isU(c) ? " (אומינו)" : ""}`);
    }
    return new Response(JSON.stringify({ created: 1, is_published: pRota?.is_published ?? null,
      dish_cells: after.length, per_person: per, wednesday: by[dateOf(WED)] }, null, 2),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
