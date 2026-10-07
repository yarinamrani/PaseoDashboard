// טיוטת סידור אוטומטית למטבח פסאו (4283) לשבוע הבא.
// פרוס בסלוט של contest-daily (התחרות נגמרה, מכסת הפונקציות מלאה). cron 66: רביעי 20:00 (17:00 UTC).
//
// ירין 08/10: שוטפים כמעט לא משתנים — מועתקים אחד-לאחד מהשבוע הנוכחי.
// טבחים משתנים משבוע לשבוע — לא מעתיקים שמות. נשאר רק השלד (אותן שעות) כתאים ריקים "חסר טבח", חוץ מהקבועים:
//   • בני — ב'–ש' כמו השבוע הנוכחי, חופש בראשון.
//   • מולו — כפולות באמצע השבוע: ב'–ה' 11:30 + 17:00.
//   1. אם כבר יש רוטה לשבוע הבא עם תאי טבח/שוטף — לא נוגע בכלום, רק מדווח.
//   2. יוצר רוטה, מעתיק מכסות (שער >= 60), כותב תאים. לא מפרסם לעולם.
//   3. שולח סיכום לוואטסאפ (app_config.SHIFT_DRAFT_WA_TARGET, ברירת מחדל SHIFT_CLOCK_WA_TARGET).
// לא מועתק: שעות בפועל/ידניות, היעדרויות, תאים בלי תפקיד או בלי שעת התחלה.
// עובדים ב-app_config.SHIFT_DRAFT_SKIP (מערך JSON של מזהי עובד) הופכים לחור עם הערה "חסר טבח"/"חסר שוטף".
//   ?week=YYYY-MM-DD  (ברירת מחדל: ראשון הבא)   ?src=YYYY-MM-DD (ברירת מחדל: שבוע לפני)
//   בלי confirm — ריצה יבשה שמחזירה את ההודעה. ?confirm=1 כותב. &notify=1 שולח וואטסאפ.
//   ?rebuild=cooks — לטיוטה קיימת: מוחק את תאי הטבחים ובונה אותם מחדש לפי הכללים, רק אם הם עדיין
//     זהים להעתק של שבוע המקור (כלומר אף אחד לא ערך אותם). אחרת עוצר ומדווח.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const APP = 4283, COOK = 34771, DISH = 34937, B = 16656, E = 21796;
const BENNY = 543969, MOLU = 853229;
const MOLU_DAYS = [1, 2, 3, 4], MOLU_TIMES: [number, string][] = [[B, "11:30"], [E, "17:00"]];
const ROLE_NAME: Record<number, string> = { [COOK]: "טבח", [DISH]: "שוטף" };
const DAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
function eat(res: Response, jar: Record<string, string>) {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  const list: string[] = raw.length ? raw : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const c of list) { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
}
const jarStr = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
function hdrs(jar: Record<string, string>, post = false) {
  const h: Record<string, string> = { "User-Agent": UA, "Accept": "application/json", "Cookie": jarStr(jar), "Referer": `${BASE}/app/home/` };
  if (post) { h["Content-Type"] = "application/json"; h["Origin"] = BASE; }
  if (jar["csrftoken"]) h["X-CSRFToken"] = jar["csrftoken"];
  return h;
}
async function login(jar: Record<string, string>) {
  const g = await fetch(`${BASE}/app/login/`, { headers: { "User-Agent": UA }, redirect: "manual" }); eat(g, jar);
  const r = await fetch(`${BASE}/api/auth/login/`, { method: "POST", headers: { ...hdrs(jar, true), "Referer": `${BASE}/app/login/` },
    body: JSON.stringify({ username: await cfg("SHIFT_USERNAME"), company: await cfg("SHIFT_COMPANY"), password: await cfg("SHIFT_PASSWORD") }), redirect: "manual" });
  eat(r, jar); return r.ok;
}
async function switchApp(jar: Record<string, string>, app: number) {
  const r = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(r, jar); return r.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
const hhmm = (s: any) => String(s || "").slice(0, 5);
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const who = (c: any) => c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim().replace(/\s*כוח אדם\s*/g, "").trim() || String(c.employee) : "";
function nextSunday(): string {
  const il = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const t = new Date(Date.UTC(il.getFullYear(), il.getMonth(), il.getDate()));
  t.setUTCDate(t.getUTCDate() + (7 - t.getUTCDay()));
  return t.toISOString().slice(0, 10);
}

async function send(chatId: string, message: string) {
  const url = await cfg("GREENAPI_API_URL"), inst = await cfg("GREENAPI_ID_INSTANCE"), tok = await cfg("GREENAPI_API_TOKEN");
  let ok = false, status = 0, body = "";
  try {
    const r = await fetch(`${url}/waInstance${inst}/sendMessage/${tok}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, message }) });
    ok = r.ok; status = r.status; body = await r.text().catch(() => "");
  } catch (e) { body = String(e); }
  try { await sb.from("wa_send_log").insert({ fn: "shift-week-draft", chat_id: chatId, ok, status, error: ok ? null : body.slice(0, 1000), preview: message.slice(0, 300) }); } catch (_e) { /* */ }
  return ok;
}

// סיכום לבדיקה: ימים לכל עובד, עובדים 7 ימים, חורים לפי יום
function summarize(cells: any[]) {
  const per: Record<string, { role: number; days: Set<number> }> = {};
  const holes: Record<number, Record<number, string[]>> = { [COOK]: {}, [DISH]: {} };
  for (const c of cells) {
    if (!c.employee) { ((holes[c.role] ||= {})[c.day] ||= []).push(hhmm(c.planned_start)); continue; }
    const p = (per[who(c)] ||= { role: c.role, days: new Set() });
    p.days.add(c.day);
  }
  const line = (role: number) => Object.entries(per).filter(([, p]) => p.role === role)
    .sort((a, b) => b[1].days.size - a[1].days.size).map(([k, p]) => `${k} ${p.days.size}`).join(" · ");
  const holeLines = (role: number) => Object.keys(holes[role] ?? {}).map(Number).sort()
    .map((d) => `${DAYS[d]} ${holes[role][d].sort().join(", ")}`);
  const nHoles = (role: number) => Object.values(holes[role] ?? {}).reduce((a, v) => a + v.length, 0);
  const seven = Object.entries(per).filter(([, p]) => p.days.size >= 7).map(([k]) => k);
  return { cooks: line(COOK), dish: line(DISH), seven, cookHoles: holeLines(COOK), dishHoles: holeLines(DISH), nCook: nHoles(COOK), nDish: nHoles(DISH) };
}

// טבחים: שלד של השבוע המקור. בני נשאר (חוץ מראשון), מולו לפי הכלל, כל השאר הופך ל"חסר טבח".
function cookRows(src: any[]) {
  const out: any[] = [];
  for (const c of src) {
    if (c.employee === BENNY && c.day !== 0) { out.push({ ...c }); continue; }
    if (c.employee === MOLU && MOLU_DAYS.includes(c.day)) continue;
    out.push({ ...c, employee: null, first_name: "", last_name: "", notes: c.employee ? "חסר טבח" : (c.notes || "חסר טבח") });
  }
  for (const d of MOLU_DAYS) for (const [shift, t] of MOLU_TIMES)
    out.push({ day: d, role: COOK, shift, employee: MOLU, first_name: "מולו", last_name: "", planned_start: t, planned_end: null, notes: "" });
  // order רץ לכל יום, בוקר לפני ערב
  out.sort((a, b) => (a.day - b.day) || hhmm(a.planned_start).localeCompare(hhmm(b.planned_start)));
  const n: Record<number, number> = {};
  for (const r of out) r.order = (n[r.day] = (n[r.day] ?? 0) + 1);
  return out;
}

const json = (o: any, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const go = u.searchParams.get("confirm") === "1", notify = u.searchParams.get("notify") === "1";
    const WEEK = u.searchParams.get("week") ?? nextSunday();
    const SRC = u.searchParams.get("src") ?? addDays(WEEK, -7);
    const range = `${ddmm(WEEK)}–${ddmm(addDays(WEEK, 6))}`;
    let skip: number[] = [];
    try { const v = JSON.parse((await cfg("SHIFT_DRAFT_SKIP")) || "[]"); if (Array.isArray(v)) skip = v.map(Number); } catch (_e) { skip = []; }
    const target = (await cfg("SHIFT_DRAFT_WA_TARGET")) || (await cfg("SHIFT_CLOCK_WA_TARGET"));
    const tell = async (msg: string) => (notify && go && target) ? await send(target, msg) : false;

    const jar: Record<string, string> = {};
    if (!(await login(jar))) return json({ error: "login failed" }, 502);
    if (!(await switchApp(jar, APP))) return json({ error: "switch failed" }, 502);
    const get = async (p: string) => rowsOf(await (await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) })).json());
    const findRota = async (d: string) => (await get("rotas/")).find((r: any) => String(r.date).slice(0, 10) === d && r.application === APP && !r.is_deleted);

    const srcRota = await findRota(SRC);
    if (!srcRota) return json({ error: `אין רוטה לשבוע המקור ${SRC}` }, 404);
    let rota = await findRota(WEEK);
    const allCells = (await get("cells/")).filter((c: any) => !c.is_deleted);
    const existing = rota ? allCells.filter((c: any) => c.rota === rota.id && [COOK, DISH].includes(c.role)) : [];
    // תאים מקור → תאים יעד: שוטפים אחד-לאחד, טבחים לפי cookRows
    const srcAll = allCells.filter((c: any) => c.rota === srcRota.id && [COOK, DISH].includes(c.role) && c.planned_start)
      .sort((a: any, b: any) => (a.day - b.day) || (Number(a.order || 0) - Number(b.order || 0)));
    const toRow = (c: any) => {
      const date = addDays(WEEK, c.day);
      const drop = c.employee && skip.includes(Number(c.employee));
      const notes = drop ? `חסר ${ROLE_NAME[c.role]} (במקום ${who(c)})` : (c.notes || "");
      const ps = hhmm(c.planned_start), pe = c.planned_end ? hhmm(c.planned_end) : null;
      const endDate = pe && pe < ps ? addDays(date, 1) : date;
      return {
        view: { day: c.day, role: c.role, employee: drop ? null : c.employee, first_name: drop ? "" : c.first_name, last_name: drop ? "" : c.last_name, planned_start: ps, notes },
        payload: {
          shift: c.shift, day: c.day, date, role: c.role, employee: drop ? null : c.employee, order: Number(c.order || 0),
          planned_start: `${ps}:00`, planned_end: pe ? `${pe}:00` : null,
          planned_start_full: `${date}T${ps}:00`, planned_end_full: pe ? `${endDate}T${pe}:00` : null,
          manual_start: null, manual_end: null, work_code: c.work_code ?? 0, break_duration: c.break_duration ?? 0, waiting: 0,
          absence: "", notes, highlight: "", sub_rota: null,
        },
      };
    };
    const cooks = cookRows(srcAll.filter((c: any) => c.role === COOK)).map(toRow);
    const rows = [...srcAll.filter((c: any) => c.role === DISH).map(toRow), ...cooks];
    const s = summarize(rows.map((r) => r.view));
    const msgBody = (head: string) => `${head}\n\n` +
      `*טבחים קבועים:* בני ב'–ש' (חופש א') · מולו כפולות ב'–ה' 11:30+17:00\n` +
      `*טבחים לשבץ (${s.nCook} תאים "חסר טבח"):*\n${s.cookHoles.map((h) => "• " + h).join("\n") || "—"}\n\n` +
      `*שוטפים (ימים):* ${s.dish || "—"} — העתק של ${ddmm(SRC)}–${ddmm(addDays(SRC, 6))}\n` +
      (s.nDish ? `*שוטפים חסרים:* ${s.dishHoles.join(" · ")}\n` : "") +
      (s.seven.length ? `\n⚠️ *7 ימים:* ${s.seven.join(", ")}\n` : "") +
      `\nשלח לי מי עובד איפה ואמלא. הסידור לא מפורסם.`;

    // בנייה מחדש של הטבחים בטיוטה קיימת — רק אם אף אחד לא נגע בה מאז ההעתקה
    if (u.searchParams.get("rebuild") === "cooks") {
      if (!rota) return json({ error: "אין טיוטה לשבוע הזה" }, 404);
      const key = (c: any) => `${c.day}|${c.employee ?? "-"}|${hhmm(c.planned_start)}`;
      const cur = allCells.filter((c: any) => c.rota === rota.id && c.role === COOK);
      const want = new Set(srcAll.filter((c: any) => c.role === COOK).map(key));
      const curKeys = new Set(cur.map(key));
      const changed = [...curKeys].filter((k) => !want.has(k)).concat([...want].filter((k) => !curKeys.has(k)));
      if (changed.length) return json({ blocked: true, reason: "תאי הטבחים בטיוטה נערכו מאז ההעתקה — לא נוגע", changed }, 409);
      if (!go) return json({ dry: true, rebuild: "cooks", delete: cur.length, create: cooks.length, message: msgBody(`🗓 *טיוטת סידור מטבח ${range}* (ריצה יבשה)`) });
      let del = 0, created = 0; const failed: any[] = [];
      for (const c of cur) {
        let r = await fetch(`${BASE}/api/cells/${c.id}/?application=${APP}`, { method: "DELETE", headers: hdrs(jar, true) });
        if (!r.ok) r = await fetch(`${BASE}/api/cells/${c.id}/?application=${APP}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ is_deleted: true }) });
        await r.text(); if (r.ok) del++; else failed.push({ del: c.id, status: r.status });
      }
      for (const r of cooks) {
        const res = await fetch(`${BASE}/api/cells/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ ...r.payload, rota: rota.id }) });
        const t = await res.text();
        if (res.ok) created++; else failed.push({ day: r.payload.day, start: r.payload.planned_start, status: res.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
      }
      const after = await findRota(WEEK);
      const message = msgBody(`🗓 *טיוטת סידור מטבח ${range}* — הטבחים נבנו מחדש (${created} תאים${failed.length ? `, ${failed.length} כשלים` : ""})`);
      const sent = await tell(message);
      return json({ rebuild: "cooks", rota: rota.id, published: after?.is_published ?? null, deleted: del, created, failed, sent, message });
    }
    if (existing.length) {
      const msg = `🗓 *סידור מטבח ${range}*\nכבר קיימת טיוטה בשיפט עם ${existing.length} תאים — לא נגעתי בה.`;
      const sent = await tell(msg);
      return json({ skipped: "target week already has cells", week: WEEK, rota: rota.id, cells: existing.length, sent, message: msg });
    }

    if (!go) return json({ dry: true, week: WEEK, src: SRC, src_rota: srcRota.id, rota_exists: !!rota, would_write: rows.length,
      message: msgBody(`🗓 *טיוטת סידור מטבח ${range}* (ריצה יבשה)`) });

    if (!rota) {
      const cr = await fetch(`${BASE}/api/rotas/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: APP, date: WEEK, source: "manual" }) });
      const ct = await cr.text();
      if (!cr.ok) return json({ error: `rota create ${cr.status}`, body: ct.slice(0, 300) }, 502);
      try { rota = JSON.parse(ct); } catch { rota = null; }
      if (!rota?.id) rota = await findRota(WEEK);
    }
    let quotas = (await get(`employees-quotas/?date=${WEEK}`)).length;
    if (quotas < 60) {
      for (const q of await get(`employees-quotas/?date=${SRC}`)) {
        const b: any = { ...q, date: WEEK }; delete b.id; delete b.version;
        const r = await fetch(`${BASE}/api/employees-quotas/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify(b) });
        await r.text();
      }
      quotas = (await get(`employees-quotas/?date=${WEEK}`)).length;
    }
    if (quotas < 60) {
      const msg = `⚠️ *טיוטת סידור מטבח ${range}* — הרוטה נוצרה אבל המכסות לא הועתקו (${quotas}), ולכן לא נכתבו תאים. צריך לבדוק ידנית.`;
      await tell(msg);
      return json({ blocked: true, quotas, rota: rota?.id }, 409);
    }

    let created = 0; const failed: any[] = [];
    for (const r of rows) {
      const res = await fetch(`${BASE}/api/cells/?application=${APP}`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ ...r.payload, rota: rota.id }) });
      const t = await res.text();
      if (res.ok) created++; else failed.push({ day: r.payload.day, start: r.payload.planned_start, emp: r.payload.employee, status: res.status, body: t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140) });
    }
    const after = await findRota(WEEK);
    const head = `🗓 *טיוטת סידור מטבח ${range}* — נוצרה בשיפט (${created} תאים${failed.length ? `, ${failed.length} נכשלו` : ""})`;
    const message = msgBody(head);
    const sent = await tell(message);
    return json({ week: WEEK, src: SRC, rota: rota.id, published: after?.is_published ?? null, quotas, created, failed, sent, message });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
