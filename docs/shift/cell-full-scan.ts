// סריקה: תאים עם manual_start/manual_end שה-_full שלהם חסר או לא תואם (עדכונים דרך API בלי _full).
// ?from=YYYY-MM-DD  בלי confirm — קריאה בלבד. &confirm=1&ids=1,2 — מעדכן _full לפי ה-manual (manual קובע).
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
async function cfg(k: string) { const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle(); return data?.value ?? ""; }
function eat(res: Response, jar: Record<string, string>) {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of raw) { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
}
const jarStr = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
function hdrs(jar: Record<string, string>, post = false) {
  const h: Record<string, string> = { "User-Agent": UA, "Accept": "application/json", "Cookie": jarStr(jar), "Referer": `${BASE}/app/home/` };
  if (post) { h["Content-Type"] = "application/json"; h["Origin"] = BASE; }
  if (jar["csrftoken"]) h["X-CSRFToken"] = jar["csrftoken"];
  return h;
}
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function ilOffset(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const h = Math.round((Date.parse(d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })) - Date.parse(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 36e5);
  return `+${String(h).padStart(2, "0")}:00`;
}
function fullOf(date: string, t: string, after?: string | null): string {
  let d = date;
  if (after && mins(t) < mins(after)) d = ymd(Date.parse(`${date}T00:00:00Z`) + 864e5);
  return `${d}T${t.slice(0, 5)}:00${ilOffset(d)}`;
}
const hmOfFull = (f: string | null) => f ? f.slice(11, 16) : null;
Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("unauthorized", { status: 401 });
  const from = u.searchParams.get("from") ?? "2026-09-20", go = u.searchParams.get("confirm") === "1";
  const only = new Set((u.searchParams.get("ids") ?? "").split(",").map(Number).filter(Boolean));
  const jar: Record<string, string> = {};
  const g = await fetch(`${BASE}/app/login/`, { headers: { "User-Agent": UA }, redirect: "manual" }); eat(g, jar);
  const r = await fetch(`${BASE}/api/auth/login/`, { method: "POST", headers: { ...hdrs(jar, true), "Referer": `${BASE}/app/login/` }, body: JSON.stringify({ username: await cfg("SHIFT_USERNAME"), company: await cfg("SHIFT_COMPANY"), password: await cfg("SHIFT_PASSWORD") }), redirect: "manual" }); eat(r, jar);
  const out: any[] = [];
  for (const app of [4281, 4283]) {
    const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" }); eat(sw, jar);
    const j = await (await fetch(`${BASE}/api/cells/`, { headers: hdrs(jar) })).json().catch(() => []);
    const rows = Array.isArray(j) ? j : (j?.results ?? []);
    for (const c of rows) {
      const date = String(c.date ?? "").slice(0, 10);
      if (date < from || c.is_deleted || !(c.manual_start || c.manual_end)) continue;
      const bad: Record<string, string> = {};
      if (c.manual_start && hmOfFull(c.manual_start_full) !== c.manual_start.slice(0, 5)) { bad.manual_start = c.manual_start; bad.manual_start_full = fullOf(date, c.manual_start); }
      const st = c.manual_start ?? c.clock_start ?? c.planned_start ?? null;
      if (c.manual_end && hmOfFull(c.manual_end_full) !== c.manual_end.slice(0, 5)) { bad.manual_end = c.manual_end; bad.manual_end_full = fullOf(date, c.manual_end, st); }
      if (!Object.keys(bad).length) continue;
      const row: any = { app, id: c.id, date, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        ms: c.manual_start, msf: c.manual_start_full, me: c.manual_end, mef: c.manual_end_full, cs: c.clock_start, ce: c.clock_end, fix: bad };
      if (go && only.has(c.id)) {
        const p = await fetch(`${BASE}/api/cells/${c.id}/?application=${app}`, { method: "PATCH", headers: hdrs(jar, true), body: JSON.stringify({ ...bad, version: c.version }) });
        row.s = p.status; if (!p.ok) row.err = (await p.text()).slice(0, 200);
      }
      out.push(row);
    }
  }
  return new Response(JSON.stringify({ from, n: out.length, out }, null, 1), { headers: { "Content-Type": "application/json" } });
});
