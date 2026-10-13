// מעקב מילוי טופס 101 ב-buk → וואטסאפ לקבוצה שב-app_config.HR101_STATUS_WA_TARGET (ברירת מחדל HR101_ASK_TARGET = PaseoInvoices).
// פרוס בסלוט של ontopo-feedback-list (דוח טלגרם כבוי; גיבוי ב-docs/ontopo/). שולח דרך Green API (Whapi בניסיון שמוצה).
// מקור האמת: getAllEmployeesForms101 של buk — כל טופס שנשלח, גם אם נשלח ידנית מ-buk ולא דרך הבוט.
//   ?mode=live   (כל שעה) — "✅ מילא/ה 101" לכל טופס שעבר לנחתם/הושלם/אומת מאז הריצה הקודמת. ריצה ראשונה = רישום שקט.
//   ?mode=digest (כל בוקר, מקובץ לפי מסעדה: פסאו → אומינו → טאלה) — שליחות שנכשלו ב-buk + מי עוד לא מילא (נשלח/נפתח, נשלח ב-90 הימים האחרונים) + מי מילא ב-7 הימים האחרונים
//                + "עבדו בלי 101": מי שהחתים בשיפט ב-30 הימים האחרונים ואין לו 101 ממולא באותה חברה.
//     כל יום — רק עובדים חדשים (משמרת ראשונה אי פעם ב-21 הימים האחרונים, hr_first_shift). ביום ראשון (או ?full=1) — כל הרשימה.
//     החברה נקבעת לפי התא בשיפט: אפליקציות אומינו (5930/5931) → אומינו; תפקידי טאלה בפלור → טאלה; שאר הפלור → פסאו;
//     מטבח (4283) → כל חברה (טבחים ושוטפים פזורים בין החברות). מי שיש לו 101 ממולא בחברה אחרת מסומן רק מ-3 משמרות.
//     טופס שרשום ב-buk בלי שום שליחה (statusId ריק, בלי audit) = עובד ותיק שה-101 שלו טופל מחוץ ל-buk — נחשב תקין.
//     ההתאמה שיפט↔buk לפי טלפון (9 ספרות אחרונות; mobilePhoneNumber בטופס) ואם אין — לפי שם מלא. עובדי כוח אדם מסוננים.
//     הנתונים מהטבלה shift_cells (shift-sync, 3 פעמים ביום) דרך הפונקציה hr_worked_recent.
//   ?mode=send&venue=paseo|tala|umino — 13/10: "101 פסאו" מג׳סי — רשימת מי חסר בלבד (השליחה המרוכזת בוטלה; שליחה רק דרך mode=one). כל מי שהחתים באותה מסעדה ב-30 הימים האחרונים ואין לו 101 ממולא שם:
//       אין טופס בחברה → טופס חדש (שם + נייד מ-shift_employees, תחילת עבודה = החתמה ראשונה); יש טופס שלא מולא / שליחה שנכשלה → שליחה חוזרת מ-buk.
//       מטבח (4283) בלי טופס בשום חברה — לא נשלח (לא ידוע לאיזו חברה), מופיע ברשימה. בלי &confirm=1 — תצוגה מקדימה בלבד.
//       טופס חדש פותח תיק עובד בחברה — נשלח אוטומטית רק לעובד חדש (משמרת ראשונה ב-21 הימים האחרונים). ותיק בלי טופס — רק עם &all=1 ("הכל").
//       אחרי השליחה קורא שוב את buk ומדווח לכל עובד: נשלח / buk חסם שליחה חוזרת / נכשל. כל שליחה נרשמת ב-hr_101_queue (source='bot_cmd').
//   ?mode=one&name=<שם> — 13/10: "שלח 101 מור בניסטי" מג׳סי. מזהה עובד פעיל בשיפט (שם מלא/חלקי, מאחד את אותו אדם בכמה אפליקציות לפי נייד),
//       באיזו מסעדה עבד (60 יום) וה-101 שלו ב-buk בכל חברה, מציע חברה ופעולה (טופס חדש / שליחה חוזרת) ושומר בקשה ב-hr_101_queue (status='one_confirm').
//       ?mode=one&confirm=<id>[&company=פסאו|טאלה|אומינו] — שולח אחרי "כן" של ירין · ?mode=one&cancel=<id> — "לא".
//   ?dry=1 — מחזיר את ההודעה בלי לשלוח ובלי לשמור.
// מצב אחרון לכל טופס בטבלה hr_101_status. מפתח ה-Web API של buk וה-refresh token: app_config.BUK_FB_API_KEY / env BUK_REFRESH_TOKEN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const COMPANIES: Record<string, string> = { VRP5IK2cpacu2ZmPMcjt: "פסאו", VZgAaVfmSuJlrb3xOSv2: "טאלה", uVHjtoB6rsenMFgPCyoe: "אומינו" };
const PASEO = "VRP5IK2cpacu2ZmPMcjt";
const VENUE_ORDER = [PASEO, "uVHjtoB6rsenMFgPCyoe", "VZgAaVfmSuJlrb3xOSv2"]; // פסאו → אומינו → טאלה
const ORDER = ["sent", "opened", "signed", "done", "verified"];
const HE: Record<string, string> = { sent: "נשלח", opened: "נפתח", signed: "נחתם", done: "הושלם", verified: "אומת" };
const FILLED = new Set(["signed", "done", "verified"]);
const PENDING_DAYS = 90, RECENT_DAYS = 7, WORKED_DAYS = 30, NEW_DAYS = 21;
const ph9 = (p: any) => String(p ?? "").replace(/\D/g, "").slice(-9);
const VENUES: Record<string, string> = { "פסאו": PASEO, paseo: PASEO, "טאלה": "VZgAaVfmSuJlrb3xOSv2", "טלה": "VZgAaVfmSuJlrb3xOSv2", tala: "VZgAaVfmSuJlrb3xOSv2", "אומינו": "uVHjtoB6rsenMFgPCyoe", umino: "uVHjtoB6rsenMFgPCyoe" };
const NANO = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
function nanoid(n = 21) { const b = new Uint8Array(n); crypto.getRandomValues(b); let s = ""; for (let i = 0; i < n; i++) s += NANO[b[i] % NANO.length]; return s; }
const nameKey = (n: string) => n.replace(/[^a-zא-ת\s]/gi, " ").toLowerCase().split(/\s+/).filter((w) => w.length >= 2).sort().join(" ");

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
async function idToken(): Promise<string> {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${await cfg("BUK_FB_API_KEY")}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN") ?? "")}`,
  });
  if (!r.ok) throw new Error(`buk token ${r.status}`);
  const j = await r.json(); return j.access_token || j.id_token;
}
// תאריך ב-audit יכול להגיע כמחרוזת, כמספר או כ-Timestamp של Firestore
function toMs(d: any): number | null {
  if (d == null) return null;
  if (typeof d === "number") return d < 1e12 ? d * 1000 : d;
  if (typeof d === "string") { const t = Date.parse(d); return isNaN(t) ? null : t; }
  const s = d._seconds ?? d.seconds; return typeof s === "number" ? s * 1000 : null;
}
// שליחה חוזרת שנחסמה (resendLimit) נרשמת על אותו audit של "נשלח" עם error — הטופס עצמו כן נשלח קודם,
// והתאריך האמיתי ב-error.data.lastFormSendDate. שגיאה אחרת = לא נשלח.
function status(f: any): { st: string | null; at: number | null; sent: number | null } {
  const a = f?.auditByStatusId ?? {};
  let st: string | null = null, at: number | null = null;
  for (const s of ORDER) {
    const e = a[s]; if (!e?.date) continue;
    if (!e.error) { st = s; at = toMs(e.date); }
    else if (e.error.code === "resendLimit") { st = s; at = toMs(e.error.data?.lastFormSendDate) ?? toMs(e.date); }
  }
  const sentErr = a.sent?.error;
  const sent = sentErr?.code === "resendLimit" ? (toMs(sentErr.data?.lastFormSendDate) ?? toMs(a.sent?.date)) : toMs(a.sent?.date);
  return { st, at, sent };
}
const ddmm = (ms: number | null) => ms ? new Date(ms + 3 * 36e5).toISOString().slice(5, 10).split("-").reverse().join("/") : "?";

