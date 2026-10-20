import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { zipSync } from "npm:fflate@0.8.2";

// 20/10: ארכיון חשבוניות מהקבוצה "חשבוניות פסאו - Paseo Invoice".
// wa-green שומר ב-wa_invoice_intake רק קישור של Green API (image_url) — והוא פג אחרי זמן קצר (קישור מיולי מחזיר 403).
// כאן הקובץ עצמו נשמר ב-Storage (bucket invoices, פרטי) בתיקייה לפי ספק: <supplier_id>/<YYYY-MM>/<תאריך>_<מספר>.<סיומת>
// (Storage לא מקבל שמות בעברית — שם הספק בעברית נכנס רק לשמות שבתוך ה-ZIP).
//   ?mode=sweep              (cron כל דקה) — מוריד ושומר עד 10 חשבוניות שעוד לא נשמרו. קישור שפג → storage_path='!<status>' כדי לא לנסות שוב.
//   ?mode=list               — כמה חשבוניות שמורות לכל ספק
//   ?mode=zip&supplier=<id|שם|all>[&from=YYYY-MM][&to=YYYY-MM] — ZIP עם תיקייה לכל ספק → מעביר לקישור הורדה (7 ימים)
//   ?dry=1 (ב-sweep) — רק מראה מה היה נשמר
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "invoices";
const PASEO_GROUP = "120363330603969657@g.us";
const SWEEP_LIMIT = 10, SWEEP_BACK_DAYS = 30;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
const safe = (s: string | null | undefined, max = 40) => String(s ?? "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max);
// שם קובץ בתוך ה-ZIP — עברית מותרת, רק בלי תווים שאסורים בווינדוס
const fname = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
// תאריך החשבונית מה-OCR, אלא אם הוא לא סביר (נבדק 20/10: 3 מ-4 נקראו עם שנה שגויה — 2019/2020/2022) → תאריך הקבלה
const dayOf = (r: any) => {
  const got = String(r.created_at).slice(0, 10), d = String(r.invoice_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return got;
  const diff = (Date.parse(got) - Date.parse(d)) / 864e5;
  return diff >= -7 && diff <= 120 ? d : got;
};

async function sweep(dry: boolean) {
  const since = new Date(Date.now() - SWEEP_BACK_DAYS * 864e5).toISOString();
  const { data: rows, error } = await sb.from("wa_invoice_intake").select("id, supplier_id, invoice_ref, invoice_date, image_url, created_at")
    .eq("source_chat_id", PASEO_GROUP).is("storage_path", null).not("image_url", "is", null).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(SWEEP_LIMIT);
  if (error) return { error: error.message };
  const out: any[] = [];
  for (const r of rows ?? []) {
    let res: Response;
    try { res = await fetch(r.image_url); } catch (e) { out.push({ id: r.id, err: String(e).slice(0, 80) }); continue; }
    if (!res.ok) {
      if (!dry) await sb.from("wa_invoice_intake").update({ storage_path: `!${res.status}` }).eq("id", r.id);
      out.push({ id: r.id, gone: res.status });
      continue;
    }
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = EXT[ct] ?? (String(r.image_url).match(/\.([a-z0-9]{3,4})(?:\?|$)/i)?.[1]?.toLowerCase() ?? "bin");
    const day = dayOf(r);
    const path = `${safe(r.supplier_id) || "_unmatched"}/${day.slice(0, 7)}/${day}_${safe(r.invoice_ref, 30) || "noref"}_${String(r.id).slice(0, 8)}.${ext}`;
    if (dry) { out.push({ id: r.id, path }); continue; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: ct || "application/octet-stream", upsert: true });
    if (up.error) { out.push({ id: r.id, upload_err: up.error.message }); continue; }
    await sb.from("wa_invoice_intake").update({ storage_path: path }).eq("id", r.id);
    out.push({ id: r.id, path, kb: Math.round(bytes.length / 1024) });
  }
  return { checked: (rows ?? []).length, results: out };
}

// 20/10: העתקה ל-Google Drive — Apps Script בחשבון של ירין (docs/shift/invoice-drive.gs) מקבל את הקובץ ושומר
// ב"חשבוניות פסאו/<ספק>/<YYYY-MM>/". Drive for Desktop מסנכרן למחשב. מעקב ב-invoice_drive_sync (עד 5 ניסיונות).
// app_config: INVOICE_DRIVE_URL (כתובת ה-Web App) + INVOICE_DRIVE_SECRET. בלי URL — מדלגים.
const DRIVE_PER_RUN = 5, DRIVE_MAX_TRIES = 5;
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
async function driveSync() {
  const url = await cfg("INVOICE_DRIVE_URL"), key = await cfg("INVOICE_DRIVE_SECRET");
  if (!url || !key) return { drive: "not configured" };
  const { data: rows } = await sb.from("wa_invoice_intake").select("id, supplier_id, invoice_ref, invoice_date, created_at, storage_path")
    .eq("source_chat_id", PASEO_GROUP).not("storage_path", "is", null).not("storage_path", "like", "!%")
    .order("created_at", { ascending: true }).limit(1000);
  const { data: st } = await sb.from("invoice_drive_sync").select("intake_id, status, attempts");
  const seen = new Map((st ?? []).map((s: any) => [s.intake_id, s]));
  const todo = (rows ?? []).filter((r: any) => { const s: any = seen.get(r.id); return !s || (s.status !== "done" && s.attempts < DRIVE_MAX_TRIES); }).slice(0, DRIVE_PER_RUN);
  if (!todo.length) return { drive: 0 };
  const names = await supplierNames();
  const out: any[] = [];
  for (const r of todo) {
    const prev: any = seen.get(r.id);
    const mark = (o: Record<string, unknown>) => sb.from("invoice_drive_sync").upsert({ intake_id: r.id, attempts: (prev?.attempts ?? 0) + 1, updated_at: new Date().toISOString(), ...o });
    try {
      const dl = await sb.storage.from(BUCKET).download(r.storage_path);
      if (dl.error || !dl.data) throw new Error(`storage: ${dl.error?.message ?? "empty"}`);
      const ext = String(r.storage_path).split(".").pop();
      const day = dayOf(r);
      const body = { secret: key, supplier: fname(r.supplier_id ? (names.get(r.supplier_id) ?? r.supplier_id) : "לא מזוהה"), month: day.slice(0, 7),
        name: `${day}_${fname(String(r.invoice_ref ?? "ללא מספר"))}_${String(r.id).slice(0, 4)}.${ext}`,
        mime: dl.data.type || "application/octet-stream", data: b64(new Uint8Array(await dl.data.arrayBuffer())) };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(`drive: ${res.status} ${String(j?.error ?? "").slice(0, 120)}`);
      await mark({ status: "done", file_id: j.id, error: null });
      out.push({ id: r.id, file: j.id, dup: !!j.dup });
    } catch (e) {
      await mark({ status: "error", error: String(e).slice(0, 300) });
      out.push({ id: r.id, err: String(e).slice(0, 120) });
    }
  }
  return { drive: out };
}

async function supplierNames(): Promise<Map<string, string>> {
  const { data } = await sb.from("suppliers").select("id, name");
  return new Map((data ?? []).map((s: any) => [String(s.id), String(s.name ?? s.id)]));
}

async function list() {
  const { data } = await sb.from("wa_invoice_intake").select("supplier_id, storage_path").eq("source_chat_id", PASEO_GROUP);
  const names = await supplierNames();
  const per = new Map<string, { saved: number; gone: number; waiting: number }>();
  for (const r of data ?? []) {
    const k = r.supplier_id ?? "_unmatched";
    const x = per.get(k) ?? { saved: 0, gone: 0, waiting: 0 };
    if (!r.storage_path) x.waiting++; else if (String(r.storage_path).startsWith("!")) x.gone++; else x.saved++;
    per.set(k, x);
  }
  return [...per.entries()].map(([id, x]) => ({ id, name: names.get(id) ?? (id === "_unmatched" ? "לא מזוהה" : id), ...x }))
    .sort((a, b) => b.saved - a.saved);
}

async function zip(sup: string, from: string | null, to: string | null) {
  const names = await supplierNames();
  let q = sb.from("wa_invoice_intake").select("id, supplier_id, invoice_ref, invoice_date, created_at, storage_path")
    .eq("source_chat_id", PASEO_GROUP).not("storage_path", "is", null).not("storage_path", "like", "!%");
  let label = "all";
  if (sup !== "all") {
    let id = names.has(sup) ? sup : null;
    if (!id && /^(_unmatched|לא מזוהה|לא_מזוהה)$/.test(sup)) id = "_unmatched";
    if (!id) {
      const hits = [...names.entries()].filter(([, n]) => n.includes(sup) || sup.includes(n));
      if (hits.length !== 1) return { error: hits.length ? `כמה ספקים מתאימים: ${hits.map(([i, n]) => `${n} (${i})`).join(", ")}` : `לא מצאתי ספק "${sup}"` };
      id = hits[0][0];
    }
    q = id === "_unmatched" ? q.is("supplier_id", null) : q.eq("supplier_id", id);
    label = id;
  }
  const { data: rows, error } = await q.order("invoice_date", { ascending: true }).limit(500);
  if (error) return { error: error.message };
  const pick = (rows ?? []).filter((r: any) => { const m = dayOf(r).slice(0, 7); return (!from || m >= from) && (!to || m <= to); });
  if (!pick.length) return { error: "אין חשבוניות שמורות לבקשה הזו" };
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const r of pick) {
    const dl = await sb.storage.from(BUCKET).download(r.storage_path);
    if (dl.error || !dl.data) continue;
    const folder = fname(r.supplier_id ? (names.get(r.supplier_id) ?? r.supplier_id) : "לא מזוהה");
    const ext = String(r.storage_path).split(".").pop();
    let n = `${folder}/${dayOf(r)}_${fname(String(r.invoice_ref ?? "ללא מספר"))}.${ext}`;
    for (let i = 2; used.has(n); i++) n = n.replace(/(\.\w+)$/, `_${i}$1`);
    used.add(n);
    files[n] = new Uint8Array(await dl.data.arrayBuffer());
  }
  const z = zipSync(files, { level: 0 }); // PDF/JPG כבר דחוסים
  const path = `_exports/${label}_${from ?? ""}${to ? "-" + to : ""}_${Date.now()}.zip`;
  const up = await sb.storage.from(BUCKET).upload(path, z, { contentType: "application/zip", upsert: true });
  if (up.error) return { error: up.error.message };
  const sg = await sb.storage.from(BUCKET).createSignedUrl(path, 7 * 86400, { download: `invoices_${label}.zip` });
  if (sg.error) return { error: sg.error.message };
  return { files: Object.keys(files).length, mb: +(z.length / 1048576).toFixed(1), url: sg.data.signedUrl };
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const secret = await cfg("ALFRED_SYNC_SECRET");
  if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
  const mode = u.searchParams.get("mode") ?? "sweep";
  if (mode === "sweep") {
    const dry = u.searchParams.get("dry") === "1";
    const s = await sweep(dry);
    return json(dry ? s : { ...s, ...(await driveSync()) });
  }
  if (mode === "list") return json(await list());
  if (mode === "zip") {
    const r: any = await zip((u.searchParams.get("supplier") ?? "all").trim(), u.searchParams.get("from"), u.searchParams.get("to"));
    if (r.url && u.searchParams.get("go") === "1") return Response.redirect(r.url, 302);
    return json(r, r.error ? 400 : 200);
  }
  return json({ error: "unknown mode" }, 400);
});
