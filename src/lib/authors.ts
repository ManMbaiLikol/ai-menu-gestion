import { supabase } from '@/integrations/supabase/client';

/** Libellé affiché quand le créateur n'a renseigné ni nom ni pseudo. */
export const AUTHOR_FALLBACK = 'Utilisateur';

/**
 * Résout les noms affichables des créateurs via la table publique `profiles`.
 *
 * `menus.user_id` référence `auth.users`, illisible côté client : aucune
 * jointure PostgREST n'est possible, d'où cette requête dédiée.
 * En cas d'erreur on renvoie une map vide : l'affichage retombe alors sur
 * AUTHOR_FALLBACK plutôt que de bloquer le chargement des menus.
 */
export const fetchAuthorNames = async (
  userIds: string[],
): Promise<Record<string, string>> => {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .in('id', ids);

  if (error) return {};

  const names: Record<string, string> = {};
  data?.forEach(p => {
    const label = (p.full_name || p.username || '').trim();
    if (label) names[p.id] = label;
  });
  return names;
};
