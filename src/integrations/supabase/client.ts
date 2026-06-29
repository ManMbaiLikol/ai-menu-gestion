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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
