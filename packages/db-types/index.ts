export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  app: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actor_resolve: {
        Args: {
          p_initials: string
          p_request_id: string
          p_terminal_id: string
        }
        Returns: Json
      }
      auth_user_link: {
        Args: {
          p_auth_user_id: string
          p_kind: string
          p_request_id: string
          p_row_id: string
        }
        Returns: Json
      }
      manager_authorize_pin: {
        Args: {
          p_actor_initials?: string
          p_actor_user_id?: string
          p_pin: string
          p_request_id: string
          p_terminal_id: string
        }
        Returns: Json
      }
      session_select_store: {
        Args: {
          p_actor_initials: string
          p_actor_user_id: string
          p_request_id: string
          p_store_id: string
          p_terminal_id: string
        }
        Returns: Json
      }
      terminal_register: {
        Args: { p_actor_initials: string; p_name: string; p_request_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      organizations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          log: Json
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          log?: Json
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          log?: Json
          name?: string
        }
        Relationships: []
      }
      pin_line_closures: {
        Row: {
          closed_at: string
          id: string
          org_id: string
          principal: string
          reopens_at: string
          request_id: string | null
          store_id: string
          terminal_id: string
        }
        Insert: {
          closed_at: string
          id?: string
          org_id: string
          principal: string
          reopens_at: string
          request_id?: string | null
          store_id: string
          terminal_id: string
        }
        Update: {
          closed_at?: string
          id?: string
          org_id?: string
          principal?: string
          reopens_at?: string
          request_id?: string | null
          store_id?: string
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_line_closures_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pin_line_closures_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pin_line_closures_org_id_store_id_terminal_id_fkey"
            columns: ["org_id", "store_id", "terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["org_id", "store_id", "id"]
          },
        ]
      }
      pin_refusals: {
        Row: {
          at: string
          closure_id: string | null
          counted: boolean
          id: string
          org_id: string
          principal: string
          request_id: string | null
          staff_user_id: string | null
          store_id: string
          terminal_id: string
        }
        Insert: {
          at?: string
          closure_id?: string | null
          counted: boolean
          id?: string
          org_id: string
          principal: string
          request_id?: string | null
          staff_user_id?: string | null
          store_id: string
          terminal_id: string
        }
        Update: {
          at?: string
          closure_id?: string | null
          counted?: boolean
          id?: string
          org_id?: string
          principal?: string
          request_id?: string | null
          staff_user_id?: string | null
          store_id?: string
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_refusals_org_id_staff_user_id_fkey"
            columns: ["org_id", "staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pin_refusals_org_id_store_id_closure_id_fkey"
            columns: ["org_id", "store_id", "closure_id"]
            isOneToOne: false
            referencedRelation: "pin_line_closures"
            referencedColumns: ["org_id", "store_id", "id"]
          },
          {
            foreignKeyName: "pin_refusals_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pin_refusals_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pin_refusals_org_id_store_id_terminal_id_fkey"
            columns: ["org_id", "store_id", "terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["org_id", "store_id", "id"]
          },
        ]
      }
      review_flags: {
        Row: {
          actor_user_id: string | null
          context: Json | null
          created_at: string
          id: string
          kind: string
          org_id: string
          principal: string | null
          request_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          store_id: string
          subject_id: string | null
          subject_type: string | null
          terminal_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          kind: string
          org_id: string
          principal?: string | null
          request_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id: string
          subject_id?: string | null
          subject_type?: string | null
          terminal_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          principal?: string | null
          request_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          store_id?: string
          subject_id?: string | null
          subject_type?: string | null
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_flags_org_id_actor_user_id_fkey"
            columns: ["org_id", "actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "review_flags_org_id_reviewed_by_fkey"
            columns: ["org_id", "reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "review_flags_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "review_flags_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "review_flags_org_id_store_id_terminal_id_fkey"
            columns: ["org_id", "store_id", "terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["org_id", "store_id", "id"]
          },
        ]
      }
      store_assignments: {
        Row: {
          org_id: string
          store_id: string
          user_id: string
        }
        Insert: {
          org_id: string
          store_id: string
          user_id: string
        }
        Update: {
          org_id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_assignments_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "store_assignments_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "store_assignments_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          log: Json
          org_id: string
          store_account_email: string | null
          trading_name: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          log?: Json
          org_id: string
          store_account_email?: string | null
          trading_name: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          log?: Json
          org_id?: string
          store_account_email?: string | null
          trading_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_administrators: {
        Row: {
          active: boolean
          added_at: string
          added_by: string | null
          auth_user_id: string
          deactivated_at: string | null
          name: string
        }
        Insert: {
          active?: boolean
          added_at?: string
          added_by?: string | null
          auth_user_id: string
          deactivated_at?: string | null
          name: string
        }
        Update: {
          active?: boolean
          added_at?: string
          added_by?: string | null
          auth_user_id?: string
          deactivated_at?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_administrators_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "system_administrators"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      terminals: {
        Row: {
          id: string
          name: string
          org_id: string
          principal: string | null
          registered_at: string
          registered_by_user_id: string | null
          request_id: string | null
          store_id: string
        }
        Insert: {
          id?: string
          name: string
          org_id: string
          principal?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          request_id?: string | null
          store_id: string
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
          principal?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          request_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminals_org_id_registered_by_user_id_fkey"
            columns: ["org_id", "registered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "terminals_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "terminals_org_id_store_id_fkey"
            columns: ["org_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      user_pins: {
        Row: {
          org_id: string
          pin_hash: string
          user_id: string
        }
        Insert: {
          org_id: string
          pin_hash: string
          user_id: string
        }
        Update: {
          org_id?: string
          pin_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pins_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          initials: string | null
          log: Json
          org_id: string
          passkey_enrolled_at: string | null
          role: string
          selected_store_id: string | null
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          initials?: string | null
          log?: Json
          org_id: string
          passkey_enrolled_at?: string | null
          role: string
          selected_store_id?: string | null
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          initials?: string | null
          log?: Json
          org_id?: string
          passkey_enrolled_at?: string | null
          role?: string
          selected_store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_org_id_selected_store_id_fkey"
            columns: ["org_id", "selected_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "users_org_id_selected_store_id_fkey"
            columns: ["org_id", "selected_store_id"]
            isOneToOne: false
            referencedRelation: "stores_identity"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
    }
    Views: {
      stores_identity: {
        Row: {
          active: boolean | null
          id: string | null
          org_id: string | null
          store_account_email: string | null
          trading_name: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string | null
          org_id?: string | null
          store_account_email?: string | null
          trading_name?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string | null
          org_id?: string | null
          store_account_email?: string | null
          trading_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  app: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

