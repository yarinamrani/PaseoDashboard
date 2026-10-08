// מעקב מילוי טופס 101 ב-buk → וואטסאפ לקבוצה שב-app_config.HR101_STATUS_WA_TARGET (ברירת מחדל HR101_ASK_TARGET = PaseoInvoices).
// פרוס בסלוט של ontopo-feedback-list (דוח טלגרם כבוי; גיבוי ב-docs/ontopo/). שולח דרך Green API (Whapi בניסיון שמוצה).
// מקור האמת: getAllEmployeesForms101 של buk — כל טופס שנשלח, גם אם נשלח ידנית מ-buk ולא דרך הבוט.
//   ?mode=live   (כל שעה) — "✅ מילא/ה 101" לכל טופס שעבר לנחתם/הושלם/אומת מאז הריצה הקודמת. ריצה ראשונה = רישום שקט.
//   ?mode=digest (כל בוקר) — מי עוד לא מילא (נשלח/נפתח, נשלח ב-90 הימים האחרונים) + מי מילא ב-7 הימים האחרונים.
//   ?dry=1 — מחזיר את ההודעה בלי לשלוח ובלי לשמור.
// מצב אחרון לכל טופס בטבלה hr_101_status. מפתח ה-Web API של buk וה-refresh token: app_config.BUK_FB_API_KEY / env BUK_REFRESH_TOKEN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const COMPANIES: Record<string, string> = { VRP5IK2cpacu2ZmPMcjt: "פסאו", VZgAaVfmSuJlrb3xOSv2: "טאלה" };
const ORDER = ["sent", "opened", "signed", "done", "verified"];
const HE: Record<string, string> = { sent: "נשלח", opened: "נפתח", signed: "נחתם", done: "הושלם", verified: "אומת" };
const FILLED = new Set(["signed", "done", "verified"]);
const PENDING_DAYS = 90, RECENT_DAYS = 7;

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
function status(f: any): { st: string | null; at: number | null; sent: number | null } {
  const a = f?.auditByStatusId ?? {};
  let st: string | null = null, at: number | null = null;
  for (const s of ORDER) if (a[s]?.date && !a[s].error) { st = s; at = toMs(a[s].date); }
  return { st, at, sent: toMs(a.sent?.date) };
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
    const mode = u.searchParams.get("mode") === "digest" ? "digest" : "live";
    const dry = u.searchParams.get("dry") === "1";
    const now = Date.now();

    const r = await fetch("https://bookeeping-prod.appspot.com/emp/getAllEmployeesForms101", {
      method: "POST", headers: { Authorization: `Bearer ${await idToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { taxYear: new Date().getUTCFullYear(), companiesIdsToGet: Object.fromEntries(Object.keys(COMPANIES).map((c) => [c, true])) } }),
    });
    if (!r.ok) return json({ error: `buk ${r.status}`, body: (await r.text()).slice(0, 300) }, 502);
    const j = await r.json();
    const forms: any[] = [];
    for (const [co, v] of Object.entries(j?.data?.dataByCompanyId ?? j?.dataByCompanyId ?? {})) {
      if (!COMPANIES[co]) continue;
      for (const f of (Array.isArray(v) ? v : Object.values(v ?? {})) as any[]) {
        const s = status(f);
        if (!s.st || !f.employeeId) continue;
        forms.push({ company: co, employee_id: String(f.employeeId), name: (f.employeeName || `${f.firstName ?? ""} ${f.lastName ?? ""}`).trim(),
          status: s.st, sent_at: s.sent ? new Date(s.sent).toISOString() : null, filled_at: FILLED.has(s.st) && s.at ? new Date(s.at).toISOString() : null });
      }
    }

    const { data: prev } = await sb.from("hr_101_status").select("company, employee_id, status");
    const before = new Map<string, string>((prev ?? []).map((p: any) => [`${p.company}|${p.employee_id}`, p.status]));
    const seeding = before.size === 0;
    const target = (await cfg("HR101_STATUS_WA_TARGET")) || (await cfg("HR101_ASK_TARGET"));
    const tag = (f: any) => `*${f.name}* (${COMPANIES[f.company]})`;

    let message = "";
    if (mode === "live") {
      const fresh = seeding ? [] : forms.filter((f) => FILLED.has(f.status) && !FILLED.has(before.get(`${f.company}|${f.employee_id}`) ?? ""));
      if (fresh.length) message = `📋 *טופס 101*\n\n${fresh.map((f) => `✅ ${tag(f)} מילא/ה את הטופס (${HE[f.status]})`).join("\n")}`;
    } else {
      const pending = forms.filter((f) => !FILLED.has(f.status) && f.sent_at && now - Date.parse(f.sent_at) <= PENDING_DAYS * 864e5)
        .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
      const recent = forms.filter((f) => f.filled_at && now - Date.parse(f.filled_at) <= RECENT_DAYS * 864e5)
        .sort((a, b) => Date.parse(b.filled_at) - Date.parse(a.filled_at));
      if (pending.length || recent.length) {
        message = `📋 *טופס 101 — מצב*\n`;
        if (pending.length) message += `\n⏳ *עוד לא מילאו (${pending.length}):*\n` + pending.map((f) => {
          const days = Math.floor((now - Date.parse(f.sent_at)) / 864e5);
          return `• ${tag(f)} — נשלח ${ddmm(Date.parse(f.sent_at))} (לפני ${days} ימים)${f.status === "opened" ? " · פתח/ה ולא סיים/ה" : ""}${days >= 3 ? " ⚠️" : ""}`;
        }).join("\n") + "\n";
        if (recent.length) message += `\n✅ *מילאו ב-${RECENT_DAYS} הימים האחרונים (${recent.length}):*\n` + recent.map((f) => `• ${tag(f)} — ${ddmm(Date.parse(f.filled_at))}`).join("\n") + "\n";
        if (pending.length) message += `\nלתזכורת — לשלוח לעובד שוב את הקישור מ-buk.`;
      }
    }

    if (dry) return json({ mode, dry, seeding, forms: forms.length, message: message || null });
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
