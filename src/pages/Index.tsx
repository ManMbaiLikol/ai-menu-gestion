import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AuthForm } from '@/components/AuthForm';
// Imports statiques (pas d'import() dynamique) pour rester compatible avec les
// navigateurs plus anciens (certaines tablettes ne supportent pas l'import dynamique).
import { MenuUpload } from '@/components/MenuUpload';
import { MenuGenerator } from '@/components/MenuGenerator';
import { PriceManager } from '@/components/PriceManager';
import { MenuLibrary } from '@/components/MenuLibrary';
import { AdminDashboard } from '@/components/AdminDashboard';
import { supabase } from '@/integrations/supabase/client';
import { InstallButton } from '@/components/InstallButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChefHat,
  Calendar,
  DollarSign,
  BookOpen,
  LogOut,
  User,
  TrendingUp,
  Shuffle,
  Camera,
  Sparkles,
  Shield
} from 'lucide-react';

interface MonthlyPlan {
  id: string;
  month: number;
  year: number;
  total_estimated_cost: number;
  serving_size: number;
  menu_data: any;
}

interface DashboardStats {
  menusCount: number;
  avgBudget: number;
  avgInflation: number;
  plansCount: number;
}

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const NAV_ITEMS = [
  { value: 'upload', label: 'Analyser', icon: Camera },
  { value: 'library', label: 'Bibliothèque', icon: BookOpen },
  { value: 'generator', label: 'Générateur', icon: Shuffle },
  { value: 'prices', label: 'Prix', icon: DollarSign },
  { value: 'calendar', label: 'Calendrier', icon: Calendar },
] as const;

// Onglet supplémentaire, ajouté seulement pour les administrateurs.
const ADMIN_NAV_ITEM = { value: 'admin', label: 'Admin', icon: Shield } as const;

