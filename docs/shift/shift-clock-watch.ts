// התראות שעון נוכחות משיפט → קבוצת הוואטסאפ שב-app_config.SHIFT_CLOCK_WA_TARGET (PaseoInvoices).
// קריאה בלבד מול שיפט. פרוס בסלוט של contest-watch (התחרות נגמרה, מכסת הפונקציות מלאה).
//
//   ?mode=live   (ברירת מחדל, כל 10 דק') — התראה מיידית, פעם אחת לכל משמרת:
//       • כניסה ויציאה תוך פחות מ-10 דק' (כנראה יציאה בטעות)
//       • יציאה בלי כניסה
//       • כניסה בלי יציאה — שעה אחרי הסוף המתוכנן, או 12 ש' אחרי הכניסה כשאין סוף מתוכנן
//   ?mode=digest (פעם ביום בבוקר) — סיכום של אתמול: כל מה שעדיין לא תוקן + משמרת מעל 14 ש' + משובץ בלי שום החתמה
//   ?dry=1 — מחזיר מה היה נשלח, בלי לשלוח ובלי לרשום.
// משמרת שהמנהל כבר תיקן בה שעות ידנית (manual_start/manual_end) לא נחשבת תקלה. עובדי כוח אדם מסוננים.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APPS: Record<number, string> = { 4281: "פלור", 4283: "מטבח" };
const DOUBLE_MIN = 10, NO_EXIT_GRACE_MIN = 60, NO_END_MAX_H = 12, LONG_H = 14;

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
  const r = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(r, jar); return r.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);

// זמן ישראל כ"שעון קיר" בתוך Date של UTC, כדי להשוות ישירות לתאריך+שעה של התא
function ilNow(): number {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
}
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (date: string, t: string) => Date.parse(`${date}T${t.slice(0, 5)}:00Z`);
const hm = (t: string) => t.slice(0, 5);
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
// שעה מאוחרת מההתחלה = אותו יום; מוקדמת = אחרי חצות
const endAt = (date: string, start: string, end: string) => { const s = at(date, start); let e = at(date, end); if (e < s) e += 864e5; return e; };

type Cell = { id: number; app: number; date: string; name: string; ps: string | null; pe: string | null;
  cs: string | null; ce: string | null; ms: string | null; me: string | null; absence: string | null };
type Hit = { cell: Cell; kind: string; line: string };

function check(c: Cell, now: number, mode: "live" | "digest"): Hit[] {
  const out: Hit[] = [];
  const who = `*${c.name}* (${APPS[c.app]}${mode === "digest" ? "" : `, ${ddmm(c.date)}`})`;
  if (c.ms || c.me) return out; // תוקן ידנית
  if (c.cs && c.ce) {
    const dur = (endAt(c.date, c.cs, c.ce) - at(c.date, c.cs)) / 6e4;
    if (dur < DOUBLE_MIN) out.push({ cell: c, kind: "double", line: `⚠️ ${who} – כניסה ויציאה ב-${hm(c.cs)} (${Math.round(dur)} דק'). כנראה יציאה בטעות – לתקן בשיפט` });
    if (mode === "digest" && dur > LONG_H * 60) out.push({ cell: c, kind: "long", line: `🕓 ${who} – משמרת של ${(dur / 60).toFixed(1)} ש' (${hm(c.cs)}–${hm(c.ce)}). לבדוק שלא נשכחה יציאה` });
  }
  if (!c.cs && c.ce) out.push({ cell: c, kind: "exit_no_entry", line: `⚠️ ${who} – יציאה ב-${hm(c.ce)} בלי כניסה – לתקן בשיפט` });
  if (c.cs && !c.ce) {
    const due = c.pe ? endAt(c.date, c.ps ?? c.cs, c.pe) + NO_EXIT_GRACE_MIN * 6e4 : at(c.date, c.cs) + NO_END_MAX_H * 36e5;
    if (now > due) out.push({ cell: c, kind: "no_exit", line: `⏰ ${who} – נכנס/ה ב-${hm(c.cs)} ואין יציאה – לבדוק ולתקן בשיפט` });
  }
  if (mode === "digest" && c.ps && !c.cs && !c.ce && !c.absence)
    out.push({ cell: c, kind: "no_show", line: `❔ ${who} – שובץ/ה מ-${hm(c.ps)} ואין שום החתמה – לא הגיע/ה או לא החתים/ה?` });
  return out;
}

async function send(chatId: string, message: string) {
  const url = await cfg("GREENAPI_API_URL"), inst = await cfg("GREENAPI_ID_INSTANCE"), tok = await cfg("GREENAPI_API_TOKEN");
  let ok = false, status = 0, body = "";
  try {
    const r = await fetch(`${url}/waInstance${inst}/sendMessage/${tok}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, message }) });
    ok = r.ok; status = r.status; body = await r.text().catch(() => "");
  } catch (e) { body = String(e); }
  try { await sb.from("wa_send_log").insert({ fn: "shift-clock-watch", chat_id: chatId, ok, status, error: ok ? null : body.slice(0, 1000), preview: message.slice(0, 300) }); } catch (_e) { /* */ }
  return ok;
}

const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const mode = u.searchParams.get("mode") === "digest" ? "digest" : "live";
    const dry = u.searchParams.get("dry") === "1";
    const now = ilNow(), today = ymd(now), yday = ymd(now - 864e5);
    const dates = mode === "digest" ? [yday] : [yday, today];

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return json({ error: "login failed" }, 502);
    const cells: Cell[] = [];
    for (const app of Object.keys(APPS).map(Number)) {
      if (!(await switchApp(jar, app))) continue;
      const r = await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) });
      if (!r.ok) continue;
      for (const c of rowsOf(await r.json())) {
        const date = String(c.date ?? "").slice(0, 10);
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        if (!dates.includes(date) || c.is_deleted || !c.employee || /כוח אדם/.test(name)) continue;
        cells.push({ id: c.id, app, date, name, ps: c.planned_start || null, pe: c.planned_end || null,
          cs: c.clock_start || null, ce: c.clock_end || null, ms: c.manual_start || null, me: c.manual_end || null, absence: c.absence || null });
      }
    }

    let hits = cells.flatMap((c) => check(c, now, mode));
    if (mode === "live" && hits.length) {
      const { data: sent } = await sb.from("shift_clock_alerts").select("cell_id, kind").in("cell_id", hits.map((h) => h.cell.id));
      const seen = new Set((sent ?? []).map((s: any) => `${s.cell_id}|${s.kind}`));
      hits = hits.filter((h) => !seen.has(`${h.cell.id}|${h.kind}`));
    }
    if (!hits.length) return json({ mode, dry, cells: cells.length, alerts: 0 });

    const message = mode === "digest"
      ? `🕐 *תקלות שעון נוכחות – ${ddmm(yday)}*\nלתקן בשיפט לפני המשכורת:\n\n${hits.map((h) => h.line).join("\n")}`
      : `🕐 *שעון נוכחות*\n\n${hits.map((h) => h.line).join("\n")}`;
    if (dry) return json({ mode, dry, cells: cells.length, alerts: hits.length, message });

    const target = await cfg("SHIFT_CLOCK_WA_TARGET");
    const ok = target ? await send(target, message) : false;
    if (ok && mode === "live")
      await sb.from("shift_clock_alerts").upsert(hits.map((h) => ({ cell_id: h.cell.id, kind: h.kind })), { onConflict: "cell_id,kind", ignoreDuplicates: true });
    return json({ mode, cells: cells.length, alerts: hits.length, sent: ok });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
