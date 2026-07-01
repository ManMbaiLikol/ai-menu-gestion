import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, Camera, Loader2, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
}

interface MenuData {
  name: string;
  description: string;
  cuisineType: string;
  servingSize: number;
  ingredients: Ingredient[];
  mealType: string;
  preparationTime: number;
  dietaryTags: string[];
}

export const MenuUpload: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<MenuData>({
    name: '',
    description: '',
    cuisineType: 'camerounaise',
    servingSize: 4,
    ingredients: [],
    mealType: 'déjeuner',
    preparationTime: 30,
    dietaryTags: []
  });
  const [newIngredient, setNewIngredient] = useState<Ingredient>({
    name: '',
    quantity: 0,
    unit: 'kg',
    estimatedCost: 0
  });

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const addIngredient = () => {
    if (!newIngredient.name.trim()) {
      toast({
        title: "Nom manquant",
        description: "Indiquez le nom de l'ingrédient avant de l'ajouter",
        variant: "destructive",
      });
      return;
    }
    if (!(newIngredient.quantity > 0)) {
      toast({
        title: "Quantité manquante",
        description: "Indiquez une quantité supérieure à 0",
        variant: "destructive",
      });
      return;
    }

    setMenuData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { ...newIngredient, name: newIngredient.name.trim() }]
    }));
    setNewIngredient({
      name: '',
      quantity: 0,
      unit: 'kg',
      estimatedCost: 0
    });
  };

  const removeIngredient = (index: number) => {
    setMenuData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const calculateTotalCost = () => {
    return menuData.ingredients.reduce((total, ingredient) => total + ingredient.estimatedCost, 0);
  };

  // Analyse d'image RÉELLE via l'Edge Function `analyze-menu-image` (Claude vision).
  // La clé du modèle vit côté Edge Function — jamais ici (recommandation #1 & #2).
  const analyzeImage = async () => {
    if (!imagePreview) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-menu-image', {
        body: { imageBase64: imagePreview, mediaType: imageFile?.type },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const m = (data as any).menu;
      setMenuData(prev => ({
        ...prev,
        name: m.name ?? prev.name,
        description: m.description ?? prev.description,
        cuisineType: m.cuisineType ?? prev.cuisineType,
        mealType: m.mealType ?? prev.mealType,
        servingSize: m.servingSize ?? prev.servingSize,
        preparationTime: m.preparationTime ?? prev.preparationTime,
        dietaryTags: Array.isArray(m.dietaryTags) ? m.dietaryTags : [],
        ingredients: (m.ingredients ?? []).map((i: any) => ({
          name: String(i.name),
          quantity: Number(i.quantity) || 0,
          unit: i.unit || 'kg',
          estimatedCost: Number(i.estimatedCost) || 0,
        })),
      }));

      toast({
        title: 'Analyse terminée',
        description: `Plat reconnu : ${m.name}`,
      });
    } catch (err: any) {
      toast({
        title: "Échec de l'analyse de l'image",
        description: err.message ?? 'Erreur inconnue',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Agrège les ingrédients par nom (somme quantités + coûts) pour éviter les doublons.
  const aggregateIngredients = (ings: Ingredient[]) => {
    const byName = new Map<string, Ingredient>();
    for (const ing of ings) {
      const name = ing.name.trim();
      if (!name) continue;
      const existing = byName.get(name);
      if (existing) {
        existing.quantity += ing.quantity;
        existing.estimatedCost += ing.estimatedCost;
      } else {
        byName.set(name, { ...ing, name });
      }
    }
    return Array.from(byName.values());
  };

  // Lie chaque ingrédient à une ligne de la table `ingredients` (la crée si besoin).
  // Retourne une map nom -> id (recommandation #6 : FK plutôt que JSONB libre).
  const resolveIngredientIds = async (ings: Ingredient[]) => {
    const map: Record<string, string> = {};
    const names = ings.map(i => i.name.trim()).filter(Boolean);
    if (names.length === 0) return map;

    const { data: existing, error: selErr } = await supabase
      .from('ingredients')
      .select('id, name')
      .eq('user_id', user!.id)
      .in('name', names);
    if (selErr) throw selErr;
    existing?.forEach(e => { map[e.name] = e.id; });

    const toInsert = ings
      .filter(i => !map[i.name.trim()])
      .map(i => ({
        user_id: user!.id,
        name: i.name.trim(),
        category: 'Autres',
        unit: i.unit,
        // current_price = prix UNITAIRE (le coût saisi est celui de la ligne entière)
        current_price: i.quantity > 0 ? Math.round(i.estimatedCost / i.quantity) : i.estimatedCost,
        currency: 'FCFA',
        market_location: 'Cameroun',
      }));

    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from('ingredients')
        .insert(toInsert)
        .select('id, name');
      if (insErr) throw insErr;
      inserted?.forEach(e => { map[e.name] = e.id; });
    }
    return map;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Upload image if exists
      let imageUrl = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('menu-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('menu-images')
          .getPublicUrl(fileName);
        
        imageUrl = publicUrl;
      }

      const ingredients = aggregateIngredients(menuData.ingredients);

      // Lier les ingrédients à la table `ingredients` (FK) avant insertion
      const ingredientIdByName = await resolveIngredientIds(ingredients);

      // Create menu (total_cost sera recalculé par trigger à partir de la jonction)
      const { data: menuResult, error: menuError } = await supabase
        .from('menus')
        .insert({
          user_id: user.id,
          name: menuData.name,
          description: menuData.description,
          cuisine_type: menuData.cuisineType,
          serving_size: menuData.servingSize,
          meal_type: menuData.mealType,
          dietary_tags: menuData.dietaryTags,
          preparation_time: menuData.preparationTime,
          total_cost: 0,
          image_url: imageUrl,
          is_analyzed_from_image: !!imageFile
        })
        .select()
        .single();

      if (menuError) throw menuError;

      // Create menu item
      const { data: itemResult, error: itemError } = await supabase
        .from('menu_items')
        .insert({
          menu_id: menuResult.id,
          dish_name: menuData.name,
          meal_type: menuData.mealType,
          preparation_time: menuData.preparationTime
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Lignes de jonction menu_item_ingredients (line_cost + totaux via triggers)
      if (ingredients.length > 0) {
        const rows = ingredients
          .map(ing => ({
            menu_item_id: itemResult.id,
            ingredient_id: ingredientIdByName[ing.name.trim()],
            quantity: ing.quantity,
            unit: ing.unit,
          }))
          .filter(r => r.ingredient_id);

        if (rows.length > 0) {
          const { error: linkError } = await supabase
            .from('menu_item_ingredients')
            .insert(rows);
          if (linkError) throw linkError;
        }
      }

      toast({
        title: "Menu créé avec succès",
        description: `Le menu "${menuData.name}" a été ajouté à votre collection`,
      });

      // Reset form
      setMenuData({
        name: '',
        description: '',
        cuisineType: 'camerounaise',
        servingSize: 4,
        ingredients: [],
        mealType: 'déjeuner',
        preparationTime: 30,
        dietaryTags: []
      });
      setImageFile(null);
      setImagePreview(null);

    } catch (error: any) {
      toast({
        title: "Erreur lors de la création du menu",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Analyser un Menu
        </CardTitle>
        <CardDescription>
          Uploadez une image de menu ou créez un menu manuellement
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-4">
            <Label>Image du Menu (Optionnel)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2"
                    onClick={analyzeImage}
                    disabled={analyzing}
                  >
                    {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {analyzing ? "Analyse en cours…" : "Analyser l'image (IA)"}
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Glissez une image ici ou cliquez pour sélectionner</p>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="max-w-xs mx-auto"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Menu Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du Menu</Label>
              <Input
                id="name"
                value={menuData.name}
                onChange={(e) => setMenuData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Ndolé aux crevettes"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuisineType">Type de Cuisine</Label>
              <Select
                value={menuData.cuisineType}
                onValueChange={(value) => setMenuData(prev => ({ ...prev, cuisineType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="camerounaise">Cuisine camerounaise traditionnelle</SelectItem>
                  <SelectItem value="africaine">Cuisine africaine (non-camerounaise)</SelectItem>
                  <SelectItem value="internationale">Cuisine internationale</SelectItem>
                  <SelectItem value="fusion">Cuisine fusion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={menuData.description}
              onChange={(e) => setMenuData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Décrivez le plat, ses saveurs, sa préparation..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="servingSize">Nombre de Personnes</Label>
              <Input
                id="servingSize"
                type="number"
                min="1"
                value={menuData.servingSize}
                onChange={(e) => setMenuData(prev => ({ ...prev, servingSize: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mealType">Type de Repas</Label>
              <Select
                value={menuData.mealType}
                onValueChange={(value) => setMenuData(prev => ({ ...prev, mealType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit-déjeuner">Petit-déjeuner</SelectItem>
                  <SelectItem value="déjeuner">Déjeuner</SelectItem>
                  <SelectItem value="dîner">Dîner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preparationTime">Temps de Préparation (min)</Label>
              <Input
                id="preparationTime"
                type="number"
                min="5"
                value={menuData.preparationTime}
                onChange={(e) => setMenuData(prev => ({ ...prev, preparationTime: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-4">
            <Label>Ingrédients</Label>
            
            {/* Add new ingredient */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-4 border rounded-lg bg-gray-50">
              <Input
                placeholder="Nom ingrédient"
                value={newIngredient.name}
                onChange={(e) => setNewIngredient(prev => ({ ...prev, name: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Quantité"
                value={newIngredient.quantity || ''}
                onChange={(e) => setNewIngredient(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
              />
              <Select
                value={newIngredient.unit}
                onValueChange={(value) => setNewIngredient(prev => ({ ...prev, unit: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="litre">litre</SelectItem>
                  <SelectItem value="pièce">pièce</SelectItem>
                  <SelectItem value="douzaine">douzaine</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Coût (FCFA)"
                value={newIngredient.estimatedCost || ''}
                onChange={(e) => setNewIngredient(prev => ({ ...prev, estimatedCost: parseFloat(e.target.value) || 0 }))}
              />
              <Button type="button" onClick={addIngredient} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Ingredients list */}
            <div className="space-y-2">
              {menuData.ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {ingredient.name}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {ingredient.quantity} {ingredient.unit}
                    </span>
                    <span className="text-sm font-medium text-green-600">
                      {ingredient.estimatedCost} FCFA
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeIngredient(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {menuData.ingredients.length > 0 && (
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-lg font-semibold text-green-800">
                  Coût Total Estimé: {calculateTotalCost()} FCFA
                </p>
                <p className="text-sm text-green-600">
                  Soit {(calculateTotalCost() / menuData.servingSize).toFixed(0)} FCFA par personne
                </p>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer le Menu
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};