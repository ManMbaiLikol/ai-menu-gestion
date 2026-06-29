-- Create user profiles table
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ingredients table with pricing
CREATE TABLE public.ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- légumes, viandes, épices, etc.
    unit TEXT NOT NULL, -- kg, litre, pièce, etc.
    current_price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'FCFA',
    market_location TEXT DEFAULT 'Cameroun',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create price history for inflation tracking
CREATE TABLE public.price_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    date_recorded DATE NOT NULL,
    inflation_rate DECIMAL(5,2), -- pourcentage d'inflation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create menus table
CREATE TABLE public.menus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cuisine_type TEXT NOT NULL, -- camerounaise, africaine, internationale, fusion
    serving_size INTEGER DEFAULT 4,
    total_cost DECIMAL(10,2),
    image_url TEXT,
    is_analyzed_from_image BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create menu items (plats dans un menu)
CREATE TABLE public.menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_id UUID REFERENCES public.menus(id) ON DELETE CASCADE,
    dish_name TEXT NOT NULL,
    ingredients JSONB, -- liste des ingrédients avec quantités
    estimated_cost DECIMAL(10,2),
    meal_type TEXT, -- petit-déjeuner, déjeuner, dîner
    preparation_time INTEGER, -- en minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create monthly menu plans
CREATE TABLE public.monthly_menu_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    budget_min DECIMAL(10,2),
    budget_max DECIMAL(10,2),
    serving_size INTEGER DEFAULT 4,
    dietary_restrictions TEXT[],
    menu_data JSONB, -- structure du calendrier mensuel
    total_estimated_cost DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Anyone can view ingredients" ON public.ingredients FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert ingredients" ON public.ingredients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ingredients" ON public.ingredients FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Anyone can view price history" ON public.price_history FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert price history" ON public.price_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view own menus" ON public.menus FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own menus" ON public.menus FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own menus" ON public.menus FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own menus" ON public.menus FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own menu items" ON public.menu_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.menus WHERE menus.id = menu_items.menu_id AND menus.user_id = auth.uid())
);
CREATE POLICY "Users can insert own menu items" ON public.menu_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.menus WHERE menus.id = menu_items.menu_id AND menus.user_id = auth.uid())
);
CREATE POLICY "Users can update own menu items" ON public.menu_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.menus WHERE menus.id = menu_items.menu_id AND menus.user_id = auth.uid())
);
CREATE POLICY "Users can delete own menu items" ON public.menu_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.menus WHERE menus.id = menu_items.menu_id AND menus.user_id = auth.uid())
);

CREATE POLICY "Users can view own monthly plans" ON public.monthly_menu_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly plans" ON public.monthly_menu_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly plans" ON public.monthly_menu_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly plans" ON public.monthly_menu_plans FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_menu_plans ENABLE ROW LEVEL SECURITY;

-- Create trigger for user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, username, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();