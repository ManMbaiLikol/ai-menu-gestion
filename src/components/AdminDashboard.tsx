import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';
import { AUTHOR_FALLBACK } from '@/lib/authors';
import {
  Shield,
  ShieldOff,
  Users,
  UserPlus,
  ChefHat,
  Calendar,
  DollarSign,
  TrendingUp,
  Activity,
  RefreshCw,
  Search,
  Loader2,
  Sparkles,
  Carrot,
} from 'lucide-react';

// Les quatre fonctions RPC sont réservées à l'admin côté base (SECURITY DEFINER
// + contrôle du rôle) : ce composant n'est qu'une vitrine, jamais la sécurité.
interface Overview {
  users_total: number;
  users_active_30d: number;
  users_new_30d: number;
  menus_total: number;
  plans_total: number;
  ingredients_total: number;
  price_updates: number;
  avg_menu_cost: number;
  avg_inflation: number;
}

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  menus_count: number;
  plans_count: number;
  ingredients_count: number;
  price_updates: number;
  last_activity: string | null;
  admin_flag: boolean;
}

interface MonthPoint {
  bucket: string;
  signups: number;
  menus: number;
  plans: number;
  price_updates: number;
}

interface FeedEvent {
  occurred_at: string;
  kind: string;
  label: string | null;
  actor_id: string | null;
  actor_name: string | null;
}

