import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: יציבות הסידור בין שבועות (מטבח 4283 + פלור 4281) ומצב הגשות זמינות לשבוע הבא. לא כותב כלום.
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://app.shiftorganizer.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

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
  const sw = await fetch(`${BASE}/api/auth/switch-application/`, { method: "POST", headers: hdrs(jar, true), body: JSON.stringify({ application: app }), redirect: "manual" });
  eat(sw, jar); return sw.ok;
}
const rowsOf = (j: any) => Array.isArray(j) ? j : (Array.isArray(j?.results) ? j.results : []);
const hhmm = (s: any) => String(s || "").slice(0, 5);
const nm = (c: any) => c.employee ? ((c.first_name || "") + (c.last_name ? " " + c.last_name : "")).trim() : ("—" + (c.notes ? "[" + c.notes + "]" : ""));

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const secret = await cfg("ALFRED_SYNC_SECRET");
    if (!secret || (req.headers.get("x-sync-secret") ?? u.searchParams.get("secret")) !== secret) return new Response("unauthorized", { status: 401 });
    const from = u.searchParams.get("from") ?? "2026-09-13", next = u.searchParams.get("next") ?? "2026-10-11";
    const jar: Record<string, string> = {};
    if (!(await login(jar))) return new Response(JSON.stringify({ error: "login failed" }), { status: 502 });
    const out: Record<string, any> = {};
    for (const app of (u.searchParams.get("apps") ?? "4283,4281").split(",").map(Number)) {
      if (!(await switchApp(jar, app))) { out[app] = "switch failed"; continue; }
      const g = async (p: string) => { const r = await fetch(`${BASE}/api/${p}`, { headers: hdrs(jar) }); const t = await r.text(); try { return JSON.parse(t); } catch { return { err: `${r.status} ${t.slice(0, 200)}` }; } };
      const roles: Record<number, string> = {};
      for (const r of rowsOf(await g(`roles/?application=${app}`))) roles[r.id] = r.name;
      const rotas = rowsOf(await g("rotas/")).filter((r: any) => r.application === app && !r.is_deleted && String(r.date).slice(0, 10) >= from)
        .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
      const cells = rowsOf(await g("cells/")).filter((c: any) => !c.is_deleted);
      const weeks: any[] = [];
      for (const r of rotas) {
        const cs = cells.filter((c: any) => c.rota === r.id);
        const byRole: Record<string, Record<string, string[]>> = {};
        const keys = new Set<string>(), keysNoTime = new Set<string>();
        for (const c of cs) {
          const rn = roles[c.role] ?? String(c.role);
          ((byRole[rn] ||= {})[nm(c)] ||= []).push(`${c.day}@${hhmm(c.planned_start)}`);
          keys.add(`${c.role}|${c.employee ?? "-"}|${c.day}|${hhmm(c.planned_start)}`);
          keysNoTime.add(`${c.role}|${c.employee ?? "-"}|${c.day}`);
        }
        weeks.push({ id: r.id, date: String(r.date).slice(0, 10), pub: r.is_published, n: cs.length, keys, keysNoTime,
          roles: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([e, d]) => [e, d.sort().join(" ")]))])) });
      }
      const sim = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return `${i}/${Math.max(a.size, b.size)}`; };
      const stab = weeks.slice(1).map((w, i) => ({ week: w.date, vs: weeks[i].date, same_exact: sim(weeks[i].keys, w.keys), same_emp_day: sim(weeks[i].keysNoTime, w.keysNoTime) }));
      const reqs = rowsOf(await g(`requests/?application=${app}`));
      const nx = reqs.filter((x: any) => String(x.date ?? x.start_date ?? "") >= next);
      const byEmp: Record<string, number> = {};
      for (const x of nx) byEmp[String(x.employee)] = (byEmp[String(x.employee)] ?? 0) + 1;
      let perEmp: Record<string, any> | null = null;
      if (u.searchParams.get("emp") && weeks.length) {
        perEmp = {};
        const last = weeks.filter((w) => w.date < next).pop();
        const emps = [...new Set(cells.filter((c: any) => c.rota === last.id && c.employee).map((c: any) => c.employee))];
        for (const e of emps) {
          const rs = rowsOf(await g(`requests/?application=${app}&employee=${e}`));
          const nn = cells.find((c: any) => c.employee === e);
          perEmp[`${e} ${nn ? nm(nn) : ""}`] = rs.filter((x: any) => String(x.date ?? "") >= next).map((x: any) => `${x.date} s${x.availability_shift} st${x.state}${x.is_default ? " def" : ""}`).join(", ") || `(none; total ${rs.length})`;
        }
      }
      out[app] = { perEmp, stability: stab, weeks: weeks.map(({ keys, keysNoTime, ...w }) => (u.searchParams.get("full") ? w : { id: w.id, date: w.date, pub: w.pub, n: w.n })),
        requests_total: reqs.length, requests_next: nx.length, next_by_emp: byEmp, req_sample: reqs[0] ?? null };
    }
    return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
