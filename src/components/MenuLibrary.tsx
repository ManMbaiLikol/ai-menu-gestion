import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChefHat, Edit, Trash2, DollarSign, Users, Clock, Search, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';

interface Menu {
  id: string;
  name: string;
  description: string;
  cuisine_type: string;
  serving_size: number;
  meal_type: string;
  preparation_time: number;
  total_cost: number;
  image_url: string;
  is_analyzed_from_image: boolean;
  created_at: string;
}

interface MenuItemIngredient {
  quantity: number;
  unit: string;
  line_cost: number;
  ingredients: { name: string } | null;
}

interface MenuItem {
  id: string;
  menu_id: string;
  dish_name: string;
  estimated_cost: number;
  meal_type: string;
  preparation_time: number;
  menu_item_ingredients: MenuItemIngredient[];
}

// --- Structures d'édition (brouillon modifiable) -----------------------------
interface EditIngredient {
  name: string;
  quantity: number;
  unit: string;
  // Prix unitaire (FCFA). Sert à créer l'ingrédient s'il n'existe pas encore.
  unitPrice: number;
}

interface EditItem {
  dish_name: string;
  meal_type: string;
  preparation_time: number;
  ingredients: EditIngredient[];
}

const MEAL_TYPES = ['petit-déjeuner', 'déjeuner', 'dîner'];
const UNITS = ['kg', 'litre', 'pièce', 'douzaine'];

