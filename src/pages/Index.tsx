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
  Upload,
  Calendar,
  DollarSign,
  BookOpen,
  LogOut,
  User,
  TrendingUp,
  Shuffle,
  Camera
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <ChefHat className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Menu Gestion</h1>
                <p className="text-sm text-gray-500">Assistant IA pour menus camerounais</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <User className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-700 truncate max-w-[110px] sm:max-w-none">
                  {user.user_metadata?.full_name || user.email}
                </span>
              </div>
              <Button variant="outline" onClick={signOut} className="flex items-center gap-2 shrink-0">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    Bienvenue dans votre gestionnaire de menus IA ! 🍽️
                  </h2>
                  <p className="text-orange-100">
                    Analysez vos menus, gérez les prix des ingrédients et générez des plans mensuels automatiquement
                  </p>
                </div>
                <div className="hidden md:block">
                  <div className="bg-white/20 p-4 rounded-lg">
                    <TrendingUp className="h-12 w-12 text-white" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-white shadow-sm">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Analyser Menu</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Bibliothèque</span>
            </TabsTrigger>
            <TabsTrigger value="generator" className="flex items-center gap-2">
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Générateur</span>
            </TabsTrigger>
            <TabsTrigger value="prices" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Prix & Inflation</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Calendrier</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Contents */}
          <TabsContent value="upload" className="space-y-6">
            <MenuUpload />
          </TabsContent>

          <TabsContent value="library" className="space-y-6">
            <MenuLibrary />
          </TabsContent>

          <TabsContent value="generator" className="space-y-6">
            <MenuGenerator />
          </TabsContent>

          <TabsContent value="prices" className="space-y-6">
            <PriceManager />
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

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <ChefHat className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Menus Créés</p>
                  <p className="text-xl font-semibold">{stats.menusCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Budget Moyen</p>
                  <p className="text-xl font-semibold">{stats.avgBudget.toLocaleString('fr-FR')} FCFA</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Inflation Moyenne</p>
                  <p className="text-xl font-semibold">{stats.avgInflation.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Plans Mensuels</p>
                  <p className="text-xl font-semibold">{stats.plansCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Index;
