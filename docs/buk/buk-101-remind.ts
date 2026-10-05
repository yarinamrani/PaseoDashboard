// תזכורת טופס 101 בוואטסאפ (Whapi) לשורות תור שנשלחו ועוד לא הושלמו.
//   ?ids=9,10,...   — שורות hr_101_queue (חייב form_url).
//   ברירת מחדל      — דראי ראן: סטטוס חי מ-buk + ההודעה שתישלח.
//   &confirm=1      — שליחה. מדלג על מי שכבר חתם/הושלם/אומת ברגע השליחה.
// חתימה לפי החברה שב-note (company=...): פסאו / טאלה.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// מפתח ה-Web API של buk (Firebase) לא נשמר בריפו — הוא קיים בפונקציות הפרוסות. לפני פריסה מהריפו: להגדיר אותו כ-secret של הפונקציה בשם BUK_FB_API_KEY.
const FB_API_KEY = Deno.env.get("BUK_FB_API_KEY") ?? "";
const SIGN: Record<string, string> = { VRP5IK2cpacu2ZmPMcjt: "פסאו", VZgAaVfmSuJlrb3xOSv2: "טאלה" };
const STATUS_ORDER = ["sent", "opened", "signed", "done", "verified"];
const STATUS_HE: Record<string, string> = { sent: "נשלח", opened: "נפתח", signed: "נחתם", done: "הושלם", verified: "אומת" };

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return j;
}
async function cfg(key: string): Promise<string> {
  const j = await rest(`app_config?key=eq.${encodeURIComponent(key)}&select=value`);
  return j?.[0]?.value ?? "";
}
async function getIdToken(): Promise<string> {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN")!)}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json(); return j.access_token || j.id_token;
}
const digits = (p: any) => String(p ?? "").replace(/\D/g, "");
const last9 = (p: any) => digits(p).slice(-9);
const intl = (p: any) => `972${last9(p)}`;
function deriveStatus(r: any) {
  const a = r?.auditByStatusId; if (!a || typeof a !== "object") return null;
  let best: string | null = null;
  for (const s of STATUS_ORDER) if (a[s] && a[s].date && !a[s].error) best = s;
  return best;
}
function compose(name: string, url: string, sign: string) {
  return `היי ${name} 👋\nתזכורת: עוד לא הושלם אצלך *טופס 101*.\nלוקח 2 דקות מהנייד:\n${url}\n\nצריך ביד: תעודת זהות ופרטי חשבון בנק.\nבלי הטופס לא נוכל להעביר משכורת 🙏\n*${sign}*`;
}
const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const ids = (u.searchParams.get("ids") ?? "").split(",").filter((x) => /^\d+$/.test(x)).join(",");
    if (!ids) return json({ error: "חובה ids" }, 400);
    const go = u.searchParams.get("confirm") === "1";
    const rows: any[] = await rest(`hr_101_queue?id=in.(${ids})&select=id,full_name,first_name,phone,note,form_url&order=id.asc`) ?? [];
    const tok = await getIdToken();
    const r = await fetch("https://bookeeping-prod.appspot.com/emp/getAllEmployeesForms101", {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { taxYear: new Date().getUTCFullYear(), companiesIdsToGet: Object.fromEntries(Object.keys(SIGN).map((c) => [c, true])) } }),
    });
    const j = await r.json();
    const all: any[] = [];
    for (const [co, v] of Object.entries(j?.data?.dataByCompanyId ?? j?.dataByCompanyId ?? {})) {
      const list: any[] = Array.isArray(v) ? v : Object.values(v ?? {});
      for (const x of list) all.push({ ...x, _co: co });
    }
    const plan = rows.map((row) => {
      const co = (String(row.note ?? "").match(/company=([A-Za-z0-9]+)/) ?? [])[1] ?? "";
      const me = all.find((b) => b._co === co && last9(b.mobilePhoneNumber) === last9(row.phone));
      const st = me ? deriveStatus(me) : null;
      const url = me?.formUrl ?? row.form_url;
      const skip = !SIGN[co] ? "חברה לא מוכרת" : !url ? "אין קישור"
        : (st === "signed" || st === "done" || st === "verified") ? `כבר ${STATUS_HE[st]}` : null;
      return { row, url, skip, status: st ? STATUS_HE[st] : "לא נמצא", text: compose(row.first_name || row.full_name, url ?? "", SIGN[co] ?? "") };
    });
    if (!go) return json({ dry: true, plan: plan.map((p) => ({ id: p.row.id, name: p.row.full_name, status: p.status, skip: p.skip, text: p.skip ? null : p.text })) });

    const token = await cfg("WA_WHAPI_TOKEN");
    const results: any[] = [];
    for (const p of plan) {
      if (p.skip) { results.push({ name: p.row.full_name, skipped: p.skip }); continue; }
      const s = await fetch("https://gate.whapi.cloud/messages/text", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: intl(p.row.phone), body: p.text }),
      });
      const t = await s.text(); let sj: any = null; try { sj = JSON.parse(t); } catch { /* */ }
      const ok = s.ok && sj?.sent === true;
      if (ok) await rest(`hr_101_queue?id=eq.${p.row.id}`, { method: "PATCH",
        body: JSON.stringify({ note: `${p.row.note ?? ""}; תזכורת וואטסאפ ${new Date().toISOString().slice(0, 16)}` }) });
      results.push({ name: p.row.full_name, ok, status: s.status, resp: ok ? undefined : t.slice(0, 200) });
      await new Promise((res) => setTimeout(res, 1500));
    }
    return json({ sent: results.filter((x) => x.ok).length, total: results.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
