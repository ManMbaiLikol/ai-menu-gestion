import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, DollarSign, Edit, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from './AuthProvider';

interface Ingredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_price: number;
  currency: string;
  market_location: string;
  created_at: string;
  updated_at: string;
}

interface PriceHistory {
  id: string;
  ingredient_id: string;
  price: number;
  date_recorded: string;
  inflation_rate: number;
}

// Dialogue d'édition de prix contrôlé (état local propre à chaque ingrédient).
// Remplace l'ancien `document.querySelector('input[type=number]')` qui ciblait
// par erreur le premier champ numérique de la page (celui du formulaire d'ajout).
const PriceEditDialog: React.FC<{
  ingredient: Ingredient;
  loading: boolean;
  onUpdate: (ingredient: Ingredient, newPrice: number) => Promise<void>;
}> = ({ ingredient, loading, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = async () => {
    const newPrice = parseFloat(value);
    if (!(newPrice > 0)) {
      toast({
        title: 'Prix invalide',
        description: 'Saisissez un prix supérieur à 0',
        variant: 'destructive',
      });
      return;
    }
    await onUpdate(ingredient, newPrice);
    setOpen(false);
    setValue('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setValue(''); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le prix - {ingredient.name}</DialogTitle>
          <DialogDescription>
            Prix actuel: {ingredient.current_price} FCFA par {ingredient.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nouveau prix (FCFA)</Label>
            <Input
              type="number"
              autoFocus
              value={value}
              placeholder={ingredient.current_price.toString()}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <Button onClick={submit} disabled={loading} className="w-full">
            Mettre à jour le prix
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const PriceManager: React.FC = () => {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [newIngredient, setNewIngredient] = useState({
    name: '',
    category: 'Légumes',
    unit: 'kg',
    current_price: 0
  });

  useEffect(() => {
    fetchIngredients();
    fetchPriceHistory();
  }, []);

  const fetchIngredients = async () => {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .order('name');

      if (error) throw error;
      setIngredients(data || []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des ingrédients",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchPriceHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .order('date_recorded', { ascending: false });

      if (error) throw error;
      setPriceHistory(data || []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement de l'historique",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addIngredient = async () => {
    if (!newIngredient.name || newIngredient.current_price <= 0) {
      toast({
        title: "Données incomplètes",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ingredients')
        .insert([{
          user_id: user!.id,
          name: newIngredient.name,
          category: newIngredient.category,
          unit: newIngredient.unit,
          current_price: newIngredient.current_price,
          currency: 'FCFA',
          market_location: 'Cameroun'
        }]);

      if (error) throw error;

      toast({
        title: "Ingrédient ajouté",
        description: `${newIngredient.name} a été ajouté avec succès`,
      });

      setNewIngredient({
        name: '',
        category: 'Légumes',
        unit: 'kg',
        current_price: 0
      });

      fetchIngredients();
    } catch (error: any) {
      toast({
        title: "Erreur lors de l'ajout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateIngredientPrice = async (ingredient: Ingredient, newPrice: number) => {
    setLoading(true);
    try {
      // Calculer le taux d'inflation
      const inflationRate = ((newPrice - ingredient.current_price) / ingredient.current_price) * 100;

      // Mettre à jour le prix de l'ingrédient
      const { error: updateError } = await supabase
        .from('ingredients')
        .update({ 
          current_price: newPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', ingredient.id);

      if (updateError) throw updateError;

      // Ajouter à l'historique des prix
      const { error: historyError } = await supabase
        .from('price_history')
        .insert([{
          user_id: user!.id,
          ingredient_id: ingredient.id,
          price: newPrice,
          date_recorded: new Date().toISOString().split('T')[0],
          inflation_rate: inflationRate
        }]);

      if (historyError) throw historyError;

      toast({
        title: "Prix mis à jour",
        description: `Le prix de ${ingredient.name} a été mis à jour`,
      });

      fetchIngredients();
      fetchPriceHistory();
      setEditingIngredient(null);
    } catch (error: any) {
      toast({
        title: "Erreur lors de la mise à jour",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteIngredient = async (ingredient: Ingredient) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${ingredient.name} ?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', ingredient.id);

      if (error) throw error;

      toast({
        title: "Ingrédient supprimé",
        description: `${ingredient.name} a été supprimé`,
      });

      fetchIngredients();
    } catch (error: any) {
      toast({
        title: "Erreur lors de la suppression",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInflationTrend = (ingredientId: string) => {
    const ingredientHistory = priceHistory
      .filter(h => h.ingredient_id === ingredientId)
      .slice(0, 2); // Les 2 derniers enregistrements

    if (ingredientHistory.length < 2) return null;

    const latestRate = ingredientHistory[0].inflation_rate;
    return latestRate;
  };

  // Prévision (recommandation #4) : projette le prix du mois prochain à partir de
  // l'inflation HISTORIQUE RÉELLE (price_history), au lieu d'une valeur aléatoire.
  const forecast = useMemo(() => {
    if (ingredients.length === 0) return null;

    let projectedSum = 0;
    let currentSum = 0;
    let rateSum = 0;
    let rateCount = 0;

    for (const ing of ingredients) {
      const hist = priceHistory.filter(h => h.ingredient_id === ing.id);
      currentSum += ing.current_price;
      if (hist.length > 0) {
        const avgRate =
          hist.reduce((s, h) => s + Number(h.inflation_rate), 0) / hist.length;
        rateSum += avgRate;
        rateCount += 1;
        projectedSum += ing.current_price * (1 + avgRate / 100);
      } else {
        projectedSum += ing.current_price; // pas d'historique → prix stable
      }
    }

    const projectedAvg = Math.round(projectedSum / ingredients.length);
    const currentAvg = Math.round(currentSum / ingredients.length);
    const projectedInflation = rateCount > 0 ? rateSum / rateCount : 0;

    return { projectedAvg, currentAvg, projectedInflation };
  }, [ingredients, priceHistory]);

  const categories = ['Légumes', 'Viandes', 'Poissons', 'Céréales', 'Légumineuses', 'Épices', 'Condiments', 'Fruits', 'Laitiers'];
  const units = ['kg', 'litre', 'pièce', 'douzaine'];

  return (
    <div className="space-y-6">
      {/* Ajouter un nouvel ingrédient */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Ajouter un Ingrédient
          </CardTitle>
          <CardDescription>
            Ajoutez de nouveaux ingrédients à votre base de données de prix
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Nom de l'ingrédient</Label>
              <Input
                value={newIngredient.name}
                onChange={(e) => setNewIngredient(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Tomate"
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select
                value={newIngredient.category}
                onValueChange={(value) => setNewIngredient(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unité</Label>
              <Select
                value={newIngredient.unit}
                onValueChange={(value) => setNewIngredient(prev => ({ ...prev, unit: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map(unit => (
                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prix actuel (FCFA)</Label>
              <Input
                type="number"
                value={newIngredient.current_price || ''}
                onChange={(e) => setNewIngredient(prev => ({ ...prev, current_price: parseFloat(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addIngredient} disabled={loading} className="w-full">
                Ajouter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des ingrédients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Gestion des Prix des Ingrédients
          </CardTitle>
          <CardDescription>
            Gérez les prix actuels et suivez l'inflation des ingrédients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingrédient</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Prix Actuel</TableHead>
                <TableHead>Unité</TableHead>
                <TableHead>Tendance</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((ingredient) => {
                const inflationRate = getInflationTrend(ingredient.id);
                return (
                  <TableRow key={ingredient.id}>
                    <TableCell className="font-medium">{ingredient.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ingredient.category}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      {ingredient.current_price} FCFA
                    </TableCell>
                    <TableCell>{ingredient.unit}</TableCell>
                    <TableCell>
                      {inflationRate !== null && (
                        <div className="flex items-center gap-1">
                          {inflationRate > 0 ? (
                            <TrendingUp className="h-4 w-4 text-red-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-green-500" />
                          )}
                          <span className={inflationRate > 0 ? 'text-red-500' : 'text-green-500'}>
                            {Math.abs(inflationRate).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PriceEditDialog
                          ingredient={ingredient}
                          loading={loading}
                          onUpdate={updateIngredientPrice}
                        />

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteIngredient(ingredient)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Statistiques d'inflation */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse de l'Inflation</CardTitle>
          <CardDescription>
            Tendances des prix sur le marché camerounais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-red-500" />
                <span className="font-semibold">Inflation Moyenne</span>
              </div>
              <p className="text-2xl font-bold text-red-600">
                {priceHistory.length > 0 
                  ? (priceHistory.reduce((sum, h) => sum + h.inflation_rate, 0) / priceHistory.length).toFixed(1)
                  : '0'
                }%
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Ingrédients Suivis</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {ingredients.length}
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-blue-500" />
                <span className="font-semibold">Prix Moyen</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {ingredients.length > 0 
                  ? Math.round(ingredients.reduce((sum, i) => sum + i.current_price, 0) / ingredients.length)
                  : '0'
                } FCFA
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prévision budgétaire (recommandation #4) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Prévision Budgétaire (mois prochain)
          </CardTitle>
          <CardDescription>
            Projection basée sur l'inflation réelle observée dans l'historique des prix
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecast ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <span className="font-semibold text-sm text-gray-600">Prix moyen actuel</span>
                <p className="text-2xl font-bold text-blue-600">{forecast.currentAvg} FCFA</p>
              </div>
              <div className="p-4 border rounded-lg">
                <span className="font-semibold text-sm text-gray-600">Prix moyen projeté</span>
                <p className="text-2xl font-bold text-orange-600">{forecast.projectedAvg} FCFA</p>
              </div>
              <div className="p-4 border rounded-lg">
                <span className="font-semibold text-sm text-gray-600">Inflation projetée</span>
                <p className={`text-2xl font-bold ${forecast.projectedInflation >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {forecast.projectedInflation >= 0 ? '+' : ''}{forecast.projectedInflation.toFixed(1)}%
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">
              Ajoutez des ingrédients et mettez à jour leurs prix pour générer une prévision.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};