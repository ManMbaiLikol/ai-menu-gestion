-- =============================================================================
-- Hygiène : `prevent_last_admin_removal()` est une fonction de trigger, elle
-- n'a rien à faire dans l'API REST. Un appel direct échoue de toute façon
-- (« trigger functions can only be called as triggers »), mais on ferme la
-- porte, comme déjà fait pour `sync_profile_from_auth()` dans la migration
-- précédente. Signalé par le linter de sécurité Supabase (lint 0028/0029).
--
-- Le privilège EXECUTE n'est vérifié qu'à la création du trigger, jamais à son
-- déclenchement : le garde-fou « dernier administrateur » reste donc actif.
-- =============================================================================

revoke all on function public.prevent_last_admin_removal()
  from public, anon, authenticated;
