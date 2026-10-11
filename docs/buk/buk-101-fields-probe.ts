// קריאה בלבד: אילו שדות יש בטופסי 101 ב-buk (גג על הים + טאלה).
// ?secret=&mode=keys  → רק שמות שדות ומונים (בלי ערכים).
// ?secret=&mode=bank&names=a|b|c → לשמות שביקשו בלבד: שדות שהשם שלהם נראה כמו בנק/סניף/חשבון.
// לא כותב כלום ל-buk. הערכים לא נשמרים בטבלאות — רק בתגובת ה-HTTP.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const COMPANIES: Record<string, string> = { VRP5IK2cpacu2ZmPMcjt: "פסאו", VZgAaVfmSuJlrb3xOSv2: "טאלה" };
const BANKISH = /bank|branch|account|iban|snif|bnk/i;

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
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// כל הנתיבים בעץ (a.b.c) עם הערך העלה
function walk(o: any, p = "", out: [string, any][] = []): [string, any][] {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k, out);
  else out.push([p, o]);
  return out;
}
const UID = "q0As5JbwnOwOANvhBneW";
const FS = "https://firestore.googleapis.com/v1/projects/bookeeping-prod/databases/(default)/documents";
function dec(v: any): any {
  if (v == null || "nullValue" in v) return null;
  for (const t of ["stringValue", "booleanValue", "timestampValue", "referenceValue"]) if (t in v) return v[t];
  if ("integerValue" in v || "doubleValue" in v) return Number(v.integerValue ?? v.doubleValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, dec(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(dec);
  return v;
}
// emp_att = כרטיס העובד החודשי (שם, טלפון, מייל ...) לשתי החברות
async function att(u: URL, mode: string) {
  const ym = u.searchParams.get("ym") ?? "202609";
  const tok = await idToken();
  const docs: { co: string; d: any }[] = [];
  for (const co of Object.keys(COMPANIES)) {
    const r = await fetch(`${FS}:runQuery`, {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "companies_stats" }], where: { compositeFilter: { op: "AND", filters: [
        { fieldFilter: { field: { fieldPath: `uids.${UID}` }, op: "EQUAL", value: { booleanValue: true } } },
        { fieldFilter: { field: { fieldPath: "yearMonth" }, op: "EQUAL", value: { stringValue: ym } } },
        { fieldFilter: { field: { fieldPath: "label" }, op: "EQUAL", value: { stringValue: "emp_att" } } },
        { fieldFilter: { field: { fieldPath: "companyId" }, op: "EQUAL", value: { stringValue: co } } },
      ] } } } }),
    });
    if (!r.ok) return json({ error: `fs ${r.status}`, body: (await r.text()).slice(0, 300) }, 502);
    for (const x of (await r.json()) as any[]) if (x.document) docs.push({ co, d: dec({ mapValue: { fields: x.document.fields } }) });
  }
  if (mode === "att") {
    const cnt: Record<string, number> = {};
    for (const { d } of docs) for (const [p] of walk(d)) { const k = p.replace(/\.\d+\./g, ".#."); cnt[k] = (cnt[k] ?? 0) + 1; }
    return json({ docs: docs.length, bankKeys: Object.fromEntries(Object.keys(cnt).filter((k) => BANKISH.test(k)).map((k) => [k, cnt[k]])), keys: Object.keys(cnt).length });
  }
  const want = (u.searchParams.get("names") ?? "").split("|").map((n) => words(n)).filter((w) => w.length);
  return json({ rows: want.map((w1) => ({ q: w1.join(" "), hits: docs.filter(({ d }) => { const w = words(d.employeeName ?? ""); return w1.every((x) => w.includes(x)); })
    .map(({ co, d }) => ({ company: COMPANIES[co], name: (d.employeeName ?? "").trim(), bank: Object.fromEntries(walk(d).filter(([p, v]) => BANKISH.test(p) && v != null && v !== "")) })) })) });
}
// אילו תת-אוספים יש מתחת למסמך, ובכל אחד: מספר מסמכים לדוגמה ושדות שנראים כמו בנק (שמות בלבד)
async function cols(u: URL) {
  const tok = await idToken();
  const parent = u.searchParams.get("parent") ?? "companies/VRP5IK2cpacu2ZmPMcjt";
  const r = await fetch(`${FS}/${parent}:listCollectionIds`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return json({ error: `list ${r.status}`, body: (await r.text()).slice(0, 300) }, 502);
  const ids: string[] = (await r.json()).collectionIds ?? [];
  const out: Record<string, unknown> = {};
  for (const c of ids) {
    const q = await fetch(`${FS}/${parent}:runQuery`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: c }], limit: 3 } }) });
    if (!q.ok) { out[c] = q.status; continue; }
    const docs = ((await q.json()) as any[]).filter((x) => x.document).map((x) => dec({ mapValue: { fields: x.document.fields } }));
    const keys = new Set<string>(); for (const d of docs) for (const [p] of walk(d)) keys.add(p.replace(/\.\d+(\.|$)/g, ".#$1"));
    out[c] = { n: docs.length, bank: [...keys].filter((k) => BANKISH.test(k)), keys: keys.size };
  }
  return json({ parent, out });
}
const words = (s: string) => s.replace(/[^a-zא-ת\s]/gi, " ").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("secret") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
    const mode = u.searchParams.get("mode") ?? "keys";
    if (mode === "att" || mode === "attbank") return await att(u, mode);
    if (mode === "cols") return await cols(u);
    const r = await fetch("https://bookeeping-prod.appspot.com/emp/getAllEmployeesForms101", {
      method: "POST", headers: { Authorization: `Bearer ${await idToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { taxYear: new Date().getUTCFullYear(), companiesIdsToGet: Object.fromEntries(Object.keys(COMPANIES).map((c) => [c, true])) } }),
    });
    if (!r.ok) return json({ error: `buk ${r.status}` }, 502);
    const j = await r.json();
    const forms: { co: string; f: any }[] = [];
    for (const [co, v] of Object.entries(j?.data?.dataByCompanyId ?? j?.dataByCompanyId ?? {}))
      if (COMPANIES[co]) for (const f of (Array.isArray(v) ? v : Object.values(v ?? {})) as any[]) forms.push({ co, f });

    if (mode === "keys") {
      const cnt: Record<string, number> = {};
      for (const { f } of forms) for (const [p] of walk(f)) { const k = p.replace(/\.\d+\./g, ".#."); cnt[k] = (cnt[k] ?? 0) + 1; }
      const bankKeys = Object.keys(cnt).filter((k) => BANKISH.test(k));
      return json({ forms: forms.length, bankKeys: Object.fromEntries(bankKeys.map((k) => [k, cnt[k]])), keyCount: Object.keys(cnt).length });
    }

    // mode=bank: רק לשמות שביקשו
    const want = (u.searchParams.get("names") ?? "").split("|").map((n) => words(n)).filter((w) => w.length);
    const rows = [];
    for (const want1 of want) {
      const hits = forms.filter(({ f }) => { const w = words(f.employeeName ?? ""); return want1.every((x) => w.includes(x)); });
      rows.push({
        q: want1.join(" "),
        hits: hits.map(({ co, f }) => ({
          company: COMPANIES[co], name: (f.employeeName ?? "").trim(), taxYear: f.taxYear,
          bank: Object.fromEntries(walk(f).filter(([p, v]) => BANKISH.test(p) && v != null && v !== "")),
        })),
      });
    }
    return json({ rows });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
