-- Test fixture only. Execute against a disposable local PostgreSQL database
-- after the historical migration and SEC-003, before the two new migrations.
-- Never execute this file in production.
-- The runner supplies auth.users, auth.uid(), auth.role() and the API roles.

BEGIN;

-- Reproduce the current production policies supplied for the audit. The
-- historical migration still contains SEC-001's three permissive match write
-- policies; replacing them here keeps that separate migration drift visible
-- without changing any production migration or policy.
DROP POLICY "Auth users delete matches" ON public.matches;
DROP POLICY "Auth users insert matches" ON public.matches;
DROP POLICY "Auth users update matches" ON public.matches;

CREATE POLICY "Strict Match Owner Control" ON public.matches
  FOR ALL TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- Production already grants SELECT to anon. Preserve that grant in the test
-- so SEC-003 is checked through underlying RLS, rather than a missing grant.
GRANT SELECT ON public.player_season_aggregates TO anon, authenticated;

-- All identifiers, addresses and statistics below are synthetic. The existing
-- on_auth_user_created trigger creates their corresponding public.profiles.
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'fixture-player-1@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'fixture-player-2@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'fixture-player-3@example.invalid');

INSERT INTO public.matches (
  id, player_id, match_date, opponent, competition_type,
  team_score, opponent_score, match_result
)
SELECT
  ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  CASE
    WHEN i <= 8 THEN '10000000-0000-4000-8000-000000000001'::uuid
    WHEN i <= 16 THEN '10000000-0000-4000-8000-000000000002'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid
  END,
  DATE '2026-08-01' + (i - 1),
  'Synthetic opponent ' || i,
  CASE i % 3 WHEN 0 THEN 'CUP' WHEN 1 THEN 'LEAGUE' ELSE 'FRIENDLY' END,
  CASE WHEN i = 23 THEN NULL ELSE 2 END,
  CASE WHEN i = 23 THEN NULL ELSE 1 END,
  CASE WHEN i = 23 THEN NULL ELSE 'V' END
FROM generate_series(1, 23) AS fixture(i);

INSERT INTO public.statistics (
  id, player_id, match_id, has_played, minutes_played, goals, assists,
  yellow_cards, red_cards, position_played, is_motm
)
SELECT
  ('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  CASE
    WHEN i <= 8 THEN '10000000-0000-4000-8000-000000000001'::uuid
    WHEN i <= 16 THEN '10000000-0000-4000-8000-000000000002'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid
  END,
  ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  CASE WHEN i = 23 THEN NULL ELSE i NOT IN (7, 15) END,
  CASE WHEN i = 23 THEN NULL WHEN i IN (7, 15) THEN 0 ELSE 60 END,
  CASE WHEN i = 23 THEN NULL WHEN i IN (7, 15) THEN 0 ELSE i % 3 END,
  CASE WHEN i = 23 THEN NULL WHEN i IN (7, 15) THEN 0 ELSE i % 2 END,
  CASE WHEN i = 23 THEN NULL WHEN i IN (7, 15) THEN 1 ELSE 0 END,
  CASE WHEN i = 23 THEN NULL WHEN i = 15 THEN 1 ELSE 0 END,
  CASE WHEN i IN (7, 15, 23) THEN NULL ELSE 'MC' END,
  CASE WHEN i = 23 THEN NULL ELSE i = 1 END
FROM generate_series(1, 23) AS fixture(i);

-- Deliberately fail an otherwise valid second write, after the RPC has
-- inserted or updated its match. This helper is local test infrastructure;
-- it is not part of either application migration.
CREATE FUNCTION public.fail_test_statistics_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NEW.goals = 13 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.matches AS m
      WHERE m.id = NEW.match_id AND m.player_id = NEW.player_id
    ) THEN
      RAISE EXCEPTION 'Test fixture cannot observe the first match write';
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Test-only statistics write failure';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_test_statistics_write()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER fail_test_statistics_write
BEFORE INSERT OR UPDATE ON public.statistics
FOR EACH ROW EXECUTE FUNCTION public.fail_test_statistics_write();

COMMIT;
