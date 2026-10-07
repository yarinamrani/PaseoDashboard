// גיבוי: הקוד של contest-daily (גרסה 19) לפני שהסלוט נוצל ל-shift-week-draft (07/10/2026).
// התחרות הסתיימה (job 52 כבוי). לשחזור — לפרוס את הקובץ הזה לסלאג contest-daily.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// דוח יומי לתחרות ביקורות גוגל (27/07 – 31/08).
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MEDAL = ["🥇", "🥈", "🥉"];
const FENCE = "```";

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
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
  if (first.ok) return { ok: true, delivered_to: target, to: target, tried: [target] };

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

function dm(d: string): string { const p = d.split("-"); return `${p[2]}.${p[1]}`; }
function len(s: string): number { return [...s].length; }
function pad(s: string, n: number): string { return s + " ".repeat(Math.max(0, n - len(s))); }
function padS(s: string, n: number): string { return " ".repeat(Math.max(0, n - len(s))) + s; }
function ils(v: string): string {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? "" : "₪" + n.toLocaleString("en-US");
}
function dots(label: string, value: string, w: number): string {
  const fill = Math.max(1, w - len(label) - len(value) - 2);
  return `${label} ${".".repeat(fill)} ${value}`;
}
function clip(s: string, n: number): string {
  const a = [...(s || "")];
  if (a.length <= n) return s;
  let cut = a.slice(0, n).join("");
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > n * 0.5) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(" ");
  if (sp > n * 0.5) cut = cut.slice(0, sp);
  return cut.trimEnd() + "…";
}

const TIPS = [
  "הרגע הכי טוב לבקש הוא כשהאורח אומר תודה בסוף הארוחה.",
  "אורח שמחמיא לכם בעל פה — בקשו ממנו לכתוב את זה.",
  "בקשה אישית עובדת הכי טוב: ״אשמח אם תזכירו אותי בשם״.",
  "אורח מרוצה שמבקשים ממנו — כותב. שלא מבקשים — שוכח.",
  "שם שלכם בביקורת שווה יותר מביקורת בלי שם.",
];

function prizeLine(p: any, sep = " / "): string {
  const parts: string[] = [];
  if (p.p1) parts.push(ils(p.p1));
  if (p.p2) parts.push(ils(p.p2));
  if (p.p3) parts.push(ils(p.p3));
  return parts.join(sep);
}

// הערת שוליים על ביקורות שלא נכללו — הנוסח מגיע מ-contest_rules.content_required
function dqNote(b: any): string {
  const n = Number(b?.disqualified ?? 0);
  if (!n) return "";
  const rule = String(b?.disq_note ?? "").trim();
  let s = `(*) ${n === 1 ? "ביקורת אחת לא נכללה" : `${n} ביקורות לא נכללו`}. `;
  s += rule || "ביקורת שמזכירה שם עובד אך אינה מתייחסת למקום, לאוכל, לשירות או לאווירה — אינה נכללת בספירה.";
  s += " התחרות מודדת ביקורות שמקדמות את פסאו, לא אזכורי שם.";
  return s;
}

// פירוט הפסילות לפי עובד — בפורמט הקבלה
function dqRows(b: any, W: number, withTop: boolean): string {
  const list = (b?.disq_by ?? []) as any[];
  if (!list.length) return "";
  let s = withTop ? "\n" + "-".repeat(W) + "\n" : "";
  s += "לא נכללו בספירה (*)\n";
  for (const d of list) s += dots(String(d.owner ?? ""), String(d.count ?? 0), W) + "\n";
  s += "-".repeat(W) + "\n";
  return s;
}

// פירוט הפסילות בשורה אחת — לשאר הסגנונות
function dqLine(b: any): string {
  const list = (b?.disq_by ?? []) as any[];
  if (!list.length) return "";
  return `לא נכללו (*): ` + list.map((d: any) => `${d.owner} ${d.count}`).join(" · ");
}

