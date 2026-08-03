import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from './AuthProvider';
import { InstallButton } from './InstallButton';
import { Loader2, ChefHat, Star } from 'lucide-react';

export const AuthForm: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    username: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await signIn(formData.email, formData.password);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await signUp(formData.email, formData.password, {
      full_name: formData.fullName,
      username: formData.username
    });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* En-tête de marque */}
        <div className="text-center mb-6">
          <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gradient shadow-warm">
            <ChefHat className="h-11 w-11 text-white" strokeWidth={2.2} />
            <Star className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white p-0.5 fill-accent text-accent" />
          </div>
          <h1 className="text-3xl font-extrabold text-brand-gradient">AI Menu Gestion</h1>
          <p className="mt-2 text-muted-foreground flex items-center justify-center gap-1.5">
            <Star className="h-4 w-4 fill-accent text-accent" />
            Votre assistante cuisine intelligente
          </p>
        </div>

      <Card className="w-full shadow-warm border-border/60 overflow-hidden">
        <div className="h-1.5 bg-flag-strip" />
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl font-bold">
            Bienvenue 👩🏾‍🍳
          </CardTitle>
          <CardDescription>
            Planifiez vos menus, maîtrisez votre budget, cuisinez sereinement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Se connecter
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nom complet</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Votre nom complet"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Nom d'utilisateur</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="nom_utilisateur"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  S'inscrire
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

        <div className="mt-6 flex flex-col items-center gap-2">
          <InstallButton className="rounded-full" />
          <p className="text-center text-xs text-muted-foreground">
            📲 Installez l'app sur votre téléphone pour un accès rapide.
          </p>
        </div>
      </div>
    </div>
  );
};