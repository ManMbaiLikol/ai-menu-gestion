-- Insert sample Cameroonian ingredients with current prices
INSERT INTO public.ingredients (name, category, unit, current_price, currency, market_location) VALUES
-- Légumes
('Tomate', 'Légumes', 'kg', 800, 'FCFA', 'Cameroun'),
('Oignon', 'Légumes', 'kg', 600, 'FCFA', 'Cameroun'),
('Carotte', 'Légumes', 'kg', 500, 'FCFA', 'Cameroun'),
('Pomme de terre', 'Légumes', 'kg', 400, 'FCFA', 'Cameroun'),
('Macabo', 'Légumes', 'kg', 350, 'FCFA', 'Cameroun'),
('Plantain', 'Légumes', 'kg', 300, 'FCFA', 'Cameroun'),
('Igname', 'Légumes', 'kg', 450, 'FCFA', 'Cameroun'),
('Patate douce', 'Légumes', 'kg', 250, 'FCFA', 'Cameroun'),
('Épinard', 'Légumes', 'kg', 200, 'FCFA', 'Cameroun'),
('Gombo', 'Légumes', 'kg', 600, 'FCFA', 'Cameroun'),

-- Viandes et Poissons
('Bœuf', 'Viandes', 'kg', 3500, 'FCFA', 'Cameroun'),
('Porc', 'Viandes', 'kg', 2800, 'FCFA', 'Cameroun'),
('Poulet', 'Viandes', 'kg', 2200, 'FCFA', 'Cameroun'),
('Poisson frais', 'Poissons', 'kg', 2000, 'FCFA', 'Cameroun'),
('Poisson fumé', 'Poissons', 'kg', 3000, 'FCFA', 'Cameroun'),
('Crevettes', 'Poissons', 'kg', 4500, 'FCFA', 'Cameroun'),

-- Céréales et Légumineuses
('Riz', 'Céréales', 'kg', 650, 'FCFA', 'Cameroun'),
('Maïs', 'Céréales', 'kg', 400, 'FCFA', 'Cameroun'),
('Haricot rouge', 'Légumineuses', 'kg', 800, 'FCFA', 'Cameroun'),
('Arachide', 'Légumineuses', 'kg', 1200, 'FCFA', 'Cameroun'),

-- Épices et Condiments
('Piment rouge', 'Épices', 'kg', 1500, 'FCFA', 'Cameroun'),
('Gingembre', 'Épices', 'kg', 2000, 'FCFA', 'Cameroun'),
('Ail', 'Épices', 'kg', 1800, 'FCFA', 'Cameroun'),
('Cube Maggi', 'Condiments', 'pièce', 25, 'FCFA', 'Cameroun'),
('Huile de palme', 'Condiments', 'litre', 1000, 'FCFA', 'Cameroun'),
('Huile végétale', 'Condiments', 'litre', 1200, 'FCFA', 'Cameroun'),
('Sel', 'Condiments', 'kg', 200, 'FCFA', 'Cameroun'),

-- Fruits
('Banane', 'Fruits', 'kg', 300, 'FCFA', 'Cameroun'),
('Ananas', 'Fruits', 'pièce', 500, 'FCFA', 'Cameroun'),
('Mangue', 'Fruits', 'kg', 400, 'FCFA', 'Cameroun'),
('Avocat', 'Fruits', 'pièce', 200, 'FCFA', 'Cameroun'),

-- Produits laitiers
('Lait en poudre', 'Laitiers', 'kg', 2500, 'FCFA', 'Cameroun'),
('Œufs', 'Laitiers', 'douzaine', 1200, 'FCFA', 'Cameroun');

-- Insert price history for inflation tracking (sample data for the last 6 months)
INSERT INTO public.price_history (ingredient_id, price, date_recorded, inflation_rate) 
SELECT 
    i.id,
    i.current_price * (1 - (RANDOM() * 0.15 + 0.05)), -- Prix 6 mois plus bas (5-20% moins cher)
    CURRENT_DATE - INTERVAL '6 months',
    -(RANDOM() * 15 + 5) -- Inflation négative (déflation) pour simuler l'augmentation
FROM public.ingredients i;

INSERT INTO public.price_history (ingredient_id, price, date_recorded, inflation_rate) 
SELECT 
    i.id,
    i.current_price * (1 - (RANDOM() * 0.10 + 0.02)), -- Prix 3 mois plus bas
    CURRENT_DATE - INTERVAL '3 months',
    -(RANDOM() * 10 + 2)
FROM public.ingredients i;

INSERT INTO public.price_history (ingredient_id, price, date_recorded, inflation_rate) 
SELECT 
    i.id,
    i.current_price, -- Prix actuel
    CURRENT_DATE,
    0 -- Pas d'inflation pour le prix actuel
FROM public.ingredients i;