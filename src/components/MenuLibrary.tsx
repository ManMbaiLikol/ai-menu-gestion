import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChefHat, Edit, Trash2, DollarSign, Users, Clock, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';

interface Menu {
  id: string;
  name: string;
  description: string;
  cuisine_type: string;
  serving_size: number;
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

export const MenuLibrary: React.FC = () => {
  const { user } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCuisine, setFilterCuisine] = useState('all');
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);

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

  const fetchMenuItems = async (menuId: string) => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*, menu_item_ingredients(quantity, unit, line_cost, ingredients(name))')
        .eq('menu_id', menuId);

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

  const updateMenu = async (menu: Menu, updatedData: Partial<Menu>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('menus')
        .update({ ...updatedData })
        .eq('id', menu.id);

      if (error) throw error;

      toast({
        title: "Menu mis à jour",
        description: `Le menu "${menu.name}" a été mis à jour avec succès`,
      });

      fetchMenus();
      setEditingMenu(null);
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
          <Card key={menu.id} className="cursor-pointer hover:shadow-lg transition-shadow">
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
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg line-clamp-1">{menu.name}</h3>
                  <div className="flex gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setSelectedMenu(menu);
                          fetchMenuItems(menu.id);
                        }}>
                          <ChefHat className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
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
                                <h4 className="font-semibold mb-2">Ingrédients</h4>
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

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setEditingMenu(menu)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Modifier le menu</DialogTitle>
                          <DialogDescription>
                            Modifiez les informations de base du menu
                          </DialogDescription>
                        </DialogHeader>
                        {editingMenu && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Nom du menu</label>
                              <Input
                                defaultValue={editingMenu.name}
                                onChange={(e) => setEditingMenu(prev => prev ? {...prev, name: e.target.value} : null)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Description</label>
                              <Textarea
                                defaultValue={editingMenu.description || ''}
                                onChange={(e) => setEditingMenu(prev => prev ? {...prev, description: e.target.value} : null)}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Nombre de personnes</label>
                                <Input
                                  type="number"
                                  defaultValue={editingMenu.serving_size}
                                  onChange={(e) => setEditingMenu(prev => prev ? {...prev, serving_size: parseInt(e.target.value)} : null)}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Type de cuisine</label>
                                <Select
                                  defaultValue={editingMenu.cuisine_type}
                                  onValueChange={(value) => setEditingMenu(prev => prev ? {...prev, cuisine_type: value} : null)}
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
                            </div>
                            <Button
                              onClick={() => editingMenu && updateMenu(menu, editingMenu)}
                              disabled={loading}
                              className="w-full"
                            >
                              Sauvegarder les modifications
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMenu(menu)}
                      className="text-red-600 hover:text-red-700"
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
    </div>
  );
};