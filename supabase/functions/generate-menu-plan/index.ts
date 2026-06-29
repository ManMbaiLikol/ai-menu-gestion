// supabase/functions/generate-menu-plan/index.ts
//
// Edge Function — Optimisation du plan mensuel (recommandation #3).
// Remplace la génération aléatoire par un plan équilibré sous contraintes :
// budget, équilibre des repas et dietary_restrictions, via un prompt Claude contraint.
//
// Le modèle choisit, pour chaque jour, un menu par créneau (id parmi la liste fournie).
// Les COÛTS sont recalculés côté serveur de façon déterministe (jamais déduits du LLM).
//
// SÉCURITÉ : ANTHROPIC_API_KEY vit en secret d'Edge Function (recommandation #1).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.70.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MenuLite {
  id: string;
  name: string;
  total_cost: number;
  meal_type: string;
  cuisine_type: string;
  dietary_tags: string[];
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "integer" },
          // id du menu choisi, ou "" si aucun ne convient pour ce créneau
          breakfastId: { type: "string" },
          lunchId: { type: "string" },
          dinnerId: { type: "string" },
        },
        required: ["day", "breakfastId", "lunchId", "dinnerId"],
      },
    },
  },
  required: ["days"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY non configurée (secret manquant)." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const {
      menus = [],
      daysInMonth,
      budgetMin = 0,
      budgetMax = 0,
      servingSize = 4,
      dietaryRestrictions = [],
      monthName = "",
      year,
    } = body as {
      menus: MenuLite[];
      daysInMonth: number;
      budgetMin: number;
      budgetMax: number;
      servingSize: number;
      dietaryRestrictions: string[];
      monthName: string;
      year: number;
    };

    if (!Array.isArray(menus) || menus.length === 0) {
      return json({ error: "Aucun menu disponible pour générer un plan." }, 400);
    }
    if (!daysInMonth || daysInMonth < 1) {
      return json({ error: "daysInMonth invalide." }, 400);
    }

    const dailyBudget = budgetMax > 0 ? Math.round(budgetMax / daysInMonth) : 0;
    const menuById = new Map<string, MenuLite>(menus.map((m) => [m.id, m]));

    const anthropic = new Anthropic({ apiKey });

    const system = `Tu es un planificateur de repas pour un foyer camerounais.
Tu construis un plan mensuel ÉQUILIBRÉ et RÉALISTE à partir d'une bibliothèque de menus existants.
Objectifs et contraintes (par ordre d'importance) :
1. Respecter les restrictions alimentaires : n'utilise un menu que si ses "dietary_tags" couvrent TOUTES les restrictions demandées. Si une restriction n'est satisfaite par aucun menu pour un créneau, laisse "".
2. Rester dans le budget : viser un coût quotidien proche de ${dailyBudget} FCFA (répartition indicative 20% petit-déjeuner / 40% déjeuner / 40% dîner) et un total mensuel ≤ ${budgetMax} FCFA.
3. Équilibre & variété : éviter de répéter le même plat des jours consécutifs ; varier les types de cuisine ; privilégier un menu dont "meal_type" correspond au créneau (petit-déjeuner/déjeuner/dîner).
Tu choisis uniquement des id de menus présents dans la liste fournie. Réponds via le schéma JSON imposé.`;

    const userPayload = {
      daysInMonth,
      dailyBudgetFCFA: dailyBudget,
      monthlyBudgetMaxFCFA: budgetMax,
      monthlyBudgetMinFCFA: budgetMin,
      servingSize,
      dietaryRestrictions,
      menus: menus.map((m) => ({
        id: m.id,
        name: m.name,
        cost: m.total_cost,
        meal_type: m.meal_type,
        cuisine_type: m.cuisine_type,
        dietary_tags: m.dietary_tags ?? [],
      })),
    };

    const message = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system,
      output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `Construis le plan pour ${monthName} ${year ?? ""} (${daysInMonth} jours).\n` +
            `Données (JSON):\n${JSON.stringify(userPayload)}`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return json({ error: "Génération refusée par le modèle." }, 422);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return json({ error: "Réponse du modèle vide." }, 502);
    }

    const parsed = JSON.parse(textBlock.text) as {
      days: Array<{
        day: number;
        breakfastId: string;
        lunchId: string;
        dinnerId: string;
      }>;
    };

    // Reconstruction DÉTERMINISTE des coûts à partir des menus réels.
    const menu_data: Record<number, unknown> = {};
    let totalCost = 0;

    const slot = (id: string) => {
      const m = id ? menuById.get(id) : undefined;
      if (!m) return null;
      return { id: m.id, name: m.name, cost: m.total_cost, cuisine_type: m.cuisine_type };
    };

    for (const d of parsed.days) {
      const breakfast = slot(d.breakfastId);
      const lunch = slot(d.lunchId);
      const dinner = slot(d.dinnerId);
      const dayCost =
        (breakfast?.cost ?? 0) + (lunch?.cost ?? 0) + (dinner?.cost ?? 0);
      totalCost += dayCost;
      menu_data[d.day] = { breakfast, lunch, dinner, totalDayCost: dayCost };
    }

    return json({ menu_data, total_estimated_cost: totalCost }, 200);
  } catch (err) {
    console.error("generate-menu-plan error:", err);
    return json({ error: (err as Error).message ?? "Erreur inconnue" }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
