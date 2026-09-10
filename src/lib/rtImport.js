import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabaseClient'

/**
 * Calls fetch-rt-movie (see supabase/functions/fetch-rt-movie.ts) with a pasted Rotten Tomatoes
 * link and returns the scraped fields, for AddMovieDialog's admin "add by hand" flow.
 *
 * Throws a plain Error with a message meant to be shown to the admin directly (a bad link, RT
 * 404ing, RT being unreachable) -- there is no separate "friendly wrapper" layer here the way
 * planError/moviesError get a generic prefix elsewhere, because this dialog's whole job in that
 * moment is showing exactly what went wrong with the one link that was just pasted.
 */
export async function fetchRtMovieInfo(url) {
  const { data, error } = await supabase.functions.invoke('fetch-rt-movie', { body: { url } })
  if (error) {
    // A non-2xx response arrives as FunctionsHttpError with the *unconsumed* Response on
    // `.context` (confirmed against the installed @supabase/functions-js: it throws the raw
    // fetch Response before ever reading its body) -- read fetch-rt-movie's own {error: "..."}
    // JSON off of it rather than surfacing supabase-js's generic "non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      const message = await error.context
        .json()
        .then((body) => body?.error)
        .catch(() => null) // not JSON, or the function is down entirely -- fall through below
      if (message) throw new Error(message)
    }
    throw new Error(error.message || "Couldn't reach the import function.")
  }
  return data.movie
}
