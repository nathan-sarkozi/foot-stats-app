CREATE OR REPLACE VIEW public.player_season_aggregates
WITH (security_invoker = true) AS
SELECT
  player_id,
  count(id) AS matches_played,
  sum(goals) AS total_goals,
  sum(assists) AS total_assists,
  sum(minutes_played) AS total_minutes
FROM public.statistics
GROUP BY player_id;

GRANT SELECT ON public.player_season_aggregates
TO authenticated, service_role;
