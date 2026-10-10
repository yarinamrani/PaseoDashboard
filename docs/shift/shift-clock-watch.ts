// התראות שעון נוכחות משיפט → קבוצת הוואטסאפ שב-app_config.SHIFT_CLOCK_WA_TARGET (PaseoInvoices).
// פרוס בסלוט של contest-watch (התחרות נגמרה, מכסת הפונקציות מלאה).
//
//   ?mode=live   (ברירת מחדל, כל 10 דק') — התראה מיידית, פעם אחת לכל משמרת:
//       • כניסה ויציאה תוך פחות מ-10 דק' (כנראה יציאה בטעות)
//       • יציאה בלי כניסה
//       • כניסה בלי יציאה — שעה אחרי הסוף המתוכנן, או 12 ש' אחרי הכניסה כשאין סוף מתוכנן
//   ?mode=digest (פעם ביום בבוקר) — סיכום של אתמול: כל מה שעדיין לא תוקן + משמרת מעל 14 ש' + משובץ בלי שום החתמה
//       + בדיקת טיפים בפלור: לכל משמרת (בוקר/ערב) שהחתימו בה 2+ עובדי טיפ — יש חישוב טיפים? יש בו גביית אוכל?
//   ?mode=replies (כל דקה) — קורא תגובות (reply) של ירין על הודעות ההתראה ומזין את השעה בשיפט (manual_start/manual_end)
//   ?dry=1 — מחזיר מה היה נשלח, בלי לשלוח ובלי לרשום. ?date=YYYY-MM-DD — סיכום ליום אחר (לבדיקה).
// משמרת שהמנהל כבר תיקן בה שעות ידנית (manual_start/manual_end) לא נחשבת תקלה. עובדי כוח אדם מסוננים.
// "משובץ בלי החתמה" לא נבדק בתאים עם הערה Umino/אומינו — מי שמשובץ לאומינו מחתים באפליקציה של אומינו
// (למשל Germay 778534 בסידור פסאו = גרמי 829782 שמחתים ב-5931), שלא נקראת כאן.
//
// כפולות (אותו עובד, כמה תאים באותו יום): בשיפט הכניסה נרשמת בתא הבוקר והיציאה בלילה נרשמת בתא הערב.
// לכן תא בוקר בלי יציאה לא מתריע כל עוד יש לעובד תא מאוחר יותר באותו יום — רק אם גם בסוף הערב אין יציאה.
// זוג "כניסה בבוקר / יציאה בערב" (או החתמה אחת ארוכה על תא הבוקר) מופיע בסיכום הבוקר כ"כפולה – לפצל",
// ותשובה עם שעה אחת מפצלת: סוף הבוקר = תחילת הערב = השעה.
//
// תשובה בוואטסאפ: reply על הודעת ההתראה. שורה לכל עובד: [מספר שורה או שם] שעה [שעה].
//   "19:30" (כשבהודעה עובד אחד) · "2 19:30" · "אופל 19:15-01:55" · "כניסה 19:15" · "יציאה 01:55"
//   שעה אחת בלי מילה → ממלא את מה שחסר (אין יציאה → יציאה; אין כניסה → כניסה; לא החתים בכלל → כניסה).
// רק שולחים שב-app_config.SHIFT_CLOCK_EDITORS (רשימת chatId מופרדת בפסיקים). הודעות המיפוי בטבלה shift_clock_msgs,
// תשובות שטופלו ב-shift_clock_replies. wa-green מתעלם מ-reply (quotedMessage), כך שאין כפילות תשובות.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APPS: Record<number, string> = { 4281: "פלור", 4283: "מטבח" };
const DOUBLE_MIN = 10, NO_EXIT_GRACE_MIN = 60, NO_END_MAX_H = 12, LONG_H = 14, DOUBLE_TAIL_H = 10, REPLY_MAX_H = 48;

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
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// סדר בתוך יום עבודה: שעות לפני 06:00 שייכות לסוף הלילה
const dayKey = (t: string | null) => t ? mins(t) + (mins(t) < 360 ? 1440 : 0) : 9999;

type Cell = { id: number; app: number; date: string; emp: number; name: string; ps: string | null; pe: string | null;
  cs: string | null; ce: string | null; ms: string | null; me: string | null; absence: string | null; notes: string };
type Hit = { cell: Cell; kind: string; line: string; partner?: Cell };