const Index = () => {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [stats, setStats] = useState<DashboardStats>({
    menusCount: 0,
    avgBudget: 0,
    avgInflation: 0,
    plansCount: 0,
  });
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    try {
      const [{ data: menus }, { data: planRows }, { data: priceRows }] = await Promise.all([
        supabase.from('menus').select('total_cost').eq('user_id', user!.id),
        supabase
          .from('monthly_menu_plans')
          .select('id, month, year, total_estimated_cost, serving_size, menu_data')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false }),
        supabase.from('price_history').select('inflation_rate').eq('user_id', user!.id),
      ]);

      const menusCount = menus?.length ?? 0;
      const plansCount = planRows?.length ?? 0;

      const avgBudget = plansCount > 0
        ? Math.round(planRows!.reduce((s, p) => s + Number(p.total_estimated_cost), 0) / plansCount)
        : (menusCount > 0
            ? Math.round(menus!.reduce((s, m) => s + Number(m.total_cost), 0) / menusCount)
            : 0);

      const avgInflation = (priceRows && priceRows.length > 0)
        ? priceRows.reduce((s, r) => s + Number(r.inflation_rate), 0) / priceRows.length
        : 0;

      setStats({ menusCount, avgBudget, avgInflation, plansCount });
      setPlans(planRows ?? []);
      if (planRows && planRows.length > 0) {
        setSelectedPlanId(prev => prev || planRows[0].id);
      }
    } catch (e) {
      // silencieux : le tableau de bord reste à zéro en cas d'erreur
      console.error('loadDashboard error', e);
    }
  };

  const mealChip = (emoji: string, name: string, cls: string) => (
    <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className="shrink-0">{emoji}</span>
      <span className="truncate">{name}</span>
    </div>
  );

  const renderCalendar = (plan: MonthlyPlan) => {
    const daysInMonth = new Date(plan.year, plan.month, 0).getDate();
    const firstDayOfWeek = new Date(plan.year, plan.month - 1, 1).getDay();
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === plan.year && now.getMonth() + 1 === plan.month;
    const todayDate = now.getDate();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = plan.menu_data?.[day];
      const isToday = isCurrentMonth && day === todayDate;
      cells.push(
        <div
          key={day}
          className={`flex flex-col gap-1 rounded-2xl border p-2 min-h-[94px] sm:min-h-[126px] transition-colors ${
            isToday
              ? 'border-primary/50 ring-2 ring-primary/40 bg-card'
              : dayData
                ? 'border-border/70 bg-card hover:border-primary/40'
                : 'border-border/50 bg-muted/30'
          }`}
        >
          <span
            className={`inline-flex h-6 min-w-[1.5rem] w-fit items-center justify-center rounded-full px-1.5 text-xs font-bold ${
              isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
            }`}
          >
            {day}
          </span>
          {dayData ? (
            <div className="flex flex-1 flex-col gap-1">
              {dayData.breakfast &&
                mealChip('🌅', dayData.breakfast.name, 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300')}
              {dayData.lunch &&
                mealChip('🌞', dayData.lunch.name, 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300')}
              {dayData.dinner &&
                mealChip('🌙', dayData.dinner.name, 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300')}
              <div className="mt-auto inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary dark:bg-primary/20">
                {dayData.totalDayCost} FCFA
              </div>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground/50">—</span>
          )}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 min-w-[680px]">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(d => (
            <div
              key={d}
              className="rounded-lg bg-muted py-2 text-center text-[11px] sm:text-sm font-bold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {cells}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? null;

  const firstName = (user.user_metadata?.full_name || user.email || '').split(' ')[0].split('@')[0];

  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : [...NAV_ITEMS];
  // Le rôle est résolu après le premier rendu : si l'onglet actif disparaît
  // (droits retirés), on retombe sur le premier onglet plutôt que sur du vide.
  const currentTab = navItems.some(i => i.value === activeTab) ? activeTab : NAV_ITEMS[0].value;
  const navColumns = { gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-brand-gradient p-2.5 rounded-2xl shadow-warm">
                <ChefHat className="h-6 w-6 text-white" strokeWidth={2.2} />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-brand-gradient leading-tight">AI Menu Gestion</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Assistante cuisine intelligente</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle className="shrink-0" />
              <InstallButton compact className="shrink-0 rounded-full" />
              <div className="hidden sm:flex items-center gap-2 min-w-0 rounded-full bg-secondary px-3 py-1.5">
                <User className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground font-semibold truncate max-w-[90px] sm:max-w-none">
                  {user.user_metadata?.full_name || user.email}
                </span>
              </div>
              <Button variant="outline" onClick={signOut} className="flex items-center gap-2 shrink-0 rounded-full">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-28 md:pb-10">
        {/* Welcome Section */}
        <div className="mb-8">
          <Card className="bg-brand-gradient text-white border-0 shadow-soft overflow-hidden relative">
            <div className="h-1.5 bg-flag-strip" />
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm mb-3">
                    <Sparkles className="h-3.5 w-3.5" /> Propulsé par l'IA
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">
                    Bonjour {firstName} ! 👋
                  </h2>
                  <p className="text-white/90 max-w-xl">
                    Analysez vos plats, suivez les prix du marché et générez vos plans mensuels
                    en quelques secondes.
                  </p>
                </div>
                <div className="hidden md:block shrink-0">
                  <div className="bg-white/20 p-4 rounded-3xl backdrop-blur-sm">
                    <TrendingUp className="h-12 w-12 text-white" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={currentTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Onglets — barre supérieure (tablette / ordinateur) */}
          <TabsList
            style={navColumns}
            className="hidden md:grid w-full h-auto bg-card shadow-warm rounded-2xl p-1.5 gap-1"
          >
            {navItems.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 rounded-xl py-2.5 font-semibold data-[state=active]:bg-brand-gradient data-[state=active]:text-white"
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Contents */}
          <TabsContent value="upload" className="space-y-6">
            <MenuUpload onChanged={loadDashboard} />
          </TabsContent>

          <TabsContent value="library" className="space-y-6">
            <MenuLibrary onChanged={loadDashboard} />
          </TabsContent>

          <TabsContent value="generator" className="space-y-6">
            <MenuGenerator onChanged={loadDashboard} />
          </TabsContent>

          <TabsContent value="prices" className="space-y-6">
            <PriceManager onChanged={loadDashboard} />
          </TabsContent>

          <TabsContent value="admin" className="space-y-6">
            <AdminDashboard />
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Vue Calendrier des Menus
                </CardTitle>
                <CardDescription>
                  Visualisez vos plans mensuels sauvegardés dans un format calendrier
                </CardDescription>
              </CardHeader>
              <CardContent>
                {plans.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                      <Calendar className="h-9 w-9" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">
                      Aucun plan à afficher
                    </h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Générez et sauvegardez un plan mensuel depuis l'onglet « Générateur »
                      pour le visualiser ici, jour par jour.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Sélecteur de plan + résumé */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Calendar className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-extrabold leading-tight">
                            {selectedPlan ? `${MONTHS[selectedPlan.month - 1]} ${selectedPlan.year}` : 'Plan'}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {selectedPlan ? Object.keys(selectedPlan.menu_data ?? {}).length : 0} jour(s) planifié(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                          <SelectTrigger className="w-full sm:w-56">
                            <SelectValue placeholder="Choisir un plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {MONTHS[p.month - 1]} {p.year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPlan && (
                          <Badge className="flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm">
                            <DollarSign className="h-3.5 w-3.5" />
                            {selectedPlan.total_estimated_cost.toLocaleString('fr-FR')} FCFA
                          </Badge>
                        )}
                      </div>
                    </div>

                    {selectedPlan && renderCalendar(selectedPlan)}

                    {/* Légende des repas */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-1">
                      <span className="font-semibold">Légende :</span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> 🌅 Petit-déjeuner
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> 🌞 Déjeuner
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> 🌙 Dîner
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Stats — tuiles « bento » colorées */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-0 shadow-warm rounded-3xl bg-primary/10">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ChefHat className="h-5 w-5" />
              </div>
              <p className="text-3xl font-extrabold leading-none text-foreground">{stats.menusCount}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Menus créés</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-warm rounded-3xl bg-accent/25">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <DollarSign className="h-5 w-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold leading-none text-foreground truncate">
                {stats.avgBudget.toLocaleString('fr-FR')}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">Budget moyen (FCFA)</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-warm rounded-3xl bg-destructive/10">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground">
                <TrendingUp className="h-5 w-5" />
              </div>
              <p className="text-3xl font-extrabold leading-none text-foreground">{stats.avgInflation.toFixed(1)}%</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Inflation moyenne</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-warm rounded-3xl bg-primary/10">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Calendar className="h-5 w-5" />
              </div>
              <p className="text-3xl font-extrabold leading-none text-foreground">{stats.plansCount}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Plans mensuels</p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Navigation basse — style appli mobile (téléphone uniquement) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={navColumns}>
          {navItems.map(({ value, label, icon: Icon }) => {
            const active = currentTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                aria-current={active ? 'page' : undefined}
                className="flex min-w-0 flex-col items-center gap-1 pt-2 pb-1.5 focus:outline-none"
              >
                <span
                  className={`flex h-9 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`w-full truncate px-0.5 text-center text-[10px] font-semibold ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Index;
