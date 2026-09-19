import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// התאמת סידור השוטפים ליום כיפור:
//   ראשון 20/09 — סגור כל היום בשתי המסעדות.
//   שני   21/09 — פתיחה ב-20:00 (צום יוצא במוצאי שני), אין בוקר.
// פסאו (רוטה 881056): מוחק את כל יום ראשון, מוחק את בוקר שני,
//   ומעביר את שתי משמרות הערב של שני ל-20:00. חור "חסר שוטף" של שני נמחק —
//   ליל פתיחה קצר לא צריך שני שוטפים בפסאו.
// אומינו (רוטה 880896): מוחק את משבצות השוטף של ראשון ושל בוקר שני.
// הכל נשאר טיוטה — הפונקציה לא מפרסמת.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const P_APP = 4283, P_ROTA = 881056, P_ROLE = 34937, P_BOKER = 16656, P_EREV = 21796;
const U_APP = 5931, U_ROTA = 880896, U_ROLE = 52707, U_BOKER = 21850;
const OPEN_MON = "20:00";

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

async function delCell(jar: Record<string, string>, app: number, id: number) {
  let r = await fetch(`${BASE}/api/cells/${id}/?application=${app}`, { method: "DELETE", headers: hdrs(jar, true) });
  if (!r.ok) r = await fetch(`${BASE}/api/cells/${id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ is_deleted: true }) });
  await r.text();
  return r.ok;
}
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

    // ---------- פסאו ----------
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });
    const pLive = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);

    const pDel = pLive.filter((c: any) =>
      c.day === 0                                        // ראשון — סגור לגמרי
      || (c.day === 1 && c.shift === P_BOKER)            // שני — אין בוקר
      || (c.day === 1 && c.shift === P_EREV && c.employee === null)); // החור של שני
    const pMove = pLive.filter((c: any) =>
      c.day === 1 && c.shift === P_EREV && c.employee !== null && hhmm(c.planned_start) !== OPEN_MON);

    // ---------- אומינו ----------
    if (!(await switchApp(jar, U_APP))) return new Response(JSON.stringify({ error: "switch 5931 failed" }), { status: 502 });
    const uLive = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted && c.role === U_ROLE);
    const uDel = uLive.filter((c: any) => c.day === 0 || (c.day === 1 && c.shift === U_BOKER));

    const plan = {
      paseo_delete: pDel.map((c: any) => ({ id: c.id, date: c.date, start: hhmm(c.planned_start), who: c.employee, notes: c.notes })),
      paseo_move_to_2000: pMove.map((c: any) => ({ id: c.id, date: c.date, from: hhmm(c.planned_start), who: c.employee, notes: c.notes })),
      umino_delete: uDel.map((c: any) => ({ id: c.id, date: c.date, shift: c.shift })),
    };
    if (!go) return new Response(JSON.stringify({ dry: true, plan }, null, 2), { headers: { "Content-Type": "application/json" } });

    const done: any = { paseo_deleted: [], paseo_moved: [], umino_deleted: [], failed: [] };
    for (const c of uDel) { if (await delCell(jar, U_APP, c.id)) done.umino_deleted.push(c.id); else done.failed.push({ app: U_APP, id: c.id, op: "del" }); }

    await switchApp(jar, P_APP);
    for (const c of pDel) { if (await delCell(jar, P_APP, c.id)) done.paseo_deleted.push(c.id); else done.failed.push({ app: P_APP, id: c.id, op: "del" }); }
    for (const c of pMove) {
      const date = String(c.date).slice(0, 10);
      const res = await patchCell(jar, P_APP, c, { planned_start: `${OPEN_MON}:00`, planned_start_full: `${date}T${OPEN_MON}:00` });
      if (res.ok) done.paseo_moved.push({ id: c.id, to: OPEN_MON }); else done.failed.push({ app: P_APP, id: c.id, op: "move", last: res.last });
    }

    // ---------- אימות ----------
    const pAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === P_ROLE);
    const pRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === P_ROTA);
    await switchApp(jar, U_APP);
    const uAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted && c.role === U_ROLE);

    const by: Record<string, string[]> = {};
    for (const c of pAfter.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
      const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
      const tag = c.employee && String(c.notes || "").includes("אומינו") ? "  <-- אומינו" : "";
      (by[String(c.date).slice(0, 10)] ||= []).push(`${hhmm(c.planned_start) || "--:--"} ${who}${c.shift === P_BOKER ? " [בוקר]" : " [ערב]"}${tag}`);
    }

    return new Response(JSON.stringify({
      done_counts: { paseo_deleted: done.paseo_deleted.length, paseo_moved: done.paseo_moved.length,
                     umino_deleted: done.umino_deleted.length, failed: done.failed.length },
      failures: done.failed,
      paseo: { rota: P_ROTA, is_published: pRota?.is_published ?? null, cells: pAfter.length, by_day: by },
      umino_dish_slots_left: uAfter.length,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
