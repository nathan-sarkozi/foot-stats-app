SET local check_function_bodies = off;

CREATE TABLE "public"."matches" (
  "id"               uuid         NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "match_date"       date         NOT NULL,
  "opponent"         text         NOT NULL,
  "competition_type" text         NOT NULL,
  "team_score"       integer      DEFAULT 0,
  "opponent_score"   integer      DEFAULT 0,
  "match_result"     character(1),
  CONSTRAINT "matches_competition_type_check" CHECK ((competition_type = ANY (ARRAY['LEAGUE'::text, 'CUP'::text, 'FRIENDLY'::text]))),
  CONSTRAINT "matches_pkey" PRIMARY KEY (id),
  "player_id"        uuid         DEFAULT auth.uid()
);

ALTER TABLE "public"."matches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."players" (
  "id"         uuid                     NOT NULL,
  "username"   text                     NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "players_pkey" PRIMARY KEY (id),
  CONSTRAINT "players_username_key" UNIQUE (username)
);

ALTER TABLE "public"."players"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                 uuid                   NOT NULL,
  "display_name"       text                   NOT NULL,
  "club"               character varying(100),
  "category"           character varying(50),
  "preferred_position" character varying(10),
  "foot_preference"    character varying(20),
  "jersey_number"      integer,
  "height"             integer,
  "weight"             integer,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."statistics" (
  "id"              uuid                  NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "player_id"       uuid                  NOT NULL,
  "match_id"        uuid                  NOT NULL,
  "has_played"      boolean               DEFAULT true,
  "minutes_played"  integer               DEFAULT 0,
  "goals"           integer               DEFAULT 0,
  "assists"         integer               DEFAULT 0,
  "yellow_cards"    integer               DEFAULT 0,
  "red_cards"       integer               DEFAULT 0,
  "position_played" character varying(10),
  "is_motm"         boolean               DEFAULT false,
  CONSTRAINT "statistics_minutes_played_check" CHECK (((minutes_played >= 0) AND (minutes_played <= 120))),
  CONSTRAINT "statistics_pkey" PRIMARY KEY (id),
  CONSTRAINT "statistics_player_id_match_id_key" UNIQUE (player_id, match_id)
);

ALTER TABLE "public"."statistics"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, split_part(new.email, '@', 1)); 
  RETURN new;
END;
$function$;

ALTER TABLE "public"."players"
  ADD CONSTRAINT "players_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id);

ALTER TABLE "public"."statistics"
  ADD CONSTRAINT "statistics_match_id_fkey" FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE "public"."statistics"
  ADD CONSTRAINT "statistics_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Allow authenticated read" ON "public"."matches"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Auth users delete matches" ON "public"."matches"
  FOR DELETE
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Auth users insert matches" ON "public"."matches"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Auth users update matches" ON "public"."matches"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Lecture publique des matchs" ON "public"."matches"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Allow authenticated read" ON "public"."players"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Owner write access" ON "public"."profiles"
  FOR ALL
  TO "authenticated"
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "Public read access" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Users can update own profile" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Allow authenticated read" ON "public"."statistics"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Lecture publique des stats" ON "public"."statistics"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Players update own stats" ON "public"."statistics"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = player_id));

CREATE POLICY "Écriture privée des stats" ON "public"."statistics"
  FOR ALL
  TO "authenticated"
  USING ((player_id = auth.uid()))
  WITH CHECK ((player_id = auth.uid()));

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."matches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."players" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."players" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."players" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."players" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistics" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."statistics" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistics" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistics" TO "service_role";

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE POLICY "Écriture privée des matchs" ON "public"."matches"
  FOR ALL
  TO "authenticated"
  USING ((player_id = auth.uid()))
  WITH CHECK ((player_id = auth.uid()));

