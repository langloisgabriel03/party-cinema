// notify-bracket
//
// Kept here for version control, but DEPLOYED by pasting: Supabase dashboard -> Edge Functions
// -> Deploy a new function -> name it `notify-bracket` -> paste this file -> Deploy. Uses the
// same VAPID_KEYS secret as notify-night; no new secret to set.
//
// Called as POST { bracketId, round, excludeProfileId }. Everything the notification says is
// looked up here -- the client only names which bracket and round, so the worst a caller can do
// is re-announce a round that genuinely exists.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

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

const serviceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default

const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
  auth: { persistSession: false },
})

const rawVapid = Deno.env.get('VAPID_KEYS')
if (!rawVapid) throw new Error('Missing VAPID_KEYS secret (Edge Functions -> Secrets).')

const vapidKeys = await webpush.importVapidKeys(JSON.parse(rawVapid))
const appServer = await webpush.ApplicationServer.new({
  contactInformation: 'https://tooning.co',
  vapidKeys,
})

function roundName(round: number, totalRounds: number) {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'the Final'
  if (fromEnd === 1) return 'the Semi-finals'
  if (fromEnd === 2) return 'the Quarter-finals'
  return `the Round of ${2 ** (fromEnd + 1)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { bracketId?: unknown; round?: unknown; excludeProfileId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const { bracketId, round, excludeProfileId } = body
  if (typeof bracketId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bracketId)) {
    return json({ error: 'bad bracketId' }, 400)
  }
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > 16) {
    return json({ error: 'bad round' }, 400)
  }

  const { data: bracket, error: bracketError } = await admin
    .from('brackets')
    .select('id, status, created_at')
    .eq('id', bracketId)
    .single()
  if (bracketError || !bracket) return json({ error: 'unknown bracket' }, 404)

  // Replay guard, keyed per (bracket, round): several clients hit this the moment a match
  // resolves, and without the claim every one of them would fan out a full round of pushes.
  // anon has no policies on this table, so it can't clear the claim and replay either.
  const { data: claimed, error: claimError } = await admin
    .from('bracket_notifications')
    .upsert({ bracket_id: bracketId, round }, { onConflict: 'bracket_id,round', ignoreDuplicates: true })
    .select('bracket_id')
  if (claimError) return json({ error: claimError.message }, 500)
  if (!claimed?.length) return json({ skipped: 'already-notified' })

  const [matchesResult, participantsResult] = await Promise.all([
    admin.from('bracket_matches').select('round, slot, movie_a, movie_b, winner').eq('bracket_id', bracketId),
    admin.from('bracket_participants').select('profile_id').eq('bracket_id', bracketId),
  ])
  if (matchesResult.error) return json({ error: matchesResult.error.message }, 500)

  const matches = matchesResult.data ?? []
  if (!matches.length) return json({ error: 'bracket has no matches' }, 404)
  const totalRounds = Math.max(...matches.map((m: any) => m.round))

  // The next thing to vote on, so the notification can name the actual matchup.
  const next = matches
    .filter((m: any) => !m.winner && m.movie_a && m.movie_b)
    .sort((a: any, b: any) => a.round - b.round || a.slot - b.slot)[0]

  let title: string
  let body_: string
  let image: string | undefined

  if (bracket.status === 'complete') {
    const final = matches.find((m: any) => m.round === totalRounds)
    const champ = final?.winner
      ? (await admin.from('movies').select('title, poster').eq('id', final.winner).maybeSingle()).data
      : null
    title = '🏆 We have a champion'
    body_ = champ?.title ? `${champ.title} wins the bracket.` : 'The bracket is decided.'
    image = champ?.poster ?? undefined
  } else if (!next) {
    return json({ skipped: 'nothing-to-vote-on' })
  } else {
    const ids = [next.movie_a, next.movie_b].filter(Boolean)
    const { data: films } = await admin.from('movies').select('id, title, poster').in('id', ids)
    const byId = new Map((films ?? []).map((f: any) => [f.id, f]))
    const a = byId.get(next.movie_a)
    const b = byId.get(next.movie_b)
    title = round === 1 ? '🏆 Bracket time' : `🏆 ${roundName(next.round, totalRounds)}`
    body_ =
      a?.title && b?.title ? `${a.title} vs ${b.title} — cast your vote` : 'A new matchup is up — cast your vote'
    image = a?.poster ?? b?.poster ?? undefined
  }

  const payload = JSON.stringify({
    title,
    body: body_,
    // Deep-links straight to the bracket rather than the dashboard, so tapping the notification
    // lands on the thing it is asking you to do.
    url: '/bracket',
    // Per round, so a new matchup replaces the previous prompt instead of stacking six of them.
    tag: `bracket-${bracketId}-${round}`,
    image,
  })

  // Only the people actually playing this bracket, minus whoever triggered it (they're in the
  // app looking at the result). No participants row at all means the bracket predates the roster
  // table, in which case everyone is playing.
  const roster = (participantsResult.data ?? []).map((p: any) => p.profile_id)
  let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth')
  if (roster.length) query = query.in('profile_id', roster)
  if (typeof excludeProfileId === 'string') query = query.neq('profile_id', excludeProfileId)

  const { data: subs, error: subsError } = await query
  if (subsError) return json({ error: subsError.message }, 500)
  if (!subs?.length) return json({ sent: 0, removed: 0 })

  const results = await Promise.allSettled(
    subs.map((s: any) =>
      appServer
        .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(payload, { ttl: 86_400, urgency: webpush.Urgency.Normal })
    )
  )

  // 410/404 mean the browser threw the subscription away. Never reap on 403 (VAPID mismatch) or
  // 429/5xx -- those are our problem, and deleting on them empties the table on the first
  // misconfiguration.
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