export const MenuLibrary: React.FC = () => {
  const { user } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuisine, setFilterCuisine] = useState('all');
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // --- État d'édition complète ---
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMenus();
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

  const openDetail = async (menu: Menu) => {
    setSelectedMenu(menu);
    setMenuItems([]);
    setDetailOpen(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, menu_item_ingredients(quantity, unit, line_cost, ingredients(name))')
        .eq('menu_id', menu.id);

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement des détails du menu",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Charge le menu + ses plats + leurs ingrédients dans le brouillon d'édition.
  const openEditor = async (menu: Menu) => {
    setEditingMenu({ ...menu });
    setEditItems([]);
    setEditOpen(true);
    setEditLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, menu_item_ingredients(quantity, unit, line_cost, ingredients(name))')
        .eq('menu_id', menu.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const items: EditItem[] = (data || []).map((it: any) => ({
        dish_name: it.dish_name ?? '',
        meal_type: it.meal_type ?? 'déjeuner',
        preparation_time: it.preparation_time ?? 30,
        ingredients: (it.menu_item_ingredients || []).map((mii: any) => {
          const qty = Number(mii.quantity) || 0;
          const line = Number(mii.line_cost) || 0;
          return {
            name: mii.ingredients?.name ?? '',
            quantity: qty,
            unit: mii.unit ?? 'kg',
            // Prix unitaire reconstitué à partir du coût de ligne existant.
            unitPrice: qty > 0 ? Math.round(line / qty) : 0,
          };
        }),
      }));

      setEditItems(items);
    } catch (error: any) {
      toast({
        title: "Erreur lors du chargement du menu à modifier",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  };

  // --- Manipulation du brouillon ---------------------------------------------
  const patchMenu = (patch: Partial<Menu>) =>
    setEditingMenu(prev => (prev ? { ...prev, ...patch } : prev));

  const addDish = () =>
    setEditItems(prev => [
      ...prev,
      { dish_name: '', meal_type: editingMenu?.meal_type ?? 'déjeuner', preparation_time: 30, ingredients: [] },
    ]);

  const patchDish = (di: number, patch: Partial<EditItem>) =>
    setEditItems(prev => prev.map((it, i) => (i === di ? { ...it, ...patch } : it)));

  const removeDish = (di: number) =>
    setEditItems(prev => prev.filter((_, i) => i !== di));

  const addIngredient = (di: number) =>
    setEditItems(prev =>
      prev.map((it, i) =>
        i === di
          ? { ...it, ingredients: [...it.ingredients, { name: '', quantity: 1, unit: 'kg', unitPrice: 0 }] }
          : it,
      ),
    );

  const patchIngredient = (di: number, ii: number, patch: Partial<EditIngredient>) =>
    setEditItems(prev =>
      prev.map((it, i) =>
        i === di
          ? { ...it, ingredients: it.ingredients.map((ing, j) => (j === ii ? { ...ing, ...patch } : ing)) }
          : it,
      ),
    );

  const removeIngredient = (di: number, ii: number) =>
    setEditItems(prev =>
      prev.map((it, i) =>
        i === di ? { ...it, ingredients: it.ingredients.filter((_, j) => j !== ii) } : it,
      ),
    );

  // Lie chaque ingrédient (par nom) à une ligne `ingredients`, en créant les
  // manquants. Retourne une map nom -> id. Réutilise le modèle de MenuUpload.
  const resolveIngredientIds = async (ings: EditIngredient[]) => {
    const map: Record<string, string> = {};
    const names = Array.from(new Set(ings.map(i => i.name.trim()).filter(Boolean)));
    if (names.length === 0) return map;

    const { data: existing, error: selErr } = await supabase
      .from('ingredients')
      .select('id, name')
      .eq('user_id', user!.id)
      .in('name', names);
    if (selErr) throw selErr;
    existing?.forEach(e => { map[e.name] = e.id; });

    const missing = names.filter(n => !map[n]);
    if (missing.length > 0) {
      const toInsert = missing.map(n => {
        const src = ings.find(i => i.name.trim() === n)!;
        return {
          user_id: user!.id,
          name: n,
          category: 'Autres',
          unit: src.unit || 'kg',
          current_price: Math.max(0, Math.round(src.unitPrice || 0)),
          currency: 'FCFA',
          market_location: 'Cameroun',
        };
      });
      const { data: inserted, error: insErr } = await supabase
        .from('ingredients')
        .insert(toInsert)
        .select('id, name');
      if (insErr) throw insErr;
      inserted?.forEach(e => { map[e.name] = e.id; });
    }
    return map;
  };

  // Enregistre TOUT le menu : infos de base + plats + ingrédients.
  // Stratégie robuste : on remplace les plats (delete cascade) puis on réinsère.
  // Les triggers recalculent line_cost / estimated_cost / total_cost.
  const saveMenuFull = async () => {
    if (!editingMenu || !user) return;

    // Validation minimale
    if (!editingMenu.name.trim()) {
      toast({ title: 'Nom requis', description: 'Le menu doit avoir un nom.', variant: 'destructive' });
      return;
    }

    setSavingEdit(true);
    try {
      // 1) Infos de base du menu
      const { error: baseErr } = await supabase
        .from('menus')
        .update({
          name: editingMenu.name.trim(),
          description: editingMenu.description,
          cuisine_type: editingMenu.cuisine_type,
          serving_size: Number(editingMenu.serving_size) || 1,
          meal_type: editingMenu.meal_type,
          preparation_time: Number(editingMenu.preparation_time) || 0,
        })
        .eq('id', editingMenu.id)
        .eq('user_id', user.id);
      if (baseErr) throw baseErr;

      // 2) Suppression des plats existants (cascade -> jonctions)
      const { error: delErr } = await supabase
        .from('menu_items')
        .delete()
        .eq('menu_id', editingMenu.id);
      if (delErr) throw delErr;

      // 3) Résolution des ingrédients (création des manquants)
      const allIngs = editItems.flatMap(it => it.ingredients).filter(i => i.name.trim());
      const idByName = await resolveIngredientIds(allIngs);

      // 4) Réinsertion des plats + jonctions
      let insertedJunctions = 0;
      for (const it of editItems) {
        const dishName = it.dish_name.trim() || editingMenu.name.trim();
        const { data: itemRow, error: itemErr } = await supabase
          .from('menu_items')
          .insert({
            menu_id: editingMenu.id,
            dish_name: dishName,
            meal_type: it.meal_type,
            preparation_time: Number(it.preparation_time) || 0,
          })
          .select('id')
          .single();
        if (itemErr) throw itemErr;

        // Agrège par ingredient_id pour respecter l'unicité (menu_item_id, ingredient_id)
        const byIngredient = new Map<string, { ingredient_id: string; quantity: number; unit: string }>();
        for (const ing of it.ingredients) {
          const name = ing.name.trim();
          const ingredient_id = name ? idByName[name] : undefined;
          if (!ingredient_id) continue;
          const existing = byIngredient.get(ingredient_id);
          if (existing) {
            existing.quantity += Number(ing.quantity) || 0;
          } else {
            byIngredient.set(ingredient_id, {
              ingredient_id,
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit || 'kg',
            });
          }
        }

        const rows = Array.from(byIngredient.values()).map(r => ({
          menu_item_id: itemRow.id,
          ingredient_id: r.ingredient_id,
          quantity: r.quantity,
          unit: r.unit,
        }));

        if (rows.length > 0) {
          const { error: linkErr } = await supabase
            .from('menu_item_ingredients')
            .insert(rows);
          if (linkErr) throw linkErr;
          insertedJunctions += rows.length;
        }
      }

      // Aucune jonction insérée => aucun trigger de recalcul n'a tourné :
      // on remet explicitement le coût total à 0 pour éviter une valeur périmée.
      if (insertedJunctions === 0) {
        const { error: zeroErr } = await supabase
          .from('menus')
          .update({ total_cost: 0 })
          .eq('id', editingMenu.id)
          .eq('user_id', user.id);
        if (zeroErr) throw zeroErr;
      }

      toast({
        title: 'Menu mis à jour',
        description: `Toutes les modifications de « ${editingMenu.name.trim()} » ont été enregistrées.`,
      });

      setEditOpen(false);
      setEditingMenu(null);
      fetchMenus();
    } catch (error: any) {
      toast({
        title: 'Erreur lors de la mise à jour',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteMenu = async (menu: Menu) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le menu "${menu.name}" ?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('menus')
        .delete()
        .eq('id', menu.id);

      if (error) throw error;

      toast({
        title: "Menu supprimé",
        description: `Le menu "${menu.name}" a été supprimé`,
      });

      fetchMenus();
      if (selectedMenu?.id === menu.id) {
        setSelectedMenu(null);
      }
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

  const filteredMenus = menus.filter(menu => {
    const matchesSearch = menu.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         menu.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCuisine = filterCuisine === 'all' || menu.cuisine_type === filterCuisine;
    return matchesSearch && matchesCuisine;
  });

  const getCuisineColor = (cuisineType: string) => {
    const colors = {
      'camerounaise': 'bg-green-100 text-green-800',
      'africaine': 'bg-orange-100 text-orange-800',
      'internationale': 'bg-blue-100 text-blue-800',
      'fusion': 'bg-purple-100 text-purple-800'
    };
    return colors[cuisineType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Coût estimé du brouillon en cours (informatif ; le vrai total est calculé côté base).
  const draftTotal = editItems.reduce(
    (sum, it) =>
      sum +
      it.ingredients.reduce(
        (s, ing) => s + (Number(ing.quantity) || 0) * (Number(ing.unitPrice) || 0),
        0,
      ),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Filtres et recherche */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Bibliothèque de Menus
          </CardTitle>
          <CardDescription>
            Gérez et consultez tous vos menus sauvegardés
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Rechercher un menu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCuisine} onValueChange={setFilterCuisine}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Type de cuisine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les cuisines</SelectItem>
                <SelectItem value="camerounaise">Camerounaise</SelectItem>
                <SelectItem value="africaine">Africaine</SelectItem>
                <SelectItem value="internationale">Internationale</SelectItem>
                <SelectItem value="fusion">Fusion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Liste des menus */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMenus.map((menu) => (
          <Card key={menu.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-0">
              {menu.image_url && (
                <div className="h-48 bg-gray-200 rounded-t-lg overflow-hidden">
                  <img
                    src={menu.image_url}
                    alt={menu.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-semibold text-lg line-clamp-1">{menu.name}</h3>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Voir les détails"
                      onClick={() => openDetail(menu)}
                    >
                      <ChefHat className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      title="Modifier le menu"
                      onClick={() => openEditor(menu)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMenu(menu)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-700"
                      title="Supprimer le menu"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                  {menu.description || 'Aucune description disponible'}
                </p>

                <div className="flex items-center justify-between mb-2">
                  <Badge className={getCuisineColor(menu.cuisine_type)}>
                    {menu.cuisine_type}
                  </Badge>
                  {menu.is_analyzed_from_image && (
                    <Badge variant="secondary">Analysé par IA</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {menu.serving_size}
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {menu.total_cost} FCFA
                    </div>
                  </div>
                  <span>{formatDate(menu.created_at)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredMenus.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <ChefHat className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">
              {searchTerm || filterCuisine !== 'all' ? 'Aucun menu trouvé' : 'Aucun menu créé'}
            </h3>
            <p className="text-gray-500">
              {searchTerm || filterCuisine !== 'all'
                ? 'Essayez de modifier vos critères de recherche'
                : 'Commencez par créer votre premier menu'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialogue : détails du menu (lecture seule) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedMenu?.name}</DialogTitle>
            <DialogDescription>
              Détails du menu et ingrédients
            </DialogDescription>
          </DialogHeader>
          {selectedMenu && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span>{selectedMenu.serving_size} personnes</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <span>{selectedMenu.total_cost} FCFA</span>
                </div>
              </div>

              <div>
                <Badge className={getCuisineColor(selectedMenu.cuisine_type)}>
                  {selectedMenu.cuisine_type}
                </Badge>
              </div>

              {selectedMenu.description && (
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-gray-600">{selectedMenu.description}</p>
                </div>
              )}

              {menuItems.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Plats et ingrédients</h4>
                  <div className="space-y-2">
                    {menuItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{item.dish_name}</span>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock className="h-3 w-3" />
                            {item.preparation_time} min
                          </div>
                        </div>
                        {Array.isArray(item.menu_item_ingredients) && item.menu_item_ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.menu_item_ingredients.map((mii, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {mii.ingredients?.name ?? '—'} ({mii.quantity} {mii.unit})
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogue : édition complète du menu */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditingMenu(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le menu</DialogTitle>
            <DialogDescription>
              Modifiez les informations, les plats et les ingrédients. Le coût total est
              recalculé automatiquement à partir des prix des ingrédients.
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement du menu…
            </div>
          ) : editingMenu && (
            <div className="space-y-6">
              {/* Infos de base */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du menu</Label>
                  <Input
                    value={editingMenu.name}
                    onChange={(e) => patchMenu({ name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editingMenu.description || ''}
                    onChange={(e) => patchMenu({ description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type de cuisine</Label>
                    <Select
                      value={editingMenu.cuisine_type}
                      onValueChange={(value) => patchMenu({ cuisine_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="camerounaise">Camerounaise</SelectItem>
                        <SelectItem value="africaine">Africaine</SelectItem>
                        <SelectItem value="internationale">Internationale</SelectItem>
                        <SelectItem value="fusion">Fusion</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type de repas</Label>
                    <Select
                      value={editingMenu.meal_type}
                      onValueChange={(value) => patchMenu({ meal_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_TYPES.map(mt => (
                          <SelectItem key={mt} value={mt}>{mt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre de personnes</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editingMenu.serving_size}
                      onChange={(e) => patchMenu({ serving_size: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temps de préparation (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editingMenu.preparation_time}
                      onChange={(e) => patchMenu({ preparation_time: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              {/* Plats */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Plats du menu</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addDish}>
                    <Plus className="h-4 w-4 mr-1" /> Ajouter un plat
                  </Button>
                </div>

                {editItems.length === 0 && (
                  <p className="text-sm text-gray-500">
                    Aucun plat. Ajoutez-en un pour détailler les ingrédients et le coût.
                  </p>
                )}

                {editItems.map((it, di) => (
                  <div key={di} className="border rounded-lg p-4 space-y-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                        <div className="sm:col-span-1 space-y-1">
                          <Label className="text-xs">Nom du plat</Label>
                          <Input
                            value={it.dish_name}
                            placeholder="Ex: Ndolé"
                            onChange={(e) => patchDish(di, { dish_name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Repas</Label>
                          <Select
                            value={it.meal_type}
                            onValueChange={(value) => patchDish(di, { meal_type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEAL_TYPES.map(mt => (
                                <SelectItem key={mt} value={mt}>{mt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Préparation (min)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={it.preparation_time}
                            onChange={(e) => patchDish(di, { preparation_time: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 mt-5"
                        title="Supprimer ce plat"
                        onClick={() => removeDish(di)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Ingrédients du plat */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-gray-600">Ingrédients</Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => addIngredient(di)}>
                          <Plus className="h-3 w-3 mr-1" /> Ingrédient
                        </Button>
                      </div>

                      {it.ingredients.map((ing, ii) => (
                        <div key={ii} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                          <Input
                            className="md:col-span-4"
                            placeholder="Nom"
                            value={ing.name}
                            onChange={(e) => patchIngredient(di, ii, { name: e.target.value })}
                          />
                          <Input
                            className="md:col-span-2"
                            type="number"
                            placeholder="Qté"
                            value={ing.quantity || ''}
                            onChange={(e) => patchIngredient(di, ii, { quantity: parseFloat(e.target.value) || 0 })}
                          />
                          <Select
                            value={ing.unit}
                            onValueChange={(value) => patchIngredient(di, ii, { unit: value })}
                          >
                            <SelectTrigger className="md:col-span-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="md:col-span-3"
                            type="number"
                            placeholder="Prix unitaire FCFA"
                            value={ing.unitPrice || ''}
                            onChange={(e) => patchIngredient(di, ii, { unitPrice: parseFloat(e.target.value) || 0 })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="md:col-span-1 text-red-600 hover:text-red-700"
                            title="Retirer l'ingrédient"
                            onClick={() => removeIngredient(di, ii)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {it.ingredients.length === 0 && (
                        <p className="text-xs text-gray-400">Aucun ingrédient pour ce plat.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Récap coût + actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t pt-4">
                <div className="text-sm text-gray-600">
                  Coût estimé du brouillon :{' '}
                  <span className="font-semibold text-green-700">
                    {draftTotal.toLocaleString('fr-FR')} FCFA
                  </span>
                  <p className="text-xs text-gray-400">
                    Le coût définitif est recalculé automatiquement d'après les prix enregistrés.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                    Annuler
                  </Button>
                  <Button onClick={saveMenuFull} disabled={savingEdit}>
                    {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sauvegarder
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
