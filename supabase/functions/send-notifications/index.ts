// Sends whatever public.pending_notifications() says is due, as Web Push
// notifications to each player's phones. Called every 15 minutes by the
// pg_cron job "send-notifications" (see supabase/notifications.sql).
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  push keys (scripts/make-push-keys.mjs)
//   VAPID_SUBJECT                        the app's web address, e.g. https://your-app.vercel.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

type Pending = { user_id: string; kind: string; ref: string; title: string; body: string; url: string };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  // Only the scheduler knows this secret
  const secret = req.headers.get("x-notify-secret") ?? "";
  const { data: ok } = await supabase.rpc("check_notify_secret", { p_secret: secret });
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const { data: pending, error } = await supabase.rpc("pending_notifications");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const items = (pending ?? []) as Pending[];
  if (items.length === 0) return Response.json({ sent: 0 });

  const userIds = [...new Set(items.map((i) => i.user_id))];
  const { data: subRows, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subError) return Response.json({ error: subError.message }, { status: 500 });
  const subs = (subRows ?? []) as Sub[];

  let sent = 0;
  let failed = 0;
  for (const item of items) {
    const phones = subs.filter((s) => s.user_id === item.user_id);
    let delivered = false;
    let retry = false;
    for (const phone of phones) {
      try {
        await webpush.sendNotification(
          { endpoint: phone.endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth } },
          JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: `${item.kind}:${item.ref}` }),
          { TTL: 3600 },
        );
        delivered = true;
        await supabase.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", phone.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // That phone turned notifications off or the app was removed
          await supabase.from("push_subscriptions").delete().eq("id", phone.id);
        } else {
          retry = true;
          console.error("Push failed", status, (err as Error).message);
        }
      }
    }
    // Log it unless every phone had a temporary failure (then try again next run)
    if (delivered || !retry) {
      await supabase.from("notification_log").upsert(
        { user_id: item.user_id, kind: item.kind, ref: item.ref },
        { onConflict: "user_id,kind,ref", ignoreDuplicates: true },
      );
    }
    if (delivered) sent++;
    else failed++;
  }
  return Response.json({ sent, failed });
});
