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
    PostgrestVersion: '14.15'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
      activity_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database['public']['Enums']['activity_actor_kind']
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          org_id: string
          payload: Json
          project_id: string | null
          summary: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: Database['public']['Enums']['activity_actor_kind']
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id: string
          payload?: Json
          project_id?: string | null
          summary: string
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database['public']['Enums']['activity_actor_kind']
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string
          payload?: Json
          project_id?: string | null
          summary?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activity_events_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_events_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clients_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      deliveries: {
        Row: {
          approved_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          milestone_id: string | null
          org_id: string
          project_id: string
          status: Database['public']['Enums']['delivery_status']
          title: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          org_id: string
          project_id: string
          status?: Database['public']['Enums']['delivery_status']
          title: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          org_id?: string
          project_id?: string
          status?: Database['public']['Enums']['delivery_status']
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deliveries_milestone_id_fkey'
            columns: ['milestone_id']
            isOneToOne: false
            referencedRelation: 'milestones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deliveries_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deliveries_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      delivery_assets: {
        Row: {
          delivery_id: string
          file_path: string
          id: string
        }
        Insert: {
          delivery_id: string
          file_path: string
          id?: string
        }
        Update: {
          delivery_id?: string
          file_path?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'delivery_assets_delivery_id_fkey'
            columns: ['delivery_id']
            isOneToOne: false
            referencedRelation: 'deliveries'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          project_id: string | null
          role: Database['public']['Enums']['user_role']
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          project_id?: string | null
          role: Database['public']['Enums']['user_role']
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          project_id?: string | null
          role?: Database['public']['Enums']['user_role']
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invitations_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitations_project_in_org'
            columns: ['project_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id', 'org_id']
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string
          invoice_url: string | null
          org_id: string
          paid_at: string | null
          payment_intent: string | null
          project_id: string
          status: Database['public']['Enums']['invoice_status']
          subtotal: number
          tax_amount: number
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          invoice_url?: string | null
          org_id: string
          paid_at?: string | null
          payment_intent?: string | null
          project_id: string
          status?: Database['public']['Enums']['invoice_status']
          subtotal?: number
          tax_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          invoice_url?: string | null
          org_id?: string
          paid_at?: string | null
          payment_intent?: string | null
          project_id?: string
          status?: Database['public']['Enums']['invoice_status']
          subtotal?: number
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database['public']['Enums']['user_role']
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: Database['public']['Enums']['user_role']
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database['public']['Enums']['user_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string | null
          due_date: string | null
          id: string
          project_id: string
          status: Database['public']['Enums']['milestone_status']
          title: string
        }
        Insert: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          project_id: string
          status?: Database['public']['Enums']['milestone_status']
          title: string
        }
        Update: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          project_id?: string
          status?: Database['public']['Enums']['milestone_status']
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'milestones_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          currency: string
          daily_capacity_hours: number
          days_per_week: number
          id: string
          logo_url: string | null
          name: string
          rounding_minutes: number
          slug: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          daily_capacity_hours?: number
          days_per_week?: number
          id?: string
          logo_url?: string | null
          name: string
          rounding_minutes?: number
          slug: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          daily_capacity_hours?: number
          days_per_week?: number
          id?: string
          logo_url?: string | null
          name?: string
          rounding_minutes?: number
          slug?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          duration_months: number
          features: Json
          id: string
          is_active: boolean
          name: string
          price_cents: number
          price_id: string | null
          seats: number | null
        }
        Insert: {
          created_at?: string
          duration_months: number
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          price_id?: string | null
          seats?: number | null
        }
        Update: {
          created_at?: string
          duration_months?: number
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          price_id?: string | null
          seats?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      project_allocations: {
        Row: {
          created_at: string
          days_per_week: number
          effective_from: string
          effective_to: string | null
          hours_per_day: number
          id: string
          project_id: string
          rate: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          days_per_week?: number
          effective_from: string
          effective_to?: string | null
          hours_per_day: number
          id?: string
          project_id: string
          rate?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          days_per_week?: number
          effective_from?: string
          effective_to?: string | null
          hours_per_day?: number
          id?: string
          project_id?: string
          rate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_allocations_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          client_org_id: string | null
          contract_value: number | null
          created_at: string
          description: string | null
          due_date: string | null
          engagement: Database['public']['Enums']['engagement_model']
          id: string
          name: string
          org_id: string
          override_reason: string | null
          retainer_amount: number | null
          retainer_hours: number | null
          retainer_overage: number | null
          retainer_period: Database['public']['Enums']['retainer_period'] | null
          start_date: string | null
          status: Database['public']['Enums']['project_status']
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          client_org_id?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          engagement?: Database['public']['Enums']['engagement_model']
          id?: string
          name: string
          org_id: string
          override_reason?: string | null
          retainer_amount?: number | null
          retainer_hours?: number | null
          retainer_overage?: number | null
          retainer_period?:
            Database['public']['Enums']['retainer_period'] | null
          start_date?: string | null
          status?: Database['public']['Enums']['project_status']
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          client_org_id?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          engagement?: Database['public']['Enums']['engagement_model']
          id?: string
          name?: string
          org_id?: string
          override_reason?: string | null
          retainer_amount?: number | null
          retainer_hours?: number | null
          retainer_overage?: number | null
          retainer_period?:
            Database['public']['Enums']['retainer_period'] | null
          start_date?: string | null
          status?: Database['public']['Enums']['project_status']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'projects_client_org_id_fkey'
            columns: ['client_org_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'projects_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          id?: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          org_id: string
          payment_method_details: Json
          payment_method_type: string | null
          plan_id: string | null
          status: Database['public']['Enums']['subscription_status']
          stripe_customer_id: string | null
          stripe_payment_intent: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id: string
          payment_method_details?: Json
          payment_method_type?: string | null
          plan_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_payment_intent?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id?: string
          payment_method_details?: Json
          payment_method_type?: string | null
          plan_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_payment_intent?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          description: string
          duration_minutes: number
          id: string
          milestone_id: string | null
          project_id: string
          status: Database['public']['Enums']['time_entry_status']
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          description: string
          duration_minutes: number
          id?: string
          milestone_id?: string | null
          project_id: string
          status?: Database['public']['Enums']['time_entry_status']
          user_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          milestone_id?: string | null
          project_id?: string
          status?: Database['public']['Enums']['time_entry_status']
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: 'time_entries_milestone_id_fkey'
            columns: ['milestone_id']
            isOneToOne: false
            referencedRelation: 'milestones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'time_entries_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      updates: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'updates_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_time_entry: { Args: { entry_id: string }; Returns: undefined }
      current_user_orgs: { Args: never; Returns: string[] }
      has_org_role: {
        Args: {
          allowed_roles: Database['public']['Enums']['user_role'][]
          target_org_id: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { target_org_id: string }; Returns: boolean }
      is_slug_available: { Args: { candidate: string }; Returns: boolean }
      submit_time_entry: { Args: { entry_id: string }; Returns: undefined }
      update_delivery_status: {
        Args: {
          p_delivery_id: string
          p_project_id: string
          p_status: Database['public']['Enums']['delivery_status']
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_actor_kind: 'system' | 'client' | 'member'
      delivery_status: 'pending' | 'submitted' | 'approved' | 'rejected'
      engagement_model: 'full_time' | 'part_time' | 'retainer' | 'fixed'
      invoice_status: 'draft' | 'due' | 'paid' | 'overdue' | 'cancelled'
      milestone_status: 'pending' | 'in_progress' | 'completed'
      project_status:
        | 'draft'
        | 'in-progress'
        | 'pending-approval'
        | 'pending'
        | 'on-hold'
        | 'completed'
        | 'cancelled'
      retainer_period: 'weekly' | 'monthly'
      roles: 'admin' | 'user'
      subscription_status:
        | 'active'
        | 'trialing'
        | 'past_due'
        | 'cancelled'
        | 'expired'
        | 'incomplete'
        | 'incomplete_expired'
        | 'unpaid'
        | 'paused'
      time_entry_status: 'draft' | 'submitted' | 'approved' | 'rejected'
      user_role: 'owner' | 'admin' | 'member' | 'client'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_actor_kind: ['system', 'client', 'member'],
      delivery_status: ['pending', 'submitted', 'approved', 'rejected'],
      engagement_model: ['full_time', 'part_time', 'retainer', 'fixed'],
      invoice_status: ['draft', 'due', 'paid', 'overdue', 'cancelled'],
      milestone_status: ['pending', 'in_progress', 'completed'],
      project_status: [
        'draft',
        'in-progress',
        'pending-approval',
        'pending',
        'on-hold',
        'completed',
        'cancelled',
      ],
      retainer_period: ['weekly', 'monthly'],
      roles: ['admin', 'user'],
      subscription_status: [
        'active',
        'trialing',
        'past_due',
        'cancelled',
        'expired',
        'incomplete',
        'incomplete_expired',
        'unpaid',
        'paused',
      ],
      time_entry_status: ['draft', 'submitted', 'approved', 'rejected'],
      user_role: ['owner', 'admin', 'member', 'client'],
    },
  },
} as const
