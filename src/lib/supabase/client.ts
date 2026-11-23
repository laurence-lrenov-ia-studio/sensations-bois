import { createClient } from '@supabase/supabase-js'

export const projectUrl = 'https://dkfwiaulbapfbbrslavy.supabase.co'
// Capture the invite marker before supabase-js consumes the URL fragment.
export const invitationInUrl = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'invite'
  || new URLSearchParams(window.location.search).get('setup') === 'invite'
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Refuse a build accidentally pointed at another project.
export const configurationError = !configuredUrl || !publishableKey
  ? 'Configuration Supabase manquante pour cette version de test.'
  : configuredUrl !== projectUrl
    ? 'La configuration ne correspond pas au projet Sensations Bois.'
    : !publishableKey.startsWith('sb_publishable_')
      ? 'La clé Supabase doit être la clé publiable du projet Sensations Bois.'
      : null

export const supabase = configurationError
  ? null
  : createClient(projectUrl, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sensations-bois-auth',
      },
    })
