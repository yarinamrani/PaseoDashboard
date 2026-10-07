// גיבוי: הקוד של contest-watch (גרסה 4) לפני שהסלוט נוצל ל-shift-clock-watch (07/10/2026).
// התחרות הסתיימה והמשימה המתוזמנת כובתה. לשחזור — לפרוס את הקובץ הזה לסלאג contest-watch.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// התראת תחרות מבוססת-אירוע.
// מדווחת על *כל* הביקורות עם שם שנכנסו מאז ההתראה הקודמת — לא רק האחרונה.
// אם השליחה נכשלה לגמרי — הסמן לא מתקדם, כדי שהביקורת לא תאבד.
// אם הטבלה נכשלה — מנסים שוב, ואם גם זה נכשל מסמנים להרצה הבאה לשלוח אותה.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = Deno.env.get("SUPABASE_URL")!;

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
async function setCfg(k: string, v: string) {
  await sb.from("app_config").upsert({ key: k, value: v }, { onConflict: "key" });
}

type Api = { url: string; inst: string; tok: string };

async function waSend(chatId: string, message: string, api: Api) {
  try {
    const r = await fetch(`${api.url}/waInstance${api.inst}/sendMessage/${api.tok}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

async function logSend(fn: string, chatId: string, res: { ok: boolean; status: number; body: string }, preview: string) {
  try {
    await sb.from("wa_send_log").insert({
      fn, chat_id: chatId, ok: res.ok, status: res.status,
      error: res.ok ? null : (res.body || "").slice(0, 1000),
      preview: (preview || "").slice(0, 300),
    });
  } catch (_e) { /* logging must never break the send path */ }
}

async function sendWithFallback(fn: string, target: string, message: string, api: Api) {
  const first = await waSend(target, message, api);
  await logSend(fn, target, first, message);
  if (first.ok) return { ok: true, delivered_to: target, to: target, status: first.status, error: null as string | null, tried: [target] };

  let fallbacks: string[] = [];
  try {
    const raw = (await cfg("WA_FALLBACK_CHATS")) || (await cfg("WA_INVOICE_GROUPS")) || "[]";
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) fallbacks = parsed.filter((x: any) => typeof x === "string");
  } catch (_e) { fallbacks = []; }

  const tried = [target];
  const head = `⚠️ *כשל בשליחה*\nיעד מקורי: ${target}\nקוד: ${first.status}\n${(first.body || "").slice(0, 300)}\n\n———\n\n`;
  for (const fb of fallbacks) {
    if (fb === target || tried.includes(fb)) continue;
    const r = await waSend(fb, head + message, api);
    await logSend(`${fn}:fallback`, fb, r, head);
    tried.push(fb);
    if (r.ok) return { ok: false, delivered_to: fb, to: target, status: first.status, error: (first.body || "").slice(0, 500), tried };
  }
  return { ok: false, delivered_to: null, to: target, status: first.status, error: (first.body || "").slice(0, 500), tried };
}

// שולח את הטבלה דרך contest-daily, עם ניסיונות חוזרים.
// 502 מ-Supabase לפני שהפונקציה עולה הוא תקלה רגעית — ניסיון שני כמעט תמיד עובר.
async function sendBoard(secret: string, tries = 3): Promise<{ sent: boolean; last: string }> {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/functions/v1/contest-daily?secret=${encodeURIComponent(secret)}`);
      const txt = await r.text().catch(() => "");
      last = `${r.status} ${txt.slice(0, 200)}`;
      let j: any = {}; try { j = JSON.parse(txt); } catch (_e) { j = {}; }
      if (j?.sent === true) return { sent: true, last };
    } catch (e) { last = String(e); }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return { sent: false, last };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    const provided = req.headers.get("x-sync-secret") ?? url.searchParams.get("secret");
    if (!secret || provided !== secret) return new Response("unauthorized", { status: 401 });

    try {
      await fetch(`${BASE}/functions/v1/google-reviews-sync`,
        { method: "POST", headers: { "x-sync-secret": secret } });
    } catch (_e) { /* ignore */ }

    const from = url.searchParams.get("from") || "2026-07-27";
    const to = url.searchParams.get("to") || "2026-08-31";
    const lastTs = Number((await cfg("CONTEST_LAST_TS")) || 0);
    const boardPending = (await cfg("CONTEST_BOARD_PENDING")) === "1";

    // כל הביקורות עם שם שנכנסו מאז הסמן האחרון
    const { data: fresh, error: e1 } = await sb.rpc("contest_named_since",
      { p_since: lastTs, p_from: from, p_to: to });
    if (e1) return new Response(JSON.stringify({ error: e1.message }), { status: 500 });

    const items: any[] = Array.isArray(fresh) ? fresh : [];

    // אין חדש ואין חוב פתוח — יוצאים בשקט
    if (!items.length && !boardPending && url.searchParams.get("force") !== "1") {
      return new Response(JSON.stringify({ changed: false, last_ts: lastTs }),
        { headers: { "Content-Type": "application/json" } });
    }

    // הטבלה נכשלה בפעם הקודמת ואין ביקורות חדשות — רק משלימים אותה
    if (!items.length && boardPending) {
      const b = await sendBoard(secret);
      if (b.sent) await setCfg("CONTEST_BOARD_PENDING", "0");
      return new Response(JSON.stringify({ changed: false, board_recovered: b.sent, detail: b.last }),
        { headers: { "Content-Type": "application/json" } });
    }

    const apiUrl = await cfg("GREENAPI_API_URL"), inst = await cfg("GREENAPI_ID_INSTANCE"), tok = await cfg("GREENAPI_API_TOKEN");
    const target = url.searchParams.get("to_chat") || await cfg("CONTEST_WA_TARGET") || await cfg("WD_WATCHDOG_CHAT");

    let alert: any = null;
    if (items.length && apiUrl && inst && tok && target) {
      const title = items.length === 1
        ? `🔔 *ביקורת חדשה עם שם*`
        : `🔔 *${items.length} ביקורות חדשות עם שם*`;
      let msg = `${title}\n\n`;
      for (const it of items) {
        msg += `⭐${it.rating} ${it.author}\n«${it.snippet}»\n← *${it.owner}*\n\n`;
      }
      alert = await sendWithFallback("contest-watch", target, msg.trimEnd(), { url: apiUrl, inst, tok });
    }

    // הטבלה המלאה — עם ניסיונות חוזרים, וסימון להשלמה אם לא עבר
    const board = await sendBoard(secret);
    await setCfg("CONTEST_BOARD_PENDING", board.sent ? "0" : "1");

    // מקדמים את הסמן רק אם ההתראה באמת נמסרה למישהו.
    const delivered = alert === null ? true : alert.delivered_to !== null;
    const newMax = items.length ? Math.max(...items.map((i: any) => Number(i.ts))) : lastTs;
    if (delivered && newMax > lastTs) await setCfg("CONTEST_LAST_TS", String(newMax));

    return new Response(JSON.stringify({
      changed: items.length > 0, count: items.length,
      alert_delivered_to: alert?.delivered_to ?? null,
      alert_error: alert?.error ?? null,
      board_sent: board.sent, board_detail: board.last,
      prev_ts: lastTs, new_ts: delivered ? newMax : lastTs, marker_held: !delivered,
      reported: items.map((i: any) => `${i.author} -> ${i.owner}`),
    }), { status: (delivered && board.sent) ? 200 : 502, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
