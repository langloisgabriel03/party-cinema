import { create } from 'zustand'

import { buildMatches, nextSlot } from '@/data/bracket'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

/**
 * The knockout bracket: the tournament, its match tree, and everyone's votes. Its own store (and
 * its own realtime channel) rather than more surface on usePlanStore -- only the bracket page
 * consumes any of it, and the two domains share no state.
 */
let subscribed = false
let channel = null

async function fetchLatestBracket() {
  const { data, error } = await supabase
    .from('brackets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

function connectChannel(set, get) {
  if (channel) supabase.removeChannel(channel)

  channel = supabase
    .channel('bracket-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'brackets' }, () => {
      get().refreshBracket()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bracket_matches' }, ({ eventType, new: row }) => {
      // Matches only ever change one at a time and always carry the full row on INSERT/UPDATE --
      // patch in place rather than refetching the tree on every vote-driven advance.
      if (eventType === 'DELETE') return get().refreshBracket()
      const current = get().matches
      const index = current.findIndex((m) => m.id === row.id)
      if (index === -1) set({ matches: [...current, row] })
      else set({ matches: current.map((m) => (m.id === row.id ? row : m)) })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bracket_votes' }, ({ eventType, new: row, old }) => {
      const current = get().votes
      if (eventType === 'DELETE') {
        set({
          votes: current.filter((v) => !(v.match_id === old.match_id && v.profile_id === old.profile_id)),
        })
        return
      }
      const index = current.findIndex((v) => v.match_id === row.match_id && v.profile_id === row.profile_id)
      if (index === -1) set({ votes: [...current, row] })
      else set({ votes: current.map((v, i) => (i === index ? row : v)) })
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') get().refreshBracket()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') set({ bracketError: 'Realtime connection lost.' })
    })
}

export const useBracketStore = create((set, get) => ({
  bracket: null,
  matches: [],
  votes: [],
  // null means "not scoped" -- every profile plays. An array is the explicit roster.
  participantIds: null,
  bracketLoading: true,
  bracketError: null,

  refreshBracket: async () => {
    try {
      const bracket = await fetchLatestBracket()
      if (!bracket) {
        set({
          bracket: null,
          matches: [],
          votes: [],
          participantIds: null,
          bracketLoading: false,
          bracketError: null,
        })
        return
      }
      const [matchesResult, votesResult, participantsResult] = await Promise.all([
        supabase.from('bracket_matches').select('*').eq('bracket_id', bracket.id),
        supabase.from('bracket_votes').select('*'),
        supabase.from('bracket_participants').select('profile_id').eq('bracket_id', bracket.id),
      ])
      if (matchesResult.error) throw matchesResult.error
      if (votesResult.error) throw votesResult.error
      const matchIds = new Set(matchesResult.data.map((m) => m.id))
      set({
        bracket,
        matches: matchesResult.data,
        votes: votesResult.data.filter((v) => matchIds.has(v.match_id)),
        // A missing table (migration not run yet) is treated as "everyone", which is what the
        // behaviour was before participants existed -- better than a bracket with no voters that
        // can never resolve a match.
        participantIds: participantsResult.error
          ? null
          : participantsResult.data.map((p) => p.profile_id),
        bracketLoading: false,
        bracketError: null,
      })
    } catch (error) {
      // bracket_schema.sql is a manual paste-in-dashboard migration and can lag a deploy -- show
      // the page's empty state rather than a crash if the tables aren't there yet.
      console.warn('bracket fetch failed (has bracket_schema.sql been run?):', error.message)
      set({ bracketLoading: false, bracketError: error.message })
    }
  },

  initBracket: () => {
    if (subscribed) return
    subscribed = true
    if (!supabaseConfigured) {
      set({ bracketLoading: false, bracketError: 'Supabase is not configured yet.' })
      return
    }
    connectChannel(set, get)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') connectChannel(set, get)
    })
  },

  /** Replaces any existing bracket -- there's only ever one tournament running. */
  startBracket: async (movieIds, profileId, participantIds) => {
    const previous = get().bracket
    const { data: bracket, error } = await supabase
      .from('brackets')
      .insert({ created_by: profileId })
      .select()
      .single()
    if (error) {
      set({ bracketError: error.message })
      return
    }

    // buildMatches pre-resolves byes when the count isn't a power of two, so the rows inserted
    // here already carry those winners -- don't strip `winner` on the way in.
    const rows = buildMatches(movieIds).map((m) => ({ ...m, bracket_id: bracket.id }))
    const { data: matches, error: matchError } = await supabase.from('bracket_matches').insert(rows).select()
    if (matchError) {
      // Roll the bracket back rather than leaving a tournament with no matches in it, which the
      // UI would render as a permanently empty bracket nobody can clear.
      await supabase.from('brackets').delete().eq('id', bracket.id)
      set({ bracketError: matchError.message })
      return
    }

    let roster = null
    if (participantIds?.length) {
      const { error: partError } = await supabase
        .from('bracket_participants')
        .insert(participantIds.map((id) => ({ bracket_id: bracket.id, profile_id: id })))
      // Not fatal: without the roster the bracket just falls back to "everyone votes", which is
      // how it worked before. Better than throwing away a tournament that's otherwise fine.
      if (partError) console.warn('could not save participants (bracket_participants.sql run?):', partError.message)
      else roster = participantIds
    }

    if (previous) await supabase.from('brackets').delete().eq('id', previous.id)
    set({ bracket, matches, votes: [], participantIds: roster, bracketError: null })
  },

  castVote: async (matchId, movieId, profileId) => {
    const previous = get().votes
    const index = previous.findIndex((v) => v.match_id === matchId && v.profile_id === profileId)
    const optimistic = { match_id: matchId, profile_id: profileId, movie_id: movieId }
    set({
      votes:
        index === -1
          ? [...previous, optimistic]
          : previous.map((v, i) => (i === index ? { ...v, movie_id: movieId } : v)),
    })
    const { error } = await supabase
      .from('bracket_votes')
      .upsert({ match_id: matchId, profile_id: profileId, movie_id: movieId }, { onConflict: 'match_id,profile_id' })
    if (error) set({ votes: previous, bracketError: error.message })
  },

  /**
   * Writes a match's winner and promotes it into the next round's slot. Guarded on the match not
   * already having a winner so several clients resolving the same match at once (very likely --
   * everyone is watching when the deciding vote lands) can't double-advance it.
   */
  resolveMatch: async (match, winnerMovieId, totalRounds) => {
    if (match.winner) return
    const { data: updated, error } = await supabase
      .from('bracket_matches')
      .update({ winner: winnerMovieId })
      .eq('id', match.id)
      .is('winner', null)
      .select()
    if (error) {
      set({ bracketError: error.message })
      return
    }
    if (!updated?.length) return // someone else got there first

    if (match.round >= totalRounds) {
      const bracket = get().bracket
      if (bracket) {
        await supabase
          .from('brackets')
          .update({ status: 'complete', champion_movie_id: winnerMovieId })
          .eq('id', bracket.id)
      }
      return
    }

    const { round, slot, side } = nextSlot(match)
    const target = get().matches.find((m) => m.round === round && m.slot === slot)
    if (target) {
      await supabase.from('bracket_matches').update({ [side]: winnerMovieId }).eq('id', target.id)
    }
  },

  clearBracket: async () => {
    const bracket = get().bracket
    if (!bracket) return
    set({ bracket: null, matches: [], votes: [] })
    const { error } = await supabase.from('brackets').delete().eq('id', bracket.id)
    if (error) set({ bracketError: error.message })
  },
}))
