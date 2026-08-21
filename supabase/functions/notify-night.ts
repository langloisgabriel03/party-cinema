// notify-night
//
// Kept here for version control, but DEPLOYED by pasting: Supabase dashboard -> Edge Functions
// -> Deploy a new function -> paste this file's contents -> Deploy. No local Supabase CLI is
// used for this project. Required secret: VAPID_KEYS (Edge Functions -> Secrets), the JSON
// produced by the VAPID key-generation script -- see README.md.
//
// Called as POST { nightId }. The client never supplies notification text -- everything the
// notification says is looked up here, so the worst a caller can do is re-announce a night that
// genuinely exists, not push arbitrary strings to everyone's lock screen.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

// Mirrors the header list @supabase/supabase-js's CORS helper expects. Inlined rather than
// imported so this single-file paste has no subpath-export surprises.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// SUPABASE_SERVICE_ROLE_KEY is auto-injected but flagged legacy in Supabase's docs;
// SUPABASE_SECRET_KEYS (a JSON dict) is the replacement. Read both so a future key-scheme
// migration doesn't silently take this function down.
const serviceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default

// service_role does not "match a policy" -- RLS simply does not apply to it. That is the only
// way to read push_subscriptions, which has RLS on and zero policies by design (see
// push_schema.sql).
const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
  auth: { persistSession: false },
})

const rawVapid = Deno.env.get('VAPID_KEYS')
if (!rawVapid) throw new Error('Missing VAPID_KEYS secret (Edge Functions -> Secrets).')

const vapidKeys = await webpush.importVapidKeys(JSON.parse(rawVapid))
const appServer = await webpush.ApplicationServer.new({
  // RFC 8292 allows mailto: or https:. If a push service ever 403s on this, try a mailto:.
  contactInformation: 'https://tooning.co',
  vapidKeys,
})

// Logged once per cold start. This MUST equal VITE_VAPID_PUBLIC_KEY in the client bundle -- if
// it doesn't, every send 403s and the browser shows nothing at all.
console.log('application server key:', await webpush.exportApplicationServerKey(vapidKeys))

// scheduled_for is a date-only string and Deno runs in UTC. Parsing it as anything but UTC
// reproduces exactly the off-by-one-day bug src/data/dates.js exists to prevent -- "Fri, Aug 25"
// would go out as "Thu, Aug 24".
function formatNightDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

Deno.serve(async (req) => {
  // Must come first and must carry the CORS headers, or the browser's preflight fails before
  // any of the logic below can run.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let nightId: unknown
  try {
    nightId = (await req.json())?.nightId
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (typeof nightId !== 'string' || !/^[0-9a-f-]{36}$/i.test(nightId)) {
    return json({ error: 'bad nightId' }, 400)
  }

  const { data: night, error: nightError } = await admin
    .from('nights')
    .select('id, scheduled_for, created_by, created_at')
    .eq('id', nightId)
    .single()
  if (nightError || !night) return json({ error: 'unknown night' }, 404)

  // Freshness window: a night booked last week can never be woken up by a stray retry.
  if (Date.now() - Date.parse(night.created_at) > 5 * 60 * 1000) {
    return json({ skipped: 'stale' })
  }

  // Replay guard: an already-claimed night returns zero rows. anon cannot clear
  // night_notifications (zero RLS policies), so this holds even against a determined caller.
  const { data: claimed, error: claimError } = await admin
    .from('night_notifications')
    .upsert({ night_id: night.id }, { onConflict: 'night_id', ignoreDuplicates: true })
    .select('night_id')
  if (claimError) return json({ error: claimError.message }, 500)
  if (!claimed?.length) return json({ skipped: 'already-notified' })

  const [bookerResult, filmsResult] = await Promise.all([
    night.created_by
      ? admin.from('profiles').select('name').eq('id', night.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('night_movies').select('movies(title, poster)').eq('night_id', night.id).limit(3),
  ])

  const films = (filmsResult.data ?? []).map((row: any) => row.movies).filter(Boolean)
  const titles = films.map((m: any) => m.title).filter(Boolean)
  const who = bookerResult.data?.name ?? 'Someone'
  const date = formatNightDate(night.scheduled_for)

  const payload = JSON.stringify({
    title: `${who} booked a movie night`,
    body: titles.length ? `${date} — ${titles.join(', ')}` : date,
    url: '/dashboard',
    tag: `night-${night.id}`,
    // First attached film's poster, if there is one -- shown as the large image in the
    // expanded notification on platforms that support it (see sw.js). Undefined (not present
    // in the JSON at all) when there's no film yet or no poster URL, matching sw.js's check.
    image: films.find((m: any) => m.poster)?.poster,
  })

  // Everyone except the booker's own devices. created_by is nullable in the schema; if it's
  // null we cannot exclude anyone, so notify everybody rather than nobody.
  let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth')
  if (night.created_by) query = query.neq('profile_id', night.created_by)
  const { data: subs, error: subsError } = await query
  if (subsError) return json({ error: subsError.message }, 500)
  if (!subs?.length) return json({ sent: 0, removed: 0 })

  // Parallel: a handful of independent HTTPS round-trips to FCM/Mozilla/APNs, and one slow or
  // dead push service must not hold up the rest. allSettled, never all.
  const results = await Promise.allSettled(
    subs.map((s) =>
      appServer
        .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(payload, { ttl: 86_400, urgency: webpush.Urgency.High })
    )
  )

  // 410 Gone / 404 Not Found mean the browser threw this subscription away -- reap it, or the
  // table accumulates dead endpoints forever. Everything else is OUR problem: 403 is a VAPID key
  // mismatch, 429 is rate limiting, 5xx is the push service. Deleting on those would silently
  // empty the entire table the first time a key is misconfigured.
  const dead: string[] = []
  results.forEach((result, i) => {
    if (result.status !== 'rejected') return
    const error = result.reason
    const status = error instanceof webpush.PushMessageError ? error.response.status : 0
    if (status === 410 || status === 404) dead.push(subs[i].endpoint)
    else console.error('push failed', status, String(error))
  })
  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    removed: dead.length,
  })
})
