BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.save_match_with_statistics(
  p_match_date date,
  p_opponent text,
  p_competition_type text,
  p_team_score integer,
  p_opponent_score integer,
  p_has_played boolean,
  p_is_motm boolean,
  p_minutes_played integer,
  p_goals integer,
  p_assists integer,
  p_yellow_cards integer,
  p_red_cards integer,
  p_position_played text DEFAULT NULL,
  p_match_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_player_id uuid := auth.uid();
  v_match_id uuid;
  v_match_result character(1);
  v_count integer;
BEGIN
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication required';
  END IF;

  IF p_match_date IS NULL
     OR p_opponent IS NULL
     OR char_length(p_opponent) NOT BETWEEN 2 AND 100
     OR p_competition_type IS NULL
     OR p_competition_type NOT IN ('LEAGUE', 'CUP', 'FRIENDLY')
     OR p_team_score IS NULL
     OR p_team_score NOT BETWEEN 0 AND 99
     OR p_opponent_score IS NULL
     OR p_opponent_score NOT BETWEEN 0 AND 99
     OR p_has_played IS NULL
     OR p_is_motm IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid match data';
  END IF;

  IF NOT p_has_played THEN
    p_is_motm := false;
    p_position_played := NULL;
    p_minutes_played := 0;
    p_goals := 0;
    p_assists := 0;
  ELSE
    p_position_played := nullif(btrim(p_position_played), '');
  END IF;

  -- Substitutes can receive disciplinary sanctions without entering the pitch.
  IF p_minutes_played IS NULL
     OR p_minutes_played NOT BETWEEN 0 AND 120
     OR p_goals IS NULL OR p_goals NOT BETWEEN 0 AND 50
     OR p_assists IS NULL OR p_assists NOT BETWEEN 0 AND 50
     OR p_yellow_cards IS NULL
     OR p_yellow_cards NOT BETWEEN 0 AND 2
     OR p_red_cards IS NULL
     OR p_red_cards NOT BETWEEN 0 AND 1
     OR (
       p_position_played IS NOT NULL
       AND p_position_played NOT IN (
         'BU', 'AG', 'AD', 'MOC', 'MC',
         'MDC', 'DG', 'DD', 'DC', 'GB'
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid statistics data';
  END IF;

  v_match_result := CASE
    WHEN p_team_score > p_opponent_score THEN 'V'
    WHEN p_team_score < p_opponent_score THEN 'D'
    ELSE 'N'
  END;

  IF p_match_id IS NULL THEN
    INSERT INTO public.matches (
      player_id, match_date, opponent, competition_type,
      team_score, opponent_score, match_result
    )
    VALUES (
      v_player_id, p_match_date, p_opponent, p_competition_type,
      p_team_score, p_opponent_score, v_match_result
    )
    RETURNING id INTO v_match_id;

    INSERT INTO public.statistics (
      player_id, match_id, has_played, is_motm, position_played,
      minutes_played, goals, assists, yellow_cards, red_cards
    )
    VALUES (
      v_player_id, v_match_id, p_has_played, p_is_motm,
      p_position_played, p_minutes_played, p_goals, p_assists,
      p_yellow_cards, p_red_cards
    );
  ELSE
    UPDATE public.matches AS m
    SET match_date = p_match_date,
        opponent = p_opponent,
        competition_type = p_competition_type,
        team_score = p_team_score,
        opponent_score = p_opponent_score,
        match_result = v_match_result
    WHERE m.id = p_match_id
      AND m.player_id = v_player_id
    RETURNING m.id INTO v_match_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'Match unavailable';
    END IF;

    UPDATE public.statistics AS s
    SET has_played = p_has_played,
        is_motm = p_is_motm,
        position_played = p_position_played,
        minutes_played = p_minutes_played,
        goals = p_goals,
        assists = p_assists,
        yellow_cards = p_yellow_cards,
        red_cards = p_red_cards
    WHERE s.match_id = v_match_id
      AND s.player_id = v_player_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'Statistics unavailable';
    END IF;
  END IF;

  RETURN v_match_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_match_with_statistics(
  date, text, text, integer, integer, boolean, boolean,
  integer, integer, integer, integer, integer, text, uuid
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.save_match_with_statistics(
  date, text, text, integer, integer, boolean, boolean,
  integer, integer, integer, integer, integer, text, uuid
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
