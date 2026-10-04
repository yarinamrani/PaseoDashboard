// קריאה בלבד: אילו חברות פתוחות למשתמש ב-buk (כדי למצוא את companyId של טאלה), ומי מופיע בטופסי 101 של כל חברה.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// מפתח ה-Web API של buk (Firebase) לא נשמר בריפו — הוא קיים בפונקציות הפרוסות. לפני פריסה מהריפו: להגדיר אותו כ-secret של הפונקציה בשם BUK_FB_API_KEY.
const FB_API_KEY = Deno.env.get("BUK_FB_API_KEY") ?? "";
const FS_BASE = "https://firestore.googleapis.com/v1/projects/bookeeping-prod/databases/(default)/documents";
const UID = "q0As5JbwnOwOANvhBneW";

async function cfg(key: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const j = await r.json(); return j?.[0]?.value ?? "";
}
async function getIdToken(): Promise<string> {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(Deno.env.get("BUK_REFRESH_TOKEN")!)}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json(); return j.access_token || j.id_token;
}
async function api(path: string, payload: any, tok: string) {
  const r = await fetch(`https://bookeeping-prod.appspot.com/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: payload }),
  });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, data: j?.data ?? j, raw: t.slice(0, 300) };
}
async function fsQuery(collectionId: string, tok: string) {
  const r = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath: `uids.${UID}` }, op: "EQUAL", value: { booleanValue: true } } }, limit: 20 } }),
  });
  const t = await r.text();
  if (!r.ok) return { error: r.status, body: t.slice(0, 200) };
  const j = JSON.parse(t);
  return (Array.isArray(j) ? j : []).filter((x: any) => x.document).map((x: any) => {
    const f = x.document.fields || {};
    const s = (k: string) => f[k]?.stringValue ?? null;
    return { id: x.document.name.split("/").pop(), name: s("name") ?? s("companyName") ?? s("title"), keys: Object.keys(f).slice(0, 25) };
  });
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const tok = await getIdToken();
    const out: any = {};
    for (const c of ["portal_companies", "companies"]) out[c] = await fsQuery(c, tok);
    const ids = new Set<string>(["VRP5IK2cpacu2ZmPMcjt"]);
    for (const c of ["portal_companies", "companies"]) if (Array.isArray(out[c])) for (const x of out[c]) ids.add(x.id);
    const f = await api("emp/getAllEmployeesForms101", { taxYear: new Date().getUTCFullYear(),
      companiesIdsToGet: Object.fromEntries([...ids].map((i) => [i, true])) }, tok);
    const by = f.data?.dataByCompanyId ?? {};
    out.forms101 = { status: f.status, raw: f.data ? undefined : f.raw, companies: Object.fromEntries(Object.entries(by).map(([k, v]: any) => {
      const rows: any[] = Array.isArray(v) ? v : Object.values(v ?? {});
      return [k, { n: rows.length, companyName: rows[0]?.companyName ?? null }];
    })) };
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
