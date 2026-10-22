BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.season_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  season_start integer NOT NULL
    CHECK (season_start BETWEEN 1 AND 9998),
  metric text NOT NULL
    CHECK (metric IN ('goals', 'assists', 'appearances', 'motm')),
  target integer NOT NULL CHECK (target > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_goals_player_season_metric_key
    UNIQUE (player_id, season_start, metric)
);

ALTER TABLE public.season_goals ENABLE ROW LEVEL SECURITY;

-- Override the project's broad defaults for this new table only. Trusted
-- service_role administration/restoration retains the existing ALL convention;
-- this role bypasses RLS and must never be exposed to browser clients.
REVOKE ALL ON TABLE public.season_goals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.season_goals TO service_role;

GRANT SELECT, DELETE ON TABLE public.season_goals TO authenticated;
GRANT INSERT (season_start, metric, target)
  ON TABLE public.season_goals TO authenticated;
GRANT UPDATE (target)
  ON TABLE public.season_goals TO authenticated;

CREATE POLICY "Players read own season goals"
  ON public.season_goals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = player_id);

CREATE POLICY "Players insert own season goals"
  ON public.season_goals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = player_id);

CREATE POLICY "Players update own season goals"
  ON public.season_goals FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = player_id)
  WITH CHECK ((SELECT auth.uid()) = player_id);

CREATE POLICY "Players delete own season goals"
  ON public.season_goals FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = player_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
