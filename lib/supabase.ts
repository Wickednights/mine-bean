import { createClient } from '@supabase/supabase-js'

const fetchNoCache = (url: RequestInfo | URL, options?: RequestInit) =>
  fetch(url, { ...options, cache: 'no-store' })

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: fetchNoCache } }
)
