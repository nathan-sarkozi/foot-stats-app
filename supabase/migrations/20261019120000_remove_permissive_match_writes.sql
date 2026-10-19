BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- These historical policies allow any authenticated user to write another
-- player's matches. Permissive policies are combined with OR, so the existing
-- owner-only policies cannot restrict them. Production already omits them;
-- IF EXISTS also makes this correction safe for that policy state.
DROP POLICY IF EXISTS "Auth users delete matches" ON public.matches;
DROP POLICY IF EXISTS "Auth users insert matches" ON public.matches;
DROP POLICY IF EXISTS "Auth users update matches" ON public.matches;

-- Keep the existing authenticated reads and owner-only write policies on
-- matches and statistics, including their USING and WITH CHECK expressions.

COMMIT;
