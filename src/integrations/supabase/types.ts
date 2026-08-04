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
      action_plans_5w2h: {
        Row: {
          company_id: string | null
          created_at: string
          days_remaining: number | null
          how: string | null
          how_much: number | null
          id: string
          owner_id: string
          priority: string
          status: string
          updated_at: string
          what: string | null
          when_date: string | null
          where_field: string | null
          who: string | null
          why: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          days_remaining?: number | null
          how?: string | null
          how_much?: number | null
          id?: string
          owner_id?: string
          priority?: string
          status?: string
          updated_at?: string
          what?: string | null
          when_date?: string | null
          where_field?: string | null
          who?: string | null
          why?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          days_remaining?: number | null
          how?: string | null
          how_much?: number | null
          id?: string
          owner_id?: string
          priority?: string
          status?: string
          updated_at?: string
          what?: string | null
          when_date?: string | null
          where_field?: string | null
          who?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_5w2h_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          type?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          responsible: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          responsible?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          responsible?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dre_category_map: {
        Row: {
          category: string
          cost_type: string | null
          created_at: string
          dre_group: string
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          category: string
          cost_type?: string | null
          created_at?: string
          dre_group: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          cost_type?: string | null
          created_at?: string
          dre_group?: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      efo_monthly_analysis: {
        Row: {
          cash_balance: number
          company_id: string | null
          created_at: string
          fixed_expenses: number
          id: string
          interest_total: number
          open_total: number
          operational_result: number
          overdue_total: number
          owner_id: string
          paid_total: number
          period_month: number
          period_year: number
          product_revenue: number
          service_revenue: number
          total_expenses: number
          total_revenue: number
          variable_expenses: number
        }
        Insert: {
          cash_balance?: number
          company_id?: string | null
          created_at?: string
          fixed_expenses?: number
          id?: string
          interest_total?: number
          open_total?: number
          operational_result?: number
          overdue_total?: number
          owner_id?: string
          paid_total?: number
          period_month: number
          period_year: number
          product_revenue?: number
          service_revenue?: number
          total_expenses?: number
          total_revenue?: number
          variable_expenses?: number
        }
        Update: {
          cash_balance?: number
          company_id?: string | null
          created_at?: string
          fixed_expenses?: number
          id?: string
          interest_total?: number
          open_total?: number
          operational_result?: number
          overdue_total?: number
          owner_id?: string
          paid_total?: number
          period_month?: number
          period_year?: number
          product_revenue?: number
          service_revenue?: number
          total_expenses?: number
          total_revenue?: number
          variable_expenses?: number
        }
        Relationships: [
          {
            foreignKeyName: "efo_monthly_analysis_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          category: string | null
          company_id: string | null
          competence_date: string | null
          cost_center: string | null
          cost_type: string | null
          created_at: string
          dedupe_key: string | null
          description: string | null
          dre_group: string | null
          due_date: string | null
          external_id: string | null
          id: string
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          installment_value: number
          interest_rate_month: number
          interest_type: string
          movement_type: string
          notes: string | null
          original_value: number
          owner_id: string
          paid_value: number
          payment_date: string | null
          payment_method: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          competence_date?: string | null
          cost_center?: string | null
          cost_type?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          dre_group?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          installment_value?: number
          interest_rate_month?: number
          interest_type?: string
          movement_type: string
          notes?: string | null
          original_value?: number
          owner_id?: string
          paid_value?: number
          payment_date?: string | null
          payment_method?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          competence_date?: string | null
          cost_center?: string | null
          cost_type?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          dre_group?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          installment_value?: number
          interest_rate_month?: number
          interest_type?: string
          movement_type?: string
          notes?: string | null
          original_value?: number
          owner_id?: string
          paid_value?: number
          payment_date?: string | null
          payment_method?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          error_rows: number
          file_name: string | null
          id: string
          imported_rows: number
          owner_id: string
          source_system: string | null
          status: string
          total_rows: number
        }
        Insert: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          imported_rows?: number
          owner_id?: string
          source_system?: string | null
          status?: string
          total_rows?: number
        }
        Update: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          imported_rows?: number
          owner_id?: string
          source_system?: string | null
          status?: string
          total_rows?: number
        }
        Relationships: []
      }
      import_errors: {
        Row: {
          batch_id: string | null
          created_at: string
          error_message: string | null
          field_name: string | null
          id: string
          owner_id: string
          raw_data: Json | null
          row_number: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          field_name?: string | null
          id?: string
          owner_id?: string
          raw_data?: Json | null
          row_number?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          field_name?: string | null
          id?: string
          owner_id?: string
          raw_data?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
