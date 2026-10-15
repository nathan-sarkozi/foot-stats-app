BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.matches
  ADD CONSTRAINT matches_id_player_id_key
  UNIQUE (id, player_id);

ALTER TABLE public.statistics
  DROP CONSTRAINT statistics_match_id_fkey,
  ADD CONSTRAINT statistics_match_id_fkey
    FOREIGN KEY (match_id, player_id)
    REFERENCES public.matches (id, player_id)
    ON UPDATE NO ACTION
    ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
