/**
 * Hand-written Database types matching the initial schema migration.
 * Once Brodie supplies Supabase credentials and the schema is applied to
 * the live project, this file is regenerated via:
 *   pnpm db:gen-types
 *
 * Until then, this file is the source of truth for typed Supabase queries.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountSource = 'up' | 'basiq';
export type AccountTypeEnum =
  | 'transaction'
  | 'savings'
  | 'credit'
  | 'offset'
  | 'saver_bucket';
export type ClassificationEnum =
  | 'fixed'
  | 'discretionary'
  | 'internal'
  | 'income'
  | 'refund';
export type ClassifiedByEnum = 'rule' | 'recurrence' | 'llm' | 'user' | 'system';
export type PayCadenceEnum = 'weekly' | 'fortnightly' | 'monthly' | 'four_weekly' | 'irregular';
export type SubscriptionStatusEnum =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';
export type RuleSourceEnum = 'system' | 'user_correction';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          apple_user_id: string | null;
          email: string | null;
          display_name: string | null;
          basiq_user_id: string | null;
          email_alias: string;
          timezone: string;
          pay_cycle_type: PayCadenceEnum | null;
          pay_cycle_anchor_date: string | null;
          pay_amount_estimate_cents: number | null;
          preferences: Json;
          subscription_status: SubscriptionStatusEnum;
          subscription_current_period_end: string | null;
          llm_categorisation_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      connections: {
        Row: {
          id: string;
          user_id: string;
          source: AccountSource;
          source_connection_id: string;
          display_name: string;
          access_token_encrypted: string | null;
          refresh_token_encrypted: string | null;
          token_expires_at: string | null;
          webhook_secret_encrypted: string | null;
          status: string;
          last_synced_at: string | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['connections']['Row']>;
        Update: Partial<Database['public']['Tables']['connections']['Row']>;
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          connection_id: string | null;
          source: AccountSource;
          source_account_id: string;
          parent_account_id: string | null;
          display_name: string;
          account_type: AccountTypeEnum;
          currency: string;
          balance_cents: number;
          balance_updated_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['accounts']['Row']>;
        Update: Partial<Database['public']['Tables']['accounts']['Row']>;
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          slug: string;
          name: string;
          parent_category_id: string | null;
          default_classification: ClassificationEnum;
          icon: string | null;
          color: string | null;
          is_system: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['categories']['Row']>;
        Update: Partial<Database['public']['Tables']['categories']['Row']>;
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          source_transaction_id: string;
          posted_at: string;
          amount_cents: number;
          currency: string;
          merchant_raw: string | null;
          merchant_normalised: string | null;
          description: string | null;
          location: string | null;
          category_id: string | null;
          classification: ClassificationEnum | null;
          is_recurring: boolean;
          recurring_group_id: string | null;
          paired_transaction_id: string | null;
          confidence_score: number | null;
          classified_by: ClassifiedByEnum | null;
          user_overridden: boolean;
          classification_reasoning: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['transactions']['Row']>;
        Update: Partial<Database['public']['Tables']['transactions']['Row']>;
      };
      categorisation_rules: {
        Row: {
          id: string;
          user_id: string | null;
          merchant_pattern: string;
          pattern_type: 'substring' | 'regex';
          category_id: string | null;
          classification: ClassificationEnum;
          source: RuleSourceEnum;
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['categorisation_rules']['Row']>;
        Update: Partial<Database['public']['Tables']['categorisation_rules']['Row']>;
      };
      fixed_obligations: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          category_id: string | null;
          recurring_group_id: string | null;
          name: string;
          amount_cents: number;
          cadence: PayCadenceEnum;
          expected_day_of_month: number | null;
          next_expected_date: string | null;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['fixed_obligations']['Row']>;
        Update: Partial<Database['public']['Tables']['fixed_obligations']['Row']>;
      };
      pay_cycles: {
        Row: {
          id: string;
          user_id: string;
          source_account_id: string | null;
          payer_name: string;
          cadence: PayCadenceEnum;
          anchor_date: string;
          amount_estimate_cents: number;
          amount_variance_cents: number;
          is_primary: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['pay_cycles']['Row']>;
        Update: Partial<Database['public']['Tables']['pay_cycles']['Row']>;
      };
      sub_budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          name: string;
          target_cents: number;
          is_catchall: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sub_budgets']['Row']>;
        Update: Partial<Database['public']['Tables']['sub_budgets']['Row']>;
      };
      recurring_groups: {
        Row: {
          id: string;
          user_id: string;
          merchant_normalised: string;
          amount_min_cents: number;
          amount_max_cents: number;
          cadence_days: number;
          next_expected_date: string | null;
          confidence_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['recurring_groups']['Row']>;
        Update: Partial<Database['public']['Tables']['recurring_groups']['Row']>;
      };
      sync_events: {
        Row: {
          id: string;
          user_id: string;
          connection_id: string | null;
          source: AccountSource;
          status: string;
          transactions_added: number;
          transactions_updated: number;
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['sync_events']['Row']>;
        Update: Partial<Database['public']['Tables']['sync_events']['Row']>;
      };
      llm_calls: {
        Row: {
          id: string;
          user_id: string;
          transaction_id: string | null;
          model: string;
          prompt_tokens: number;
          completion_tokens: number;
          cost_micros_aud: number;
          response_json: Json | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['llm_calls']['Row']>;
        Update: Partial<Database['public']['Tables']['llm_calls']['Row']>;
      };
      notification_deliveries: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          payload: Json;
          sent_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notification_deliveries']['Row']>;
        Update: Partial<Database['public']['Tables']['notification_deliveries']['Row']>;
      };
    };
    Views: {
      sub_budget_progress: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_cents: number;
          is_catchall: boolean;
          display_order: number;
          spent_cents: number;
        };
      };
    };
    Functions: {
      headroom_for_user: {
        Args: { p_user_id: string; p_as_of?: string };
        Returns: {
          period_start: string;
          period_end: string;
          forecast_income_cents: number;
          forecast_fixed_cents: number;
          spent_discretionary_cents: number;
          headroom_cents: number;
          days_remaining: number;
          daily_burn_cents: number;
        }[];
      };
      current_month_burn_rate: {
        Args: { p_user_id: string };
        Returns: number;
      };
      internal_transfer_pair: {
        Args: { p_user_id: string; p_outbound_id: string; p_inbound_id: string };
        Returns: void;
      };
      forecast_period_for_user: {
        Args: { p_user_id: string; p_as_of?: string };
        Returns: {
          period_start: string;
          period_end: string;
        }[];
      };
    };
    Enums: {
      account_source: AccountSource;
      account_type: AccountTypeEnum;
      transaction_classification: ClassificationEnum;
      classified_by: ClassifiedByEnum;
      pay_cadence: PayCadenceEnum;
      subscription_status: SubscriptionStatusEnum;
      rule_source: RuleSourceEnum;
    };
  };
}