const SERIES = [
  { key: 'signups', label: 'Inscriptions', bar: 'bg-primary', dot: 'bg-primary' },
  { key: 'menus', label: 'Menus', bar: 'bg-accent', dot: 'bg-accent' },
  { key: 'plans', label: 'Plans', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { key: 'price_updates', label: 'Prix', bar: 'bg-destructive', dot: 'bg-destructive' },
] as const;

const FEED_STYLES: Record<string, { icon: React.ElementType; label: string; cls: string }> = {
  inscription: { icon: UserPlus, label: 'Inscription', cls: 'bg-primary/10 text-primary' },
  menu: { icon: ChefHat, label: 'Menu', cls: 'bg-accent/25 text-accent-foreground' },
  plan: { icon: Calendar, label: 'Plan', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  prix: { icon: DollarSign, label: 'Prix', cls: 'bg-destructive/10 text-destructive' },
};

const nf = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('fr-FR');

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const monthLabel = (bucket: string) => {
  const d = new Date(bucket);
  return {
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    year: String(d.getFullYear()).slice(2),
    full: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
  };
};

/** « il y a 3 h » — repère plus lisible qu'une date pour l'activité récente. */
const timeAgo = (iso: string | null) => {
  if (!iso) return 'jamais';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `il y a ${days} j`;
  return shortDate(iso);
};

export const AdminDashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [months, setMonths] = useState<MonthPoint[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [range, setRange] = useState('12');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // user_id en cours de promotion/révocation (désactive le bouton concerné).
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) load(range);
  }, [isAdmin, range]);

  const load = async (monthsRange: string) => {
    setLoading(true);
    try {
      const [ov, ua, ma, af] = await Promise.all([
        supabase.rpc('admin_overview'),
        supabase.rpc('admin_user_activity'),
        supabase.rpc('admin_monthly_activity', { p_months: Number(monthsRange) }),
        supabase.rpc('admin_activity_feed', { p_limit: 40 }),
      ]);

      const failed = [ov, ua, ma, af].find(r => r.error);
      if (failed?.error) throw failed.error;

      setOverview((ov.data as unknown as Overview[])?.[0] ?? null);
      setUsers((ua.data as unknown as UserRow[]) ?? []);
      setMonths((ma.data as unknown as MonthPoint[]) ?? []);
      setFeed((af.data as unknown as FeedEvent[]) ?? []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des statistiques",
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (row: UserRow) => {
    const name = row.full_name || row.username || row.email || AUTHOR_FALLBACK;
    const question = row.admin_flag
      ? `Retirer les droits d'administrateur à ${name} ?`
      : `Accorder les droits d'administrateur à ${name} ?`;
    if (!confirm(question)) return;

    setRoleBusy(row.id);
    try {
      const { error } = row.admin_flag
        ? await supabase.from('user_roles').delete().eq('user_id', row.id).eq('role', 'admin')
        : await supabase.from('user_roles').insert({
            user_id: row.id,
            role: 'admin',
            granted_by: user?.id ?? null,
          });

      if (error) throw error;

      toast({
        title: row.admin_flag ? 'Droits retirés' : 'Administrateur ajouté',
        description: name,
      });
      await load(range);
    } catch (error: any) {
      toast({
        title: 'Modification impossible',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setRoleBusy(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      [u.full_name, u.username, u.email].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [users, search]);

  // Échelle commune aux quatre séries pour que les barres restent comparables.
  const chartMax = useMemo(
    () =>
      Math.max(
        1,
        ...months.flatMap(m => SERIES.map(s => Number(m[s.key]) || 0))
      ),
    [months]
  );

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
            <ShieldOff className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold">Espace réservé aux administrateurs</h3>
          <p className="text-muted-foreground">Votre compte n'a pas accès à cette section.</p>
        </CardContent>
      </Card>
    );
  }

  const tiles = [
    { label: 'Utilisateurs', value: nf(overview?.users_total), icon: Users, cls: 'bg-primary/10', badge: 'bg-primary text-primary-foreground' },
    { label: 'Actifs (30 j)', value: nf(overview?.users_active_30d), icon: Activity, cls: 'bg-primary/10', badge: 'bg-primary text-primary-foreground' },
    { label: 'Nouveaux (30 j)', value: nf(overview?.users_new_30d), icon: UserPlus, cls: 'bg-accent/25', badge: 'bg-accent text-accent-foreground' },
    { label: 'Menus créés', value: nf(overview?.menus_total), icon: ChefHat, cls: 'bg-accent/25', badge: 'bg-accent text-accent-foreground' },
    { label: 'Plans mensuels', value: nf(overview?.plans_total), icon: Calendar, cls: 'bg-primary/10', badge: 'bg-primary text-primary-foreground' },
    { label: 'Ingrédients', value: nf(overview?.ingredients_total), icon: Carrot, cls: 'bg-accent/25', badge: 'bg-accent text-accent-foreground' },
    { label: 'Relevés de prix', value: nf(overview?.price_updates), icon: DollarSign, cls: 'bg-destructive/10', badge: 'bg-destructive text-destructive-foreground' },
    { label: 'Coût moyen (FCFA)', value: nf(overview?.avg_menu_cost), icon: Sparkles, cls: 'bg-primary/10', badge: 'bg-primary text-primary-foreground' },
    { label: 'Inflation moyenne', value: `${Number(overview?.avg_inflation ?? 0).toFixed(1)} %`, icon: TrendingUp, cls: 'bg-destructive/10', badge: 'bg-destructive text-destructive-foreground' },
  ];

  return (
    <div className="space-y-6">
      {/* Bandeau */}
      <Card className="bg-brand-gradient text-white border-0 shadow-soft overflow-hidden">
        <div className="h-1.5 bg-flag-strip" />
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/20 p-3 backdrop-blur-sm">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold leading-tight">Espace administrateur</h2>
                <p className="text-white/90 text-sm">
                  Suivi de l'activité, des comptes et de l'usage de l'application
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => load(range)}
              disabled={loading}
              className="rounded-full border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Actualiser</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Indicateurs globaux */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {tiles.map(({ label, value, icon: Icon, cls, badge }) => (
          <Card key={label} className={`border-0 shadow-warm rounded-3xl ${cls}`}>
            <CardContent className="p-4 sm:p-5">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${badge}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold leading-none text-foreground truncate">{value}</p>
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Évolution mensuelle */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Évolution mensuelle
              </CardTitle>
              <CardDescription>Inscriptions, menus, plans et relevés de prix, mois par mois</CardDescription>
            </div>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 derniers mois</SelectItem>
                <SelectItem value="12">12 derniers mois</SelectItem>
                <SelectItem value="24">24 derniers mois</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {SERIES.map(s => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} /> {s.label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto -mx-2 px-2 pb-1">
            <div
              className="flex items-end gap-2 sm:gap-3"
              style={{ minWidth: `${Math.max(months.length * 46, 320)}px` }}
            >
              {months.map(m => {
                const { month, year, full } = monthLabel(m.bucket);
                return (
                  <div key={m.bucket} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-40 w-full items-end justify-center gap-[3px]">
                      {SERIES.map(s => {
                        const value = Number(m[s.key]) || 0;
                        return (
                          <div
                            key={s.key}
                            title={`${s.label} — ${full} : ${nf(value)}`}
                            className={`w-2 sm:w-2.5 rounded-t-md transition-all ${s.bar} ${
                              value === 0 ? 'opacity-25' : ''
                            }`}
                            style={{ height: `${Math.max((value / chartMax) * 100, 3)}%` }}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground whitespace-nowrap">
                      {month} {year}
                    </span>
                  </div>
                );
              })}
              {months.length === 0 && (
                <p className="py-12 text-sm text-muted-foreground">Aucune donnée sur la période.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comptes utilisateurs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Comptes utilisateurs
                <Badge variant="secondary" className="rounded-full">{users.length}</Badge>
              </CardTitle>
              <CardDescription>Activité détaillée et gestion des droits d'administration</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un compte..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pr-3 font-bold">Utilisateur</th>
                  <th className="py-2.5 px-3 font-bold text-center">Menus</th>
                  <th className="py-2.5 px-3 font-bold text-center">Plans</th>
                  <th className="py-2.5 px-3 font-bold text-center">Ingr.</th>
                  <th className="py-2.5 px-3 font-bold text-center">Prix</th>
                  <th className="py-2.5 px-3 font-bold">Inscrit le</th>
                  <th className="py-2.5 px-3 font-bold">Dernière activité</th>
                  <th className="py-2.5 pl-3 font-bold text-right">Droits</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const name = u.full_name || u.username || AUTHOR_FALLBACK;
                  const isMe = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate flex items-center gap-1.5">
                              {name}
                              {isMe && <span className="text-xs font-normal text-muted-foreground">(vous)</span>}
                              {u.admin_flag && (
                                <Badge className="rounded-full bg-primary text-primary-foreground px-2 py-0 text-[10px]">
                                  admin
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 text-center font-semibold">{nf(u.menus_count)}</td>
                      <td className="px-3 text-center font-semibold">{nf(u.plans_count)}</td>
                      <td className="px-3 text-center font-semibold">{nf(u.ingredients_count)}</td>
                      <td className="px-3 text-center font-semibold">{nf(u.price_updates)}</td>
                      <td className="px-3 whitespace-nowrap text-muted-foreground">{shortDate(u.signed_up_at)}</td>
                      <td className="px-3 whitespace-nowrap text-muted-foreground">{timeAgo(u.last_activity)}</td>
                      <td className="pl-3 text-right">
                        <Button
                          variant={u.admin_flag ? 'outline' : 'secondary'}
                          size="sm"
                          className="rounded-full"
                          disabled={roleBusy === u.id}
                          onClick={() => toggleAdmin(u)}
                        >
                          {roleBusy === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : u.admin_flag ? (
                            <ShieldOff className="h-3.5 w-3.5" />
                          ) : (
                            <Shield className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1.5 hidden sm:inline">
                            {u.admin_flag ? 'Retirer' : 'Nommer'}
                          </span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {loading ? 'Chargement...' : 'Aucun compte ne correspond à cette recherche.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activité récente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activité récente
          </CardTitle>
          <CardDescription>Les 40 dernières actions, tous comptes confondus</CardDescription>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {loading ? 'Chargement...' : 'Aucune activité enregistrée.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {feed.map((e, i) => {
                const style = FEED_STYLES[e.kind] ?? {
                  icon: Activity,
                  label: e.kind,
                  cls: 'bg-muted text-muted-foreground',
                };
                const Icon = style.icon;
                return (
                  <li
                    key={`${e.occurred_at}-${i}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.cls}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.label || style.label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {style.label} · {e.actor_name || AUTHOR_FALLBACK}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(e.occurred_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