async function send(chatId: string, message: string) {
  const url = await cfg("GREENAPI_API_URL"), inst = await cfg("GREENAPI_ID_INSTANCE"), tok = await cfg("GREENAPI_API_TOKEN");
  let ok = false, code = 0, body = "";
  try {
    const r = await fetch(`${url}/waInstance${inst}/sendMessage/${tok}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, message }) });
    ok = r.ok; code = r.status; body = await r.text().catch(() => "");
  } catch (e) { body = String(e); }
  try { await sb.from("wa_send_log").insert({ fn: "hr-101-status", chat_id: chatId, ok, status: code, error: ok ? null : body.slice(0, 1000), preview: message.slice(0, 300) }); } catch (_e) { /* */ }
  return ok;
}
const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const mp = u.searchParams.get("mode"), mode = mp === "digest" || mp === "send" || mp === "one" ? mp : "live";
    const dry = u.searchParams.get("dry") === "1";
    const now = Date.now();

    const tok = await idToken();
    const readForms = async () => {
      const r = await fetch("https://bookeeping-prod.appspot.com/emp/getAllEmployeesForms101", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { taxYear: new Date().getUTCFullYear(), companiesIdsToGet: Object.fromEntries(Object.keys(COMPANIES).map((c) => [c, true])) } }),
      });
      if (!r.ok) throw new Error(`buk ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return await r.json();
    };
    const j = await readForms();
    const forms: any[] = [], skipped: string[] = [], failedSend: any[] = [], raw101: any[] = [];
    for (const [co, v] of Object.entries(j?.data?.dataByCompanyId ?? j?.dataByCompanyId ?? {})) {
      if (!COMPANIES[co]) continue;
      for (const f of (Array.isArray(v) ? v : Object.values(v ?? {})) as any[]) {
        const s = status(f);
        raw101.push({ company: co, employee_id: String(f.employeeId ?? ""), name: (f.employeeName || "").trim(), ph: ph9(f.mobilePhoneNumber), form: f,
          st: s.st, sent: s.sent, failed: !s.st && !!f.auditByStatusId?.sent?.error,
          ok: FILLED.has(s.st ?? "") || f.statusId === 5 || (f.statusId == null && !Object.keys(f.auditByStatusId ?? {}).length) });
        if (!s.st || !f.employeeId) {
          const err = f.auditByStatusId?.sent?.error;
          if (err) failedSend.push({ company: co, name: (f.employeeName || "").trim(), code: err.code ?? "error", at: toMs(f.auditByStatusId.sent.date) });
          skipped.push(`${COMPANIES[co]}: ${(f.employeeName || "").trim()} [${Object.entries(f.auditByStatusId ?? {}).map(([k, a]: any) => `${k}${a?.error ? ":" + (a.error.code ?? "err") : ""}`).join(",") || "בלי סטטוס"}]`);
          continue;
        }
        forms.push({ company: co, employee_id: String(f.employeeId), name: (f.employeeName || `${f.firstName ?? ""} ${f.lastName ?? ""}`).trim(),
          status: s.st, sent_at: s.sent ? new Date(s.sent).toISOString() : null, filled_at: FILLED.has(s.st) && s.at ? new Date(s.at).toISOString() : null });
      }
    }


    // עבדו בשיפט (WORKED_DAYS) בלי 101 ממולא באותה חברה. full=false — רק עובדים חדשים (NEW_DAYS).
    const workedNoForm = async (full: boolean) => {
      const { data: worked } = await sb.rpc("hr_worked_recent", { p_days: WORKED_DAYS });
      const { data: firsts } = await sb.rpc("hr_first_shift");
      const firstEver = new Map<number, string>(((firsts ?? []) as any[]).map((x) => [Number(x.employee), String(x.first_ever)]));
      const newSince = new Date(now - NEW_DAYS * 864e5).toISOString().slice(0, 10);
      // כל שורה משויכת למסעדה; ההודעה נבנית מסעדה-מסעדה (פסאו → אומינו → טאלה), ובתוך כל אחת לפי סוג
      const noForm: { co: string; line: string; w: any; f: any; any: boolean; fe: string }[] = [], inNoForm = new Set<string>();
      for (const w of ((worked ?? []) as any[]).sort((a, b) => String(a.first_day).localeCompare(String(b.first_day)))) {
        const any = w.company === "any";
        if ((!any && !COMPANIES[w.company]) || /כוח אדם/.test(w.full_name ?? "")) continue;
        const p = ph9(w.phone);
        const byPh = p.length === 9 ? raw101.filter((r) => r.ph === p) : [];
        const all = byPh.length ? byPh : raw101.filter((r) => nameKey(r.name) && nameKey(r.name) === nameKey(w.full_name ?? ""));
        const okAny = all.some((r) => r.ok);
        if (any ? okAny : all.some((r) => r.company === w.company && r.ok)) continue;
        if (!any && okAny && w.shifts < 3) continue; // משמרת-שתיים בחברה השנייה — לא מסמנים
        const fe = firstEver.get(Number(w.employee)) ?? String(w.first_day);
        if (!full && fe < newSince) continue; // ביום רגיל — רק עובדים חדשים
        const here = any ? all : all.filter((r) => r.company === w.company);
        const f = here.find((r) => r.st) ?? here[0];
        if (f?.employee_id) inNoForm.add(`${f.company}|${f.employee_id}`);
        const why = !f ? "אין 101 ב-buk (לא נשלח / לא פתוח בחברה)" : f.failed ? "שליחת 101 נכשלה ב-buk" :
          `101 נשלח ${ddmm(f.sent)}${f.st === "opened" ? ", נפתח ולא הושלם" : ", עוד לא מולא"}`;
        // מטבח פסאו (4283) בלי טופס בשום חברה — משויך לפסאו עם הערה; אם יש טופס בחברה כלשהי — לחברה של הטופס
        const co = any ? (f?.company ?? PASEO) : w.company;
        noForm.push({ co, w, f, any, fe, line: `• *${w.full_name}*${any ? " (מטבח" + (f ? "" : " — לוודא חברה") + ")" : ""} – ${w.shifts} משמרות${fe >= newSince ? ` · חדש/ה מ-${fe.slice(8, 10)}/${fe.slice(5, 7)}` : ""} · ${why}` });
      }
      return { noForm, inNoForm };
    };

    // שליחה לעובד אחד בחברה אחת: f = טופס קיים בחברה (שליחה חוזרת) או null (טופס חדש). מחזיר שורת סטטוס אחרי קריאה חוזרת מ-buk.
    const sendOne = async (co: string, f: any, info: { first: string; last: string; phone: string; start: string }) => {
      const before = f ? status(f).sent : null;
      const emp = f ? (f.michpalEmployeeId != null ? { employeeId: f.employeeId, michpalEmployeeId: f.michpalEmployeeId }
          : { employeeId: f.employeeId, firstName: f.firstName ?? info.first, lastName: f.lastName ?? info.last, startWorkDate: f.startWorkDate ?? `${info.start}T00:00:00.000Z`, mobilePhoneNumber: f.mobilePhoneNumber ?? info.phone })
        : { employeeId: nanoid(), firstName: info.first, lastName: info.last, startWorkDate: `${info.start}T00:00:00.000Z`, mobilePhoneNumber: info.phone };
      const r = await fetch("https://bookeeping-prod.appspot.com/emp/sendForms101ToEmployees", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { companyId: co, employees: [emp], confirmResend: !!f } }) });
      const t = await r.text();
      if (!r.ok) return { ok: false, line: `❌ buk החזיר ${r.status}: ${t.slice(0, 150)}`, bukId: null as string | null };
      await new Promise((ok) => setTimeout(ok, 5000));
      const after: any[] = [];
      for (const [c2, v] of Object.entries((await readForms())?.data?.dataByCompanyId ?? {})) if (c2 === co) after.push(...((Array.isArray(v) ? v : Object.values(v ?? {})) as any[]));
      const f2 = after.find((b) => (f && b.employeeId === f.employeeId) || (ph9(b.mobilePhoneNumber) && ph9(b.mobilePhoneNumber) === ph9(info.phone)));
      const e2 = f2?.auditByStatusId?.sent?.error;
      if (e2?.code === "resendLimit") return { ok: false, line: `⏸ buk חסם שליחה חוזרת (נשלח לאחרונה ${ddmm(toMs(e2.data?.lastFormSendDate))}) — לנסות שוב מחר`, bukId: f2?.employeeId ?? null };
      if (e2) return { ok: false, line: `❌ ${e2.code ?? "שגיאה"} — לבדוק את הנייד ב-buk`, bukId: f2?.employeeId ?? null };
      const s2 = f2 ? status(f2).sent : null;
      if (s2 && (!before || s2 > before)) return { ok: true, line: `✅ ${f ? "נשלח שוב" : "נשלח טופס חדש"} — הקישור יצא לעובד מ-buk`, bukId: f2?.employeeId ?? null };
      return { ok: true, line: "❔ נשלח ל-buk, עוד לא רואים אישור — יופיע בסיכום הבוקר", bukId: f2?.employeeId ?? null };
    };

    const { data: prev } = await sb.from("hr_101_status").select("company, employee_id, status");
    const before = new Map<string, string>((prev ?? []).map((p: any) => [`${p.company}|${p.employee_id}`, p.status]));
    const seeding = before.size === 0;
    // חברה שעוד אין לה שורות בטבלה (למשל אומינו כשנוספה) — רישום שקט, בלי "מילא" על כל הטפסים הישנים
    const seededCos = new Set((prev ?? []).map((p: any) => p.company));
    const target = (await cfg("HR101_STATUS_WA_TARGET")) || (await cfg("HR101_ASK_TARGET"));
    const tag = (f: any) => `*${f.name}* (${COMPANIES[f.company]})`;

    if (mode === "one") {
      const cid = Number(u.searchParams.get("confirm") ?? 0), xid = Number(u.searchParams.get("cancel") ?? 0);
      if (xid) {
        const { data } = await sb.from("hr_101_queue").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", xid).eq("status", "one_confirm").select("full_name");
        return json({ message: data?.length ? `🚫 101 ל${data[0].full_name} — בוטל, לא נשלח.` : "אין בקשת 101 פתוחה." });
      }
      if (cid) {
        const { data: row } = await sb.from("hr_101_queue").select("*").eq("id", cid).eq("status", "one_confirm").maybeSingle();
        if (!row) return json({ message: "❌ אין בקשת 101 פתוחה (אולי כבר טופלה)." });
        const co = VENUES[(u.searchParams.get("company") ?? "").trim()] ?? (String(row.note ?? "").match(/company=([A-Za-z0-9]+)/) ?? [])[1] ?? "";
        if (!COMPANIES[co]) return json({ message: `❓ מאיזו חברה התלוש של ${row.full_name}? השב: *כן פסאו* / *כן טאלה* / *כן אומינו*` });
        const mineF = raw101.filter((r) => r.company === co && ((ph9(row.phone) && r.ph === ph9(row.phone)) || (row.buk_employee_id && r.employee_id === row.buk_employee_id)));
        if (mineF.some((r) => r.ok)) {
          await sb.from("hr_101_queue").update({ status: "already_done", decided_at: new Date().toISOString() }).eq("id", cid);
          return json({ message: `✅ ${row.full_name} כבר מילא/ה 101 ב${COMPANIES[co]} — לא נשלח.` });
        }
        const here = mineF.find((r) => r.st && r.employee_id) ?? mineF.find((r) => r.employee_id) ?? null;
        await sb.from("hr_101_queue").update({ status: "sending", decided_at: new Date().toISOString() }).eq("id", cid);
        const res = await sendOne(co, here?.form ?? null, { first: row.first_name ?? "", last: row.last_name ?? "", phone: row.phone ?? "", start: String(row.start_work_date ?? new Date().toISOString().slice(0, 10)) });
        await sb.from("hr_101_queue").update({ status: res.ok ? "sent" : "failed", sent_at: res.ok ? new Date().toISOString() : null, buk_employee_id: res.bukId ?? row.buk_employee_id,
          note: `company=${co}; ${here ? "resend" : "new"}; ${res.line}`.slice(0, 500) }).eq("id", cid);
        return json({ message: `📋 *101 — ${row.full_name}* (${COMPANIES[co]})\n${res.line}` });
      }
      // תצוגה: זיהוי העובד, החברה והמצב ב-buk
      const q = (u.searchParams.get("name") ?? "").trim();
      const words = (x: any) => String(x ?? "").replace(/[^a-zא-ת\s]/gi, " ").toLowerCase().split(/\s+/).filter(Boolean);
      const qw = words(q);
      if (!qw.length) return json({ message: "צריך שם: *שלח 101 מור בניסטי*" });
      const { data: emps } = await sb.from("shift_employees").select("id, application, first_name, last_name, full_name, phone, is_active").eq("is_active", true).limit(5000);
      const nameW = (e: any) => words(e.full_name || `${e.first_name ?? ""} ${e.last_name ?? ""}`);
      let hits = (emps ?? []).filter((e: any) => /כוח אדם/.test(e.full_name ?? "") ? false : qw.every((w) => nameW(e).includes(w)));
      if (!hits.length) hits = (emps ?? []).filter((e: any) => qw.every((w) => nameW(e).some((x) => x.startsWith(w) || (w.length >= 3 && x.length >= 3 && Math.abs(x.length - w.length) <= 1 && [...w].filter((c, i) => x[i] !== c).length <= 1))));
      const people = new Map<string, any[]>();
      for (const e of hits) { const k = ph9(e.phone).length === 9 ? ph9(e.phone) : `id${e.id}`; people.set(k, [...(people.get(k) ?? []), e]); }
      if (!people.size) return json({ message: `❌ לא מצאתי עובד/ת פעיל/ה בשיפט בשם "${q}".` });
      if (people.size > 1) return json({ message: `❓ "${q}" — יש כמה:\n${[...people.values()].map((g) => `• ${g[0].full_name || `${g[0].first_name} ${g[0].last_name}`}`).join("\n")}\nכתוב שם מלא: *שלח 101 <שם מלא>*` });
      const grp = [...people.values()][0], ids = new Set(grp.map((e: any) => Number(e.id)));
      const e0 = grp.find((e: any) => e.last_name) ?? grp[0];
      const fullName = (e0.full_name || `${e0.first_name ?? ""} ${e0.last_name ?? ""}`).trim();
      const phone = String(grp.map((e: any) => e.phone).find((x: any) => ph9(x).length === 9) ?? "").replace(/\D/g, "").replace(/^972/, "0");
      const { data: worked } = await sb.rpc("hr_worked_recent", { p_days: 60 });
      const mineW = ((worked ?? []) as any[]).filter((w) => ids.has(Number(w.employee)));
      const { data: firsts } = await sb.rpc("hr_first_shift");
      const first = ((firsts ?? []) as any[]).filter((x) => ids.has(Number(x.employee))).map((x) => String(x.first_ever)).sort()[0] ?? null;
      const byCo = new Map<string, number>(); let kitchen = 0;
      for (const w of mineW) { if (w.company === "any") kitchen += w.shifts; else byCo.set(w.company, (byCo.get(w.company) ?? 0) + w.shifts); }
      const forms101 = raw101.filter((r) => (phone && r.ph === ph9(phone)) || (!phone && nameKey(r.name) && nameKey(r.name) === nameKey(fullName)));
      const stOf = (r: any) => r.ok ? "מולא ✅" : r.failed ? "השליחה נכשלה" : r.st ? `נשלח ${ddmm(r.sent)}${r.st === "opened" ? ", נפתח ולא הושלם" : ", לא מולא"}` : "רשום בלי שליחה";
      const coSorted = [...byCo.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const co = coSorted[0] ?? forms101.filter((r) => r.st && !r.ok).sort((a, b) => (b.sent ?? 0) - (a.sent ?? 0))[0]?.company ?? null;
      const worksTxt = mineW.length ? [...[...byCo.entries()].map(([c, n]) => `${COMPANIES[c]} ${n}`), ...(kitchen ? [`מטבח ${kitchen}`] : [])].join(" · ") : "לא החתים ב-60 הימים האחרונים";
      let msg = `📋 *101 — ${fullName}*\n📱 ${phone ? "…" + phone.slice(-4) : "אין נייד בשיפט"}${first ? ` · משמרת ראשונה ${ddmm(Date.parse(first))}` : ""}\n🕐 משמרות (60 יום): ${worksTxt}\n` +
        `🗂 buk: ${forms101.length ? forms101.map((r) => `${COMPANIES[r.company]} — ${stOf(r)}`).join(" · ") : "אין 101 באף חברה"}\n`;
      if (coSorted.length > 1) msg += `⚠️ עבד/ה ביותר ממסעדה אחת — לוודא מאיזו חברה התלוש\n`;
      if (co && forms101.some((r) => r.company === co && r.ok)) return json({ message: msg + `\n✅ כבר מילא/ה 101 ב${COMPANIES[co]} — אין מה לשלוח.` });
      const here = co ? forms101.find((r) => r.company === co && r.employee_id) : null;
      if (!here && !/^0?5\d{8}$/.test(phone)) return json({ message: msg + `\n❌ אין נייד תקין בשיפט — לתקן בשיפט ולנסות שוב.` });
      await sb.from("hr_101_queue").update({ status: "superseded" }).eq("status", "one_confirm");
      const parts = fullName.split(/\s+/);
      const { data: ins } = await sb.from("hr_101_queue").insert({ shift_employee_id: Number(e0.id), application: Number(e0.application) || null, full_name: fullName,
        first_name: e0.first_name || parts[0] || "", last_name: e0.last_name || parts.slice(1).join(" "), phone: phone || null, start_work_date: first ?? new Date().toISOString().slice(0, 10),
        status: "one_confirm", source: "bot_one", buk_employee_id: here?.employee_id ?? null, note: `company=${co ?? ""}`, asked_at: new Date().toISOString() }).select("id");
      const action = here ? "שליחה חוזרת של הקישור" : "טופס חדש (פותח תיק עובד בחברה ב-buk)";
      msg += co ? `\n➡️ יישלח דרך *${COMPANIES[co]}*: ${action}\nלאשר? *כן* · חברה אחרת: *כן טאלה* / *כן אומינו* / *כן פסאו* · ביטול: *לא*`
        : `\n➡️ לא ברור מאיזו חברה התלוש. השב: *כן פסאו* / *כן טאלה* / *כן אומינו* · ביטול: *לא*`;
      return json({ id: ins?.[0]?.id ?? null, message: msg });
    }

    if (mode === "send") {
      const co = VENUES[(u.searchParams.get("venue") ?? "").trim().toLowerCase()];
      if (!co) return json({ error: "venue: paseo / tala / umino" }, 400);
      const go = u.searchParams.get("confirm") === "1", all = u.searchParams.get("all") === "1";
      const newSince = new Date(now - NEW_DAYS * 864e5).toISOString().slice(0, 10);
      const { noForm } = await workedNoForm(true);
      const mine = noForm.filter((x) => x.co === co);
      const ids = [...new Set(mine.map((x) => Number(x.w.employee)))];
      const { data: emps } = ids.length ? await sb.from("shift_employees").select("id, first_name, last_name, full_name, phone").in("id", ids) : { data: [] as any[] };
      const empOf = new Map<number, any>((emps ?? []).map((e: any) => [Number(e.id), e]));
      const validPh = (p: any) => /^0?5\d{8}$/.test(String(p ?? "").replace(/\D/g, "").replace(/^972/, "0"));
      const plan = mine.map((x) => {
        const e = empOf.get(Number(x.w.employee)) ?? {};
        const here = x.f && x.f.company === co ? x.f : null;
        const phone = String(e.phone ?? x.w.phone ?? "").replace(/\D/g, "").replace(/^972/, "0");
        // טופס חדש = פתיחת תיק עובד בחברה ב-buk. לעובד ותיק בלי טופס (אולי 101 מחוץ ל-buk / תלוש בחברה אחרת) — רק עם "הכל" (&all=1)
        const skip = x.any && !x.f ? "מטבח — לא ידוע לאיזו חברה, לשלוח ידנית" : !here && !validPh(phone) ? "אין נייד תקין בשיפט"
          : !here && x.fe < newSince && !all ? `ותיק/ה (מ-${x.fe.slice(8, 10)}/${x.fe.slice(5, 7)}) בלי טופס ב-buk ב${COMPANIES[co]} — טופס חדש יפתח תיק; לבדוק מול רו"ח` : null;
        return { name: x.w.full_name, x, e, here, phone, kind: here ? "resend" : "new", skip };
      });
      const todo = plan.filter((p) => !p.skip), skipped = plan.filter((p) => p.skip);
      const vName = COMPANIES[co];
      if (!go) {
        const msg = `📋 *101 ${vName} — מי חסר* (לא נשלח)\n\n` +
          (todo.length ? `אפשר לשלוח ל-${todo.length}:\n${todo.map((p) => `• ${p.name} — ${p.kind === "new" ? "טופס חדש" : "שליחה חוזרת"}`).join("\n")}` : "אין למי לשלוח.") +
          (skipped.length ? `\n\nלבדיקה:\n${skipped.map((p) => `• ${p.name} — ${p.skip}`).join("\n")}` : "") +
          (todo.length ? `\n\nלשליחה לעובד/ת: *שלח 101 <שם מלא>*` : "");
        return json({ mode, venue: vName, preview: true, message: msg });
      }
      // 13/10: שליחה מרוכזת בוטלה לבקשת ירין — רק פרטני עם אישור (mode=one)
      return json({ error: "שליחה מרוכזת בוטלה (13/10) — רק שליחה פרטנית עם אישור (mode=one)" }, 400);
    }

    let message = "";
    if (mode === "live") {
      const fresh = seeding ? [] : forms.filter((f) => seededCos.has(f.company) && FILLED.has(f.status) && !FILLED.has(before.get(`${f.company}|${f.employee_id}`) ?? ""));
      if (fresh.length) message = `📋 *טופס 101*\n\n${fresh.map((f) => `✅ ${tag(f)} מילא/ה את הטופס (${HE[f.status]})`).join("\n")}`;
    } else {
      const ilDow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getDay();
      const full = u.searchParams.get("full") === "1" || ilDow === 0;
      const { noForm, inNoForm } = await workedNoForm(full);
      const pending = forms.filter((f) => !inNoForm.has(`${f.company}|${f.employee_id}`) && !FILLED.has(f.status) && f.sent_at && now - Date.parse(f.sent_at) <= PENDING_DAYS * 864e5)
        .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
      const recent = forms.filter((f) => f.filled_at && now - Date.parse(f.filled_at) <= RECENT_DAYS * 864e5)
        .sort((a, b) => Date.parse(b.filled_at) - Date.parse(a.filled_at));
      if (pending.length || recent.length || failedSend.length || noForm.length) {
        const nm = (f: any) => `*${f.name}*`;
        message = `📋 *טופס 101 — מצב*${full ? " (רשימה שבועית מלאה)" : ""}\n`;
        for (const co of VENUE_ORDER) {
          const nf = noForm.filter((x) => x.co === co), fs = failedSend.filter((f) => f.company === co);
          const pd = pending.filter((f) => f.company === co), rc = recent.filter((f) => f.company === co);
          if (!nf.length && !fs.length && !pd.length && !rc.length) continue;
          message += `\n━━━━━━━━━━\n🏠 *${COMPANIES[co]}*\n`;
          if (nf.length) message += `\n🚨 *${full ? `עבדו ב-${WORKED_DAYS} הימים האחרונים` : "עובדים חדשים"} בלי 101 ממולא (${nf.length}):*\n${nf.map((x) => x.line).join("\n")}\n`;
          if (fs.length) message += `\n❌ *השליחה נכשלה — לבדוק נייד ב-buk ולשלוח שוב (${fs.length}):*\n` +
            fs.map((f) => `• ${nm(f)} — ${ddmm(f.at)} (${f.code})`).join("\n") + "\n";
          if (pd.length) message += `\n⏳ *עוד לא מילאו (${pd.length}):*\n` + pd.map((f) => {
            const days = Math.floor((now - Date.parse(f.sent_at)) / 864e5);
            return `• ${nm(f)} — נשלח ${ddmm(Date.parse(f.sent_at))} (לפני ${days} ימים)${f.status === "opened" ? " · פתח/ה ולא סיים/ה" : ""}${days >= 3 ? " ⚠️" : ""}`;
          }).join("\n") + "\n";
          if (rc.length) message += `\n✅ *מילאו ב-${RECENT_DAYS} הימים האחרונים (${rc.length}):*\n` + rc.map((f) => `• ${nm(f)} — ${ddmm(Date.parse(f.filled_at))}`).join("\n") + "\n";
        }
        message += `\nלשליחה לעובד/ת: *שלח 101 <שם מלא>*`;
      }
    }

    if (dry) return json({ mode, dry, seeding, forms: forms.length, skipped, message: message || null });
    let sent = false;
    if (message && target) sent = await send(target, message);
    // שומרים מצב רק אם ההתראה יצאה (או שלא היה מה לשלוח) — כדי לא לאבד "מילא" כשהשליחה נכשלה
    if (mode === "live" && (sent || !message))
      await sb.from("hr_101_status").upsert(forms.map((f) => ({ ...f, updated_at: new Date().toISOString() })), { onConflict: "company,employee_id" });
    return json({ mode, seeding, forms: forms.length, message: message || null, sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
