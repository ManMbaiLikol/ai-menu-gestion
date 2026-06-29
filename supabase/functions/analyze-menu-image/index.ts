// supabase/functions/analyze-menu-image/index.ts
//
// Edge Function — Analyse d'image réelle (recommandation #2).
// Appelle Claude (vision) pour extraire les détails d'un plat à partir d'une photo.
//
// SÉCURITÉ (recommandation #1) : la clé ANTHROPIC_API_KEY est lue depuis les
// secrets de l'Edge Function (Deno.env). Elle ne transite JAMAIS par le frontend.
//
// Déployée avec verify_jwt = true : seul un utilisateur authentifié peut l'appeler.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.70.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Schéma JSON imposé à la réponse du modèle (structured outputs)
const MENU_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Nom du plat" },
    description: { type: "string", description: "Courte description du plat" },
    cuisineType: {
      type: "string",
      enum: ["camerounaise", "africaine", "internationale", "fusion"],
    },
    mealType: {
      type: "string",
      enum: ["petit-déjeuner", "déjeuner", "dîner"],
    },
    servingSize: { type: "integer", description: "Nombre de personnes estimé" },
    preparationTime: {
      type: "integer",
      description: "Temps de préparation estimé en minutes",
    },
    dietaryTags: {
      type: "array",
      description:
        "Étiquettes diététiques applicables (ex: végétarien, sans-porc, sans-gluten, halal)",
      items: { type: "string" },
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: {
            type: "string",
            enum: ["kg", "litre", "pièce", "douzaine"],
          },
          estimatedCost: {
            type: "number",
            description: "Coût estimé de la ligne en FCFA",
          },
        },
        required: ["name", "quantity", "unit", "estimatedCost"],
      },
    },
  },
  required: [
    "name",
    "description",
    "cuisineType",
    "mealType",
    "servingSize",
    "preparationTime",
    "dietaryTags",
    "ingredients",
  ],
};

const SYSTEM_PROMPT = `Tu es un expert en cuisine camerounaise et en gestion de coûts alimentaires.
On te fournit la photo d'un plat. Identifie le plat et déduis une décomposition réaliste.
Estime les ingrédients avec des quantités plausibles pour le nombre de personnes,
et un coût par ligne en FCFA cohérent avec les prix de marché au Cameroun (2024-2025).
Réponds uniquement via le schéma JSON imposé, en français.`;

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
    const { imageBase64, mediaType, imageUrl } = body as {
      imageBase64?: string;
      mediaType?: string;
      imageUrl?: string;
    };

    if (!imageBase64 && !imageUrl) {
      return json({ error: "Fournir imageBase64 (+ mediaType) ou imageUrl." }, 400);
    }

    // Construit la source image pour l'API (URL ou base64)
    const imageSource = imageUrl
      ? { type: "url" as const, url: imageUrl }
      : {
          type: "base64" as const,
          media_type: (mediaType ?? "image/jpeg") as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          // accepte un data-URL complet ou la chaîne base64 brute
          data: (imageBase64 ?? "").replace(/^data:[^,]+,/, ""),
        };

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: MENU_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: imageSource },
            {
              type: "text",
              text: "Analyse ce plat et renvoie sa décomposition selon le schéma.",
            },
          ],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return json({ error: "Analyse refusée par le modèle." }, 422);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return json({ error: "Réponse du modèle vide." }, 502);
    }

    const data = JSON.parse(textBlock.text);
    return json({ menu: data }, 200);
  } catch (err) {
    console.error("analyze-menu-image error:", err);
    return json({ error: (err as Error).message ?? "Erreur inconnue" }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
