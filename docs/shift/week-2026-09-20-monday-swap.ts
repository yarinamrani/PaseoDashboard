import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// יום שני 21/09 (פתיחה 20:00 אחרי הצום) — ירין ביקש את אנזו וג'ונתן
// במקום פטל והילארי. שומר את השעות, ההערות והמבנה; מחליף רק את העובד.
//   פסאו  20:00: פטל (808241)   -> אנזו (765295)
//   אומינו 20:00: הילארי (732289) -> ג'ונתן (765292)   [הערה "אומינו" נשמרת]
// הרוטה נשארת טיוטה — הפונקציה לא מפרסמת.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const P_APP = 4283, P_ROTA = 881056, P_ROLE = 34937, P_BOKER = 16656, P_EREV = 21796;
const MONDAY = 1;
const SWAPS: { from: number; to: number; tag: boolean; who: string }[] = [
  { from: 808241, to: 765295, tag: false, who: "פטל -> אנזו (פסאו)" },
  { from: 732289, to: 765292, tag: true,  who: "הילארי -> ג'ונתן (אומינו)" },
];

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
// PATCH דורש version תואם, אחרת 409.
async function patchCell(jar: Record<string, string>, app: number, cur: any, fields: Record<string, unknown>) {
  let ver = Number(cur.version ?? 0), last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/api/cells/${cur.id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...cur, version: ver, ...fields }) });
    const t = await r.text();
    if (r.ok) return { ok: true };
    last = `${r.status} ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`;
    if (r.status === 409) { try { const j = JSON.parse(t); if (typeof j?.version === "number") ver = j.version + 1; } catch { ver++; } }
    else break;
  }
  return { ok: false, last };
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
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);
    const mon = live.filter((c: any) => c.day === MONDAY);

    const plan: any[] = [], done: any[] = [], failed: any[] = [];
    for (const s of SWAPS) {
      const cur = mon.find((c: any) => Number(c.employee) === s.from
        && String(c.notes || "").includes("אומינו") === s.tag);
      if (!cur) {
        const already = mon.find((c: any) => Number(c.employee) === s.to && String(c.notes || "").includes("אומינו") === s.tag);
        (already ? done : failed).push({ swap: s.who, note: already ? "כבר מוחלף" : "לא נמצא תא מתאים" });
        continue;
      }
      plan.push({ swap: s.who, id: cur.id, start: hhmm(cur.planned_start), notes: cur.notes });
      if (!go) continue;
      const res = await patchCell(jar, P_APP, cur, { employee: s.to });
      if (res.ok) done.push({ swap: s.who, id: cur.id }); else failed.push({ swap: s.who, id: cur.id, last: res.last });
    }

    if (!go) return new Response(JSON.stringify({ dry: true, monday_cells: mon.length, plan, done, failed }, null, 2),
      { headers: { "Content-Type": "application/json" } });

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);

    const by: Record<string, string[]> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      const tag = c.employee && String(c.notes || "").includes("אומינו") ? "  <-- אומינו" : "";
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start) || "--:--"} ${who}${c.shift === P_BOKER ? " [בוקר]" : " [ערב]"}${tag}`);
    }
    return new Response(JSON.stringify({ done, failed, is_published: pRota?.is_published ?? null, cells: after.length, by_day: by }, null, 2),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
