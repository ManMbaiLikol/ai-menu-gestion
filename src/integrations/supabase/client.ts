import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// --- SECURITY (recommandation #1) --------------------------------------------
// Ce fichier ne doit JAMAIS contenir autre chose que l'URL du projet et la clé
// *publishable* (anon). Cette clé est conçue pour être exposée dans le navigateur :
// l'accès aux données est protégé par les politiques RLS définies côté base.
//
// Toute clé sensible (service_role, ANTHROPIC_API_KEY, etc.) doit vivre
// UNIQUEMENT comme secret d'Edge Function — jamais ici, jamais dans le bundle.
// -----------------------------------------------------------------------------

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://fgxjjknhtfigqibreryn.supabase.co'

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_sUhxcKR5L6lkcZhul2lmfw_O6rA6LNd'

// --- STOCKAGE RÉSILIENT (fix mobile/tablette) --------------------------------
// Sur certains navigateurs mobiles (Safari en navigation privée, WebView, mode
// restreint), l'accès à localStorage peut lever une exception. supabase-js
// utilise localStorage par défaut : si l'écriture échoue, la session n'est pas
// persistée et l'utilisateur est renvoyé à l'écran de connexion.
// On enveloppe donc l'accès dans un stockage tolérant aux erreurs, avec repli
// en mémoire pour garder l'utilisateur connecté le temps de la session.
const memoryStore = new Map<string, string>()

const resilientStorage = {
  getItem: (key: string): string | null => {
    try {
      const v = window.localStorage.getItem(key)
      return v ?? (memoryStore.has(key) ? memoryStore.get(key)! : null)
    } catch {
      return memoryStore.has(key) ? memoryStore.get(key)! : null
    }
  },
  setItem: (key: string, value: string): void => {
    memoryStore.set(key, value)
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* stockage indisponible : on garde la valeur en mémoire */
    }
  },
  removeItem: (key: string): void => {
    memoryStore.delete(key)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Garde la session entre les rechargements (essentiel sur mobile où l'app
    // se recharge souvent : retour en arrière, mise en veille de l'onglet…).
    persistSession: true,
    // Rafraîchit automatiquement le jeton avant expiration pour éviter les
    // erreurs 401 qui donnaient l'impression d'être déconnecté.
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? resilientStorage : undefined,
  },
})

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
