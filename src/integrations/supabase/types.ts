export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ingredients: {
        Row: {
          category: string
          created_at: string
          currency: string
          current_price: number
          id: string
          market_location: string | null
          name: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          current_price?: number
          id?: string
          market_location?: string | null
          name: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          current_price?: number
          id?: string
          market_location?: string | null
          name?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      menu_item_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          line_cost: number
          menu_item_id: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          line_cost?: number
          menu_item_id: string
          quantity?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          line_cost?: number
          menu_item_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          dish_name: string
          estimated_cost: number
          id: string
          meal_type: string
          menu_id: string
          preparation_time: number
        }
        Insert: {
          created_at?: string
          dish_name: string
          estimated_cost?: number
          id?: string
          meal_type?: string
          menu_id: string
          preparation_time?: number
        }
        Update: {
          created_at?: string
          dish_name?: string
          estimated_cost?: number
          id?: string
          meal_type?: string
          menu_id?: string
          preparation_time?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          cuisine_type: string
          description: string | null
          dietary_tags: string[]
          id: string
          image_url: string | null
          is_analyzed_from_image: boolean
          meal_type: string
          name: string
          preparation_time: number
          serving_size: number
          total_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          cuisine_type?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_analyzed_from_image?: boolean
          meal_type?: string
          name: string
          preparation_time?: number
          serving_size?: number
          total_cost?: number
          user_id: string
        }
        Update: {
          created_at?: string
          cuisine_type?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_analyzed_from_image?: boolean
          meal_type?: string
          name?: string
          preparation_time?: number
          serving_size?: number
          total_cost?: number
          user_id?: string
        }
        Relationships: []
      }
      monthly_menu_plans: {
        Row: {
          budget_max: number
          budget_min: number
          created_at: string
          dietary_restrictions: string[]
          id: string
          menu_data: Json
          month: number
          serving_size: number
          total_estimated_cost: number
          user_id: string
          year: number
        }
        Insert: {
          budget_max?: number
          budget_min?: number
          created_at?: string
          dietary_restrictions?: string[]
          id?: string
          menu_data?: Json
          month: number
          serving_size?: number
          total_estimated_cost?: number
          user_id: string
          year: number
        }
        Update: {
          budget_max?: number
          budget_min?: number
          created_at?: string
          dietary_restrictions?: string[]
          id?: string
          menu_data?: Json
          month?: number
          serving_size?: number
          total_estimated_cost?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          created_at: string
          date_recorded: string
          id: string
          inflation_rate: number
          ingredient_id: string
          price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date_recorded?: string
          id?: string
          inflation_rate?: number
          ingredient_id: string
          price: number
          user_id: string
        }
        Update: {
          created_at?: string
          date_recorded?: string
          id?: string
          inflation_rate?: number
          ingredient_id?: string
          price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recompute_menu_item: { Args: { p_item: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
