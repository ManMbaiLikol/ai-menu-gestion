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
import { Calendar, Shuffle, Filter, DollarSign, Users, Pencil, Sparkles, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';
import { fetchAuthorNames, AUTHOR_FALLBACK } from '@/lib/authors';

// Créneaux de repas disponibles à la génération (clé technique <-> libellé UI).
type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MEAL_OPTIONS: { key: MealKey; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Petit-déjeuner', emoji: '🌅' },
  { key: 'lunch', label: 'Déjeuner', emoji: '🌞' },
  { key: 'dinner', label: 'Dîner', emoji: '🌙' },
];

interface Menu {
  id: string;
  user_id: string;
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
  user_id: string;
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

export const MenuGenerator: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  // mode de génération en cours (null = aucune génération), pour l'état des 2 boutons
  const [generatingMode, setGeneratingMode] = useState<'standard' | 'strict' | null>(null);
  // Tous les menus visibles (bibliothèque partagée), tous auteurs confondus.
  const [menus, setMenus] = useState<Menu[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  // Source des menus utilisés pour la génération et l'édition par jour.
  const [menuSource, setMenuSource] = useState<'all' | 'mine'>('all');
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  // id du plan sauvegardé actuellement chargé (null = plan généré non encore sauvegardé)
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null);
  // auteur du plan chargé : un plan d'un autre utilisateur est en lecture seule
  const [loadedPlanOwnerId, setLoadedPlanOwnerId] = useState<string | null>(null);
  // filtre de la liste des plans sauvegardés (partagés entre utilisateurs)
  const [planFilter, setPlanFilter] = useState<'all' | 'mine'>('all');
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

  // Toute la bibliothèque partagée : le générateur peut piocher dans les menus
  // de la communauté, pas seulement dans ceux de l'utilisateur connecté.
  const fetchMenus = async () => {
    try {
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as Menu[];
      setMenus(rows);
      // Fusion : les auteurs des plans sont résolus par fetchMonthlyPlans.
      const names = await fetchAuthorNames(rows.map(m => m.user_id));
      setAuthorNames(prev => ({ ...prev, ...names }));
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des menus",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isOwnMenu = (menu: Menu) => !!user && menu.user_id === user.id;
  const isOwnPlan = (plan: MonthlyPlan) => !!user && plan.user_id === user.id;

  const nameFor = (userId: string) =>
    user && userId === user.id ? 'Vous' : (authorNames[userId] || AUTHOR_FALLBACK);

  const authorLabel = (menu: Menu) => nameFor(menu.user_id);

  // Menus réellement proposés à la génération / à l'édition par jour.
  const availableMenus = menuSource === 'mine' ? menus.filter(isOwnMenu) : menus;
  const myMenusCount = menus.filter(isOwnMenu).length;

  // Plans sauvegardés : visibles par tous, éditables par leur seul auteur.
  const visiblePlans = planFilter === 'mine' ? monthlyPlans.filter(isOwnPlan) : monthlyPlans;
  const myPlansCount = monthlyPlans.filter(isOwnPlan).length;
  // Un plan fraîchement généré (sans id) est toujours éditable ; un plan chargé
  // ne l'est que s'il vous appartient.
  const canEditPlan = !loadedPlanId || (!!user && loadedPlanOwnerId === user.id);

  // Plans partagés : lisibles par tous, modifiables uniquement par leur auteur.
  const fetchMonthlyPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_menu_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as MonthlyPlan[];
      setMonthlyPlans(rows);
      const names = await fetchAuthorNames(rows.map(p => p.user_id));
      setAuthorNames(prev => ({ ...prev, ...names }));
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
    if (availableMenus.length === 0) {
      toast({
        title: "Aucun menu disponible",
        description: menuSource === 'mine'
          ? "Vous n'avez encore créé aucun menu. Basculez sur « Toute la bibliothèque » ou créez un menu."
          : "La bibliothèque est vide. Créez d'abord quelques menus avant de générer un plan mensuel.",
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
          menus: availableMenus.map(m => ({
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
      setLoadedPlanOwnerId(null);

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

    // Garde-fou : la RLS refuserait la mise à jour d'un plan d'un autre auteur.
    if (!canEditPlan) {
      toast({
        title: 'Modification impossible',
        description: `Ce plan a été généré par ${nameFor(loadedPlanOwnerId ?? '')}. Seul son auteur peut le modifier.`,
        variant: 'destructive',
      });
      return;
    }

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
      onChanged?.();
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
    setLoadedPlanOwnerId(plan.user_id);
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
    // Plan d'un autre utilisateur : consultation seule.
    if (!canEditPlan) return;
    const dayData = generatedPlan?.menu_data?.[day] ?? {};
    setDayDraft({
      breakfast: dayData.breakfast?.id ?? 'none',
      lunch: dayData.lunch?.id ?? 'none',
      dinner: dayData.dinner?.id ?? 'none',
    });
    setEditingDay(day);
  };

  // Construit l'entrée d'un créneau à partir d'un menu sélectionné.
  // On cherche dans `menus` (et non `availableMenus`) pour qu'un plan sauvegardé
  // reste résolvable même si le filtre de source est restreint entre-temps.
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

  // Puce de repas (mêmes teintes que la Vue Calendrier, compatibles mode sombre).
  const mealChip = (emoji: string, name: string, cls: string) => (
    <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className="shrink-0">{emoji}</span>
      <span className="truncate">{name}</span>
    </div>
  );

  const renderCalendarView = (planData: any) => {
    const month = planData.month ?? selectedMonth;
    const year = planData.year ?? selectedYear;
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    const todayDate = now.getDate();

    const days = [];

    // Jours vides au début
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} />);
    }

    // Jours du mois — cliquables pour éditer le menu du jour
    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = planData.menu_data?.[day];
      const isToday = isCurrentMonth && day === todayDate;
      days.push(
        <button
          type="button"
          key={day}
          onClick={() => openDayEditor(day)}
          disabled={!canEditPlan}
          title={canEditPlan
            ? 'Cliquer pour modifier le menu de ce jour'
            : "Plan d'un autre utilisateur : consultation seule"}
          className={`group relative flex flex-col gap-1 text-left rounded-2xl border p-2 min-h-[94px] sm:min-h-[126px] transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
            canEditPlan ? '' : 'cursor-default'
          } ${
            isToday
              ? 'border-primary/50 ring-2 ring-primary/40 bg-card'
              : dayData
                ? `border-border/70 bg-card ${canEditPlan ? 'hover:border-primary/50 hover:shadow-md' : ''}`
                : `border-border/50 bg-muted/30 ${canEditPlan ? 'hover:border-primary/50' : ''}`
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex h-6 min-w-[1.5rem] w-fit items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}
            >
              {day}
            </span>
            {canEditPlan && (
              <Pencil className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary" />
            )}
          </div>
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
          ) : canEditPlan ? (
            <span className="mt-auto text-[11px] font-medium text-muted-foreground/70 group-hover:text-primary">
              + Ajouter
            </span>
          ) : (
            <span className="mt-auto text-[11px] font-medium text-muted-foreground/50">
              —
            </span>
          )}
        </button>
      );
    }

    return (
      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 min-w-[680px]">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
            <div
              key={day}
              className="rounded-lg bg-muted py-2 text-center text-[11px] sm:text-sm font-bold uppercase tracking-wide text-muted-foreground"
            >
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
            <Label>Menus utilisés</Label>
            <Select value={menuSource} onValueChange={(v) => setMenuSource(v as 'all' | 'mine')}>
              <SelectTrigger className="w-full md:w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Toute la bibliothèque ({menus.length} menus)
                </SelectItem>
                <SelectItem value="mine">
                  Mes menus uniquement ({myMenusCount})
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Les menus partagés par les autres utilisateurs sont chiffrés avec leurs propres
              prix d'ingrédients : les coûts affichés peuvent différer des vôtres.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Repas à générer</Label>
            <p className="text-xs text-muted-foreground">
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
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {generatingMode === 'strict' ? 'Génération...' : 'Plan Mensuel IA (budget strict)'}
            </Button>

            {generatedPlan && canEditPlan && (
              <Button onClick={saveMonthlyPlan} disabled={loading || generatingMode !== null} variant="outline" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {loadedPlanId ? 'Mettre à jour le Plan' : 'Sauvegarder le Plan'}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
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
              {!canEditPlan
                ? `Plan généré par ${nameFor(loadedPlanOwnerId ?? '')} — consultation seule. Générez le vôtre pour l'adapter.`
                : loadedPlanId
                  ? 'Plan sauvegardé — cliquez sur une date pour modifier son menu, puis « Mettre à jour le Plan ».'
                  : 'Cliquez sur une date pour ajuster son menu avant de sauvegarder.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderCalendarView(generatedPlan)}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
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
          </CardContent>
        </Card>
      )}

      {/* Plans sauvegardés */}
      <Card>
        <CardHeader>
          <CardTitle>Plans Mensuels Sauvegardés</CardTitle>
          <CardDescription>
            Les plans de la communauté. Vous pouvez tous les consulter, mais seul
            leur auteur peut les modifier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as 'all' | 'mine')}>
            <SelectTrigger className="w-full md:w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les plans ({monthlyPlans.length})</SelectItem>
              <SelectItem value="mine">Mes plans ({myPlansCount})</SelectItem>
            </SelectContent>
          </Select>

          {visiblePlans.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {planFilter === 'mine'
                ? 'Vous n’avez encore sauvegardé aucun plan. Générez votre premier plan !'
                : 'Aucun plan mensuel sauvegardé pour le moment.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visiblePlans.map((plan) => (
                <Card
                  key={plan.id}
                  onClick={() => openSavedPlan(plan)}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    loadedPlanId === plan.id ? 'ring-2 ring-primary' : ''
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
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {plan.serving_size} personnes
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Budget: {plan.budget_min} - {plan.budget_max} FCFA
                      </div>
                      {!isOwnPlan(plan) && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Plan de {nameFor(plan.user_id)} · lecture seule
                        </div>
                      )}
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

          {availableMenus.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun menu disponible. Créez d'abord des menus dans l'onglet « Analyser Menu »,
              ou élargissez la source à toute la bibliothèque.
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
                const options = availableMenus.filter(m => m.meal_type === slot.mealType);
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
                            {!isOwnMenu(m) && ` · ${authorLabel(m)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {options.length === 0 && (
                      <p className="text-xs text-muted-foreground">
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