function render(style: string, b: any, prize: any, footerCfg: string): string {
  const board = b.board ?? [];
  const attribution = b.needs_attribution ?? [];
  const newest = b.newest ?? [], finished = b.finished === true, left = b.days_left ?? 0;
  const lead = board[0], second = board[1];
  const gap = lead ? lead.mentions - (second?.mentions ?? 0) : 0;
  const q = b.best_quote;
  const head = finished ? "🏁 *תחרות ביקורות — תוצאות סופיות*" : "🏆 *תחרות ביקורות גוגל*";
  const nm = (r: any) => r.shared ? `${r.name} (לשיוך)` : (r.full_name || r.name);
  const fc = (footerCfg || "").trim();
  const foot = fc === "" ? "" : (fc === "auto" ? TIPS[(b.days_elapsed ?? 0) % TIPS.length] : fc);
  const dq = dqNote(b);
  const dql = dqLine(b);
  let m = "";

  if (style === "receipt") {
    const W = 26;
    m += FENCE + "\n" + "=".repeat(W) + "\n";
    m += padS("פסאו", Math.floor((W + 4) / 2)) + "\n";
    m += padS(finished ? "תחרות הביקורות — סיכום" : "תחרות הביקורות", Math.floor((W + 16) / 2)) + "\n";
    m += "=".repeat(W) + "\n\n";
    if (!board.length) m += "אין עדיין אזכורים\n\n";
    else board.forEach((r: any, i: number) => { m += dots(`${i + 1}. ${nm(r)}`, String(r.mentions), W) + "\n"; });
    if (!finished) {
      m += "\n" + "-".repeat(W) + "\n";
      m += dots("ימים שנותרו", String(left), W) + "\n";
      m += "-".repeat(W) + "\n";
    }
    m += dqRows(b, W, finished);
    m += "\n";
    if (prize.p1) m += dots("מקום ראשון", ils(prize.p1), W) + "\n";
    if (prize.p2) m += dots("מקום שני", ils(prize.p2), W) + "\n";
    if (prize.p3) m += dots("מקום שלישי", ils(prize.p3), W) + "\n";
    m += "\n" + "=".repeat(W) + "\n" + FENCE;
    if (dq) m += `\n${dq}`;
    if (finished) m += `\nתודה לכולם על חודש של שירות מצוין.`;
    else if (foot) m += `\n${foot}`;
    return m;
  }

  if (style === "wall") {
    m += finished ? `*מה האורחים אמרו החודש*\n\n` : `*מה האורחים אומרים עלינו*\n\n`;
    const quotes = (newest || []).filter((n: any) => n.rating >= 4).slice(0, 2);
    if (quotes.length) for (const n of quotes) m += `«${clip(n.snippet, 200)}»\n_${n.author}_\n\n`;
    else if (q && q.clean) m += `«${clip(q.clean, 200)}»\n_${q.author}_\n\n`;
    m += `———\n\n`;
    if (!board.length) m += `עדיין אף שם לא הוזכר בביקורות.\n`;
    else {
      m += `*מי הוזכר בשם:*\n`;
      board.forEach((r: any, i: number) => { m += `${i + 1}. ${nm(r)} — ${r.mentions}\n`; });
    }
    if (dql) m += `\n${dql}\n`;
    if (dq) m += `\n${dq}\n`;
    if (foot && !finished) m += `\n${foot}\n`;
    m += finished ? `\n_פרסים ${prizeLine(prize)}_` : `\n_נותרו ${left} ימים · פרסים ${prizeLine(prize)}_`;
    return m;
  }

  if (style === "league") {
    m += finished ? `*ליגת הביקורות — טבלה סופית*\n\n`
                  : `*ליגת הביקורות* · מחזור ${b.days_elapsed}\n_נותרו ${left} ימים לסיום העונה_\n\n`;
    if (!board.length) m += `הטבלה עדיין ריקה.\n`;
    else {
      const w = Math.max(...board.map((r: any) => len(nm(r))), 8);
      m += FENCE + "\n" + `${pad("#", 2)} ${pad("שם", w)} נק'\n` + "-".repeat(w + 8) + "\n";
      board.forEach((r: any, i: number) => {
        m += `${pad(String(i + 1), 2)} ${pad(nm(r), w)} ${padS(String(r.mentions), 3)}\n`;
      });
      m += FENCE + "\n";
    }
    if (second) m += `\nהפרש מהצמרת: ${gap} נקודות.\n`;
    if (dql) m += `\n${dql}\n`;
    if (dq) m += `\n${dq}\n`;
    m += `\n*פרסים:* ${prizeLine(prize)}`;
    if (finished) m += `\n\nתודה לכולם על עונה מצוינת.`;
    else if (foot) m += `\n\n${foot}`;
    return m;
  }

  if (style.startsWith("team")) {
    const formal = style === "team_formal";
    if (finished) {
      m += formal ? `*תחרות הביקורות — תוצאות סופיות*\n${dm(b.from)} – ${dm(b.to)}\n\n`
                    : `*תחרות הביקורות — תוצאות סופיות* 🏁\n${dm(b.from)} – ${dm(b.to)}\n\n`;
      board.slice(0, 3).forEach((r: any, i: number) => {
        const money = [prize.p1, prize.p2, prize.p3][i];
        m += `*${i + 1}.* ${nm(r)} — ${r.mentions}${money ? `  ·  ${ils(money)}` : ""}\n`;
      });
      board.slice(3).forEach((r: any, i: number) => { m += `${i + 4}. ${nm(r)} — ${r.mentions}\n`; });
      if (dql) m += `\n${dql}\n`;
      if (dq) m += `\n${dq}\n`;
      m += `\nתודה לכולם על חודש של שירות מצוין.`;
      return m;
    }
    if (style === "team_race") {
      m += `*סטטוס תחרות* · נותרו ${left} ימים\n\n`;
      if (!board.length) m += `אין עדיין אזכורים.\n\n`;
      else {
        const max = Math.max(...board.map((r: any) => r.mentions), 1);
        const w = Math.max(...board.map((r: any) => len(nm(r))), 4);
        m += FENCE + "\n";
        board.forEach((r: any) => {
          const l = Math.max(1, Math.round((r.mentions / max) * 10));
          m += `${pad(nm(r), w)} ${"█".repeat(l)} ${r.mentions}\n`;
        });
        m += FENCE + `\n\n`;
      }
      if (dql) m += `${dql}\n\n`;
      if (dq) m += `${dq}\n\n`;
      m += `*פרסים:* ${prizeLine(prize)}`;
      if (foot) m += `\n\n${foot}`;
      return m;
    }
    m += formal ? `*סטטוס תחרות הביקורות*\n` : `*סטטוס תחרות הביקורות* 🏆\n`;
    m += `${dm(b.from)} – ${dm(b.to)} · נותרו ${left} ימים\n\n`;
    if (!board.length) m += `אין עדיין אזכורי שם בביקורות.\n\n`;
    else {
      board.forEach((r: any, i: number) => { m += `*${i + 1}.* ${nm(r)} — ${r.mentions}\n`; });
      m += `\n`;
      if (second) m += `הפער למקום הראשון: ${gap}.\n\n`;
    }
    if (q && q.clean) {
      m += formal ? `*מתוך ביקורת אחרונה:*\n«${clip(q.clean, 200)}»\n${q.author}, דירוג ${q.rating}\n\n`
                  : `«${clip(q.clean, 200)}»\n_${q.author}, דירוג ${q.rating}_\n\n`;
    }
    if (dql) m += `${dql}\n\n`;
    if (dq) m += `${dq}\n\n`;
    m += `*פרסים:* ${prizeLine(prize)}`;
    if (foot) m += `\n\n${foot}`;
    return m;
  }

  if (style === "minimal") {
    m += `${head}\n` + (finished ? `\n` : `_נותרו ${left} ימים_\n\n`);
    if (!board.length) return m + "עדיין אין אזכורים.";
    board.forEach((r: any, i: number) => { m += `${MEDAL[i] ?? (i + 1) + "."} ${nm(r)} — *${r.mentions}*\n`; });
    if (dql) m += `\n_${dql}_`;
    if (dq) m += `\n_${dq}_`;
    if (attribution.length) m += `\n_⚠️ ${attribution.length} דורשים שיוך_`;
    return m;
  }
  if (style === "bars") {
    m += `${head}\n_יום ${b.days_elapsed} מתוך ${b.days_total} · נותרו ${left}_\n\n`;
    if (!board.length) return m + "עדיין אין אזכורים.";
    const max = Math.max(...board.map((r: any) => r.mentions), 1);
    const w = Math.max(...board.map((r: any) => len(nm(r))), 4);
    m += FENCE + "\n";
    board.forEach((r: any) => {
      const l = Math.max(1, Math.round((r.mentions / max) * 10));
      m += `${pad(nm(r), w)} ${"█".repeat(l)} ${r.mentions}\n`;
    });
    m += FENCE;
    if (dql) m += `\n${dql}`;
    if (dq) m += `\n${dq}`;
    return m;
  }
  if (style === "pulse") {
    m += `📊 *עדכון יומי · תחרות ביקורות*\n\n`;
    const n24 = b.reviews_last_24h ?? 0;
    if (n24) {
      const movers = board.filter((r: any) => r.new_24h > 0).map((r: any) => `${nm(r)} +${r.new_24h}`).join(", ");
      m += `*מאתמול:* ${n24} ביקורות חדשות\n` + (movers ? `זזו: ${movers}\n\n` : `אף אחת לא הזכירה שם.\n\n`);
    } else m += `*מאתמול:* אין ביקורות חדשות.\n\n`;
    if (lead) {
      m += `*מובילה:* ${nm(lead)} — ${lead.mentions}\n`;
      m += second ? `*אחריה:* ${nm(second)} — ${second.mentions} _(פער ${gap})_\n` : `_אין מתחרים נוספים עדיין_\n`;
    } else m += `_עדיין אין אזכורים_\n`;
    if (dql) m += `\n${dql}\n`;
    if (dq) m += `\n${dq}\n`;
    if (!finished) m += `\n_נותרו ${left} ימים_`;
    return m;
  }

  m += `${head}\n_${dm(b.from)} – ${dm(b.to)}`;
  m += finished ? `_\n\n` : ` · נותרו ${left} ימים_\n\n`;
  if (!board.length) m += `עדיין אין אזכורי שם.\n`;
  else board.forEach((r: any, i: number) => {
    m += `${MEDAL[i] ?? (i + 1) + "."} *${nm(r)}* — ${r.mentions} אזכור${r.mentions === 1 ? "" : "ים"}\n`;
  });
  if (dql) m += `\n${dql}\n`;
  if (dq) m += `\n${dq}\n`;
  if (newest.length && !finished) {
    m += `\n📝 *הביקורות האחרונות:*\n`;
    for (const n of newest) m += `⭐${n.rating} ${dm(n.date)} · ${n.author}\n«${clip(n.snippet, 110)}»\n`;
  }
  if (attribution.length) {
    m += `\n⚠️ *דורש שיוך (${attribution.length}):*\n`;
    for (const x of attribution.slice(0, 5)) m += `• "${x.name}" · ${dm(x.date)} — ${x.candidates}\n  «${clip(x.snippet, 100)}»\n`;
  }
  return m;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    const provided = req.headers.get("x-sync-secret") ?? url.searchParams.get("secret");
    if (!secret || provided !== secret) return new Response("unauthorized", { status: 401 });
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-reviews-sync`,
        { method: "POST", headers: { "x-sync-secret": secret } });
    } catch (_e) { /* ignore */ }

    const from = url.searchParams.get("from") || "2026-07-27";
    const to = url.searchParams.get("to") || "2026-08-31";
    const style = url.searchParams.get("style") || (await cfg("CONTEST_STYLE")) || "receipt";
    const footer = url.searchParams.has("footer") ? (url.searchParams.get("footer") || "") : await cfg("CONTEST_FOOTER");
    const prize = { p1: await cfg("CONTEST_PRIZE_1"), p2: await cfg("CONTEST_PRIZE_2"), p3: await cfg("CONTEST_PRIZE_3") };

    const { data: b, error } = await sb.rpc("contest_google_board", { p_from: from, p_to: to });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    const past = new Date(to + "T00:00:00Z");
    past.setUTCDate(past.getUTCDate() + 1);
    if (new Date() > past && url.searchParams.get("force") !== "1") {
      return new Response(JSON.stringify({ skipped: "contest over" }), { headers: { "Content-Type": "application/json" } });
    }

    const msg = render(style, b, prize, footer);
    const target = url.searchParams.get("to_chat") || await cfg("CONTEST_WA_TARGET") || await cfg("WD_WATCHDOG_CHAT");
    if (url.searchParams.get("dry") === "1") {
      return new Response(JSON.stringify({ dry: true, style, to: target,
        disqualified: b?.disqualified ?? 0, disq_by: b?.disq_by ?? [],
        needs_attribution: (b?.needs_attribution ?? []).length, message: msg }), { headers: { "Content-Type": "application/json" } });
    }
    const apiUrl = await cfg("GREENAPI_API_URL"), inst = await cfg("GREENAPI_ID_INSTANCE"), tok = await cfg("GREENAPI_API_TOKEN");
    if (!apiUrl || !inst || !tok || !target) return new Response(JSON.stringify({ error: "missing config" }), { status: 500 });

    const res = await sendWithFallback("contest-daily", target, msg, { url: apiUrl, inst, tok });
    return new Response(JSON.stringify({
      sent: res.delivered_to !== null, style, to: target,
      delivered_to: res.delivered_to, send_status: (res as any).status ?? 200,
      send_error: (res as any).error ?? null,
      disqualified: b?.disqualified ?? 0, disq_by: b?.disq_by ?? [],
      needs_attribution: (b?.needs_attribution ?? []).length,
    }), { status: res.delivered_to === null ? 502 : 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