const fixed = (c: Cell) => !!(c.ms || c.me);
const startOf = (c: Cell) => c.ps ?? c.cs ?? c.ms ?? c.ce ?? c.me;

function check(c: Cell, sib: Cell[], now: number, mode: "live" | "digest"): Hit[] {
  const out: Hit[] = [];
  const who = (x: Cell) => `*${x.name}* (${APPS[x.app]}${mode === "digest" ? "" : `, ${ddmm(x.date)}`})`;
  if (fixed(c)) return out; // תוקן ידנית
  const i = sib.indexOf(c), earlier = sib.slice(0, i), later = sib.slice(i + 1);
  const blank = (x: Cell) => !x.cs && !x.ce && !fixed(x);

  if (c.cs && c.ce) {
    const dur = (endAt(c.date, c.cs, c.ce) - at(c.date, c.cs)) / 6e4;
    if (dur < DOUBLE_MIN) out.push({ cell: c, kind: "double", line: `⚠️ ${who(c)} – כניסה ויציאה ב-${hm(c.cs)} (${Math.round(dur)} דק'). כנראה יציאה בטעות – לתקן בשיפט` });
    if (mode === "digest" && dur > LONG_H * 60) {
      const ev = later.find(blank);
      if (ev) out.push({ cell: c, partner: ev, kind: "split", line: `🔁 ${who(c)} – כפולה על החתמה אחת ${hm(c.cs)}–${hm(c.ce)}. שעת המעבר לערב? (מתוכנן ${ev.ps ? hm(ev.ps) : "?"})` });
      else out.push({ cell: c, kind: "long", line: `🕓 ${who(c)} – משמרת של ${(dur / 60).toFixed(1)} ש' (${hm(c.cs)}–${hm(c.ce)}). לבדוק שלא נשכחה יציאה` });
    }
  }
  if (!c.cs && c.ce) {
    // כפולה: הכניסה בתא מוקדם יותר באותו יום, היציאה נרשמה כאן
    const e = [...earlier].reverse().find((x) => x.cs && !x.ce && !fixed(x));
    if (e) {
      if (mode === "digest") out.push({ cell: e, partner: c, kind: "split", line: `🔁 ${who(e)} – כפולה: כניסה ${hm(e.cs!)}, יציאה ${hm(c.ce)}. שעת המעבר לערב? (מתוכנן ${c.ps ? hm(c.ps) : "?"})` });
    } else out.push({ cell: c, kind: "exit_no_entry", line: `⚠️ ${who(c)} – יציאה ב-${hm(c.ce)} בלי כניסה – לתקן בשיפט` });
  }
  if (c.cs && !c.ce) {
    if (later.length) {
      // כפולה: היציאה תגיע בלילה על תא מאוחר יותר. מתריעים רק אם גם אחרי סוף הערב אין יציאה.
      if (!later.some((x) => x.ce || x.cs || fixed(x))) {
        const last = later[later.length - 1];
        const base = last.ps ?? c.cs;
        const due = last.pe ? endAt(c.date, base, last.pe) + NO_EXIT_GRACE_MIN * 6e4 : endAt(c.date, c.cs, base) + DOUBLE_TAIL_H * 36e5;
        if (now > due) out.push({ cell: c, kind: "no_exit", line: `⏰ ${who(c)} – כפולה: כניסה ב-${hm(c.cs)} ואין יציאה גם בסוף הערב – לבדוק ולתקן בשיפט` });
      }
    } else {
      const due = c.pe ? endAt(c.date, c.ps ?? c.cs, c.pe) + NO_EXIT_GRACE_MIN * 6e4 : at(c.date, c.cs) + NO_END_MAX_H * 36e5;
      if (now > due) out.push({ cell: c, kind: "no_exit", line: `⏰ ${who(c)} – נכנס/ה ב-${hm(c.cs)} ואין יציאה – לבדוק ולתקן בשיפט` });
    }
  }
  if (mode === "digest" && c.ps && !c.cs && !c.ce && !c.absence && !/umino|אומינו/i.test(c.notes)) {
    // תא ערב של כפולה שהוחתמה כולה על תא הבוקר — לא "לא הגיע"
    const covered = earlier.some((x) => x.cs && (!x.ce || endAt(x.date, x.cs, x.ce) >= endAt(x.date, x.cs, c.ps!)) || x.me);
    if (!covered) out.push({ cell: c, kind: "no_show", line: `❔ ${who(c)} – שובץ/ה מ-${hm(c.ps)} ואין שום החתמה – לא הגיע/ה או לא החתים/ה?` });
  }
  return out;
}

