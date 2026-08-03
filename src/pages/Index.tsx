import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AuthForm } from '@/components/AuthForm';
// Imports statiques (pas d'import() dynamique) pour rester compatible avec les
// navigateurs plus anciens (certaines tablettes ne supportent pas l'import dynamique).
import { MenuUpload } from '@/components/MenuUpload';
import { MenuGenerator } from '@/components/MenuGenerator';
import { PriceManager } from '@/components/PriceManager';
import { MenuLibrary } from '@/components/MenuLibrary';
import { supabase } from '@/integrations/supabase/client';
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
  Sparkles
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

const Index = () => {
  const { user, loading, signOut } = useAuth();
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

  const renderCalendar = (plan: MonthlyPlan) => {
    const daysInMonth = new Date(plan.year, plan.month, 0).getDate();
    const firstDayOfWeek = new Date(plan.year, plan.month - 1, 1).getDay();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} className="p-2" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = plan.menu_data?.[day];
      cells.push(
        <div key={day} className="p-2 border rounded-lg bg-white min-h-[88px] sm:min-h-[120px]">
          <div className="font-semibold text-sm mb-1">{day}</div>
          {dayData && (
            <div className="space-y-1 text-xs">
              {dayData.breakfast && (
                <div className="bg-yellow-100 p-1 rounded text-yellow-800 truncate">
                  🌅 {dayData.breakfast.name}
                </div>
              )}
              {dayData.lunch && (
                <div className="bg-orange-100 p-1 rounded text-orange-800 truncate">
                  🌞 {dayData.lunch.name}
                </div>
              )}
              {dayData.dinner && (
                <div className="bg-blue-100 p-1 rounded text-blue-800 truncate">
                  🌙 {dayData.dinner.name}
                </div>
              )}
              <div className="text-green-600 font-semibold">
                {dayData.totalDayCost} FCFA
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[640px]">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(d => (
            <div key={d} className="p-2 text-center font-semibold bg-gray-100 rounded text-xs sm:text-sm">
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

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-0 rounded-full bg-secondary px-3 py-1.5">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Onglets — barre supérieure (tablette / ordinateur) */}
          <TabsList className="hidden md:grid w-full grid-cols-5 h-auto bg-card shadow-warm rounded-2xl p-1.5 gap-1">
            {NAV_ITEMS.map(({ value, label, icon: Icon }) => (
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
                    <Calendar className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">
                      Aucun plan à afficher
                    </h3>
                    <p className="text-gray-500 mb-4">
                      Générez et sauvegardez un plan mensuel depuis l'onglet « Générateur »
                      pour le visualiser ici.
                    </p>
                    <Badge variant="secondary">Vide</Badge>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                        <SelectTrigger className="w-64">
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
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {selectedPlan.total_estimated_cost} FCFA
                        </Badge>
                      )}
                    </div>
                    {selectedPlan && renderCalendar(selectedPlan)}
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
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map(({ value, label, icon: Icon }) => {
            const active = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-1 pt-2 pb-1.5 focus:outline-none"
              >
                <span
                  className={`flex h-9 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`text-[10px] font-semibold ${
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
