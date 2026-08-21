// Pure helpers for the knockout bracket -- no React, no Supabase, mirrors movieCatalog.js's role.

import { weightedScore } from '@/data/movieCatalog'

/** Two films is the smallest thing that can be a tournament: one match, straight to the final. */
export const MIN_BRACKET = 2
export const MAX_BRACKET = 32

/**
 * A knockout tree only halves cleanly from a power of two, so any other count is padded up to
 * the next one and the gap filled with byes -- 6 films run as an 8-bracket where two of them sit
 * out the first round. That's how real tournaments handle it, and it's why any count >= 2 works
 * here rather than only 4/8/16.
 */
export function bracketCapacity(count) {
  let capacity = 1
  while (capacity < count) capacity *= 2
  return Math.max(capacity, 2)
}

/** How many entrants skip round 1. Zero when the count is already a power of two. */
export function byeCount(count) {
  return bracketCapacity(count) - count
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
 * `seeds` is the ordered entrant list (best seed first) and may be ANY length >= 2. When it isn't
 * a power of two the tree is padded to the next one and the empty slots become byes: standard
 * seeding puts those against the top seeds, who are then advanced here at build time (winner set,
 * next round pre-filled) so nobody is ever asked to vote on a film with no opponent.
 */
export function buildMatches(seeds) {
  const capacity = bracketCapacity(seeds.length)
  const rounds = roundCount(capacity)
  const order = seedOrder(capacity)

  const matches = []
  for (let round = 1; round <= rounds; round += 1) {
    for (let slot = 0; slot < capacity / 2 ** round; slot += 1) {
      matches.push({ round, slot, movie_a: null, movie_b: null, winner: null })
    }
  }
  const at = (round, slot) => matches.find((m) => m.round === round && m.slot === slot)

  for (let slot = 0; slot < capacity / 2; slot += 1) {
    const match = at(1, slot)
    // A seed number past the entrant count is an empty slot -- that's the bye.
    match.movie_a = seeds[order[slot * 2] - 1] ?? null
    match.movie_b = seeds[order[slot * 2 + 1] - 1] ?? null
  }

  // ROUND 1 ONLY. A later round holding a single film is not a bye -- it's a match still waiting
  // on the other feeder to be decided, and auto-advancing it here would send a film through
  // without it ever being voted on. (Standard seeding also guarantees no round-1 match is
  // completely empty: capacity is the *next* power of two up, so more than half the slots are
  // always filled.)
  for (let slot = 0; slot < capacity / 2; slot += 1) {
    const match = at(1, slot)
    const present = [match.movie_a, match.movie_b].filter(Boolean)
    if (present.length !== 1) continue
    match.winner = present[0]
    if (rounds > 1) {
      const { round: nextRound, slot: nextSlotIndex, side } = nextSlot(match)
      at(nextRound, nextSlotIndex)[side] = present[0]
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
