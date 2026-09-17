import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// שבוע 20–26/09 — שוטפי כלים בשתי המסעדות לפי הנוהל של 17/09.
// פסאו: יוצר רוטה חדשה (לא קיימת) וכותב 24 תאים.
// אומינו: מעדכן 12 משבצות ריקות קיימות ומוחק 2 שלא אמורות להיות (שישי ערב, שבת בוקר).
// הכל נשאר טיוטה — הפונקציה לא מפרסמת שום רוטה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const WEEK = "2026-09-20";
const P_APP = 4283, P_ROLE = 34937, P_BOKER = 16656, P_EREV = 21796;
const U_APP = 5931, U_ROTA = 880896, U_ROLE = 52707, U_BOKER = 21850, U_EREV = 21851;
const SRC_WEEK = "2026-09-13";

const E = { JONATHAN: 765292, ENZO: 765295, HILLARY: 732289, PATEL: 808241, TONY: 811255, JEREMY: 829782 };

// ---- פסאו: [day, shift, employee|null, start, note] ----
type P = [number, number, number | null, string, string];
const PASEO: P[] = [
  [0, P_BOKER, E.JONATHAN, "10:00", ""], [1, P_BOKER, E.ENZO, "10:00", ""],
  [2, P_BOKER, E.JEREMY,   "10:00", ""], [3, P_BOKER, E.JONATHAN, "10:00", ""],
  [4, P_BOKER, E.ENZO,     "10:00", ""], [5, P_BOKER, E.JEREMY, "08:00", ""],
  [6, P_BOKER, E.JONATHAN, "08:00", ""],
  [0, P_EREV, E.HILLARY, "17:00", ""], [0, P_EREV, null, "18:00", "חסר שוטף"],
  [1, P_EREV, E.PATEL,   "17:00", ""], [1, P_EREV, null, "18:00", "חסר שוטף"],
  [2, P_EREV, E.HILLARY, "17:00", ""], [2, P_EREV, null, "18:00", "חסר שוטף"],
  [3, P_EREV, E.PATEL,   "17:00", ""], [3, P_EREV, null, "18:00", "חסר שוטף"],
  [4, P_EREV, E.HILLARY, "17:00", ""], [4, P_EREV, null, "18:00", "חסר שוטף"], [4, P_EREV, null, "19:00", "חסר שוטף"],
  [5, P_EREV, E.PATEL,   "17:00", ""], [5, P_EREV, null, "18:00", "חסר שוטף"], [5, P_EREV, null, "19:00", "חסר שוטף"],
  [6, P_EREV, E.HILLARY, "17:00", ""], [6, P_EREV, E.ENZO, "19:00", ""], [6, P_EREV, E.JEREMY, "19:30", ""],
];

