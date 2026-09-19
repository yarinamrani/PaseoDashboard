import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// הערת גיל (19/09): לא לערבב את פטל והילארי בין המסעדות יום-יום.
// אף אחד מהם לא עבד באומינו בערב, ולכן מי שנכנס לשם צריך להישאר שם
// לאורך כל השבוע — ורק בשבוע הבא מחליפים ביניהם.
// המימוש: החלפה אחת ברביעי 23/09 —
//   פסאו  ערב 17:00: פטל   -> הילארי
//   אומינו ערב 18:00: הילארי -> פטל
// אחרי זה: פטל מחזיק את כל ערבי אומינו (ג'/ד'/ה'), הילארי כולה בפסאו.
// שישי פטל בפסאו כי אומינו סגורה בשישי בערב. הרוטה נשארת טיוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const P_APP = 4283, P_ROTA = 881056, P_ROLE = 34937, P_BOKER = 16656;
const E = { JONATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255, JEREMY: 829782 };
const WED = 3;

type Op = { label: string; day: number; tag: boolean; emp: number; start: string; setEmp: number };
const OPS: Op[] = [
  { label: "ד' פסאו ערב 17:00 פטל -> הילארי",  day: WED, tag: false, emp: E.PATEL,   start: "17:00", setEmp: E.HILLARY },
  { label: "ד' אומינו ערב 18:00 הילארי -> פטל", day: WED, tag: true,  emp: E.HILLARY, start: "18:00", setEmp: E.PATEL },
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
const isU = (c: any) => String(c.notes || "").includes("אומינו");

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

    const plan: any[] = [], done: any[] = [], skipped: any[] = [], failed: any[] = [];
    for (const op of OPS) {
      const cur = live.find((c: any) => c.day === op.day && isU(c) === op.tag
        && Number(c.employee) === op.emp && hhmm(c.planned_start) === op.start);
      if (!cur) { skipped.push({ op: op.label, why: "לא נמצא תא תואם — כנראה כבר בוצע" }); continue; }
      plan.push({ op: op.label, id: cur.id });
      if (!go) continue;
      const res = await patchCell(jar, P_APP, cur, { employee: op.setEmp });
      if (res.ok) { done.push({ op: op.label, id: cur.id }); cur.employee = op.setEmp; }
      else failed.push({ op: op.label, id: cur.id, err: res.last });
    }

    if (!go) return new Response(JSON.stringify({ dry: true, plan, skipped }, null, 2), { headers: { "Content-Type": "application/json" } });

    const after = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);

    const by: Record<string, string[]> = {}; const per: Record<string, number> = {};
    const venueOf: Record<string, { paseo: number; umino: number }> = {};
    for (const c of after.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      if (c.employee) {
        per[who] = (per[who] || 0) + 1;
        const v = (venueOf[who] ||= { paseo: 0, umino: 0 });
        if (isU(c)) v.umino++; else v.paseo++;
      }
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start) || "--:--"} ${who}${c.shift === P_BOKER ? " [בוקר]" : " [ערב]"}${c.employee && isU(c) ? "  <-- אומינו" : ""}`);
    }
    return new Response(JSON.stringify({
      done: done.length, skipped, failed, is_published: pRota?.is_published ?? null,
      cells: after.length, assigned: after.filter((c: any) => c.employee).length,
      holes: after.filter((c: any) => !c.employee).length,
      per_person: per, per_venue: venueOf, by_day: by,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
