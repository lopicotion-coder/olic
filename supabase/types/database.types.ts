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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["academic_period_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["academic_period_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["academic_period_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_budget_events: {
        Row: {
          billed_amount: number
          budget_id: string
          created_at: string
          currency: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          input_tokens: number
          metadata: Json
          outcome: string
          output_tokens: number
          request_id: string
          school_id: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          billed_amount?: number
          budget_id: string
          created_at?: string
          currency?: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_tokens?: number
          metadata?: Json
          outcome: string
          output_tokens?: number
          request_id: string
          school_id?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          billed_amount?: number
          budget_id?: string
          created_at?: string
          currency?: string
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_tokens?: number
          metadata?: Json
          outcome?: string
          output_tokens?: number
          request_id?: string
          school_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_budget_events_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "ai_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_budget_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_budget_events_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_budget_reservations: {
        Row: {
          budget_id: string
          created_at: string
          expires_at: string
          id: string
          request_id: string
          reserved_amount: number
          school_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          expires_at?: string
          id?: string
          request_id: string
          reserved_amount: number
          school_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          request_id?: string
          reserved_amount?: number
          school_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_budget_reservations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "ai_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_budget_reservations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_budget_reservations_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_budgets: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_active: boolean
          max_input_tokens: number
          max_output_tokens: number
          monthly_budget_amount: number
          monthly_request_limit: number
          school_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          max_input_tokens?: number
          max_output_tokens?: number
          monthly_budget_amount: number
          monthly_request_limit?: number
          school_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          max_input_tokens?: number
          max_output_tokens?: number
          monthly_budget_amount?: number
          monthly_request_limit?: number
          school_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_budgets_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_routes: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          input_price_per_million: number
          max_output_tokens: number
          model_key: string
          output_price_per_million: number
          priority: number
          provider_key: string
          school_id: string | null
          tenant_id: string
          timeout_ms: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_price_per_million?: number
          max_output_tokens?: number
          model_key: string
          output_price_per_million?: number
          priority?: number
          provider_key: string
          school_id?: string | null
          tenant_id: string
          timeout_ms?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_price_per_million?: number
          max_output_tokens?: number
          model_key?: string
          output_price_per_million?: number
          priority?: number
          provider_key?: string
          school_id?: string | null
          tenant_id?: string
          timeout_ms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_routes_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_rag_evidence: {
        Row: {
          chunk_id: string
          citation_label: string | null
          created_at: string
          id: string
          request_id: string
          response_id: string | null
          retrieval_rank: number
          school_id: string | null
          selected_for_answer: boolean
          similarity_score: number | null
          source_excerpt: string
          tenant_id: string
        }
        Insert: {
          chunk_id: string
          citation_label?: string | null
          created_at?: string
          id?: string
          request_id: string
          response_id?: string | null
          retrieval_rank: number
          school_id?: string | null
          selected_for_answer?: boolean
          similarity_score?: number | null
          source_excerpt: string
          tenant_id: string
        }
        Update: {
          chunk_id?: string
          citation_label?: string | null
          created_at?: string
          id?: string
          request_id?: string
          response_id?: string | null
          retrieval_rank?: number
          school_id?: string | null
          selected_for_answer?: boolean
          similarity_score?: number | null
          source_excerpt?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_rag_evidence_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "curriculum_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rag_evidence_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rag_evidence_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "ai_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rag_evidence_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_rag_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          completed_at: string | null
          cost_amount: number
          created_at: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          input_context: Json
          model_key: string | null
          prompt_text: string
          provider_key: string | null
          requester_user_id: string
          safety_status: string
          school_id: string | null
          status: Database["public"]["Enums"]["ai_request_status"]
          tenant_id: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          completed_at?: string | null
          cost_amount?: number
          created_at?: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_context?: Json
          model_key?: string | null
          prompt_text: string
          provider_key?: string | null
          requester_user_id: string
          safety_status?: string
          school_id?: string | null
          status?: Database["public"]["Enums"]["ai_request_status"]
          tenant_id: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          completed_at?: string | null
          cost_amount?: number
          created_at?: string
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_context?: Json
          model_key?: string | null
          prompt_text?: string
          provider_key?: string | null
          requester_user_id?: string
          safety_status?: string
          school_id?: string | null
          status?: Database["public"]["Enums"]["ai_request_status"]
          tenant_id?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_responses: {
        Row: {
          created_at: string
          id: string
          request_id: string
          response_json: Json
          response_text: string
          school_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          response_json?: Json
          response_text: string
          school_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          response_json?: Json
          response_text?: string
          school_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cost_amount: number
          created_at: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          input_tokens: number
          output_tokens: number
          request_id: string | null
          school_id: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          cost_amount?: number
          created_at?: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_tokens?: number
          output_tokens?: number
          request_id?: string | null
          school_id?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          cost_amount?: number
          created_at?: string
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          input_tokens?: number
          output_tokens?: number
          request_id?: string | null
          school_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      analytics_snapshots: {
        Row: {
          created_at: string
          generated_by: string | null
          id: string
          school_id: string | null
          snapshot_type: string
          summary: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          generated_by?: string | null
          id?: string
          school_id?: string | null
          snapshot_type: string
          summary?: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          generated_by?: string | null
          id?: string
          school_id?: string | null
          snapshot_type?: string
          summary?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_snapshots_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_date: string | null
          assessment_type: string
          class_id: string
          created_at: string
          created_by: string
          id: string
          is_published: boolean
          max_score: number
          school_id: string
          subject_id: string
          tenant_id: string
          term_id: string | null
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          assessment_date?: string | null
          assessment_type?: string
          class_id: string
          created_at?: string
          created_by: string
          id?: string
          is_published?: boolean
          max_score: number
          school_id: string
          subject_id: string
          tenant_id: string
          term_id?: string | null
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          assessment_date?: string | null
          assessment_type?: string
          class_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_published?: boolean
          max_score?: number
          school_id?: string
          subject_id?: string
          tenant_id?: string
          term_id?: string | null
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "assessments_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "assessments_term_id_tenant_id_school_id_fkey"
            columns: ["term_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          feedback: string | null
          file_path: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          school_id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submission_text: string | null
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          feedback?: string | null
          file_path?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          school_id: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submission_text?: string | null
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          file_path?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          school_id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submission_text?: string | null
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_tenant_id_school_id_fkey"
            columns: ["assignment_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      assignments: {
        Row: {
          allow_late_submission: boolean
          class_id: string
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions: string | null
          max_score: number | null
          published_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["assignment_status"]
          subject_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          allow_late_submission?: boolean
          class_id: string
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_score?: number | null
          published_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
          subject_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          allow_late_submission?: boolean
          class_id?: string
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_score?: number | null
          published_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          subject_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "assignments_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          id: string
          note: string | null
          recorded_by: string
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          recorded_by: string
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string
          school_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_tenant_id_school_id_fkey"
            columns: ["session_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          class_id: string
          created_at: string
          finalized_at: string | null
          id: string
          notes: string | null
          period_number: number | null
          recorded_by: string
          school_id: string
          session_date: string
          subject_id: string | null
          tenant_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          notes?: string | null
          period_number?: number | null
          recorded_by: string
          school_id: string
          session_date: string
          subject_id?: string | null
          tenant_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          notes?: string | null
          period_number?: number | null
          recorded_by?: string
          school_id?: string
          session_date?: string
          subject_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          request_id: string | null
          school_id: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          school_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          school_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_jobs: {
        Row: {
          backup_type: string
          completed_at: string | null
          created_at: string
          destination: string | null
          id: string
          manifest: Json
          notes: string | null
          requested_by: string | null
          school_id: string | null
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          backup_type: string
          completed_at?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          manifest?: Json
          notes?: string | null
          requested_by?: string | null
          school_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          manifest?: Json
          notes?: string | null
          requested_by?: string | null
          school_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          periods_per_week: number
          school_id: string
          subject_id: string
          tenant_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          periods_per_week?: number
          school_id: string
          subject_id: string
          tenant_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          periods_per_week?: number
          school_id?: string
          subject_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          campus_id: string | null
          capacity: number | null
          created_at: string
          grade_level_id: string
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          campus_id?: string | null
          capacity?: number | null
          created_at?: string
          grade_level_id: string
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          campus_id?: string | null
          capacity?: number | null
          created_at?: string
          grade_level_id?: string
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "classes_campus_id_tenant_id_school_id_fkey"
            columns: ["campus_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "classes_grade_level_id_tenant_id_school_id_fkey"
            columns: ["grade_level_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "classes_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      content_items: {
        Row: {
          body: string
          class_id: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          resource_type: string
          school_id: string
          status: Database["public"]["Enums"]["content_status"]
          subject_id: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          resource_type?: string
          school_id: string
          status?: Database["public"]["Enums"]["content_status"]
          subject_id?: string | null
          summary?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          resource_type?: string
          school_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          subject_id?: string | null
          summary?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "content_items_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "content_items_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      content_versions: {
        Row: {
          body: string
          content_item_id: string
          created_at: string
          created_by: string | null
          id: string
          school_id: string
          tenant_id: string
          version_number: number
        }
        Insert: {
          body: string
          content_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id: string
          tenant_id: string
          version_number: number
        }
        Update: {
          body?: string
          content_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id?: string
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          muted_at: string | null
          participant_role: string
          school_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          muted_at?: string | null
          participant_role?: string
          school_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          muted_at?: string | null
          participant_role?: string
          school_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          class_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          school_id: string | null
          scope_type: Database["public"]["Enums"]["conversation_scope"]
          student_id: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          school_id?: string | null
          scope_type?: Database["public"]["Enums"]["conversation_scope"]
          student_id?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          school_id?: string | null
          scope_type?: Database["public"]["Enums"]["conversation_scope"]
          student_id?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "conversations_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "conversations_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      curriculum_chunks: {
        Row: {
          chapter_title: string | null
          chunk_index: number
          content_sha256: string
          content_text: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_model_key: string | null
          id: string
          last_error: string | null
          metadata: Json
          page_end: number | null
          page_start: number | null
          search_vector: unknown
          section_title: string | null
          source_id: string
          source_version_id: string
          status: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          chapter_title?: string | null
          chunk_index: number
          content_sha256: string
          content_text: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model_key?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          page_end?: number | null
          page_start?: number | null
          search_vector?: unknown
          section_title?: string | null
          source_id: string
          source_version_id: string
          status?: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          chapter_title?: string | null
          chunk_index?: number
          content_sha256?: string
          content_text?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model_key?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          page_end?: number | null
          page_start?: number | null
          search_vector?: unknown
          section_title?: string | null
          source_id?: string
          source_version_id?: string
          status?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_chunks_source_version_id_source_id_fkey"
            columns: ["source_version_id", "source_id"]
            isOneToOne: false
            referencedRelation: "curriculum_source_versions"
            referencedColumns: ["id", "source_id"]
          },
        ]
      }
      curriculum_ingestion_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          job_status: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          metadata: Json
          source_version_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          job_status?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          source_version_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          job_status?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          source_version_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_ingestion_jobs_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_source_versions: {
        Row: {
          academic_year_label: string | null
          created_at: string
          created_by: string | null
          extracted_text_sha256: string | null
          extraction_metadata: Json
          file_sha256: string | null
          id: string
          ingestion_status: string
          page_count: number | null
          publication_year: number | null
          source_id: string
          storage_bucket: string
          storage_object_path: string | null
          updated_at: string
          version_label: string
        }
        Insert: {
          academic_year_label?: string | null
          created_at?: string
          created_by?: string | null
          extracted_text_sha256?: string | null
          extraction_metadata?: Json
          file_sha256?: string | null
          id?: string
          ingestion_status?: string
          page_count?: number | null
          publication_year?: number | null
          source_id: string
          storage_bucket?: string
          storage_object_path?: string | null
          updated_at?: string
          version_label: string
        }
        Update: {
          academic_year_label?: string | null
          created_at?: string
          created_by?: string | null
          extracted_text_sha256?: string | null
          extraction_metadata?: Json
          file_sha256?: string | null
          id?: string
          ingestion_status?: string
          page_count?: number | null
          publication_year?: number | null
          source_id?: string
          storage_bucket?: string
          storage_object_path?: string | null
          updated_at?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_source_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "curriculum_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_sources: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          curriculum_board: string | null
          education_system: string | null
          grade_code: string
          grade_label: string
          id: string
          language_code: string
          permitted_uses: string[]
          publication_year: number | null
          publisher: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rights_basis: string | null
          rights_reference: string | null
          rights_status: string
          school_id: string | null
          sharing_scope: string
          source_kind: string
          status: string
          storage_bucket: string
          storage_object_path: string | null
          subject_code: string
          subject_name: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          curriculum_board?: string | null
          education_system?: string | null
          grade_code: string
          grade_label: string
          id?: string
          language_code?: string
          permitted_uses?: string[]
          publication_year?: number | null
          publisher?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_basis?: string | null
          rights_reference?: string | null
          rights_status?: string
          school_id?: string | null
          sharing_scope?: string
          source_kind?: string
          status?: string
          storage_bucket?: string
          storage_object_path?: string | null
          subject_code: string
          subject_name: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          curriculum_board?: string | null
          education_system?: string | null
          grade_code?: string
          grade_label?: string
          id?: string
          language_code?: string
          permitted_uses?: string[]
          publication_year?: number | null
          publisher?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_basis?: string | null
          rights_reference?: string | null
          rights_status?: string
          school_id?: string | null
          sharing_scope?: string
          source_kind?: string
          status?: string
          storage_bucket?: string
          storage_object_path?: string | null
          subject_code?: string
          subject_name?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_sources_school_tenant_fk"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "curriculum_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          byte_size: number
          class_id: string | null
          created_at: string
          id: string
          mime_type: string
          original_file_name: string
          resource_id: string | null
          resource_type: string
          school_id: string
          storage_path: string
          student_id: string | null
          tenant_id: string
          uploaded_by: string
        }
        Insert: {
          byte_size: number
          class_id?: string | null
          created_at?: string
          id?: string
          mime_type: string
          original_file_name: string
          resource_id?: string | null
          resource_type: string
          school_id: string
          storage_path: string
          student_id?: string | null
          tenant_id: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number
          class_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string
          original_file_name?: string
          resource_id?: string | null
          resource_type?: string
          school_id?: string
          storage_path?: string
          student_id?: string | null
          tenant_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "documents_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      early_warning_flags: {
        Row: {
          created_at: string
          details: Json
          id: string
          reason: string
          resolved_at: string | null
          school_id: string
          severity: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          reason: string
          resolved_at?: string | null
          school_id: string
          severity: string
          student_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          reason?: string
          resolved_at?: string | null
          school_id?: string
          severity?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "early_warning_flags_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "early_warning_flags_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_candidates: {
        Row: {
          committee_name: string | null
          created_at: string
          exam_session_id: string
          id: string
          invigilator_teacher_id: string | null
          school_id: string
          seat_number: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          committee_name?: string | null
          created_at?: string
          exam_session_id: string
          id?: string
          invigilator_teacher_id?: string | null
          school_id: string
          seat_number: string
          student_id: string
          tenant_id: string
        }
        Update: {
          committee_name?: string | null
          created_at?: string
          exam_session_id?: string
          id?: string
          invigilator_teacher_id?: string | null
          school_id?: string
          seat_number?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_candidates_exam_session_id_fkey"
            columns: ["exam_session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_candidates_exam_session_id_tenant_id_school_id_fkey"
            columns: ["exam_session_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "exam_candidates_invigilator_teacher_id_tenant_id_school_id_fkey"
            columns: ["invigilator_teacher_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "exam_candidates_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          exam_type: string
          id: string
          max_score: number
          published_at: string | null
          room_name: string | null
          scheduled_at: string
          school_id: string
          status: Database["public"]["Enums"]["exam_session_status"]
          subject_id: string
          tenant_id: string
          term_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          exam_type: string
          id?: string
          max_score: number
          published_at?: string | null
          room_name?: string | null
          scheduled_at: string
          school_id: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          subject_id: string
          tenant_id: string
          term_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          exam_type?: string
          id?: string
          max_score?: number
          published_at?: string | null
          room_name?: string | null
          scheduled_at?: string
          school_id?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          subject_id?: string
          tenant_id?: string
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "exam_sessions_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "exam_sessions_term_id_tenant_id_school_id_fkey"
            columns: ["term_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      fee_installments: {
        Row: {
          amount: number
          created_at: string
          due_on: string
          fee_account_id: string
          id: string
          school_id: string
          sequence_number: number
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_on: string
          fee_account_id: string
          id?: string
          school_id: string
          sequence_number: number
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_on?: string
          fee_account_id?: string
          id?: string
          school_id?: string
          sequence_number?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_installments_fee_account_id_tenant_id_school_id_fkey"
            columns: ["fee_account_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_fee_accounts"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          fee_account_id: string
          id: string
          installment_id: string | null
          notes: string | null
          payment_method: string
          receipt_number: string
          received_at: string
          received_by: string
          reference: string | null
          school_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          fee_account_id: string
          id?: string
          installment_id?: string | null
          notes?: string | null
          payment_method: string
          receipt_number: string
          received_at?: string
          received_by: string
          reference?: string | null
          school_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          fee_account_id?: string
          id?: string
          installment_id?: string | null
          notes?: string | null
          payment_method?: string
          receipt_number?: string
          received_at?: string
          received_by?: string
          reference?: string | null
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_account_id_tenant_id_school_id_fkey"
            columns: ["fee_account_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_fee_accounts"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "fee_payments_installment_id_fee_account_id_tenant_id_schoo_fkey"
            columns: [
              "installment_id",
              "fee_account_id",
              "tenant_id",
              "school_id",
            ]
            isOneToOne: false
            referencedRelation: "fee_installments"
            referencedColumns: [
              "id",
              "fee_account_id",
              "tenant_id",
              "school_id",
            ]
          },
        ]
      }
      fee_plans: {
        Row: {
          academic_year_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          tenant_id: string
          total_amount: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_plans_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      grade_publication_requests: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          published_at: string | null
          request_notes: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: Database["public"]["Enums"]["grade_publication_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          request_notes?: string | null
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["grade_publication_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          request_notes?: string | null
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["grade_publication_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_publication_requests_assessment_id_tenant_id_school__fkey"
            columns: ["assessment_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      grade_revisions: {
        Row: {
          changed_by: string | null
          created_at: string
          grade_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
          operation: string
          school_id: string
          tenant_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          grade_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          school_id: string
          tenant_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          grade_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          school_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      grades: {
        Row: {
          assessment_id: string
          created_at: string
          entered_by: string
          feedback: string | null
          id: string
          published_at: string | null
          school_id: string
          score: number
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          entered_by: string
          feedback?: string | null
          id?: string
          published_at?: string | null
          school_id: string
          score: number
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          entered_by?: string
          feedback?: string | null
          id?: string
          published_at?: string | null
          school_id?: string
          score?: number
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_assessment_id_tenant_id_school_id_fkey"
            columns: ["assessment_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "grades_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          profile_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          profile_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          profile_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_hash: string
          content_item_id: string
          content_version_id: string | null
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_dimensions: number | null
          embedding_model: string | null
          id: string
          last_error: string | null
          metadata: Json
          school_id: string
          status: string
          tenant_id: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          chunk_index: number
          content: string
          content_hash: string
          content_item_id: string
          content_version_id?: string | null
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_dimensions?: number | null
          embedding_model?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          school_id: string
          status?: string
          tenant_id: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          content_hash?: string
          content_item_id?: string
          content_version_id?: string | null
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_dimensions?: number | null
          embedding_model?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          school_id?: string
          status?: string
          tenant_id?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_content_item_id_tenant_id_school_id_fkey"
            columns: ["content_item_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "knowledge_chunks_content_version_id_content_item_id_tenant_fkey"
            columns: [
              "content_version_id",
              "content_item_id",
              "tenant_id",
              "school_id",
            ]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: [
              "id",
              "content_item_id",
              "tenant_id",
              "school_id",
            ]
          },
        ]
      }
      membership_roles: {
        Row: {
          assigned_by: string | null
          class_id: string | null
          created_at: string
          id: string
          role_id: string
          school_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          role_id: string
          school_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          role_id?: string
          school_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_class_fk"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "membership_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          attached_by: string
          created_at: string
          document_id: string
          id: string
          message_id: string
          school_id: string
          tenant_id: string
        }
        Insert: {
          attached_by: string
          created_at?: string
          document_id: string
          id?: string
          message_id: string
          school_id: string
          tenant_id: string
        }
        Update: {
          attached_by?: string
          created_at?: string
          document_id?: string
          id?: string
          message_id?: string
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      message_deletions: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          message_id: string
          reason: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          message_id: string
          reason?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          message_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_deletions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_edits: {
        Row: {
          edited_at: string
          edited_by: string | null
          id: string
          message_id: string
          new_body: string
          previous_body: string
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          message_id: string
          new_body: string
          previous_body: string
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          message_id?: string
          new_body?: string
          previous_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          conversation_id: string
          delivered_at: string
          id: string
          message_id: string
          read_at: string | null
          school_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          delivered_at?: string
          id?: string
          message_id: string
          read_at?: string | null
          school_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          delivered_at?: string
          id?: string
          message_id?: string
          read_at?: string | null
          school_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_receipts_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          metadata: Json
          reply_to_message_id: string | null
          school_id: string | null
          sender_user_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          metadata?: Json
          reply_to_message_id?: string | null
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          metadata?: Json
          reply_to_message_id?: string | null
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          delivered_at: string | null
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          notification_id: string
          payload: Json
          provider_key: string
          provider_message_id: string | null
          recipient_user_id: string
          school_id: string
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          notification_id: string
          payload?: Json
          provider_key: string
          provider_message_id?: string | null
          recipient_user_id: string
          school_id: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          notification_id?: string
          payload?: Json
          provider_key?: string
          provider_message_id?: string | null
          recipient_user_id?: string
          school_id?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          delivery_id: string
          error_message: string | null
          http_status: number | null
          id: string
          provider_key: string
          provider_message_id: string | null
          status: string
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          delivery_id: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          provider_key: string
          provider_message_id?: string | null
          status: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          delivery_id?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          provider_key?: string
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_attempts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_dead_letters: {
        Row: {
          attempts: number
          delivery_id: string
          final_error: string
          id: string
          quarantined_at: string
          replayed_at: string | null
          replayed_by: string | null
          school_id: string
          tenant_id: string
        }
        Insert: {
          attempts: number
          delivery_id: string
          final_error: string
          id?: string
          quarantined_at?: string
          replayed_at?: string | null
          replayed_by?: string | null
          school_id: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          final_error?: string
          id?: string
          quarantined_at?: string
          replayed_at?: string | null
          replayed_by?: string | null
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_dead_letters_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_dead_letters_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel_email: boolean
          channel_in_app: boolean
          channel_push: boolean
          created_at: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          school_id: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_push?: boolean
          created_at?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_push?: boolean
          created_at?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_provider_events: {
        Row: {
          delivery_id: string
          event_type: string
          id: string
          metadata: Json
          outcome: string
          provider_event_id: string
          provider_key: string
          received_at: string
          school_id: string
          tenant_id: string
        }
        Insert: {
          delivery_id: string
          event_type: string
          id?: string
          metadata?: Json
          outcome: string
          provider_event_id: string
          provider_key: string
          received_at?: string
          school_id: string
          tenant_id: string
        }
        Update: {
          delivery_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          outcome?: string
          provider_event_id?: string
          provider_key?: string
          received_at?: string
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_provider_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_provider_events_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      notification_receipts: {
        Row: {
          delivered_at: string
          id: string
          notification_id: string
          read_at: string | null
          school_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          school_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          school_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_receipts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_receipts_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          class_id: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at: string | null
          recipient_user_id: string | null
          school_id: string | null
          sender_user_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          class_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          recipient_user_id?: string | null
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          class_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          recipient_user_id?: string | null
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "notifications_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      parent_accounts: {
        Row: {
          created_at: string
          first_name: string
          last_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name: string
          last_name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          preferred_locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          is_active: boolean
          name: string
          school_id: string | null
          template_text: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          is_active?: boolean
          name: string
          school_id?: string | null
          template_text: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string | null
          template_text?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      question_attempts: {
        Row: {
          answer_payload: Json
          attempt_number: number
          exposure_id: string
          feedback: string | null
          id: string
          is_correct: boolean | null
          max_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          score: number | null
          student_id: string
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          answer_payload: Json
          attempt_number: number
          exposure_id: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          max_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          score?: number | null
          student_id: string
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          answer_payload?: Json
          attempt_number?: number
          exposure_id?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          max_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          score?: number | null
          student_id?: string
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_exposure_id_tenant_id_school_id_fkey"
            columns: ["exposure_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_question_exposures"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "question_attempts_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      question_bank: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          choices: Json
          cognitive_level: string | null
          content_fingerprint: string | null
          created_at: string
          created_by: string | null
          difficulty: number
          embedding: string | null
          embedding_model_key: string | null
          generated_by_request_id: string | null
          grade_code: string
          grade_label: string
          id: string
          language_code: string
          lesson_title: string | null
          model_key: string | null
          origin_type: string
          prompt_version: string | null
          provider_key: string | null
          question_text: string
          question_type: string
          record_status: string
          review_status: string
          school_id: string | null
          search_vector: unknown
          sharing_scope: string
          subject_code: string
          subject_name: string
          tags: string[]
          tenant_id: string | null
          unit_title: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          choices?: Json
          cognitive_level?: string | null
          content_fingerprint?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: number
          embedding?: string | null
          embedding_model_key?: string | null
          generated_by_request_id?: string | null
          grade_code: string
          grade_label: string
          id?: string
          language_code?: string
          lesson_title?: string | null
          model_key?: string | null
          origin_type: string
          prompt_version?: string | null
          provider_key?: string | null
          question_text: string
          question_type: string
          record_status?: string
          review_status?: string
          school_id?: string | null
          search_vector?: unknown
          sharing_scope?: string
          subject_code: string
          subject_name: string
          tags?: string[]
          tenant_id?: string | null
          unit_title?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          choices?: Json
          cognitive_level?: string | null
          content_fingerprint?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: number
          embedding?: string | null
          embedding_model_key?: string | null
          generated_by_request_id?: string | null
          grade_code?: string
          grade_label?: string
          id?: string
          language_code?: string
          lesson_title?: string | null
          model_key?: string | null
          origin_type?: string
          prompt_version?: string | null
          provider_key?: string | null
          question_text?: string
          question_type?: string
          record_status?: string
          review_status?: string
          school_id?: string | null
          search_vector?: unknown
          sharing_scope?: string
          subject_code?: string
          subject_name?: string
          tags?: string[]
          tenant_id?: string | null
          unit_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_generated_by_request_id_fkey"
            columns: ["generated_by_request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_school_tenant_fk"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "question_bank_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_answers: {
        Row: {
          answer_payload: Json
          answer_reveal_policy: string
          created_at: string
          explanation: string | null
          marking_rubric: Json
          question_id: string
          updated_at: string
        }
        Insert: {
          answer_payload: Json
          answer_reveal_policy?: string
          created_at?: string
          explanation?: string | null
          marking_rubric?: Json
          question_id: string
          updated_at?: string
        }
        Update: {
          answer_payload?: Json
          answer_reveal_policy?: string
          created_at?: string
          explanation?: string | null
          marking_rubric?: Json
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      question_exposure_events: {
        Row: {
          event_type: string
          exposure_id: string
          id: string
          idempotency_key: string
          metadata: Json
          occurred_at: string
          received_at: string
        }
        Insert: {
          event_type: string
          exposure_id: string
          id?: string
          idempotency_key: string
          metadata?: Json
          occurred_at?: string
          received_at?: string
        }
        Update: {
          event_type?: string
          exposure_id?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          occurred_at?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_exposure_events_exposure_id_fkey"
            columns: ["exposure_id"]
            isOneToOne: false
            referencedRelation: "student_question_exposures"
            referencedColumns: ["id"]
          },
        ]
      }
      question_generation_batches: {
        Row: {
          accepted_count: number
          batch_status: string
          completed_at: string | null
          created_at: string
          difficulty_distribution: Json
          generated_count: number
          grade_code: string
          id: string
          lesson_title: string | null
          model_key: string | null
          prompt_version: string | null
          provider_key: string | null
          question_types: string[]
          rejected_count: number
          requested_by: string | null
          requested_count: number
          school_id: string | null
          sharing_scope: string
          source_version_id: string
          started_at: string | null
          subject_code: string
          tenant_id: string | null
          unit_title: string | null
          updated_at: string
        }
        Insert: {
          accepted_count?: number
          batch_status?: string
          completed_at?: string | null
          created_at?: string
          difficulty_distribution?: Json
          generated_count?: number
          grade_code: string
          id?: string
          lesson_title?: string | null
          model_key?: string | null
          prompt_version?: string | null
          provider_key?: string | null
          question_types?: string[]
          rejected_count?: number
          requested_by?: string | null
          requested_count: number
          school_id?: string | null
          sharing_scope?: string
          source_version_id: string
          started_at?: string | null
          subject_code: string
          tenant_id?: string | null
          unit_title?: string | null
          updated_at?: string
        }
        Update: {
          accepted_count?: number
          batch_status?: string
          completed_at?: string | null
          created_at?: string
          difficulty_distribution?: Json
          generated_count?: number
          grade_code?: string
          id?: string
          lesson_title?: string | null
          model_key?: string | null
          prompt_version?: string | null
          provider_key?: string | null
          question_types?: string[]
          rejected_count?: number
          requested_by?: string | null
          requested_count?: number
          school_id?: string | null
          sharing_scope?: string
          source_version_id?: string
          started_at?: string | null
          subject_code?: string
          tenant_id?: string | null
          unit_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_generation_batches_school_tenant_fk"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "question_generation_batches_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_source_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_generation_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      question_generation_jobs: {
        Row: {
          attempts: number
          available_at: string
          batch_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_status: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          schedule_id: string | null
          source_version_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          batch_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          job_status?: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          schedule_id?: string | null
          source_version_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          batch_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_status?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          schedule_id?: string | null
          source_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_generation_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "question_generation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_generation_jobs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "question_generation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_generation_jobs_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_generation_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_month: number | null
          days_of_week: number[]
          frequency: string
          grade_code: string
          id: string
          interval_minutes: number | null
          is_enabled: boolean
          last_run_at: string | null
          lesson_title: string | null
          local_run_time: string
          low_watermark: number
          next_run_at: string | null
          question_types: string[]
          school_id: string | null
          source_version_id: string
          subject_code: string
          target_question_count: number
          tenant_id: string
          timezone: string
          unit_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          days_of_week?: number[]
          frequency?: string
          grade_code: string
          id?: string
          interval_minutes?: number | null
          is_enabled?: boolean
          last_run_at?: string | null
          lesson_title?: string | null
          local_run_time?: string
          low_watermark?: number
          next_run_at?: string | null
          question_types?: string[]
          school_id?: string | null
          source_version_id: string
          subject_code: string
          target_question_count?: number
          tenant_id: string
          timezone?: string
          unit_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          days_of_week?: number[]
          frequency?: string
          grade_code?: string
          id?: string
          interval_minutes?: number | null
          is_enabled?: boolean
          last_run_at?: string | null
          lesson_title?: string | null
          local_run_time?: string
          low_watermark?: number
          next_run_at?: string | null
          question_types?: string[]
          school_id?: string | null
          source_version_id?: string
          subject_code?: string
          target_question_count?: number
          tenant_id?: string
          timezone?: string
          unit_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_generation_schedules_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "question_generation_schedules_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_source_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_generation_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      question_quality_checks: {
        Row: {
          check_key: string
          created_at: string
          details: Json
          id: string
          question_id: string
          result: string
          score: number | null
          validator_model: string | null
          validator_provider: string | null
        }
        Insert: {
          check_key: string
          created_at?: string
          details?: Json
          id?: string
          question_id: string
          result: string
          score?: number | null
          validator_model?: string | null
          validator_provider?: string | null
        }
        Update: {
          check_key?: string
          created_at?: string
          details?: Json
          id?: string
          question_id?: string
          result?: string
          score?: number | null
          validator_model?: string | null
          validator_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_quality_checks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      question_sources: {
        Row: {
          chunk_id: string
          citation_order: number
          created_at: string
          evidence_excerpt: string | null
          grounding_score: number | null
          id: string
          question_id: string
          relation_type: string
        }
        Insert: {
          chunk_id: string
          citation_order?: number
          created_at?: string
          evidence_excerpt?: string | null
          grounding_score?: number | null
          id?: string
          question_id: string
          relation_type?: string
        }
        Update: {
          chunk_id?: string
          citation_order?: number
          created_at?: string
          evidence_excerpt?: string | null
          grounding_score?: number | null
          id?: string
          question_id?: string
          relation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_sources_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "curriculum_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_sources_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_jobs: {
        Row: {
          backup_job_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          requested_by: string | null
          restore_mode: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          backup_job_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          restore_mode: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          backup_job_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          restore_mode?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_jobs_backup_job_id_fkey"
            columns: ["backup_job_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restore_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          key: string
          name: string
          scope: Database["public"]["Enums"]["role_scope"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          scope: Database["public"]["Enums"]["role_scope"]
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          scope?: Database["public"]["Enums"]["role_scope"]
        }
        Relationships: []
      }
      safety_filters: {
        Row: {
          created_at: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id: string
          is_active: boolean
          rule_definition: Json
          rule_name: string
          school_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          feature_key: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          is_active?: boolean
          rule_definition?: Json
          rule_name: string
          school_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          feature_key?: Database["public"]["Enums"]["ai_feature_key"]
          id?: string
          is_active?: boolean
          rule_definition?: Json
          rule_name?: string
          school_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_filters_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      school_import_batches: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by: string
          created_rows: number
          entity_type: string
          file_name: string
          id: string
          invalid_rows: number
          school_id: string
          status: Database["public"]["Enums"]["import_batch_status"]
          tenant_id: string
          total_rows: number
          updated_at: string
          valid_rows: number
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by: string
          created_rows?: number
          entity_type: string
          file_name: string
          id?: string
          invalid_rows?: number
          school_id: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          tenant_id: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by?: string
          created_rows?: number
          entity_type?: string
          file_name?: string
          id?: string
          invalid_rows?: number
          school_id?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          tenant_id?: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_import_batches_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      school_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          created_entity_id: string | null
          errors: Json
          id: string
          normalized_data: Json
          raw_data: Json
          row_number: number
          school_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_entity_id?: string | null
          errors?: Json
          id?: string
          normalized_data?: Json
          raw_data: Json
          row_number: number
          school_id: string
          status: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_entity_id?: string | null
          errors?: Json
          id?: string
          normalized_data?: Json
          raw_data?: Json
          row_number?: number
          school_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_import_rows_batch_scope_fkey"
            columns: ["batch_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_import_batches"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "school_import_rows_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      school_join_codes: {
        Row: {
          code_hash: string
          code_hint: string
          created_at: string
          created_by: string
          id: string
          revoked_at: string | null
          school_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          code_hash: string
          code_hint: string
          created_at?: string
          created_by: string
          id?: string
          revoked_at?: string | null
          school_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          code_hash?: string
          code_hint?: string
          created_at?: string
          created_by?: string
          id?: string
          revoked_at?: string | null
          school_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_join_codes_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      school_memberships: {
        Row: {
          created_at: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      school_setup_steps: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean
          notes: string | null
          school_id: string
          step_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          school_id: string
          step_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          school_id?: string
          step_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_setup_steps_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      schools: {
        Row: {
          code: string | null
          created_at: string
          default_locale: string
          id: string
          logo_path: string | null
          name: string
          primary_color: string | null
          require_student_date_of_birth: boolean
          require_student_email: boolean
          require_student_grade_level: boolean
          require_student_national_id: boolean
          require_student_phone: boolean
          slug: string
          status: Database["public"]["Enums"]["record_status"]
          student_login_enabled: boolean
          student_login_namespace: number
          student_login_next_number: number
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          default_locale?: string
          id?: string
          logo_path?: string | null
          name: string
          primary_color?: string | null
          require_student_date_of_birth?: boolean
          require_student_email?: boolean
          require_student_grade_level?: boolean
          require_student_national_id?: boolean
          require_student_phone?: boolean
          slug: string
          status?: Database["public"]["Enums"]["record_status"]
          student_login_enabled?: boolean
          student_login_namespace?: number
          student_login_next_number?: number
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          default_locale?: string
          id?: string
          logo_path?: string | null
          name?: string
          primary_color?: string | null
          require_student_date_of_birth?: boolean
          require_student_email?: boolean
          require_student_grade_level?: boolean
          require_student_national_id?: boolean
          require_student_phone?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["record_status"]
          student_login_enabled?: boolean
          student_login_namespace?: number
          student_login_next_number?: number
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_documents: {
        Row: {
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          school_id: string | null
          search_tags: string[]
          search_vector: unknown
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          school_id?: string | null
          search_tags?: string[]
          search_vector?: unknown
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          school_id?: string | null
          search_tags?: string[]
          search_vector?: unknown
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          created_at: string
          id: string
          query_text: string
          result_count: number
          school_id: string | null
          search_scope: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query_text: string
          result_count?: number
          school_id?: string | null
          search_scope?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query_text?: string
          result_count?: number
          school_id?: string | null
          search_scope?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_academic_events: {
        Row: {
          academic_year_id: string | null
          created_at: string
          event_date: string
          event_type: string
          from_class_id: string | null
          id: string
          notes: string | null
          recorded_by: string | null
          school_id: string
          student_id: string
          tenant_id: string
          to_class_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          event_date?: string
          event_type: string
          from_class_id?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          school_id: string
          student_id: string
          tenant_id: string
          to_class_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          event_date?: string
          event_type?: string
          from_class_id?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          school_id?: string
          student_id?: string
          tenant_id?: string
          to_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_academic_events_academic_year_id_tenant_id_school__fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_academic_events_from_class_id_tenant_id_school_id_fkey"
            columns: ["from_class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_academic_events_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_academic_events_to_class_id_tenant_id_school_id_fkey"
            columns: ["to_class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_activation_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          import_batch_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          revoked_at: string | null
          school_id: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          import_batch_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          school_id: string
          student_id: string
          tenant_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          import_batch_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          school_id?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_activation_codes_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "school_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_activation_codes_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_enrollment_requests: {
        Row: {
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          national_id: string | null
          relationship: string
          requested_grade_level_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          student_email: string | null
          student_id: string | null
          student_number: string
          student_phone: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          national_id?: string | null
          relationship?: string
          requested_grade_level_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          student_email?: string | null
          student_id?: string | null
          student_number: string
          student_phone?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          national_id?: string | null
          relationship?: string
          requested_grade_level_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          student_email?: string | null
          student_id?: string | null
          student_number?: string
          student_phone?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollment_requests_grade_level_fk"
            columns: ["requested_grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollment_requests_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "student_enrollment_requests_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          created_by: string | null
          ended_on: string | null
          enrolled_on: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          tenant_id: string
          transfer_reason: string | null
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          tenant_id: string
          transfer_reason?: string | null
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          tenant_id?: string
          transfer_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_enrollments_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_fee_accounts: {
        Row: {
          created_at: string
          discount_amount: number
          fee_plan_id: string
          id: string
          school_id: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          fee_plan_id: string
          id?: string
          school_id: string
          student_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          fee_plan_id?: string
          id?: string
          school_id?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_accounts_fee_plan_id_tenant_id_school_id_fkey"
            columns: ["fee_plan_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_fee_accounts_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_receive_notifications: boolean
          created_at: string
          guardian_id: string
          is_primary: boolean
          relationship: string
          school_id: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          can_receive_notifications?: boolean
          created_at?: string
          guardian_id: string
          is_primary?: boolean
          relationship: string
          school_id: string
          student_id: string
          tenant_id: string
        }
        Update: {
          can_receive_notifications?: boolean
          created_at?: string
          guardian_id?: string
          is_primary?: boolean
          relationship?: string
          school_id?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_tenant_id_school_id_fkey"
            columns: ["guardian_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_password_reset_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          issued_by: string
          reserved_at: string | null
          revoked_at: string | null
          school_id: string
          student_id: string
          tenant_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by: string
          reserved_at?: string | null
          revoked_at?: string | null
          school_id: string
          student_id: string
          tenant_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string
          reserved_at?: string | null
          revoked_at?: string | null
          school_id?: string
          student_id?: string
          tenant_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_password_reset_codes_student_id_tenant_id_school_i_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      student_question_exposures: {
        Row: {
          assessment_id: string | null
          assigned_at: string
          assignment_id: string | null
          created_at: string
          display_count: number
          exposure_status: string
          first_answered_at: string | null
          first_delivered_at: string | null
          first_opened_at: string | null
          first_rendered_at: string | null
          id: string
          last_answered_at: string | null
          last_event_at: string
          question_id: string
          reviewed_at: string | null
          school_id: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          assigned_at?: string
          assignment_id?: string | null
          created_at?: string
          display_count?: number
          exposure_status?: string
          first_answered_at?: string | null
          first_delivered_at?: string | null
          first_opened_at?: string | null
          first_rendered_at?: string | null
          id?: string
          last_answered_at?: string | null
          last_event_at?: string
          question_id: string
          reviewed_at?: string | null
          school_id: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          assigned_at?: string
          assignment_id?: string | null
          created_at?: string
          display_count?: number
          exposure_status?: string
          first_answered_at?: string | null
          first_delivered_at?: string | null
          first_opened_at?: string | null
          first_rendered_at?: string | null
          id?: string
          last_answered_at?: string | null
          last_event_at?: string
          question_id?: string
          reviewed_at?: string | null
          school_id?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_question_exposures_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_question_exposures_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_question_exposures_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_question_exposures_student_id_tenant_id_school_id_fkey"
            columns: ["student_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "student_question_exposures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_date: string | null
          campus_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          national_id: string | null
          profile_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          student_number: string
          student_username: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admission_date?: string | null
          campus_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          national_id?: string | null
          profile_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          student_number: string
          student_username?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admission_date?: string | null
          campus_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          national_id?: string | null
          profile_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          student_number?: string
          student_username?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_campus_id_tenant_id_school_id_fkey"
            columns: ["campus_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          invoice_number: string
          issued_on: string | null
          metadata: Json
          notes: string | null
          paid_on: string | null
          period_end: string
          period_start: string
          status: string
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          invoice_number: string
          issued_on?: string | null
          metadata?: Json
          notes?: string | null
          paid_on?: string | null
          period_end: string
          period_start: string
          status?: string
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          invoice_number?: string
          issued_on?: string | null
          metadata?: Json
          notes?: string | null
          paid_on?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_method: string
          receipt_number: string
          received_at: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_method: string
          receipt_number: string
          received_at?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_method?: string
          receipt_number?: string
          received_at?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price: number
          billing_cycle: string
          code: string
          created_at: string
          currency: string
          display_name: string
          features: Json
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          billing_cycle?: string
          code: string
          created_at?: string
          currency?: string
          display_name: string
          features?: Json
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          billing_cycle?: string
          code?: string
          created_at?: string
          currency?: string
          display_name?: string
          features?: Json
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to_user_id: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          closure_reason: string | null
          created_at: string
          created_by: string
          created_for_user_id: string | null
          description: string
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          resolved_by: string | null
          school_id: string | null
          source: string
          status: Database["public"]["Enums"]["ticket_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by: string
          created_for_user_id?: string | null
          description: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string
          created_by?: string
          created_for_user_id?: string | null
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      sync_outbox_entries: {
        Row: {
          attempts: number
          client_mutation_id: string
          created_at: string
          device_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_retry_at: string | null
          operation: string
          payload: Json
          processed_at: string | null
          school_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_mutation_id: string
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          operation: string
          payload?: Json
          processed_at?: string | null
          school_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_mutation_id?: string
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          operation?: string
          payload?: Json
          processed_at?: string | null
          school_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_outbox_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_outbox_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_class_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          school_id: string
          subject_id: string | null
          teacher_id: string
          tenant_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          school_id: string
          subject_id?: string | null
          teacher_id: string
          tenant_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          school_id?: string
          subject_id?: string | null
          teacher_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_class_assignments_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_teacher_id_tenant_id_school_id_fkey"
            columns: ["teacher_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      teachers: {
        Row: {
          campus_id: string | null
          created_at: string
          email: string | null
          employee_number: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          profile_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          email?: string | null
          employee_number?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          profile_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          email?: string | null
          employee_number?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          profile_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_campus_id_tenant_id_school_id_fkey"
            columns: ["campus_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          archived_at: string | null
          auto_renew: boolean
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string | null
          external_reference: string | null
          id: string
          monthly_price: number
          notes: string | null
          paused_at: string | null
          seats: number
          starts_on: string
          status: string
          subscription_plan_id: string
          tenant_id: string
          trial_ends_on: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          external_reference?: string | null
          id?: string
          monthly_price?: number
          notes?: string | null
          paused_at?: string | null
          seats?: number
          starts_on?: string
          status?: string
          subscription_plan_id: string
          tenant_id: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          external_reference?: string | null
          id?: string
          monthly_price?: number
          notes?: string | null
          paused_at?: string | null
          seats?: number
          starts_on?: string
          status?: string
          subscription_plan_id?: string
          tenant_id?: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          archived_at: string | null
          created_at: string
          default_locale: string
          display_name: string
          id: string
          legal_name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          default_locale?: string
          display_name: string
          id?: string
          legal_name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          default_locale?: string
          display_name?: string
          id?: string
          legal_name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          school_id: string
          sort_order: number
          starts_on: string
          status: Database["public"]["Enums"]["academic_period_status"]
          tenant_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          starts_on: string
          status?: Database["public"]["Enums"]["academic_period_status"]
          tenant_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          starts_on?: string
          status?: Database["public"]["Enums"]["academic_period_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      ticket_assignment_history: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_assignee_user_id: string | null
          note: string | null
          previous_assignee_user_id: string | null
          school_id: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_assignee_user_id?: string | null
          note?: string | null
          previous_assignee_user_id?: string | null
          school_id: string
          tenant_id: string
          ticket_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_assignee_user_id?: string | null
          note?: string | null
          previous_assignee_user_id?: string | null
          school_id?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignment_history_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ticket_assignment_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          byte_size: number
          created_at: string
          document_id: string | null
          id: string
          mime_type: string
          original_file_name: string
          school_id: string | null
          storage_path: string
          tenant_id: string
          ticket_message_id: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          document_id?: string | null
          id?: string
          mime_type: string
          original_file_name: string
          school_id?: string | null
          storage_path: string
          tenant_id: string
          ticket_message_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          document_id?: string | null
          id?: string
          mime_type?: string
          original_file_name?: string
          school_id?: string | null
          storage_path?: string
          tenant_id?: string
          ticket_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_message_id_fkey"
            columns: ["ticket_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          message_body: string
          message_type: string
          school_id: string | null
          sender_user_id: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_body: string
          message_type?: string
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_body?: string
          message_type?: string
          school_id?: string | null
          sender_user_id?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_escalations: {
        Row: {
          created_at: string
          cycle_number: number
          due_at: string
          escalation_type: string
          id: string
          school_id: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          cycle_number?: number
          due_at: string
          escalation_type: string
          id?: string
          school_id?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          cycle_number?: number
          due_at?: string
          escalation_type?: string
          id?: string
          school_id?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_escalations_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ticket_sla_escalations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_policies: {
        Row: {
          first_response_minutes: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          first_response_minutes: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
          updated_at?: string
        }
        Update: {
          first_response_minutes?: number
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      ticket_slas: {
        Row: {
          breached_at: string | null
          created_at: string
          cycle_number: number
          first_response_at: string | null
          id: string
          resolution_due_at: string | null
          resolved_at: string | null
          response_due_at: string | null
          ticket_id: string
        }
        Insert: {
          breached_at?: string | null
          created_at?: string
          cycle_number?: number
          first_response_at?: string | null
          id?: string
          resolution_due_at?: string | null
          resolved_at?: string | null
          response_due_at?: string | null
          ticket_id: string
        }
        Update: {
          breached_at?: string | null
          created_at?: string
          cycle_number?: number
          first_response_at?: string | null
          id?: string
          resolution_due_at?: string | null
          resolved_at?: string | null
          response_due_at?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_slas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_configs: {
        Row: {
          academic_year_id: string
          configuration: Json
          created_at: string
          created_by: string
          id: string
          school_id: string
          tenant_id: string
        }
        Insert: {
          academic_year_id: string
          configuration: Json
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          tenant_id: string
        }
        Update: {
          academic_year_id?: string
          configuration?: Json
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_configs_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          created_by: string | null
          day_of_week: number
          ends_at: string
          id: string
          period_number: number
          published_at: string | null
          room_name: string | null
          school_id: string
          starts_at: string
          status: Database["public"]["Enums"]["timetable_entry_status"]
          subject_id: string
          teacher_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          created_by?: string | null
          day_of_week: number
          ends_at: string
          id?: string
          period_number: number
          published_at?: string | null
          room_name?: string | null
          school_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["timetable_entry_status"]
          subject_id: string
          teacher_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          ends_at?: string
          id?: string
          period_number?: number
          published_at?: string | null
          room_name?: string | null
          school_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["timetable_entry_status"]
          subject_id?: string
          teacher_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_academic_year_id_tenant_id_school_id_fkey"
            columns: ["academic_year_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "timetable_entries_class_id_tenant_id_school_id_fkey"
            columns: ["class_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "timetable_entries_subject_id_tenant_id_school_id_fkey"
            columns: ["subject_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
          {
            foreignKeyName: "timetable_entries_teacher_id_tenant_id_school_id_fkey"
            columns: ["teacher_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      timetable_generation_runs: {
        Row: {
          completed_at: string | null
          config_id: string
          created_at: string
          created_by: string
          id: string
          result_summary: Json
          school_id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          config_id: string
          created_at?: string
          created_by: string
          id?: string
          result_summary?: Json
          school_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          config_id?: string
          created_at?: string
          created_by?: string
          id?: string
          result_summary?: Json
          school_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_generation_runs_config_id_tenant_id_school_id_fkey"
            columns: ["config_id", "tenant_id", "school_id"]
            isOneToOne: false
            referencedRelation: "timetable_configs"
            referencedColumns: ["id", "tenant_id", "school_id"]
          },
        ]
      }
      user_push_devices: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          provider_key: string
          push_token: string
          school_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: string
          provider_key?: string
          push_token: string
          school_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          provider_key?: string
          push_token?: string
          school_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_devices_school_id_tenant_id_fkey"
            columns: ["school_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "user_push_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_curriculum_chunks: {
        Args: {
          p_grade_code?: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
          p_subject_code?: string
        }
        Returns: {
          chapter_title: string
          chunk_id: string
          content_text: string
          grade_code: string
          page_end: number
          page_start: number
          section_title: string
          similarity: number
          source_id: string
          source_title: string
          subject_code: string
          version_label: string
        }[]
      }
    }
    Enums: {
      academic_period_status: "planned" | "active" | "completed" | "archived"
      ai_feature_key:
        | "tutor"
        | "teacher_assistant"
        | "exam_generator"
        | "document_understanding"
        | "analytics"
        | "moderation"
        | "search"
      ai_request_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "blocked"
      assignment_status: "draft" | "published" | "closed" | "archived"
      attendance_status: "present" | "absent" | "late" | "excused"
      content_status: "draft" | "published" | "archived"
      conversation_scope: "direct" | "school" | "class" | "support"
      enrollment_status: "active" | "transferred" | "completed" | "withdrawn"
      exam_session_status: "draft" | "scheduled" | "completed" | "cancelled"
      grade_publication_status:
        | "pending"
        | "approved"
        | "rejected"
        | "published"
      import_batch_status: "previewed" | "committed" | "failed" | "cancelled"
      membership_status: "invited" | "active" | "suspended" | "revoked"
      notification_type: "announcement" | "direct" | "reminder" | "alert"
      record_status: "active" | "inactive" | "archived"
      role_scope: "platform" | "tenant" | "school" | "class"
      submission_status: "draft" | "submitted" | "late" | "graded" | "returned"
      tenant_status:
        | "demo"
        | "validation"
        | "active"
        | "read_only"
        | "suspended"
        | "archived"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "waiting" | "resolved" | "closed"
      timetable_entry_status: "draft" | "published" | "archived"
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
  public: {
    Enums: {
      academic_period_status: ["planned", "active", "completed", "archived"],
      ai_feature_key: [
        "tutor",
        "teacher_assistant",
        "exam_generator",
        "document_understanding",
        "analytics",
        "moderation",
        "search",
      ],
      ai_request_status: [
        "queued",
        "processing",
        "completed",
        "failed",
        "blocked",
      ],
      assignment_status: ["draft", "published", "closed", "archived"],
      attendance_status: ["present", "absent", "late", "excused"],
      content_status: ["draft", "published", "archived"],
      conversation_scope: ["direct", "school", "class", "support"],
      enrollment_status: ["active", "transferred", "completed", "withdrawn"],
      exam_session_status: ["draft", "scheduled", "completed", "cancelled"],
      grade_publication_status: [
        "pending",
        "approved",
        "rejected",
        "published",
      ],
      import_batch_status: ["previewed", "committed", "failed", "cancelled"],
      membership_status: ["invited", "active", "suspended", "revoked"],
      notification_type: ["announcement", "direct", "reminder", "alert"],
      record_status: ["active", "inactive", "archived"],
      role_scope: ["platform", "tenant", "school", "class"],
      submission_status: ["draft", "submitted", "late", "graded", "returned"],
      tenant_status: [
        "demo",
        "validation",
        "active",
        "read_only",
        "suspended",
        "archived",
      ],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "in_progress", "waiting", "resolved", "closed"],
      timetable_entry_status: ["draft", "published", "archived"],
    },
  },
} as const
