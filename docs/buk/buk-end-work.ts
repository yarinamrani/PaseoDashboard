// דיווח הפסקת עבודה ב-buk לעובד אחד — אותו payload שמסך "עובדים - דיווח נוכחות" שולח בחלון "דיווח על הפסקת עבודה".
// נמצא בקוד אפליקציית buk (bookeeping-prod.web.app): emp/saveEmployeeAttendanceData עם
//   { changesByCompanyId: { <companyId>: { yearMonth, employees: { <employeeId>: { endWorkDate, endWorkReasonId, endWorkReportYearMonth, isEndWorkCalculations } } } }, isMultiUpdateConfirmed: false }
// endWorkReasonId: 1 פיטורים · 2 התפטרות · 3 סגירת עסק · 6 עונתי · 12 סיום חוזה · 13 סיום תקופת ניסיון (רשימה מלאה בקוד buk).
// לסיבות "סיום" (פיטורים/התפטרות/סגירה/פטירה/פרישה/סיום חוזה/ניסיון) buk דורש גם isEndWorkCalculations (חישובי גמר כן/לא).
// הרצה 08/10/2026 (ירין): גילילוב אריאל — התפטרות, 13/09/2026, בלי חישובי גמר. נשמר ואומת בקריאה חוזרת.
// בלי ?confirm=1 — רק מציג. אם כבר רשומה הפסקת עבודה — לא נוגע. מפתח buk: app_config.BUK_FB_API_KEY, env BUK_REFRESH_TOKEN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
async function cfg(key: string) { const r = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: H }); return (await r.json())?.[0]?.value ?? ""; }
// עובד ופרטי הסיום — לעדכן לפני כל הרצה (ת"ז ומזהה buk נבדקים זה מול זה לפני כתיבה)
const CO = "VRP5IK2cpacu2ZmPMcjt", YM = "202609", ID_NUMBER = "310149711", EMP = "lW6H2ADgKxdFp8eRUYdBa";
const CHANGE = { endWorkDate: "2026-09-13", endWorkReasonId: 2, endWorkReportYearMonth: YM, isEndWorkCalculations: false };

async function token() {
  const t = await fetch(`https://securetoken.googleapis.com/v1/token?key=${await cfg("BUK_FB_API_KEY")}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN") ?? "")}` });
  const j = await t.json(); return j.access_token || j.id_token;
}
async function call(fn: string, data: any, tok: string) {
  const r = await fetch(`https://bookeeping-prod.appspot.com/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, j, raw: t.slice(0, 600) };
}
async function readEmp(tok: string) {
  const r = await call("emp/getAllEmployeesAttendanceData", { yearMonth: YM, companiesIdsToGet: { [CO]: true } }, tok);
  const c = (r.j?.data ?? r.j)?.dataByCompanyId?.[CO];
  const e = Object.values(c?.employees ?? {}).find((x: any) => x.idNumber === ID_NUMBER) as any;
  return e ? { employeeId: e.employeeId, name: e.employeeName, endWorkDate: e.endWorkDate, endWorkReasonId: e.endWorkReasonId, endWorkReportYearMonth: e.endWorkReportYearMonth, isEndWorkCalculations: e.isEndWorkCalculations, isEmployeeActive: e.isEmployeeActive, employeeEndWorkDate: e.employeeEndWorkDate } : null;
}
Deno.serve(async (req) => {
  const u = new URL(req.url);
  if ((u.searchParams.get("secret") ?? "") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
  const tok = await token();
  const before = await readEmp(tok);
  if (!before || before.employeeId !== EMP) return Response.json({ error: "employee not found / id mismatch", before }, { status: 409 });
  if (before.endWorkDate) return Response.json({ skipped: "already has end of work", before });
  const payload = { changesByCompanyId: { [CO]: { yearMonth: YM, employees: { [EMP]: CHANGE } } }, isMultiUpdateConfirmed: false };
  if (u.searchParams.get("confirm") !== "1") return Response.json({ dry: true, before, payload });
  const res = await call("emp/saveEmployeeAttendanceData", payload, tok);
  await new Promise((r) => setTimeout(r, 2500));
  const after = await readEmp(await token());
  return Response.json({ before, save: { status: res.status, body: res.raw }, after });
});
