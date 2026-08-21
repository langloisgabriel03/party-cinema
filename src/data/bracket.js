// Pure helpers for the knockout bracket -- no React, no Supabase, mirrors movieCatalog.js's role.

import { weightedScore } from '@/data/movieCatalog'

/** Bracket sizes we support. Anything else gets rounded DOWN to the nearest of these. */
export const BRACKET_SIZES = [4, 8, 16]

export function bracketSizeFor(available) {
  let best = 0
  for (const size of BRACKET_SIZES) if (size <= available) best = size
  return best
}

/**
 * Standard tournament seeding, so the top seeds can't meet before the final: for 8 entrants the
 * order is [1,8,4,5,2,7,3,6], read as consecutive pairs. Built by repeatedly splicing each seed
 * against its complement as the field doubles.
 */
export function seedOrder(size) {
  let order = [1]
  while (order.length < size) {
    const next = []
    const complement = order.length * 2 + 1
    for (const seed of order) next.push(seed, complement - seed)
    order = next
  }
  return order
}

/** Rounds needed for `size` entrants: 8 -> 3 (quarters, semis, final). */
export function roundCount(size) {
  return Math.log2(size)
}

export function roundName(round, totalRounds) {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  // Named by how many are still in it (2^(fromEnd+1)) rather than "Round 1", which says nothing
  // about how far in you are.
  return `Round of ${2 ** (fromEnd + 1)}`
}

/**
 * Builds every match row for a new bracket, including the empty later rounds -- creating the full
 * tree up-front means advancing a winner is an UPDATE of a row that already exists, never an
 * INSERT that two clients could race and duplicate.
 *
 * `seeds` is the ordered entrant list (best seed first); its length must be a power of two.
 */
export function buildMatches(seeds) {
  const size = seeds.length
  const order = seedOrder(size)
  const matches = []

  for (let slot = 0; slot < size / 2; slot += 1) {
    matches.push({
      round: 1,
      slot,
      movie_a: seeds[order[slot * 2] - 1] ?? null,
      movie_b: seeds[order[slot * 2 + 1] - 1] ?? null,
    })
  }

  for (let round = 2; round <= roundCount(size); round += 1) {
    for (let slot = 0; slot < size / 2 ** round; slot += 1) {
      matches.push({ round, slot, movie_a: null, movie_b: null })
    }
  }
  return matches
}

/** Where a match's winner goes next: round+1, and two adjacent slots feed one slot above. */
export function nextSlot(match) {
  return {
    round: match.round + 1,
    slot: Math.floor(match.slot / 2),
    side: match.slot % 2 === 0 ? 'movie_a' : 'movie_b',
  }
}

export function tallyVotes(votes, matchId) {
  const counts = new Map()
  for (const vote of votes) {
    if (vote.match_id !== matchId) continue
    counts.set(vote.movie_id, (counts.get(vote.movie_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Resolves a match from its current votes. Returns null when it genuinely can't be called yet.
 *
 * The tiebreak is deliberately deterministic (better weighted score, then lower id) rather than
 * random: several clients can reach this at the same moment as the last vote lands, and a random
 * pick would have them each write a different winner over each other.
 */
export function decideWinner(match, votes, moviesById, voterCount) {
  if (!match.movie_a || !match.movie_b) return null
  const counts = tallyVotes(votes, match.id)
  const a = counts.get(match.movie_a) ?? 0
  const b = counts.get(match.movie_b) ?? 0
  const cast = a + b
  if (cast === 0) return null

  // Undecided only while the remaining votes could still change the outcome -- once a lead is
  // bigger than the number of people left to vote, waiting for them is pointless.
  const remaining = Math.max(0, voterCount - cast)
  if (Math.abs(a - b) <= remaining && cast < voterCount) return null

  if (a !== b) return a > b ? match.movie_a : match.movie_b
  return breakTie(match.movie_a, match.movie_b, moviesById)
}

function breakTie(movieA, movieB, moviesById) {
  const sa = weightedScore(moviesById.get(movieA) ?? {}) ?? -1
  const sb = weightedScore(moviesById.get(movieB) ?? {}) ?? -1
  if (sa !== sb) return sa > sb ? movieA : movieB
  return movieA < movieB ? movieA : movieB
}

/** Force-resolve a stalled match (someone never voted) using whatever's been cast. */
export function forceWinner(match, votes, moviesById) {
  if (!match.movie_a || !match.movie_b) return null
  const counts = tallyVotes(votes, match.id)
  const a = counts.get(match.movie_a) ?? 0
  const b = counts.get(match.movie_b) ?? 0
  if (a !== b) return a > b ? match.movie_a : match.movie_b
  return breakTie(match.movie_a, match.movie_b, moviesById)
}

/** Groups matches into rounds for rendering, each sorted by slot. */
export function matchesByRound(matches) {
  const rounds = new Map()
  for (const match of matches) {
    const list = rounds.get(match.round) ?? []
    list.push(match)
    rounds.set(match.round, list)
  }
  for (const list of rounds.values()) list.sort((a, b) => a.slot - b.slot)
  return [...rounds.entries()].sort((a, b) => a[0] - b[0])
}

/** The match everyone should be looking at: earliest unresolved one that has both films. */
export function currentMatch(matches) {
  return (
    [...matches]
      .sort((a, b) => a.round - b.round || a.slot - b.slot)
      .find((m) => !m.winner && m.movie_a && m.movie_b) ?? null
  )
}
