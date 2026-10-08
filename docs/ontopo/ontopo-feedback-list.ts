// גיבוי: הקוד של ontopo-feedback-list (גרסה 5) לפני שהסלוט נוצל ל-hr-101-status (08/10/2026).
// דוח טלגרם "לקוחות למשוב" — כבוי (job 2 לא פעיל, ירין ביקש להפסיק את כל מה שקשור לטלגרם).
// הוסרו מהגיבוי: מספר הטלפון של חשבון Ontopo (PHONE) ומפתח ברירת המחדל — להשלים מ-app_config לפני שחזור.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CONSUMER_API = "https://ontopo.com/api";
const MGMT_API = "https://top-openapi-legacy.prod-01.ontopo.cz/graphql";
const PHONE = "<ONTOPO_ACCOUNT_PHONE>";
const DAY_START_HOUR = "0400";
const WALKIN_REGEX = /^(מזדמן|walk.?in|passerby)$/i;

const VENUES: Record<string, any> = {
  paseo: { name: "פסאו", venue_id: "62caa154a9f912000f698bc3" },
  umino: { name: "אומינו", venue_id: "64a3d2729a74080014bc9515" },
};

// Statuses indicating customer actually arrived (or very likely did, if not cancelled/no-show)
const ARRIVED_STATUSES = new Set(["seated", "arrived", "approved"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "no_show", "declined", "deleted"]);

function isWalkIn(v: any): boolean {
  const p = v.patron || {};
  const name = (typeof p === "object" ? (p.name || "") : "").trim();
  if (!name) return true;
  return WALKIN_REGEX.test(name);
}

function getPatronName(v: any): string {
  const p = v.patron || {};
  return ((typeof p === "object" ? (p.name || "") : "").trim()) || "ללא שם";
}

