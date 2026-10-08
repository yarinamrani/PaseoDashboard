// דיווח הפסקת עבודה ב-buk — אותו payload שמסך "עובדים - דיווח נוכחות" שולח בחלון "דיווח על הפסקת עבודה".
// נמצא בקוד אפליקציית buk (bookeeping-prod.web.app): emp/saveEmployeeAttendanceData עם
//   { changesByCompanyId: { <companyId>: { yearMonth, employees: { <employeeId>: { endWorkDate, endWorkReasonId, endWorkReportYearMonth, isEndWorkCalculations } } } }, isMultiUpdateConfirmed: false }
// endWorkReasonId: 1 פיטורים · 2 התפטרות · 3 סגירת עסק · 6 עונתי · 12 סיום חוזה · 13 סיום תקופת ניסיון (רשימה מלאה בקוד buk).
// לסיבות "סיום" buk דורש גם isEndWorkCalculations (חישובי גמר כן/לא).
//
// פרמטרים (לא שומרים ת"ז בקוד):
//   ?list=<ת"ז>:<YYYY-MM-DD>:<חלק מהשם>,...   ?ym=202609   ?co=<companyId>   ?reason=2   ?calc=0|1
//   בלי &confirm=1 — רק מציג תוכנית. עובד שכבר רשומה לו הפסקת עבודה, או שהשם לא תואם לת"ז — לא נוגעים בו.
//   כל עובד נשלח בקריאה נפרדת, ואחר כך קריאה חוזרת לאימות.
// מפתח buk: app_config.BUK_FB_API_KEY, env BUK_REFRESH_TOKEN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
async function cfg(key: string) { const r = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: H }); return (await r.json())?.[0]?.value ?? ""; }

async function token() {
  const t = await fetch(`https://securetoken.googleapis.com/v1/token?key=${await cfg("BUK_FB_API_KEY")}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN") ?? "")}` });
  const j = await t.json(); return j.access_token || j.id_token;
}
async function call(fn: string, data: any, tok: string) {
  const r = await fetch(`https://bookeeping-prod.appspot.com/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, j, raw: t.slice(0, 600) };
}
async function readAll(co: string, ym: string, tok: string) {
  const r = await call("emp/getAllEmployeesAttendanceData", { yearMonth: ym, companiesIdsToGet: { [co]: true } }, tok);
  const c = (r.j?.data ?? r.j)?.dataByCompanyId?.[co];
  return Object.values(c?.employees ?? {}) as any[];
}
const pick = (e: any) => e && { name: e.employeeName, endWorkDate: e.endWorkDate, endWorkReasonId: e.endWorkReasonId, endWorkReportYearMonth: e.endWorkReportYearMonth, isEndWorkCalculations: e.isEndWorkCalculations };

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if ((u.searchParams.get("secret") ?? "") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
  const co = u.searchParams.get("co") ?? "VRP5IK2cpacu2ZmPMcjt", ym = u.searchParams.get("ym") ?? "";
  const reason = Number(u.searchParams.get("reason") ?? "0"), calc = u.searchParams.get("calc") === "1";
  const list = (u.searchParams.get("list") ?? "").split(",").map((x) => x.split(":")).filter((x) => x.length === 3);
  if (!/^\d{6}$/.test(ym) || !reason || !list.length) return Response.json({ error: "חובה ym, reason, list" }, { status: 400 });
  const go = u.searchParams.get("confirm") === "1";
  const tok = await token();
  const all = await readAll(co, ym, tok);
  const plan: any[] = [];
  for (const [idn, date, nm] of list) {
    const e = all.find((x) => x.idNumber === idn);
    if (!e) { plan.push({ nm, error: "לא נמצא בדיווח החודש" }); continue; }
    if (!String(e.employeeName ?? "").includes(nm)) { plan.push({ nm, error: `שם לא תואם: ${e.employeeName}` }); continue; }
    if (e.endWorkDate) { plan.push({ nm, skipped: "כבר רשומה הפסקת עבודה", before: pick(e) }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { plan.push({ nm, error: `תאריך לא תקין: ${date}` }); continue; }
    plan.push({ nm, idn, employeeId: e.employeeId, name: e.employeeName, change: { endWorkDate: date, endWorkReasonId: reason, endWorkReportYearMonth: ym, isEndWorkCalculations: calc } });
  }
  const view = (p: any) => { const { idn, employeeId, ...rest } = p; return rest; };
  if (!go) return Response.json({ dry: true, plan: plan.map(view) });
  for (const p of plan) {
    if (!p.change) continue;
    const res = await call("emp/saveEmployeeAttendanceData", { changesByCompanyId: { [co]: { yearMonth: ym, employees: { [p.employeeId]: p.change } } }, isMultiUpdateConfirmed: false }, tok);
    p.save = `${res.status} ${res.raw.slice(0, 120)}`;
    await new Promise((r) => setTimeout(r, 1200));
  }
  await new Promise((r) => setTimeout(r, 2500));
  const after = await readAll(co, ym, await token());
  for (const p of plan) if (p.idn) p.after = pick(after.find((x) => x.idNumber === p.idn));
  return Response.json({ plan: plan.map(view) });
});
