CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE hotels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,brand_name text,slug text UNIQUE NOT NULL,workspace_slug text UNIQUE,
      country_code text,city text,timezone text NOT NULL,timezone_integrity_status text,default_language text NOT NULL DEFAULT 'es',whatsapp_number text,
      support_email text,support_phone text,brand_color text,secondary_color text,logo_url text,favicon_url text,subscription_plan text,description text,
      address text,phone text,check_in_time text,check_out_time text,ai_auto_reply_enabled boolean NOT NULL DEFAULT true,hotel_live_mode boolean DEFAULT true,metadata jsonb DEFAULT '{"live_automation_gates_verified":true}',
      live_mode_enabled_at timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE hotel_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid NOT NULL REFERENCES hotels ON DELETE CASCADE,user_id uuid,email text,platform_role text,updated_at timestamptz,
      role text NOT NULL,status text NOT NULL,is_default boolean,invited_at timestamptz,accepted_at timestamptz,UNIQUE(hotel_id,user_id));
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,banned_until timestamptz);