// ---- אומינו: עדכון תאים קיימים [cellId, employee, start] ----
const UMINO_SET: [number, number, string][] = [
  [118509440, E.JEREMY,   "10:00"], [118509441, E.JONATHAN, "10:00"],
  [118509442, E.ENZO,     "10:00"], [118509443, E.JEREMY,   "10:00"],
  [118509444, E.JONATHAN, "10:00"], [118509445, E.ENZO,     "10:00"],
  [118509454, E.PATEL,   "18:00"], [118509455, E.HILLARY, "18:00"],
  [118509456, E.PATEL,   "18:00"], [118509457, E.HILLARY, "18:00"],
  [118509458, E.PATEL,   "18:00"],
  [118509460, E.TONY,    "19:30"],   // מוצ״ש — המטבח נפתח 19:50, לא 18:00
];
// שישי ערב ושבת בוקר — אומינו סגורה (כשר)
const UMINO_DEL = [118509459, 118509446];

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
    const steps: any[] = [];

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });

    // ================= פסאו =================
    if (!(await switchApp(jar, P_APP))) return new Response(JSON.stringify({ error: "switch 4283 failed" }), { status: 502 });

    let rotas = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json());
    let pRota = rotas.find((r: any) => String(r.date).slice(0, 10) === WEEK && r.application === P_APP && !r.is_deleted);
    steps.push({ venue: "פסאו", step: "רוטה", existed: !!pRota, id: pRota?.id ?? null });

    if (!pRota && go) {
      const cr = await fetch(`${BASE}/api/rotas/`, { method: "POST", headers: hdrs(jar, true),
        body: JSON.stringify({ application: P_APP, date: WEEK, source: "manual" }) });
      const ct = await cr.text();
      if (!cr.ok) return new Response(JSON.stringify({ error: `rota create ${cr.status}`, body: ct.slice(0, 300), steps }), { status: 502 });
      try { pRota = JSON.parse(ct); } catch { pRota = null; }
      if (!pRota?.id) {
        rotas = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json());
        pRota = rotas.find((r: any) => String(r.date).slice(0, 10) === WEEK && r.application === P_APP && !r.is_deleted);
      }
      steps.push({ venue: "פסאו", step: "רוטה נוצרה", id: pRota?.id ?? null });
    }

    let pQ = 0;
    if (pRota?.id || !go) {
      const q0 = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${WEEK}`, { headers: hdrs(jar) })).json());
      pQ = q0.length;
      if (go && pQ < 60) {
        const qSrc = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${SRC_WEEK}`, { headers: hdrs(jar) })).json());
        let ok = 0;
        for (const q of qSrc) {
          const body: any = { ...q, date: WEEK }; delete body.id; delete body.version;
          const r = await fetch(`${BASE}/api/employees-quotas/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(body) });
          if (r.ok) ok++; await r.text();
        }
        pQ = rowsOf(await (await fetch(`${BASE}/api/employees-quotas/?date=${WEEK}`, { headers: hdrs(jar) })).json()).length;
        steps.push({ venue: "פסאו", step: "מכסות הועתקו", copied: ok, now: pQ });
      }
      steps.push({ venue: "פסאו", step: "אימות מכסות", count: pQ, gate: pQ >= 60 ? "PASS" : "BLOCK" });
    }

    if (go && pQ < 60) {
      return new Response(JSON.stringify({ blocked: true, reason: "מכסות פסאו לא נוצרו — לא נכתב אף תא.", quotas: pQ, steps }, null, 2),
        { status: 409, headers: { "Content-Type": "application/json" } });
    }

    const pCreated: any[] = [], pFailed: any[] = [];
    if (go && pRota?.id) {
      const live = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
        .filter((c: any) => c.rota === pRota.id && !c.is_deleted);
      const used = new Map<string, Set<number>>();
      for (const c of live) {
        const g = `${c.day}|${c.role}`;
        if (!used.has(g)) used.set(g, new Set());
        used.get(g)!.add(Number(c.order || 0));
      }
      const nextOrder = (day: number) => {
        const g = `${day}|${P_ROLE}`;
        if (!used.has(g)) used.set(g, new Set());
        const s = used.get(g)!; let o = 1; while (s.has(o)) o++; s.add(o); return o;
      };
      for (const [day, shift, emp, start, note] of PASEO) {
        const date = dateOf(day);
        const dup = live.find((c: any) => c.day === day && c.role === P_ROLE && Number(c.employee) === emp
          && String(c.planned_start || "").slice(0, 5) === start);
        if (dup) continue;
        const order = nextOrder(day);
        const payload = {
          rota: pRota.id, sub_rota: null, shift, day, date, role: P_ROLE, employee: emp, order,
          planned_start: `${start}:00`, planned_end: null,
          planned_start_full: `${date}T${start}:00`, planned_end_full: null,
          manual_start: null, manual_end: null,
          work_code: 0, break_duration: 0, waiting: 0,
          absence: "", notes: note, highlight: "",
        };
        const r = await fetch(`${BASE}/api/cells/?application=${P_APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(payload) });
        const t = await r.text();
        if (r.ok) { let j: any = null; try { j = JSON.parse(t); } catch { /* */ } pCreated.push({ id: j?.id, date, emp, start, note }); }
        else pFailed.push({ date, emp, start, status: r.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
      }
    }

    // ================= אומינו =================
    if (!(await switchApp(jar, U_APP))) return new Response(JSON.stringify({ error: "switch 5931 failed", steps }), { status: 502 });

    const uLive = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted);
    steps.push({ venue: "אומינו", step: "תאים קיימים", count: uLive.length,
      dish_slots: uLive.filter((c: any) => c.role === U_ROLE).length });

    const uSet: any[] = [], uDel: any[] = [], uFailed: any[] = [];
    if (go) {
      for (const [id, emp, start] of UMINO_SET) {
        const cur = uLive.find((c: any) => c.id === id);
        if (!cur) { uFailed.push({ id, why: "cell not found" }); continue; }
        const date = String(cur.date).slice(0, 10);
        // ה-API משתמש בנעילה אופטימית: חובה לשלוח version תואם, אחרת 409.
        let ver = Number(cur.version ?? 0);
        let done = false, last = "";
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          const variants: [string, any][] = [
            ["full", { ...cur, version: ver, employee: emp, planned_start: `${start}:00`, planned_start_full: `${date}T${start}:00` }],
            ["min", { version: ver, employee: emp, planned_start: `${start}:00`, planned_start_full: `${date}T${start}:00` }],
          ];
          for (const [how, body] of variants) {
            const r = await fetch(`${BASE}/api/cells/${id}/?application=${U_APP}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify(body) });
            const t = await r.text();
            if (r.ok) { uSet.push({ id, date, emp, start, how }); done = true; break; }
            last = `${how} ${r.status} ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`;
            if (r.status === 409) { try { const j = JSON.parse(t); if (typeof j?.version === "number") ver = j.version + 1; } catch { ver++; } }
          }
        }
        if (!done) uFailed.push({ id, date, emp, start, last });
      }
      for (const id of UMINO_DEL) {
        if (!uLive.find((c: any) => c.id === id)) continue;   // כבר נמחק — ריצה חוזרת בטוחה
        let r = await fetch(`${BASE}/api/cells/${id}/?application=${U_APP}`, { method: "DELETE", headers: hdrs(jar, true) });
        if (!r.ok) r = await fetch(`${BASE}/api/cells/${id}/?application=${U_APP}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ is_deleted: true }) });
        await r.text();
        if (r.ok) uDel.push(id); else uFailed.push({ id, why: "delete failed", status: r.status });
      }
    }

    if (!go) {
      return new Response(JSON.stringify({ dry: true, week: WEEK,
        paseo: { rota: pRota?.id ?? "(will create)", quotas: pQ, would_write: PASEO.length,
                 filled: PASEO.filter((p) => p[2] !== null).length, holes: PASEO.filter((p) => p[2] === null).length },
        umino: { rota: U_ROTA, would_set: UMINO_SET.length, would_delete: UMINO_DEL.length },
        steps }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    // ================= אימות =================
    const uAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === U_ROTA && !c.is_deleted && c.role === U_ROLE);
    const uRota = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === U_ROTA);

    await switchApp(jar, P_APP);
    const pAfter = rowsOf(await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json())
      .filter((c: any) => c.rota === pRota?.id && !c.is_deleted && c.role === P_ROLE);
    const pRotaAfter = rowsOf(await (await fetch(`${BASE}/api/rotas/`, { headers: hdrs(jar) })).json()).find((r: any) => r.id === pRota?.id);

    const fmt = (arr: any[], bokerId: number) => {
      const by: Record<string, string[]> = {};
      for (const c of arr.sort((a: any, b: any) => (a.day - b.day) || String(a.planned_start).localeCompare(String(b.planned_start)))) {
        const d = String(c.date).slice(0, 10);
        const who = c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : (c.notes || "ריק");
        (by[d] ||= []).push(`${String(c.planned_start || "--:--").slice(0, 5)} ${who}${c.shift === bokerId ? " [בוקר]" : " [ערב]"}`);
      }
      return by;
    };

    return new Response(JSON.stringify({
      week: WEEK,
      paseo: { rota: pRota?.id, is_published: pRotaAfter?.is_published ?? null, quotas: pQ,
               created: pCreated.length, failed: pFailed.length, failures: pFailed.slice(0, 5),
               cells: pAfter.length, by_day: fmt(pAfter, P_BOKER) },
      umino: { rota: U_ROTA, is_published: uRota?.is_published ?? null,
               set: uSet.length, deleted: uDel.length, failed: uFailed.length, failures: uFailed.slice(0, 5),
               cells: uAfter.length, by_day: fmt(uAfter, U_BOKER) },
      steps,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
