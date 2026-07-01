// supabase/functions/generate-menu-plan/index.ts
//
// Edge Function — Optimisation du plan mensuel (recommandation #3).
// Remplace la génération aléatoire par un plan équilibré sous contraintes :
// budget, équilibre des repas et dietary_restrictions, via un prompt Claude contraint.
//
// Le modèle choisit, pour chaque jour, un menu par créneau (id parmi la liste fournie).
// Les COÛTS sont recalculés côté serveur de façon déterministe (jamais déduits du LLM).
//
// MODE `enforceBudget` (bouton « Plan Mensuel IA ») :
//   Le total mensuel est BORNÉ de façon DÉTERMINISTE au budget max. On part de la
//   proposition variée du modèle, puis on remplace les créneaux les plus chers par
//   les menus valides les moins chers jusqu'à rentrer dans le budget. Si même le plan
//   le moins cher dépasse le budget, on renvoie ce plan avec `within_budget=false`
//   et un avertissement (stratégie « au plus proche + alerte »).
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

// Créneaux du plan <-> meal_type des menus
const SLOTS = [
  { key: "breakfast", mealType: "petit-déjeuner" },
  { key: "lunch", mealType: "déjeuner" },
  { key: "dinner", mealType: "dîner" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

interface DaySlot {
  id: string;
  name: string;
  cost: number;
  cuisine_type: string;
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
      enforceBudget = false,
    } = body as {
      menus: MenuLite[];
      daysInMonth: number;
      budgetMin: number;
      budgetMax: number;
      servingSize: number;
      dietaryRestrictions: string[];
      monthName: string;
      year: number;
      enforceBudget: boolean;
    };

    if (!Array.isArray(menus) || menus.length === 0) {
      return json({ error: "Aucun menu disponible pour générer un plan." }, 400);
    }
    if (!daysInMonth || daysInMonth < 1) {
      return json({ error: "daysInMonth invalide." }, 400);
    }

    const dailyBudget = budgetMax > 0 ? Math.round(budgetMax / daysInMonth) : 0;
    const menuById = new Map<string, MenuLite>(menus.map((m) => [m.id, m]));

    // ----- Proposition variée par le modèle (préférences) -------------------
    // En mode strict, une éventuelle défaillance du modèle n'est PAS bloquante :
    // on retombe sur une répartition déterministe des menus valides.
    let preferred = new Map<
      number,
      { breakfastId: string; lunchId: string; dinnerId: string }
    >();

    try {
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
        if (!enforceBudget) return json({ error: "Génération refusée par le modèle." }, 422);
      } else {
        const textBlock = message.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          if (!enforceBudget) return json({ error: "Réponse du modèle vide." }, 502);
        } else {
          const parsed = JSON.parse(textBlock.text) as {
            days: Array<{
              day: number;
              breakfastId: string;
              lunchId: string;
              dinnerId: string;
            }>;
          };
          preferred = new Map(
            parsed.days.map((d) => [
              d.day,
              { breakfastId: d.breakfastId, lunchId: d.lunchId, dinnerId: d.dinnerId },
            ]),
          );
        }
      }
    } catch (llmErr) {
      // En mode standard le modèle est requis ; en mode strict on continue.
      if (!enforceBudget) throw llmErr;
      console.error("generate-menu-plan LLM fallback:", llmErr);
    }

    const toSlot = (m: MenuLite): DaySlot => ({
      id: m.id,
      name: m.name,
      cost: Number(m.total_cost) || 0,
      cuisine_type: m.cuisine_type,
    });

    // ----- Mode STANDARD : on reflète la proposition du modèle telle quelle --
    if (!enforceBudget) {
      const menu_data: Record<number, unknown> = {};
      let totalCost = 0;
      for (const [day, pick] of preferred) {
        const breakfast = menuById.has(pick.breakfastId)
          ? toSlot(menuById.get(pick.breakfastId)!) : null;
        const lunch = menuById.has(pick.lunchId)
          ? toSlot(menuById.get(pick.lunchId)!) : null;
        const dinner = menuById.has(pick.dinnerId)
          ? toSlot(menuById.get(pick.dinnerId)!) : null;
        const dayCost =
          (breakfast?.cost ?? 0) + (lunch?.cost ?? 0) + (dinner?.cost ?? 0);
        totalCost += dayCost;
        menu_data[day] = { breakfast, lunch, dinner, totalDayCost: dayCost };
      }
      return json({ menu_data, total_estimated_cost: totalCost }, 200);
    }

    // ----- Mode STRICT (« Plan Mensuel IA ») : budget borné déterministe -----

    // Un menu est valide pour un créneau s'il correspond au meal_type ET couvre
    // toutes les restrictions alimentaires demandées.
    const restrictions = (dietaryRestrictions ?? [])
      .map((r) => String(r).trim().toLowerCase())
      .filter(Boolean);

    const validForSlot = (m: MenuLite, mealType: string) => {
      if (m.meal_type !== mealType) return false;
      if (restrictions.length === 0) return true;
      const tags = (m.dietary_tags ?? []).map((t) => String(t).toLowerCase());
      return restrictions.every((r) => tags.includes(r));
    };

    // Bassins de menus valides par créneau, triés du moins cher au plus cher.
    const pools: Record<SlotKey, MenuLite[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
    };
    for (const s of SLOTS) {
      pools[s.key] = menus
        .filter((m) => validForSlot(m, s.mealType))
        .sort((a, b) => (Number(a.total_cost) || 0) - (Number(b.total_cost) || 0));
    }

    // Chaque créneau du mois est une référence mutable que l'on pourra « rétrograder ».
    interface SlotRef {
      day: number;
      key: SlotKey;
      pool: MenuLite[];
      menu: MenuLite | null;
    }
    const slotRefs: SlotRef[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const pick = preferred.get(day);
      for (let si = 0; si < SLOTS.length; si++) {
        const s = SLOTS[si];
        const pool = pools[s.key];
        let menu: MenuLite | null = null;

        if (pool.length > 0) {
          const preferredId =
            s.key === "breakfast" ? pick?.breakfastId
            : s.key === "lunch" ? pick?.lunchId
            : pick?.dinnerId;

          if (preferredId && menuById.has(preferredId) &&
              validForSlot(menuById.get(preferredId)!, s.mealType)) {
            // On garde le choix du modèle (variété) s'il est valide.
            menu = menuById.get(preferredId)!;
          } else {
            // Sinon, rotation dans le bassin pour varier d'un jour à l'autre.
            menu = pool[(day - 1) % pool.length];
          }
        }
        slotRefs.push({ day, key: s.key, pool, menu });
      }
    }

    const slotCost = (r: SlotRef) => (r.menu ? Number(r.menu.total_cost) || 0 : 0);
    let total = slotRefs.reduce((sum, r) => sum + slotCost(r), 0);

    // Rétrogradation gloutonne : tant qu'on dépasse le budget, on remplace le
    // créneau dont l'économie potentielle (coût actuel - menu le moins cher du
    // bassin) est la plus grande, par ce menu le moins cher.
    if (budgetMax > 0) {
      // Garde-fou d'itérations (au pire, un remplacement par créneau).
      for (let guard = 0; total > budgetMax && guard <= slotRefs.length; guard++) {
        let best: SlotRef | null = null;
        let bestSaving = 0;
        for (const r of slotRefs) {
          if (!r.menu || r.pool.length === 0) continue;
          const cheapest = r.pool[0];
          const saving = slotCost(r) - (Number(cheapest.total_cost) || 0);
          if (saving > bestSaving) {
            bestSaving = saving;
            best = r;
          }
        }
        if (!best || bestSaving <= 0) break; // plus rien à économiser
        total -= bestSaving;
        best.menu = best.pool[0];
      }
    }

    // Reconstruction du menu_data par jour.
    const menu_data: Record<number, unknown> = {};
    const byDay = new Map<number, Record<SlotKey, DaySlot | null>>();
    for (const r of slotRefs) {
      if (!byDay.has(r.day)) {
        byDay.set(r.day, { breakfast: null, lunch: null, dinner: null });
      }
      byDay.get(r.day)![r.key] = r.menu ? toSlot(r.menu) : null;
    }

    let totalCost = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const slots = byDay.get(day) ?? { breakfast: null, lunch: null, dinner: null };
      const dayCost =
        (slots.breakfast?.cost ?? 0) +
        (slots.lunch?.cost ?? 0) +
        (slots.dinner?.cost ?? 0);
      totalCost += dayCost;
      menu_data[day] = { ...slots, totalDayCost: dayCost };
    }

    const withinBudget = budgetMax <= 0 || totalCost <= budgetMax;
    const warning = withinBudget
      ? null
      : `Budget insuffisant : même en choisissant les menus les moins chers, le plan revient à ${totalCost} FCFA (budget ${budgetMax} FCFA). Augmentez le budget ou ajoutez des menus moins chers.`;

    return json(
      {
        menu_data,
        total_estimated_cost: totalCost,
        within_budget: withinBudget,
        budget_max: budgetMax,
        warning,
      },
      200,
    );
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
