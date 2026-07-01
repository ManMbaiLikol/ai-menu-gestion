import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar, Shuffle, Filter, DollarSign, Users, Pencil, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';

// Créneaux de repas disponibles à la génération (clé technique <-> libellé UI).
type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MEAL_OPTIONS: { key: MealKey; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Petit-déjeuner', emoji: '🌅' },
  { key: 'lunch', label: 'Déjeuner', emoji: '🌞' },
  { key: 'dinner', label: 'Dîner', emoji: '🌙' },
];

interface Menu {
  id: string;
  name: string;
  description: string;
  cuisine_type: string;
  meal_type: string;
  dietary_tags: string[];
  serving_size: number;
  total_cost: number;
  image_url: string;
  created_at: string;
}

interface MonthlyPlan {
  id: string;
  month: number;
  year: number;
  budget_min: number;
  budget_max: number;
  serving_size: number;
  dietary_restrictions: string[];
  menu_data: any;
  total_estimated_cost: number;
}

interface GeneratorFilters {
  budgetMin: number;
  budgetMax: number;
  servingSize: number;
  cuisineTypes: string[];
  dietaryRestrictions: string[];
  // Repas à inclure dans la génération automatique (au moins un).
  mealTypes: MealKey[];
}

export const MenuGenerator: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  // mode de génération en cours (null = aucune génération), pour l'état des 2 boutons
  const [generatingMode, setGeneratingMode] = useState<'standard' | 'strict' | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  // id du plan sauvegardé actuellement chargé (null = plan généré non encore sauvegardé)
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null);
  // jour en cours d'édition dans le calendrier (null = aucun dialogue ouvert)
  const [editingDay, setEditingDay] = useState<number | null>(null);
  // brouillon de sélection pour le dialogue d'édition d'un jour
  const [dayDraft, setDayDraft] = useState<{ breakfast: string; lunch: string; dinner: string }>({
    breakfast: 'none',
    lunch: 'none',
    dinner: 'none',
  });

  const [filters, setFilters] = useState<GeneratorFilters>({
    budgetMin: 0,
    budgetMax: 50000,
    servingSize: 4,
    cuisineTypes: ['camerounaise'],
    dietaryRestrictions: [],
    mealTypes: ['breakfast', 'lunch', 'dinner'],
  });

  // Active/désactive un créneau de repas dans les paramètres de génération.
  const toggleMealType = (key: MealKey) => {
    setFilters(prev => ({
      ...prev,
      mealTypes: prev.mealTypes.includes(key)
        ? prev.mealTypes.filter(k => k !== key)
        : [...prev.mealTypes, key],
    }));
  };

  useEffect(() => {
    if (user) {
      fetchMenus();
      fetchMonthlyPlans();
    }
  }, [user]);

  const fetchMenus = async () => {
    try {
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMenus(data || []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des menus",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchMonthlyPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_menu_plans')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMonthlyPlans(data || []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des plans mensuels",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Optimisation via l'Edge Function `generate-menu-plan` (Claude sous contraintes) —
  // remplace l'ancienne génération aléatoire (recommandation #3).
  // `enforceBudget` active le mode strict (bouton « Plan Mensuel IA ») qui borne
  // le total mensuel au budget maximum de façon déterministe.
  const generateMonthlyPlan = async (enforceBudget = false) => {
    if (menus.length === 0) {
      toast({
        title: "Aucun menu disponible",
        description: "Créez d'abord quelques menus avant de générer un plan mensuel",
        variant: "destructive",
      });
      return;
    }

    if (enforceBudget && !(filters.budgetMax > 0)) {
      toast({
        title: "Budget requis",
        description: "Indiquez un budget maximum supérieur à 0 pour le mode budget strict",
        variant: "destructive",
      });
      return;
    }

    if (filters.mealTypes.length === 0) {
      toast({
        title: "Aucun repas sélectionné",
        description: "Choisissez au moins un repas à générer (petit-déjeuner, déjeuner ou dîner)",
        variant: "destructive",
      });
      return;
    }

    setGeneratingMode(enforceBudget ? 'strict' : 'standard');
    try {
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

      const { data, error } = await supabase.functions.invoke('generate-menu-plan', {
        body: {
          menus: menus.map(m => ({
            id: m.id,
            name: m.name,
            total_cost: m.total_cost,
            meal_type: m.meal_type,
            cuisine_type: m.cuisine_type,
            dietary_tags: m.dietary_tags ?? [],
          })),
          daysInMonth,
          budgetMin: filters.budgetMin,
          budgetMax: filters.budgetMax,
          servingSize: filters.servingSize,
          dietaryRestrictions: filters.dietaryRestrictions,
          selectedMeals: filters.mealTypes,
          monthName: getMonthName(selectedMonth),
          year: selectedYear,
          enforceBudget,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const planData = {
        month: selectedMonth,
        year: selectedYear,
        budget_min: filters.budgetMin,
        budget_max: filters.budgetMax,
        serving_size: filters.servingSize,
        dietary_restrictions: filters.dietaryRestrictions,
        menu_data: (data as any).menu_data,
        total_estimated_cost: (data as any).total_estimated_cost,
      };

      setGeneratedPlan(planData);
      setLoadedPlanId(null);

      if (enforceBudget && (data as any).within_budget === false) {
        // Stratégie « au plus proche + alerte » : le plan le moins cher dépasse le budget.
        toast({
          title: "Budget insuffisant",
          description: (data as any).warning ??
            `Le plan le moins cher revient à ${planData.total_estimated_cost} FCFA, au-dessus du budget.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: enforceBudget ? "Plan IA dans le budget !" : "Plan mensuel optimisé !",
          description: enforceBudget
            ? `Total ${planData.total_estimated_cost} FCFA pour un budget de ${filters.budgetMax} FCFA (${getMonthName(selectedMonth)} ${selectedYear})`
            : `Plan pour ${getMonthName(selectedMonth)} ${selectedYear} généré sous contraintes`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Erreur lors de la génération",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingMode(null);
    }
  };

  const saveMonthlyPlan = async () => {
    if (!generatedPlan || !user) return;

    setLoading(true);
    try {
      if (loadedPlanId) {
        // Mise à jour d'un plan déjà sauvegardé (édité depuis le calendrier)
        const { error } = await supabase
          .from('monthly_menu_plans')
          .update({
            menu_data: generatedPlan.menu_data,
            total_estimated_cost: generatedPlan.total_estimated_cost,
            serving_size: generatedPlan.serving_size,
            budget_min: generatedPlan.budget_min,
            budget_max: generatedPlan.budget_max,
            dietary_restrictions: generatedPlan.dietary_restrictions,
          })
          .eq('id', loadedPlanId)
          .eq('user_id', user.id);

        if (error) throw error;

        toast({
          title: "Plan mis à jour",
          description: "Vos modifications ont été enregistrées",
        });
      } else {
        // Création d'un nouveau plan
        const { data, error } = await supabase
          .from('monthly_menu_plans')
          .insert({
            user_id: user.id,
            ...generatedPlan,
          })
          .select('id')
          .single();

        if (error) throw error;

        // On garde le plan affiché (désormais lié à sa ligne en base) pour
        // permettre l'édition immédiate par jour.
        setLoadedPlanId(data.id);

        toast({
          title: "Plan sauvegardé",
          description: "Votre plan mensuel a été sauvegardé avec succès",
        });
      }

      fetchMonthlyPlans();
    } catch (error: any) {
      toast({
        title: "Erreur lors de la sauvegarde",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Charge un plan sauvegardé dans la vue calendrier éditable (corrige le clic sans effet).
  const openSavedPlan = (plan: MonthlyPlan) => {
    setSelectedMonth(plan.month);
    setSelectedYear(plan.year);
    setGeneratedPlan({
      month: plan.month,
      year: plan.year,
      budget_min: plan.budget_min,
      budget_max: plan.budget_max,
      serving_size: plan.serving_size,
      dietary_restrictions: plan.dietary_restrictions ?? [],
      menu_data: plan.menu_data ?? {},
      total_estimated_cost: plan.total_estimated_cost,
    });
    setLoadedPlanId(plan.id);
    // Remonte vers la vue du plan
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Recalcule le coût total du mois à partir des coûts journaliers.
  const recomputeTotal = (menuData: any) =>
    Object.values(menuData).reduce(
      (sum: number, d: any) => sum + (Number(d?.totalDayCost) || 0),
      0,
    );

  // Ouvre le dialogue d'édition d'un jour, pré-rempli avec le contenu existant.
  const openDayEditor = (day: number) => {
    const dayData = generatedPlan?.menu_data?.[day] ?? {};
    setDayDraft({
      breakfast: dayData.breakfast?.id ?? 'none',
      lunch: dayData.lunch?.id ?? 'none',
      dinner: dayData.dinner?.id ?? 'none',
    });
    setEditingDay(day);
  };

  // Construit l'entrée d'un créneau à partir d'un menu sélectionné.
  const slotFromMenu = (menuId: string) => {
    if (menuId === 'none') return null;
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return null;
    return {
      id: menu.id,
      name: menu.name,
      cost: Number(menu.total_cost) || 0,
      cuisine_type: menu.cuisine_type,
    };
  };

  // Enregistre les modifications du jour dans le plan courant + recalcule les totaux.
  const saveDayEditor = () => {
    if (editingDay == null || !generatedPlan) return;

    const breakfast = slotFromMenu(dayDraft.breakfast);
    const lunch = slotFromMenu(dayDraft.lunch);
    const dinner = slotFromMenu(dayDraft.dinner);
    const totalDayCost =
      (breakfast?.cost ?? 0) + (lunch?.cost ?? 0) + (dinner?.cost ?? 0);

    const newMenuData = { ...(generatedPlan.menu_data ?? {}) };
    if (!breakfast && !lunch && !dinner) {
      delete newMenuData[editingDay];
    } else {
      newMenuData[editingDay] = { breakfast, lunch, dinner, totalDayCost };
    }

    setGeneratedPlan({
      ...generatedPlan,
      menu_data: newMenuData,
      total_estimated_cost: recomputeTotal(newMenuData),
    });
    setEditingDay(null);
  };

  const getMonthName = (month: number) => {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[month - 1];
  };

  const renderCalendarView = (planData: any) => {
    const month = planData.month ?? selectedMonth;
    const year = planData.year ?? selectedYear;
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

    const days = [];

    // Jours vides au début
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    // Jours du mois — cliquables pour éditer le menu du jour
    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = planData.menu_data?.[day];
      days.push(
        <button
          type="button"
          key={day}
          onClick={() => openDayEditor(day)}
          title="Cliquer pour modifier le menu de ce jour"
          className="group relative text-left p-2 border rounded-lg bg-white min-h-[88px] sm:min-h-[120px] hover:border-orange-400 hover:shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm">{day}</span>
            <Pencil className="h-3 w-3 text-gray-300 group-hover:text-orange-500" />
          </div>
          {dayData ? (
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
          ) : (
            <span className="text-[11px] text-gray-400 group-hover:text-orange-500">+ Ajouter</span>
          )}
        </button>
      );
    }

    return (
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[640px]">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
            <div key={day} className="p-2 text-center font-semibold bg-gray-100 rounded text-xs sm:text-sm">
              {day}
            </div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filtres de génération */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Paramètres de Génération
          </CardTitle>
          <CardDescription>
            Configurez vos préférences pour la génération automatique de menus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Mois</Label>
              <Select
                value={selectedMonth.toString()}
                onValueChange={(value) => setSelectedMonth(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {getMonthName(i + 1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Année</Label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => (
                    <SelectItem key={i} value={(new Date().getFullYear() + i).toString()}>
                      {new Date().getFullYear() + i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Budget Maximum (FCFA)</Label>
              <Input
                type="number"
                value={filters.budgetMax}
                onChange={(e) => setFilters(prev => ({ ...prev, budgetMax: parseInt(e.target.value) }))}
                placeholder="50000"
              />
            </div>

            <div className="space-y-2">
              <Label>Nombre de Personnes</Label>
              <Input
                type="number"
                min="1"
                value={filters.servingSize}
                onChange={(e) => setFilters(prev => ({ ...prev, servingSize: parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Repas à générer</Label>
            <p className="text-xs text-gray-500">
              Sélectionnez les repas à inclure chaque jour. Décochez ceux dont vous n'avez pas besoin
              (ex. seulement le déjeuner, ou déjeuner + dîner).
            </p>
            <div className="flex flex-wrap gap-4 pt-1">
              {MEAL_OPTIONS.map(meal => (
                <label
                  key={meal.key}
                  htmlFor={`meal-${meal.key}`}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <Checkbox
                    id={`meal-${meal.key}`}
                    checked={filters.mealTypes.includes(meal.key)}
                    onCheckedChange={() => toggleMealType(meal.key)}
                  />
                  <span className="text-sm">
                    {meal.emoji} {meal.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Restrictions alimentaires (séparées par des virgules)</Label>
            <Input
              placeholder="Ex: végétarien, sans-porc, halal"
              value={filters.dietaryRestrictions.join(', ')}
              onChange={(e) =>
                setFilters(prev => ({
                  ...prev,
                  dietaryRestrictions: e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
                }))
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => generateMonthlyPlan(false)}
              disabled={generatingMode !== null}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Shuffle className="h-4 w-4" />
              {generatingMode === 'standard' ? 'Génération...' : 'Générer Plan Mensuel'}
            </Button>

            <Button
              onClick={() => generateMonthlyPlan(true)}
              disabled={generatingMode !== null}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
            >
              <Sparkles className="h-4 w-4" />
              {generatingMode === 'strict' ? 'Génération...' : 'Plan Mensuel IA (budget strict)'}
            </Button>

            {generatedPlan && (
              <Button onClick={saveMonthlyPlan} disabled={loading || generatingMode !== null} variant="outline" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {loadedPlanId ? 'Mettre à jour le Plan' : 'Sauvegarder le Plan'}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            « Plan Mensuel IA » garantit un total mensuel ≤ budget maximum (choix des menus les moins chers si nécessaire).
          </p>
        </CardContent>
      </Card>

      {/* Plan généré */}
      {generatedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Plan Mensuel - {getMonthName(generatedPlan.month)} {generatedPlan.year}</span>
              <div className="flex items-center gap-4 text-sm">
                <Badge
                  variant="secondary"
                  className={`flex items-center gap-1 ${
                    generatedPlan.budget_max > 0
                      ? generatedPlan.total_estimated_cost <= generatedPlan.budget_max
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                      : ''
                  }`}
                >
                  <DollarSign className="h-3 w-3" />
                  {generatedPlan.total_estimated_cost} FCFA
                  {generatedPlan.budget_max > 0 && ` / ${generatedPlan.budget_max}`}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {generatedPlan.serving_size} personnes
                </Badge>
              </div>
            </CardTitle>
            <CardDescription>
              {loadedPlanId
                ? 'Plan sauvegardé — cliquez sur une date pour modifier son menu, puis « Mettre à jour le Plan ».'
                : 'Cliquez sur une date pour ajuster son menu avant de sauvegarder.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderCalendarView(generatedPlan)}
          </CardContent>
        </Card>
      )}

      {/* Plans sauvegardés */}
      <Card>
        <CardHeader>
          <CardTitle>Plans Mensuels Sauvegardés</CardTitle>
          <CardDescription>
            Vos plans de menus précédemment générés et sauvegardés
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyPlans.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucun plan mensuel sauvegardé. Générez votre premier plan !
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {monthlyPlans.map((plan) => (
                <Card
                  key={plan.id}
                  onClick={() => openSavedPlan(plan)}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    loadedPlanId === plan.id ? 'ring-2 ring-orange-400' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">
                        {getMonthName(plan.month)} {plan.year}
                      </h3>
                      <Badge variant="secondary">
                        {plan.total_estimated_cost} FCFA
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {plan.serving_size} personnes
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Budget: {plan.budget_min} - {plan.budget_max} FCFA
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogue d'édition du menu d'un jour */}
      <Dialog open={editingDay != null} onOpenChange={(o) => { if (!o) setEditingDay(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Menu du {editingDay} {generatedPlan ? getMonthName(generatedPlan.month) : ''}{' '}
              {generatedPlan?.year}
            </DialogTitle>
            <DialogDescription>
              Choisissez les plats pour chaque repas. Le coût du jour est recalculé automatiquement.
            </DialogDescription>
          </DialogHeader>

          {menus.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              Aucun menu disponible. Créez d'abord des menus dans l'onglet « Analyser Menu ».
            </p>
          ) : (
            <div className="space-y-4">
              {([
                { key: 'breakfast', label: '🌅 Petit-déjeuner', mealType: 'petit-déjeuner' },
                { key: 'lunch', label: '🌞 Déjeuner', mealType: 'déjeuner' },
                { key: 'dinner', label: '🌙 Dîner', mealType: 'dîner' },
              ] as const)
                .filter(slot => filters.mealTypes.includes(slot.key))
                .map(slot => {
                const options = menus.filter(m => m.meal_type === slot.mealType);
                return (
                  <div key={slot.key} className="space-y-2">
                    <Label>{slot.label}</Label>
                    <Select
                      value={dayDraft[slot.key]}
                      onValueChange={(value) =>
                        setDayDraft(prev => ({ ...prev, [slot.key]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un plat" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun</SelectItem>
                        {options.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} — {Number(m.total_cost) || 0} FCFA
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {options.length === 0 && (
                      <p className="text-xs text-gray-400">
                        Aucun menu de type « {slot.mealType} » disponible.
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingDay(null)}>
                  Annuler
                </Button>
                <Button onClick={saveDayEditor}>
                  Valider le jour
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};