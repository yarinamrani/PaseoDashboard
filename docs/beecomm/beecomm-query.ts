import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// קריאה בלבד: הרצת pipeline של Mongo על BeeComm (אותו חיבור כמו beecomm-sync — refresh token ב-app_config).
// GET ?secret=&coll=orders&p=<JSON pipeline> → rows. רק $match/$project/$unwind/$group/$sort/$limit/$addFields מותרים (בלי כתיבה).
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function cfg(k: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", k).maybeSingle();
  return data?.value ?? "";
}
const SAFE = new Set(["$match", "$project", "$unwind", "$group", "$sort", "$limit", "$addFields", "$count", "$skip"]);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("secret") !== await cfg("ALFRED_SYNC_SECRET")) return new Response("forbidden", { status: 403 });
    const coll = u.searchParams.get("coll") || "orders";
    const pipe = JSON.parse(u.searchParams.get("p") || "[]");
    if (!Array.isArray(pipe) || pipe.some((st: any) => Object.keys(st).some((k) => !SAFE.has(k)))) return new Response("bad pipeline", { status: 400 });
    const r0 = await fetch(`https://securetoken.googleapis.com/v1/token?key=${await cfg("BEECOMM_FIREBASE_KEY")}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(await cfg("BEECOMM_REFRESH_TOKEN"))}` });
    const tok = (await r0.json())?.id_token;
    if (!tok) return new Response(JSON.stringify({ error: "token" }), { status: 502 });
    const db = await cfg("BEECOMM_DB");
    const r = await fetch(await cfg("BEECOMM_API_URL"), { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + tok, origin: "https://backoffice.beecommcloud.com" },
      body: JSON.stringify({ db, url: "api/connectoractions", data: { db, collection: coll, action: "get", query: pipe }, token: "Bearer " + tok }) });
    const t = await r.text();
    return new Response(t.slice(0, 200000), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
