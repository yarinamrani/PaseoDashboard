// טופס 101 — שליחה מרוכזת מתוך hr_101_queue (source='batch', status='batch_queued'), כל עובד לחברה שלו ב-buk.
//   ברירת מחדל   — דראי ראן: מה קיים כבר ב-buk לכל טלפון, ומה יישלח.
//   ?confirm=1   — שליחה בפועל, עובד-עובד, ועדכון השורה בתור (sent / failed / already_done + קישור).
// החברה נקבעת לפי note="company=<id>" בשורת התור. סטטוס batch_queued (ולא await_confirm) כדי שה"כן" של בוט הוואטסאפ לא ישלח אותן דרך גג על הים.
// payload ו-deriveStatus זהים ל-hr-101-approve (נלמדו מקוד הלקוח של buk).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// מפתח ה-Web API של buk (Firebase) לא נשמר בריפו — הוא קיים בפונקציות הפרוסות. לפני פריסה מהריפו: להגדיר אותו כ-secret של הפונקציה בשם BUK_FB_API_KEY.
const FB_API_KEY = Deno.env.get("BUK_FB_API_KEY") ?? "";
const COMPANIES: Record<string, string> = {
  VRP5IK2cpacu2ZmPMcjt: "גג על הים 2022 ראשון (פסאו)",
  VZgAaVfmSuJlrb3xOSv2: "תאילנדית בטיילת ראשון (טאלה)",
  uVHjtoB6rsenMFgPCyoe: "אסייתי בחוף ראשון",
};
const STATUS_ORDER = ["sent", "opened", "signed", "done", "verified"];
const STATUS_HE: Record<string, string> = { sent: "נשלח", opened: "נפתח", signed: "נחתם", done: "הושלם", verified: "אומת" };
const NANO = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { ok: r.ok, data: j };
}
async function cfg(key: string): Promise<string> {
  const r = await rest(`app_config?key=eq.${encodeURIComponent(key)}&select=value`);
  return r.data?.[0]?.value ?? "";
}
async function getIdToken(): Promise<string> {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN")!)}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json(); return j.access_token || j.id_token;
}
async function buk(path: string, payload: any, tok: string) {
  const r = await fetch(`https://bookeeping-prod.appspot.com/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: payload }),
  });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { ok: r.ok, status: r.status, data: j?.data ?? j, raw: t.slice(0, 400) };
}
function nanoid(n = 21) { const b = new Uint8Array(n); crypto.getRandomValues(b); let s = ""; for (let i = 0; i < n; i++) s += NANO[b[i] % NANO.length]; return s; }
const digits = (p: any) => String(p ?? "").replace(/\D/g, "");
const last9 = (p: any) => digits(p).slice(-9);
const validPhone = (p: any) => /^0?5\d{8}$/.test(digits(p)) || /^9725\d{8}$/.test(digits(p));
function deriveStatus(r: any) {
  const a = r?.auditByStatusId; if (!a || typeof a !== "object") return null;
  let best: string | null = null;
  for (const s of STATUS_ORDER) if (a[s] && a[s].date && !a[s].error) best = s;
  return best;
}
// כל הטפסים בכל החברות, עם החברה של כל שורה
async function readAll(tok: string, taxYear: number) {
  const res = await buk("emp/getAllEmployeesForms101", { taxYear, companiesIdsToGet: Object.fromEntries(Object.keys(COMPANIES).map((c) => [c, true])) }, tok);
  if (!res.ok || !res.data) throw new Error(`buk read ${res.status}: ${res.raw}`);
  const out: any[] = [];
  for (const [co, v] of Object.entries(res.data.dataByCompanyId ?? {})) {
    const rows: any[] = Array.isArray(v) ? v : Object.values(v ?? {});
    for (const r of rows) out.push({ ...r, _co: co });
  }
  return out;
}
const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1";
    // ?verify=1&ids=9,10 — קריאה בלבד: מה buk מראה עכשיו לשורות שכבר נשלחו
    if (u.searchParams.get("verify") === "1") {
      const ids = (u.searchParams.get("ids") ?? "").split(",").filter(Boolean).join(",");
      const vq = await rest(`hr_101_queue?id=in.(${ids})&select=id,full_name,phone,buk_employee_id,note&order=id.asc`);
      const tok = await getIdToken();
      const all = await readAll(tok, new Date().getUTCFullYear());
      if (u.searchParams.get("save") === "1") for (const r of (vq.data ?? [])) {
        const co = (String(r.note ?? "").match(/company=([A-Za-z0-9]+)/) ?? [])[1] ?? "";
        const me = all.find((b) => b._co === co && last9(b.mobilePhoneNumber) === last9(r.phone));
        if (me?.formUrl) await rest(`hr_101_queue?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ form_url: me.formUrl, buk_employee_id: me.employeeId }) });
      }
      return json({ total_by_company: Object.fromEntries(Object.keys(COMPANIES).map((c) => [COMPANIES[c], all.filter((b) => b._co === c).length])),
        rows: (vq.data ?? []).map((r: any) => {
          const hit = all.filter((b) => b.employeeId === r.buk_employee_id || last9(b.mobilePhoneNumber) === last9(r.phone));
          return { id: r.id, name: r.full_name, found: hit.map((h) => ({ company: COMPANIES[h._co] ?? h._co, byId: h.employeeId === r.buk_employee_id,
            status: deriveStatus(h) ? STATUS_HE[deriveStatus(h)!] : "לא נשלח", audit: Object.keys(h.auditByStatusId ?? {}), url: !!h.formUrl, start: h.startWorkDate ?? null })) };
        }) });
    }
    const taxYear = new Date().getUTCFullYear();
    const q = await rest(`hr_101_queue?source=eq.batch&status=eq.batch_queued&select=*&order=id.asc`);
    const rows: any[] = Array.isArray(q.data) ? q.data : [];
    if (!rows.length) return json({ error: "אין שורות batch_queued" }, 400);
    const tok = await getIdToken();
    const before = await readAll(tok, taxYear);

    const plan = rows.map((r) => {
      const co = (String(r.note ?? "").match(/company=([A-Za-z0-9]+)/) ?? [])[1] ?? "";
      const hits = before.filter((b) => last9(b.mobilePhoneNumber) === last9(r.phone));
      const same = hits.find((b) => b._co === co);
      const st = same ? deriveStatus(same) : null;
      const skip = !COMPANIES[co] ? "חברה לא מוכרת" : !validPhone(r.phone) ? "טלפון לא תקין"
        : (st === "signed" || st === "done" || st === "verified") ? `כבר מילא (${STATUS_HE[st]})` : null;
      return { r, co, same, st, skip,
        view: { id: r.id, name: r.full_name, company: COMPANIES[co] ?? co, start: r.start_work_date,
          in_buk: hits.map((h) => `${COMPANIES[h._co] ?? h._co}: ${deriveStatus(h) ? STATUS_HE[deriveStatus(h)!] : "לא נשלח"}`), skip } };
    });
    if (!go) return json({ dry: true, plan: plan.map((p) => p.view) });

    const results: any[] = [];
    for (const p of plan) {
      const { r, co } = p;
      if (p.skip) {
        await rest(`hr_101_queue?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ status: p.skip.startsWith("כבר") ? "already_done" : "failed", decided_at: new Date().toISOString(), note: `${r.note}; ${p.skip}` }) });
        results.push({ name: r.full_name, skipped: p.skip }); continue;
      }
      const employeeId = p.same?.employeeId ?? nanoid();
      const emp = p.same?.michpalEmployeeId != null
        ? { employeeId, michpalEmployeeId: p.same.michpalEmployeeId }
        : { employeeId, firstName: r.first_name, lastName: r.last_name ?? "", startWorkDate: `${r.start_work_date}T00:00:00.000Z`, mobilePhoneNumber: r.phone };
      const send = await buk("emp/sendForms101ToEmployees", { companyId: co, employees: [emp], confirmResend: false }, tok);
      const now = new Date().toISOString();
      if (!send.ok) {
        await rest(`hr_101_queue?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", decided_at: now, note: `${r.note}; buk ${send.status}: ${send.raw}`.slice(0, 500) }) });
        results.push({ name: r.full_name, failed: send.status, raw: send.raw }); continue;
      }
      await rest(`hr_101_queue?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent", decided_at: now, sent_at: now, buk_employee_id: employeeId }) });
      results.push({ id: r.id, name: r.full_name, company: COMPANIES[co], co, phone: r.phone, sent: true });
    }
    // קישורים וסטטוס אחרי השליחה — buk מעדכן תוך כמה שניות
    const sent = results.filter((x) => x.sent);
    for (let i = 0; i < 6 && sent.some((x) => !x.formUrl); i++) {
      await new Promise((res) => setTimeout(res, 3000));
      const after = await readAll(tok, taxYear);
      for (const x of sent) {
        // buk מתעלם מה-employeeId שנשלח ומקצה משלו — מאתרים לפי טלפון בחברה שאליה נשלח
        const me = after.find((b) => b._co === x.co && last9(b.mobilePhoneNumber) === last9(x.phone));
        if (me) { x.status = deriveStatus(me) ? STATUS_HE[deriveStatus(me)!] : "לא נשלח"; x.formUrl = me.formUrl ?? null; x.bukId = me.employeeId; }
      }
    }
    for (const x of sent) if (x.formUrl) await rest(`hr_101_queue?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ form_url: x.formUrl, buk_employee_id: x.bukId }) });
    return json({ results: results.map(({ co: _c, phone: _p, bukId: _b, ...v }) => v) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