async function greenUrl(method: string) {
  return `${await cfg("GREENAPI_API_URL")}/waInstance${await cfg("GREENAPI_ID_INSTANCE")}/${method}/${await cfg("GREENAPI_API_TOKEN")}`;
}
async function send(chatId: string, message: string, quotedMessageId?: string): Promise<string | null> {
  let ok = false, status = 0, body = "", id: string | null = null;
  try {
    const r = await fetch(await greenUrl("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quotedMessageId ? { chatId, message, quotedMessageId } : { chatId, message }) });
    ok = r.ok; status = r.status; body = await r.text().catch(() => "");
    try { id = JSON.parse(body)?.idMessage ?? null; } catch { /* */ }
  } catch (e) { body = String(e); }
  try { await sb.from("wa_send_log").insert({ fn: "shift-clock-watch", chat_id: chatId, ok, status, error: ok ? null : body.slice(0, 1000), preview: message.slice(0, 300) }); } catch (_e) { /* */ }
  return ok ? (id ?? "") : null;
}

const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

// ---------- בדיקת טיפים (פלור 4281) ----------
const F_APP = 4281, FOOD_VAR = 28859;
const TIP_AM = 3594, TIP_PM = 3595;
const AM_SHIFTS = new Set([16650, 16651]), PM_SHIFTS = new Set([16647, 16648, 16649, 16652]);
// מלצר, בר, מתלמד מלצר, מתלמד בר, מלצר טאלה, ראנר טאלה, מתלמד טאלה, בר טאלה — בלי מארחות ואחמ"ש
const TIP_ROLES = new Set([34749, 34750, 34752, 34753, 35342, 45481, 45482, 51036]);
async function tipsCheck(jar: Record<string, string>, date: string, floorCells: any[]): Promise<string[]> {
  await switchApp(jar, F_APP);
  const g = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json().catch(() => []));
  const runs = (await g(`tip-run/?application=${F_APP}&date=${date}`)).filter((r: any) => r.date === date);
  const food = (await g(`tips-variable-values/?application=${F_APP}&date=${date}`)).filter((v: any) => v.date === date && v.variable === FOOD_VAR);
  const worked = floorCells.filter((c) => String(c.date).slice(0, 10) === date && !c.is_deleted && c.employee && TIP_ROLES.has(c.role) && (c.clock_start || c.manual_start));
  const out: string[] = [];
  for (const [tip, label, shifts] of [[TIP_AM, "בוקר", AM_SHIFTS], [TIP_PM, "ערב", PM_SHIFTS]] as const) {
    const n = new Set(worked.filter((c) => shifts.has(c.shift)).map((c) => c.employee)).size;
    if (n < 2) continue;
    const run = runs.find((r: any) => r.tip === tip);
    const nf = food.filter((v: any) => v.tip === tip).length;
    if (!run) out.push(`💸 טיפים ${label} – אין חישוב טיפים (${n} עובדי טיפ החתימו)`);
    else if (!nf) out.push(`🍽 טיפים ${label} – יש חישוב, אבל אין בו גביית אוכל (${n} עובדי טיפ)`);
  }
  return out;
}

// ---------- תשובות בוואטסאפ ----------
const TIME_RE = /(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
const RE_START = /(כניסה|נכנס|עלי|עלה|עלתה|התחיל|התחילה|הגיע|הגיעה)/;
const RE_END = /(יציאה|יצא|יצאה|סיים|סיימה|ירד|ירדה|עזב|עזבה)/;
type Row = { msg_id: string; line: number; cell_id: number; app: number; kind: string; partner_id: number | null; name: string; date: string };
type Seg = { row: Row; times: string[]; kw: "start" | "end" | null };

// שם/מספר ושעה יכולים להיות באותה שורה או בשורות נפרדות ("Kiran" ואז "01:30")
function parse(text: string, rows: Row[]): { segs: Seg[]; problems: string[] } {
  const segs: Seg[] = [], problems: string[] = [];
  const pick = (raw: string): Row | undefined => {
    const num = raw.match(/^\s*#?(\d{1,2})(?![:.\d])/);
    if (num) { const r = rows.find((x) => x.line === +num[1]); if (r) return r; }
    const low = raw.toLowerCase();
    const named = rows.filter((r) => r.name.toLowerCase().split(/\s+/).some((w) => w.length >= 2 && low.includes(w)));
    return named.length === 1 ? named[0] : undefined;
  };
  let ctx: Row | undefined, ctxKw: "start" | "end" | null = null;
  for (const raw of text.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean)) {
    const times = [...raw.matchAll(TIME_RE)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
    const kw = RE_START.test(raw) ? "start" : RE_END.test(raw) ? "end" : null;
    const row = pick(raw);
    if (!times.length) { if (row) { ctx = row; ctxKw = kw; } continue; }
    const target = row ?? ctx ?? (rows.length === 1 ? rows[0] : undefined);
    if (!target) {
      problems.push(`לא הבנתי על מי "${raw}" – בהודעה יש כמה עובדים, תכתוב גם שם או מספר שורה (למשל: ${rows[0]?.line ?? 1} ${times[0]})`);
      continue;
    }
    segs.push({ row: target, times, kw: kw ?? (row ? null : ctxKw) });
    ctx = undefined; ctxKw = null;
  }
  return { segs, problems };
}

async function applySeg(jar: Record<string, string>, s: Seg): Promise<string> {
  const { row } = s;
  const who = `${row.name} ${ddmm(row.date)}`;
  await switchApp(jar, row.app);
  const get = async (id: number) => {
    const r = await fetch(`${BASE}/api/cells/${id}/?application=${row.app}`, { headers: hdrs(jar) });
    return r.ok ? await r.json() : null;
  };
  const patch = async (cell: any, set: Record<string, string>) => {
    const r = await fetch(`${BASE}/api/cells/${cell.id}/?application=${row.app}`, { method: "PATCH", headers: hdrs(jar, true),
      body: JSON.stringify({ ...set, version: cell.version }) });
    return r.ok ? null : `${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`;
  };
  const was = (cur: string | null, t: string) => cur && hm(cur) !== t ? ` (היה ${hm(cur)})` : "";
  const c = await get(row.cell_id);
  if (!c || c.is_deleted) return `❌ ${who} – התא לא נמצא בשיפט`;

  if (row.kind === "split") {
    const t = s.times[0], p = row.partner_id ? await get(row.partner_id) : null;
    if (!p || p.is_deleted) return `❌ ${who} – לא מצאתי את תא הערב`;
    const e1 = await patch(c, { manual_end: `${t}:00` });
    if (e1) return `❌ ${who} – ${e1}`;
    const set: Record<string, string> = { manual_start: `${t}:00` };
    if (!p.clock_end && !p.manual_end && c.clock_end) set.manual_end = c.clock_end; // החתמה אחת ארוכה על תא הבוקר
    const e2 = await patch(p, set);
    if (e2) return `❌ ${who} – סוף הבוקר עודכן ל-${t}, אבל תחילת הערב נכשלה: ${e2}`;
    return `✅ ${who} – פוצל ב-${t}: בוקר עד ${t}, ערב מ-${t}${set.manual_end ? ` עד ${hm(set.manual_end)}` : ""}`;
  }

  const set: Record<string, string> = {};
  if (s.times.length >= 2) { set.manual_start = s.times[0]; set.manual_end = s.times[1]; }
  else {
    const t = s.times[0];
    let side: "start" | "end";
    if (s.kw) side = s.kw;
    else if (row.kind === "double" && c.clock_start) {
      // כניסה+יציאה באותה דקה: שעה שאחרי ההחתמה (שעה עד 16 ש') = יציאה, אחרת כניסה
      const d = (mins(t) - mins(c.clock_start) + 1440) % 1440;
      side = d >= 60 && d <= 16 * 60 ? "end" : "start";
    } else {
      const hasStart = !!(c.clock_start || c.manual_start), hasEnd = !!(c.clock_end || c.manual_end);
      side = hasStart && !hasEnd ? "end" : "start";
    }
    set[side === "start" ? "manual_start" : "manual_end"] = t;
  }
  const body: Record<string, string> = {};
  for (const [k, v] of Object.entries(set)) body[k] = `${v}:00`;
  const err = await patch(c, body);
  if (err) return `❌ ${who} – ${err}`;
  const parts: string[] = [];
  if (set.manual_start) parts.push(`כניסה ${set.manual_start}${was(c.manual_start, set.manual_start)}`);
  if (set.manual_end) parts.push(`יציאה ${set.manual_end}${was(c.manual_end, set.manual_end)}`);
  const start = set.manual_start ?? c.manual_start ?? c.clock_start, end = set.manual_end ?? c.manual_end ?? c.clock_end;
  let note = "";
  if (!end) note = " · חסרה שעת יציאה – השב שוב עם השעה";
  else if (!start) note = " · חסרה שעת כניסה – השב שוב עם השעה";
  else if (!set.manual_end && !c.manual_end && row.kind === "double") note = ` · היציאה עדיין ${hm(end)} מהשעון – אם לא נכון, השב עם שעת יציאה`;
  return `✅ ${who} – ${parts.join(", ")}${note}`;
}

async function handleReplies(dry: boolean) {
  const target = await cfg("SHIFT_CLOCK_WA_TARGET");
  const editors = (await cfg("SHIFT_CLOCK_EDITORS")).split(",").map((s) => s.trim()).filter(Boolean);
  if (!target) return { error: "no target" };
  const r = await fetch(await greenUrl("getChatHistory"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: target, count: 40 }) });
  const hist = await r.json().catch(() => null);
  if (!Array.isArray(hist)) return { error: `history ${r.status}` };
  const cutoff = Date.now() / 1000 - REPLY_MAX_H * 3600;
  const qidOf = (m: any) => m.quotedMessage?.stanzaId ?? m.extendedTextMessage?.stanzaId ?? null;
  const cands = hist.filter((m: any) => m.type === "incoming" && m.typeMessage === "quotedMessage" && m.timestamp >= cutoff && qidOf(m))
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
  if (!cands.length) return { replies: 0 };
  const qids = [...new Set(cands.map(qidOf))];
  const { data: rows } = await sb.from("shift_clock_msgs").select("*").in("msg_id", qids);
  const byMsg = new Map<string, Row[]>();
  for (const x of (rows ?? []) as Row[]) byMsg.set(x.msg_id, [...(byMsg.get(x.msg_id) ?? []), x]);
  const mine = cands.filter((m: any) => byMsg.has(qidOf(m)));
  if (!mine.length) return { replies: 0 };
  const { data: done } = await sb.from("shift_clock_replies").select("msg_id").in("msg_id", mine.map((m: any) => m.idMessage));
  const doneSet = new Set((done ?? []).map((d: any) => d.msg_id));
  const todo = mine.filter((m: any) => !doneSet.has(m.idMessage));
  const results: any[] = [];
  let jar: Record<string, string> | null = null;
  for (const m of todo) {
    const text = String(m.extendedTextMessage?.text ?? m.textMessage ?? "");
    const quoted = qidOf(m);
    if (!dry) {
      // רישום לפני הביצוע — ריצה מקבילה לא תטפל באותה תשובה פעמיים
      const { error } = await sb.from("shift_clock_replies").insert({ msg_id: m.idMessage, quoted_id: quoted, sender: m.senderId ?? null, text: text.slice(0, 500) });
      if (error) continue;
    }
    let reply: string;
    if (!editors.includes(m.senderId)) reply = "⛔ עדכון שעות דרך הבוט פתוח רק לירין.";
    else {
      const { segs, problems } = parse(text, (byMsg.get(quoted) ?? []).sort((a, b) => a.line - b.line));
      const lines: string[] = [...problems.map((p) => `❌ ${p}`)];
      if (!segs.length && !problems.length) lines.push("לא מצאתי שעה בתשובה. דוגמה: 19:30 · 2 19:30 · אופל 19:15-01:55 · כניסה 19:15");
      if (segs.length && dry) lines.push(...segs.map((s) => `(dry) ${s.row.name} ${s.row.kind} ${s.times.join("-")} ${s.kw ?? ""}`));
      else if (segs.length) {
        if (!jar) { jar = {}; if (!(await login(jar))) { jar = null; lines.push("❌ לא הצלחתי להתחבר לשיפט. לא שיניתי כלום."); } }
        if (jar) for (const s of segs) lines.push(await applySeg(jar, s).catch((e) => `❌ ${s.row.name} – ${String(e).slice(0, 100)}`));
      }
      reply = lines.join("\n");
    }
    results.push({ msg: m.idMessage, text, reply });
    if (!dry) {
      const rid = await send(target, reply, m.idMessage);
      // תשובה לתשובה של הבוט (למשל אחרי "לא הבנתי") — ממופה לאותם עובדים
      if (rid) await sb.from("shift_clock_msgs").insert((byMsg.get(quoted) ?? []).map((x) => ({ ...x, msg_id: rid, created_at: undefined })));
      await sb.from("shift_clock_replies").update({ result: { reply } }).eq("msg_id", m.idMessage);
    }
  }
  return { replies: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const dry = u.searchParams.get("dry") === "1";
    if (u.searchParams.get("mode") === "replies") return json({ mode: "replies", dry, ...(await handleReplies(dry)) });
    const mode = u.searchParams.get("mode") === "digest" ? "digest" : "live";
    const now = ilNow(), today = ymd(now);
    const qd = u.searchParams.get("date"), yday = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : ymd(now - 864e5); // ?date= לבדיקה
    const dates = mode === "digest" ? [yday] : [yday, today];

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return json({ error: "login failed" }, 502);
    const cells: Cell[] = [];
    let floorRaw: any[] = [];
    for (const app of Object.keys(APPS).map(Number)) {
      if (!(await switchApp(jar, app))) continue;
      const r = await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) });
      if (!r.ok) continue;
      const raw = rowsOf(await r.json());
      if (app === F_APP) floorRaw = raw;
      for (const c of raw) {
        const date = String(c.date ?? "").slice(0, 10);
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        if (!dates.includes(date) || c.is_deleted || !c.employee || /כוח אדם/.test(name)) continue;
        cells.push({ id: c.id, app, date, emp: c.employee, name, ps: c.planned_start || null, pe: c.planned_end || null,
          cs: c.clock_start || null, ce: c.clock_end || null, ms: c.manual_start || null, me: c.manual_end || null, absence: c.absence || null, notes: String(c.notes || "") });
      }
    }
    const groups = new Map<string, Cell[]>();
    for (const c of cells) { const k = `${c.app}|${c.date}|${c.emp}`; groups.set(k, [...(groups.get(k) ?? []), c]); }
    for (const g of groups.values()) g.sort((a, b) => dayKey(startOf(a)) - dayKey(startOf(b)));

    let hits = cells.flatMap((c) => check(c, groups.get(`${c.app}|${c.date}|${c.emp}`)!, now, mode));
    if (mode === "live" && hits.length) {
      const { data: sent } = await sb.from("shift_clock_alerts").select("cell_id, kind").in("cell_id", hits.map((h) => h.cell.id));
      const seen = new Set((sent ?? []).map((s: any) => `${s.cell_id}|${s.kind}`));
      hits = hits.filter((h) => !seen.has(`${h.cell.id}|${h.kind}`));
    }
    const tips = mode === "digest" ? await tipsCheck(jar, yday, floorRaw).catch((e) => [`💸 בדיקת טיפים נכשלה: ${String(e).slice(0, 80)}`]) : [];
    if (!hits.length && !tips.length) return json({ mode, dry, cells: cells.length, alerts: 0 });

    const many = hits.length > 1;
    const body = hits.map((h, i) => `${many ? `${i + 1}. ` : ""}${h.line}`).join("\n");
    const howto = hits.length ? `\n\n↩️ להשיב על ההודעה עם השעה${many ? " (למשל: 2 19:30)" : " (למשל: 19:30)"} ואעדכן בשיפט` : "";
    const tipsBlock = tips.length ? `${hits.length ? "\n\n" : ""}*טיפים:*\n${tips.join("\n")}` : "";
    const message = mode === "digest"
      ? `🕐 *תקלות שעון נוכחות – ${ddmm(yday)}*\nלתקן בשיפט לפני המשכורת:\n\n${body}${howto}${tipsBlock}`
      : `🕐 *שעון נוכחות*\n\n${body}${howto}`;
    if (dry) return json({ mode, dry, cells: cells.length, alerts: hits.length, tips, message });

    const target = await cfg("SHIFT_CLOCK_WA_TARGET");
    const id = target ? await send(target, message) : null;
    if (id !== null && mode === "live")
      await sb.from("shift_clock_alerts").upsert(hits.map((h) => ({ cell_id: h.cell.id, kind: h.kind })), { onConflict: "cell_id,kind", ignoreDuplicates: true });
    if (id && hits.length)
      await sb.from("shift_clock_msgs").insert(hits.map((h, i) => ({ msg_id: id, line: i + 1, cell_id: h.cell.id, app: h.cell.app, kind: h.kind,
        partner_id: h.partner?.id ?? null, name: h.cell.name, date: h.cell.date })));
    return json({ mode, cells: cells.length, alerts: hits.length, tips: tips.length, sent: id !== null, msg_id: id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
