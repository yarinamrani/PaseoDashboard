import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// פתיחת רשומת עובד למולו (ירין 25/09: "תקרא לו רק מולו"). טבח, מטבח פסאו, חברה 1800.
// הגדרות הועתקו מאביעד (852125, עובד חדש באותו תפקיד). הטלפון מגיע כפרמטר ולא נשמר בקוד.
// אחרי היצירה: כל תאי הטבח ברוטה 884123 עם employee=null + notes "מולו" עוברים לעובד החדש.
// dry run כברירת מחדל; confirm=1 כותב. לא מפרסם רוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const P_APP = 4283, P_ROTA = 884123, COOK = 34771, COMPANY = 1800;
const USERNAME = "molu", FIRST = "מולו";

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
async function patchCell(jar: Record<string, string>, cur: any, fields: Record<string, unknown>) {
  let ver = Number(cur.version ?? 0), last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/api/cells/${cur.id}/?application=${P_APP}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...cur, version: ver, ...fields }) });
    const t = await r.text();
    if (r.ok) return { ok: true };
    last = `${r.status} ${t.slice(0, 120)}`;
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
    const phone = (u.searchParams.get("phone") || "").replace(/\D/g, "").replace(/^972/, "0");
    if (!/^05\d{8}$/.test(phone)) return new Response(JSON.stringify({ error: "bad phone", phone }), { status: 400 });

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch failed" }), { status: 502 });

    const emps = rowsOf(await (await fetch(`${BASE}/api/employees/`, { headers: hdrs(jar) })).json());
    const clash = emps.filter((e: any) => e.user?.phone_number === phone || String(e.user?.username || "").toLowerCase() === USERNAME);
    const payload = {
      user: { username: USERNAME, first_name: FIRST, last_name: "", email: "", phone_number: phone, company: COMPANY },
      application: P_APP, allowed_apps: [], group: 4, employees_group: null, gender: "O", religion: 1, day_of_rest: 6, priority: 10,
      roles: [COOK], primary_role: null, locations: [], export_employee_to_salary: true, salary_type: "R", notes: "",
      // המגבלות כמו אצל אביעד (חובה ב-API)
      limits: [
        { id: 25816, name: "מינימום בקשות א-ה", value: 0 }, { id: 25817, name: "מינימום בקשות סופש", value: 0 },
        { id: 25818, name: "מקסימום משמרות בוקר", value: 6 }, { id: 25819, name: "מקסימום משמרות גלובלי", value: 6 },
      ],
    };
    const cells = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === P_ROTA && !c.is_deleted && c.role === COOK && c.employee === null && String(c.notes || "") === FIRST);

    if (!go || clash.length) return new Response(JSON.stringify({ dry: true, employees_seen: emps.length,
      clash: clash.map((e: any) => ({ id: e.id, name: `${e.user?.first_name} ${e.user?.last_name}`, username: e.user?.username })),
      payload: { ...payload, user: { ...payload.user, phone_number: "***" + phone.slice(-3) } },
      molu_cells: cells.map((c: any) => `${String(c.date).slice(0, 10)} ${String(c.planned_start).slice(0, 5)}`) }, null, 2),
      { headers: { "Content-Type": "application/json" } });

    const r = await fetch(`${BASE}/api/employees/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
    const t = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ created: false, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 800) }), { status: 502 });
    let emp: any = null; try { emp = JSON.parse(t); } catch { /* */ }
    const newId = emp?.id;
    const moved: string[] = [], failed: any[] = [];
    if (newId) for (const c of cells) {
      const res = await patchCell(jar, c, { employee: newId, notes: "" });
      res.ok ? moved.push(`${String(c.date).slice(0, 10)} ${String(c.planned_start).slice(0, 5)}`) : failed.push({ id: c.id, last: res.last });
    }
    const rota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((x: any) => x.id === P_ROTA);
    return new Response(JSON.stringify({ created: true, employee_id: newId, user_id: emp?.user?.id, clock_id: emp?.user?.clock_id,
      moved, failed, rota_is_published: rota?.is_published ?? null }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
