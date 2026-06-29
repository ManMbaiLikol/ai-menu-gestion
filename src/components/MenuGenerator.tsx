import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Shuffle, Filter, DollarSign, Users, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';

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
}

export const MenuGenerator: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  
  const [filters, setFilters] = useState<GeneratorFilters>({
    budgetMin: 0,
    budgetMax: 50000,
    servingSize: 4,
    cuisineTypes: ['camerounaise'],
    dietaryRestrictions: []
  });

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
  const generateMonthlyPlan = async () => {
    if (menus.length === 0) {
      toast({
        title: "Aucun menu disponible",
        description: "Créez d'abord quelques menus avant de générer un plan mensuel",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
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
          monthName: getMonthName(selectedMonth),
          year: selectedYear,
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

      toast({
        title: "Plan mensuel optimisé !",
        description: `Plan pour ${getMonthName(selectedMonth)} ${selectedYear} généré sous contraintes`,
      });
    } catch (error: any) {
      toast({
        title: "Erreur lors de la génération",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveMonthlyPlan = async () => {
    if (!generatedPlan || !user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('monthly_menu_plans')
        .insert({
          user_id: user.id,
          ...generatedPlan
        });

      if (error) throw error;

      toast({
        title: "Plan sauvegardé",
        description: "Votre plan mensuel a été sauvegardé avec succès",
      });

      fetchMonthlyPlans();
      setGeneratedPlan(null);

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

  const getMonthName = (month: number) => {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[month - 1];
  };

  const renderCalendarView = (planData: any) => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay();
    
    const days = [];
    
    // Jours vides au début
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }
    
    // Jours du mois
    for (let day = 1; day <= daysInMonth; day++) {
      const dayData = planData.menu_data[day];
      days.push(
        <div key={day} className="p-2 border rounded-lg bg-white min-h-[120px]">
          <div className="font-semibold text-sm mb-1">{day}</div>
          {dayData && (
            <div className="space-y-1 text-xs">
              {dayData.breakfast && (
                <div className="bg-yellow-100 p-1 rounded text-yellow-800">
                  🌅 {dayData.breakfast.name.substring(0, 15)}...
                </div>
              )}
              {dayData.lunch && (
                <div className="bg-orange-100 p-1 rounded text-orange-800">
                  🌞 {dayData.lunch.name.substring(0, 15)}...
                </div>
              )}
              {dayData.dinner && (
                <div className="bg-blue-100 p-1 rounded text-blue-800">
                  🌙 {dayData.dinner.name.substring(0, 15)}...
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
      <div className="grid grid-cols-7 gap-2">
        {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
          <div key={day} className="p-2 text-center font-semibold bg-gray-100 rounded">
            {day}
          </div>
        ))}
        {days}
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

          <div className="mt-4 flex gap-2">
            <Button onClick={generateMonthlyPlan} disabled={loading} className="flex items-center gap-2">
              <Shuffle className="h-4 w-4" />
              {loading ? 'Génération...' : 'Générer Plan Mensuel'}
            </Button>
            
            {generatedPlan && (
              <Button onClick={saveMonthlyPlan} variant="outline" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Sauvegarder le Plan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan généré */}
      {generatedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Plan Mensuel - {getMonthName(generatedPlan.month)} {generatedPlan.year}</span>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {generatedPlan.total_estimated_cost} FCFA
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {generatedPlan.serving_size} personnes
                </Badge>
              </div>
            </CardTitle>
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
                <Card key={plan.id} className="cursor-pointer hover:shadow-md transition-shadow">
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
    </div>
  );
};