function getPatronPhone(v: any): string {
  const p = v.patron || {};
  if (typeof p !== "object") return "";
  const phone = (p.phone || p.mobile || "").trim();
  if (!phone) return "";
  if (phone.startsWith("+972")) return "0" + phone.substring(4);
  if (phone.startsWith("972") && phone.length === 12) return "0" + phone.substring(3);
  return phone;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, "0")}${d.getDate().toString().padStart(2, "0")}`;
}
function fmtDateShort(d: Date): string {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}
const HEBREW_DAYS: Record<number, string> = { 0: "ראשון", 1: "שני", 2: "שלישי", 3: "רביעי", 4: "חמישי", 5: "שישי", 6: "שבת" };
function hebDayName(d: Date): string { return HEBREW_DAYS[d.getDay() % 7]; }

function fmtTime(raw: string): string {
  const parts = (raw || "").trim().split(" ");
  let hhmm: string;
  if (parts.length > 1) hhmm = parts[1];
  else if ((raw || "").length >= 12) hhmm = raw.slice(-4);
  else hhmm = "0000";
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

async function getAnonymousToken(): Promise<string> {
  const resp = await fetch(`${CONSUMER_API}/loginAnonymously`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  return (await resp.json()).jwt_token;
}
async function gql(query: string, variables: any, token: string): Promise<any> {
  const resp = await fetch(MGMT_API, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  return await resp.json();
}

const sb = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

let currentToken = ""; let currentRefresh = "";
async function loadTokens(): Promise<boolean> {
  const { data } = await sb.from("ontopo_tokens").select("*").eq("id", "main").single();
  if (!data) return false;
  currentToken = data.login_token; currentRefresh = data.login_refresh;
  return true;
}
async function persistTokens(): Promise<void> {
  await sb.from("ontopo_tokens").upsert({ id: "main", login_token: currentToken, login_refresh: currentRefresh, updated_at: new Date().toISOString() });
}
async function doSwitchVenue(venueId: string): Promise<string> {
  const data = await gql(`mutation($i:SwitchVenueInput!){switchVenue(input:$i){jwt_token refresh_token}}`,
    { i: { refresh_token: currentRefresh, venue_id: venueId, phone: PHONE, regionCode: "IL" } }, currentToken);
  if (data.errors || !data.data?.switchVenue) throw new Error(JSON.stringify(data));
  currentRefresh = data.data.switchVenue.refresh_token;
  await persistTokens();
  return data.data.switchVenue.jwt_token;
}
async function tryRefresh(): Promise<boolean> {
  try {
    const anon = await getAnonymousToken();
    const data = await gql(`mutation($i:RefreshTokenInput!){refreshToken(input:$i){jwt_token refresh_token}}`,
      { i: { refresh_token: currentRefresh } }, anon);
    if (data.errors || !data.data?.refreshToken) return false;
    currentToken = data.data.refreshToken.jwt_token;
    currentRefresh = data.data.refreshToken.refresh_token;
    await persistTokens();
    return true;
  } catch { return false; }
}
async function switchVenueWithRetry(venueId: string): Promise<string> {
  try { return await doSwitchVenue(venueId); }
  catch (err) { if (await tryRefresh()) return await doSwitchVenue(venueId); throw err; }
}

let tgBotToken = ""; let tgChatId = "";
async function loadTelegramSecrets(): Promise<boolean> {
  if (tgBotToken && tgChatId) return true;
  const { data } = await sb.from("app_config").select("key, value").in("key", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);
  if (!data) return false;
  for (const row of data) {
    if (row.key === "TELEGRAM_BOT_TOKEN") tgBotToken = row.value;
    if (row.key === "TELEGRAM_CHAT_ID") tgChatId = row.value;
  }
  return Boolean(tgBotToken && tgChatId);
}

async function sendToTelegram(text: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  if (!await loadTelegramSecrets()) { errors.push("secrets_missing"); return { sent: 0, errors }; }
  const MAX = 3800;
  const chunks: string[] = [];
  if (text.length <= MAX) chunks.push(text);
  else {
    let buf = "";
    for (const line of text.split("\n")) {
      if ((buf + "\n" + line).length > MAX) { if (buf) chunks.push(buf); buf = line; }
      else buf = buf ? buf + "\n" + line : line;
    }
    if (buf) chunks.push(buf);
  }
  let sent = 0;
  for (const chunk of chunks) {
    const resp = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: tgChatId, text: chunk, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
    if (!resp.ok) {
      const resp2 = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChatId, text: chunk, disable_web_page_preview: true }),
      });
      if (!resp2.ok) errors.push(`${resp2.status} ${await resp2.text()}`); else sent++;
    } else sent++;
  }
  return { sent, errors };
}

function buildFeedbackMessage(venueKey: string, customers: any[], dateLabel: string, dayName: string): string {
  const cfg = VENUES[venueKey];
  const lines: string[] = [];
  lines.push(`📞 *לקוחות למשוב — ${cfg.name}*`);
  lines.push(`📅 יום ${dayName} ${dateLabel}`);
  lines.push(`👥 *סה"כ:* ${customers.length} לקוחות`);
  lines.push("");
  if (!customers.length) {
    lines.push("אין לקוחות ליום זה.");
    return lines.join("\n");
  }
  customers.sort((a, b) => fmtTime(a.time || a.expected || "").localeCompare(fmtTime(b.time || b.expected || "")));
  let withPhone = 0;
  let noPhone = 0;
  for (const v of customers) {
    const name = getPatronName(v);
    const phone = getPatronPhone(v);
    const time = fmtTime(v.time || v.expected || "");
    const size = parseInt(v.size || "0") || 0;
    const noteRaw = (v.note || "").trim();
    const note = noteRaw ? noteRaw.replace(/\n/g, " / ").substring(0, 100) : "";
    if (phone) withPhone++;
    else noPhone++;
    let line = `• *${name}* | ${time} | ${size} סועדים`;
    if (phone) line += `\n   📞 \`${phone}\``;
    else line += `\n   ⚠️ אין טלפון`;
    if (note) line += `\n   📝 ${note}`;
    lines.push(line);
    lines.push("");
  }
  lines.push("━".repeat(20));
  lines.push(`✅ *עם טלפון:* ${withPhone}`);
  if (noPhone > 0) lines.push(`⚠️ *בלי טלפון:* ${noPhone}`);
  lines.push("");
  lines.push("💬 להתקשר ולברר על חוויית הלקוח: שירות, ניקיון, טיב האוכל, אווירה");
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const apiKey = url.searchParams.get("key") || "";
    const expectedKey = Deno.env.get("ONTOPO_API_KEY") || "<ONTOPO_API_KEY>";
    if (apiKey !== expectedKey) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const venueParam = url.searchParams.get("venue") || "all";
    const send = url.searchParams.get("send") || "";
    const dateParam = url.searchParams.get("date") || "yesterday";

    if (!await loadTokens()) return new Response(JSON.stringify({ error: "no_token" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const ilNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    let targetDate: Date;
    if (dateParam === "yesterday") {
      targetDate = new Date(ilNow); targetDate.setDate(ilNow.getDate() - 1);
    } else if (dateParam === "today") {
      targetDate = new Date(ilNow);
    } else if (/^\d{8}$/.test(dateParam)) {
      const y = parseInt(dateParam.substring(0, 4));
      const m = parseInt(dateParam.substring(4, 6)) - 1;
      const d = parseInt(dateParam.substring(6, 8));
      targetDate = new Date(y, m, d);
    } else {
      return new Response(JSON.stringify({ error: "invalid date param" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const dateKey = fmtDate(targetDate);
    const dateLabel = fmtDateShort(targetDate);
    const dayName = hebDayName(targetDate);

    const venueList = venueParam === "all" ? Object.keys(VENUES) : [venueParam];
    const reports: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const telegramResults: Record<string, any> = {};

    for (const venueKey of venueList) {
      const cfg = VENUES[venueKey]; if (!cfg) continue;
      let venueToken: string;
      try { venueToken = await switchVenueWithRetry(cfg.venue_id); }
      catch (e) {
        if (send === "telegram") await sendToTelegram("⚠️ Ontopo token expired — צריך להתחבר מחדש");
        return new Response(JSON.stringify({ error: "token_expired", venue: venueKey, details: String(e) }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const data = await gql("query($i:GetPartiesByInput!){getPartiesBy(input:$i)}",
        { i: { filterType: "date", filterParam: dateKey, hour: DAY_START_HOUR } }, venueToken);
      let parties = data.data?.getPartiesBy || [];
      if (typeof parties === "string") parties = JSON.parse(parties);

      const arrived: any[] = [];
      for (const p of parties) {
        const v = p?.value || p;
        if (typeof v !== "object" || !v) continue;
        if (CANCELLED_STATUSES.has(v.status)) continue;
        if (!ARRIVED_STATUSES.has(v.status)) continue;
        if (isWalkIn(v)) continue;
        arrived.push(v);
      }

      reports[venueKey] = buildFeedbackMessage(venueKey, arrived, dateLabel, dayName);
      counts[venueKey] = arrived.length;

      if (send === "telegram") {
        if (arrived.length > 0) telegramResults[venueKey] = await sendToTelegram(reports[venueKey]);
        else telegramResults[venueKey] = { skipped: "no customers" };
      }
    }

    return new Response(JSON.stringify({ status: "ok", date: dateKey, counts, reports, telegram: telegramResults }),
      { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
