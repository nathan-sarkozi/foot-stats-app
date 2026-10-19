import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { matchIdSchema, parseMatchFormData, toMatchRpcArgs } from '../src/app/dashboard/match-form.ts'

// Linux, Node 24+, Docker, and the two pinned images below are required.
// Run: node --test --test-isolation=none tests/match-writes.test.mjs
// Images are inspected, never downloaded automatically by this runner.
// No .env loading, remote URLs, published ports, existing volumes or real
// credentials. Docker is explicitly restricted to this machine's Unix socket.
const dockerSocket = 'unix:///var/run/docker.sock'
const postgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.113'
const postgrestImage = 'postgrest/postgrest:v14.5'
const localSecret = 'footstats-isolated-tests-only-secret-at-least-32-bytes'
const root = fileURLToPath(new URL('../', import.meta.url))
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const m1 = migration('20261015140000_atomic_match_writes.sql')
const m2 = migration('20261015140100_enforce_match_statistic_ownership.sql')
const rlsCorrection = migration('20261019120000_remove_permissive_match_writes.sql')
const unsafePolicyNames = [
  'Auth users delete matches', 'Auth users insert matches', 'Auth users update matches',
]
const player = i => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const match = i => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const stat = i => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const quote = value => `'${String(value).replaceAll("'", "''")}'`

function docker(args, input) {
  const result = spawnSync('docker', ['--host', dockerSocket, ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.status, 0, `docker ${args[0]} failed: ${result.stderr || result.error || result.stdout}`)
  return (args[0] === 'logs' ? result.stdout + result.stderr : result.stdout).trim()
}

function form(overrides = {}) {
  const data = new FormData()
  for (const [name, value] of Object.entries({
    match_date: '2026-10-15', opponent: 'Synthetic opponent', competition_type: 'LEAGUE',
    team_score: '2', opponent_score: '1', has_played: 'true', is_motm: 'on',
    position_played: ' MC ', minutes_played: '80', goals: '1', assists: '2',
    yellow_cards: '0', red_cards: '0', ...overrides,
  })) {
    if (value !== null) data.set(name, value)
  }
  return data
}

test('form parsing preserves discipline independently of participation', async t => {
  await t.test('non-playing substitute keeps cards and neutralizes playing fields', () => {
    const parsed = parseMatchFormData(form({ has_played: null, yellow_cards: '2', red_cards: '1' }))
    assert.equal(parsed.success, true)
    assert.deepEqual({ ...parsed.data, match_date: undefined, opponent: undefined, competition_type: undefined,
      team_score: undefined, opponent_score: undefined }, {
      match_date: undefined, opponent: undefined, competition_type: undefined, team_score: undefined,
      opponent_score: undefined, has_played: false, is_motm: false, position_played: null,
      minutes_played: 0, goals: 0, assists: 0, yellow_cards: 2, red_cards: 1,
    })
    const args = toMatchRpcArgs(parsed.data)
    assert.equal('p_match_id' in args, false)
    assert.equal('p_player_id' in args, false)
    assert.equal('stat_id' in args, false)
    assert.equal(toMatchRpcArgs(parsed.data, match(1)).p_match_id, match(1))
  })
  await t.test('non-playing substitute without cards keeps zeroes', () => {
    const parsed = parseMatchFormData(form({ has_played: null }))
    assert.equal(parsed.success, true)
    assert.equal(parsed.data.yellow_cards, 0)
    assert.equal(parsed.data.red_cards, 0)
  })
  await t.test('played match preserves playing data and trims position', () => {
    const parsed = parseMatchFormData(form())
    assert.equal(parsed.success, true)
    assert.equal(parsed.data.position_played, 'MC')
    assert.equal(parsed.data.minutes_played, 80)
    assert.equal(parsed.data.is_motm, true)
  })
  await t.test('invalid cards, fractions, dates and UUIDs are rejected', () => {
    for (const values of [
      { has_played: null, yellow_cards: '3' }, { has_played: null, red_cards: '2' },
      { has_played: null, yellow_cards: '0.5' }, { goals: '1.5' },
      { minutes_played: '121' }, { match_date: '2026-02-30' }, { position_played: 'invalid' },
    ]) assert.equal(parseMatchFormData(form(values)).success, false, JSON.stringify(values))
    assert.equal(matchIdSchema.safeParse('invalid').success, false)
    assert.equal(matchIdSchema.safeParse(match(1)).success, true)
    assert.equal(matchIdSchema.parse('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })
})

test('isolated PostgreSQL and PostgREST match writes', { timeout: 240_000 }, async t => {
  const suffix = randomUUID().slice(0, 8)
  const network = `footstats-test-${suffix}`
  const db = `footstats-pg-${suffix}`
  const api = `footstats-rest-${suffix}`
  let networkCreated = false
  let dbStarted = false
  let apiStarted = false
  const psqlArgs = ['exec', '-i', db, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'footstats_test']
  const sql = text => docker(psqlArgs, text)
  const json = text => JSON.parse(sql(text))
  const asPlayer = (text, i = 1) => sql(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '${JSON.stringify({ role: 'authenticated', sub: player(i) })}', true);
    ${text}; ROLLBACK;`).split('\n').slice(1).join('\n')
  const snapshot = () => json(`SELECT jsonb_build_object(
    'matches', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.matches m),
    'statistics', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.statistics s));`)
  const security = () => json(`SELECT jsonb_build_object(
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname) FROM pg_policies p
      WHERE schemaname='public' AND tablename IN ('matches','statistics')),
    'tables', (SELECT jsonb_agg(jsonb_build_object('name', relname, 'rls', relrowsecurity,
      'forced', relforcerowsecurity, 'acl', relacl::text) ORDER BY relname)
      FROM pg_class WHERE oid IN ('public.matches'::regclass,'public.statistics'::regclass)));`)
  const sqlCall = (id = null, goals = 1) => `public.save_match_with_statistics(
    '2026-10-15','Synthetic SQL opponent','LEAGUE',2,1,true,false,80,${goals},0,0,0,'MC',${id === null ? 'NULL' : quote(id)})`
  const payload = changes => ({
    p_match_date: '2026-10-15', p_opponent: 'Synthetic RPC opponent', p_competition_type: 'LEAGUE',
    p_team_score: 2, p_opponent_score: 1, p_has_played: true, p_is_motm: true,
    p_minutes_played: 80, p_goals: 1, p_assists: 2, p_yellow_cards: 0, p_red_cards: 0,
    p_position_played: 'MC', ...changes,
  })
  const token = (role, i = 1) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role,
      ...(role === 'authenticated' ? { sub: player(i) } : {}), exp: Math.floor(Date.now() / 1000) + 600 })}`
    return `${body}.${createHmac('sha256', localSecret).update(body).digest('base64url')}`
  }
  let baseUrl
  let apiAddress
  const request = async (path, { role = 'authenticated', i = 1, body, method = body ? 'POST' : 'GET', timeoutMs = 10_000 } = {}) => {
    assert.equal(new URL(baseUrl).hostname, apiAddress)
    const response = await fetch(`${baseUrl}/${path}`, {
      method, headers: { Authorization: `Bearer ${token(role, i)}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs),
    })
    const raw = await response.text()
    return { status: response.status, data: raw ? JSON.parse(raw) : null }
  }
  const rpc = body => request('rpc/save_match_with_statistics', { body })
  const expectRpcError = async (body, code) => {
    const before = snapshot()
    const result = await rpc(body)
    assert.ok(result.status >= 400, JSON.stringify(result))
    assert.equal(result.data.code, code)
    assert.deepEqual(snapshot(), before)
    return result
  }

  try {
    docker(['image', 'inspect', postgresImage, '--format', '{{.Id}}'])
    docker(['image', 'inspect', postgrestImage, '--format', '{{.Id}}'])
    docker(['network', 'create', '--internal', network])
    networkCreated = true
    docker(['run', '--detach', '--name', db, '--network', network, '--read-only',
      '--tmpfs', '/tmp:rw,nosuid,size=384m', '--shm-size', '64m', '--user', 'postgres',
      '--entrypoint', '/bin/sh', postgresImage, '-c',
      'initdb -D /tmp/footstats-pg --auth=trust --no-locale -E UTF8 >/tmp/initdb.log && printf "host all all all trust\\n" >> /tmp/footstats-pg/pg_hba.conf && exec postgres -D /tmp/footstats-pg -c listen_addresses=* -c unix_socket_directories=/tmp'])
    dbStarted = true
    let ready = false
    for (let i = 0; i < 100; i++) {
      const check = spawnSync('docker', ['--host', dockerSocket, 'exec', db, 'pg_isready', '-h', '/tmp', '-U', 'postgres'], { encoding: 'utf8' })
      if (check.status === 0) { ready = true; break }
      await delay(100)
    }
    assert.ok(ready, `PostgreSQL not ready: ${docker(['logs', db])}`)
    docker(['exec', '-i', db, 'psql', '-h', '/tmp', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], 'CREATE DATABASE footstats_test;')
    // All subsequent psql calls also use the local Unix socket inside this container.
    psqlArgs.splice(5, 0, '-h', '/tmp')
    sql(`CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'test-only';
      GRANT anon, authenticated TO authenticator;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`)
    sql(migration('20261001123849_remote_schema.sql'))
    sql(migration('20261014132248_secure_player_season_aggregates.sql'))
    await t.test('all corrective migrations replay on an empty reconstructed database', () => {
      sql('CREATE DATABASE footstats_empty TEMPLATE footstats_test;')
      const emptyArgs = [...psqlArgs]
      emptyArgs[emptyArgs.length - 1] = 'footstats_empty'
      docker(emptyArgs, m1)
      docker(emptyArgs, m2)
      docker(emptyArgs, rlsCorrection)
      assert.equal(docker(emptyArgs, 'SELECT count(*) FROM public.statistics;'), '0')
      assert.equal(docker(emptyArgs, `SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='matches'
        AND policyname IN (${unsafePolicyNames.map(quote).join(',')});`), '0')
      assert.equal(docker(emptyArgs, `SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename IN ('matches','statistics')
        AND policyname IN ('Écriture privée des matchs','Écriture privée des stats');`), '2')
      assert.equal(docker(emptyArgs, `SELECT reloptions::text FROM pg_class
        WHERE oid='public.player_season_aggregates'::regclass;`), '{security_invoker=true}')
      assert.match(docker(emptyArgs, `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname='statistics_match_id_fkey';`), /FOREIGN KEY \(match_id, player_id\)/)
      assert.equal(docker(emptyArgs, `SELECT has_function_privilege('authenticated',p.oid,'EXECUTE')||':'||
        has_function_privilege('anon',p.oid,'EXECUTE')||':'||has_function_privilege('service_role',p.oid,'EXECUTE')
        FROM pg_proc p WHERE p.proname='save_match_with_statistics';`), 'true:false:false')
      sql('DROP DATABASE footstats_empty;')
    })
    sql(readFileSync(new URL('../supabase/tests/match_writes.sql', import.meta.url), 'utf8'))
    const initial = snapshot()
    await t.test('historical permissive match policies really allow cross-owner writes', () => {
      assert.equal(asPlayer(`UPDATE public.matches SET opponent='Historical unsafe update'
        WHERE id=${quote(match(9))}; SELECT opponent FROM public.matches WHERE id=${quote(match(9))}`),
      'Historical unsafe update')
      assert.equal(asPlayer(`DELETE FROM public.matches WHERE id=${quote(match(9))};
        SELECT count(*) FROM public.statistics WHERE match_id=${quote(match(9))}`), '0')
      assert.equal(asPlayer(`INSERT INTO public.matches(id,player_id,match_date,opponent,competition_type)
        VALUES(${quote(match(91))},${quote(player(2))},'2026-10-15','Historical unsafe insert','LEAGUE');
        SELECT player_id FROM public.matches WHERE id=${quote(match(91))}`), player(2))
      assert.deepEqual(snapshot(), initial)
    })
    await t.test('RLS correction removes only unsafe policies and preserves data, ACL and RLS', () => {
      const before = security()
      assert.equal(before.policies.filter(policy => policy.tablename === 'matches'
        && unsafePolicyNames.includes(policy.policyname)).length, 3)
      sql(rlsCorrection)
      assert.deepEqual(snapshot(), initial)
      assert.deepEqual(security(), {
        ...before,
        policies: before.policies.filter(policy => policy.tablename !== 'matches'
          || !unsafePolicyNames.includes(policy.policyname)),
      })
      // Production already omits these policies. Reapplying the correction
      // proves the same safe policy state does not require recreating them.
      const corrected = security()
      sql(rlsCorrection)
      assert.deepEqual(security(), corrected)
      assert.deepEqual(snapshot(), initial)
    })
    const initialSecurity = security()
    assert.equal(initial.statistics.length, 23)
    sql(m1)
    assert.deepEqual(snapshot(), initial)
    assert.deepEqual(security(), initialSecurity)
    assert.equal(sql('SHOW server_version_num;'), '170006')

    docker(['run', '--detach', '--name', api, '--network', network, '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '-e', `PGRST_DB_URI=postgresql://authenticator:test-only@${db}:5432/footstats_test`,
      '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
      '-e', 'PGRST_DB_CONFIG=false', '-e', `PGRST_JWT_SECRET=${localSecret}`, postgrestImage])
    apiStarted = true
    // Internal-only Docker networks do not publish ports. On Linux, use the
    // address of this newly created container directly from the Docker host.
    const networks = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', api]))
    assert.deepEqual(Object.keys(networks), [network])
    apiAddress = networks[network].IPAddress
    assert.match(apiAddress, /^\d+\.\d+\.\d+\.\d+$/)
    baseUrl = `http://${apiAddress}:3000`
    let apiReady = false
    for (let i = 0; i < 30; i++) {
      try { if ((await request('matches?select=id&limit=1', { timeoutMs: 1000 })).status === 200) { apiReady = true; break } } catch { /* startup */ }
      await delay(100)
    }
    assert.ok(apiReady, `PostgREST not ready: ${docker(['logs', api])}`)

    await t.test('fresh replay and 23 synthetic rows retain SEC-003 protection', async () => {
      assert.equal((await request('statistics?select=id')).data.length, 23)
      assert.deepEqual((await request('statistics?select=id', { role: 'anon' })).data, [])
      assert.deepEqual((await request('player_season_aggregates', { role: 'anon' })).data, [])
      assert.equal((await request('player_season_aggregates')).data.length, 3)
      assert.equal(sql("SELECT reloptions::text FROM pg_class WHERE oid='public.player_season_aggregates'::regclass;"), '{security_invoker=true}')
    })

    await t.test('corrected policies reject spoofed owners and preserve authenticated public reads', async () => {
      assert.equal((await request('matches?select=id')).data.length, 23)
      assert.deepEqual((await request('matches?select=id', { role: 'anon' })).data, [])
      const spoof = await request('matches', { body: {
        player_id: player(2), match_date: '2026-10-15', opponent: 'Forbidden owner', competition_type: 'LEAGUE',
      } })
      assert.equal(spoof.data.code, '42501')
      const transfer = await request(`matches?id=eq.${match(1)}`, {
        method: 'PATCH', body: { player_id: player(2) },
      })
      assert.equal(transfer.data.code, '42501')
      const statTransfer = await request(`statistics?id=eq.${stat(1)}`, {
        method: 'PATCH', body: { player_id: player(2) },
      })
      assert.equal(statTransfer.data.code, '42501')
      for (const table of ['matches', 'statistics']) {
        const insert = await request(table, { role: 'anon', body: table === 'matches'
          ? { player_id: player(1), match_date: '2026-10-15', opponent: 'Anonymous write', competition_type: 'LEAGUE' }
          : { player_id: player(1), match_id: match(1) } })
        assert.equal(insert.data.code, '42501')
        const id = table === 'matches' ? match(1) : stat(1)
        assert.equal((await request(`${table}?id=eq.${id}`, { role: 'anon', method: 'PATCH',
          body: table === 'matches' ? { opponent: 'Anonymous change' } : { goals: 9 } })).status, 204)
        assert.equal((await request(`${table}?id=eq.${id}`, { role: 'anon', method: 'DELETE' })).status, 204)
      }
      assert.deepEqual(snapshot(), initial)
    })

    for (const phase of ['before composite FK', 'after composite FK']) {
      if (phase === 'after composite FK') {
        await t.test('composite migration aborts safely if existing ownership is inconsistent', () => {
          sql(`INSERT INTO statistics(id,player_id,match_id) VALUES(${quote(stat(99))},${quote(player(1))},${quote(match(9))});`)
          assert.throws(() => sql(m2), /violates foreign key constraint/)
          assert.equal(sql("SELECT count(*) FROM pg_constraint WHERE conname='matches_id_player_id_key';"), '0')
          assert.match(sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='statistics_match_id_fkey';"), /FOREIGN KEY \(match_id\) /)
          sql(`DELETE FROM statistics WHERE id=${quote(stat(99))};`)
          assert.deepEqual(snapshot(), initial)
        })
        await t.test('composite migration preserves every row, RLS and ACL', async () => {
          sql(m2)
          assert.deepEqual(snapshot(), initial)
          assert.deepEqual(security(), initialSecurity)
          let reloaded = false
          for (let i = 0; i < 100; i++) {
            const result = await request(`matches?id=eq.${match(1)}&select=id,statistics(id)`)
            if (result.status === 200 && !Array.isArray(result.data[0].statistics)) { reloaded = true; break }
            await delay(100)
          }
          assert.ok(reloaded, 'PostgREST schema cache did not acquire the one-to-one relation')
        })
      }

      await t.test(`${phase}: join cardinality, dashboard/profile queries and edit reads`, async () => {
        const inverse = await request(`matches?id=eq.${match(1)}&select=id,statistics(id)`)
        assert.equal(inverse.status, 200, JSON.stringify(inverse))
        assert.deepEqual(inverse.data[0].statistics, phase.startsWith('before') ? [{ id: stat(1) }] : { id: stat(1) })
        const fields = 'has_played,minutes_played,goals,assists,yellow_cards,red_cards,is_motm,position_played,matches!inner(id,match_date,opponent,team_score,opponent_score,competition_type)'
        const joined = await request(`statistics?player_id=eq.${player(1)}&select=${fields}`)
        assert.equal(joined.status, 200, JSON.stringify(joined))
        assert.equal(joined.data.length, 8)
        assert.ok(joined.data.every(row => row.matches && !Array.isArray(row.matches)))
        const profileFields = 'goals,assists,yellow_cards,red_cards,minutes_played,has_played,is_motm,position_played,matches!inner(id,opponent,match_date,competition_type,team_score,opponent_score)'
        assert.equal((await request(`statistics?player_id=eq.${player(2)}&select=${profileFields}`)).data.length, 8)
        assert.equal((await request(`statistics?select=id,profiles(id)&limit=1`)).status, 200)
        assert.equal((await request(`matches?select=id,profiles(id)&limit=1`)).status, 200)
        assert.equal((await request(`matches?id=eq.${match(1)}&player_id=eq.${player(1)}&select=*`)).data.length, 1)
        assert.equal((await request(`statistics?match_id=eq.${match(1)}&player_id=eq.${player(1)}&select=*`)).data.length, 1)
      })

      await t.test(`${phase}: authenticated RPC, non-playing discipline, edit and cascade delete`, async () => {
        for (const cards of [{ p_yellow_cards: 0, p_red_cards: 0 }, { p_yellow_cards: 2, p_red_cards: 1 }]) {
          const created = await rpc(payload({ p_has_played: false, ...cards }))
          assert.equal(created.status, 200, JSON.stringify(created))
          assert.equal(matchIdSchema.safeParse(created.data).success, true)
          const id = created.data
          const saved = json(`SELECT to_jsonb(s) FROM statistics s WHERE match_id=${quote(id)};`)
          assert.equal(saved.player_id, player(1))
          assert.equal(saved.has_played, false)
          assert.equal(saved.minutes_played, 0)
          assert.equal(saved.goals, 0)
          assert.equal(saved.assists, 0)
          assert.equal(saved.position_played, null)
          assert.equal(saved.is_motm, false)
          assert.equal(saved.yellow_cards, cards.p_yellow_cards)
          assert.equal(saved.red_cards, cards.p_red_cards)
          for (const [team, opponent, result] of [[0, 1, 'D'], [1, 1, 'N'], [2, 1, 'V']]) {
            assert.equal((await rpc(payload({ p_match_id: id, p_team_score: team, p_opponent_score: opponent }))).status, 200)
            assert.equal(sql(`SELECT match_result FROM matches WHERE id=${quote(id)};`), result)
          }
          // Transition back to non-playing must still preserve entered discipline.
          assert.equal((await rpc(payload({ p_match_id: id, p_has_played: false, ...cards }))).status, 200)
          assert.equal(sql(`SELECT yellow_cards||':'||red_cards FROM statistics WHERE match_id=${quote(id)};`), `${cards.p_yellow_cards}:${cards.p_red_cards}`)
          assert.equal((await request(`matches?id=eq.${id}&player_id=eq.${player(1)}`, { method: 'DELETE' })).status, 204)
          assert.equal(sql(`SELECT count(*) FROM statistics WHERE match_id=${quote(id)};`), '0')
        }
        assert.deepEqual(snapshot(), initial)
      })

      await t.test(`${phase}: RLS and function permissions preserve owner isolation`, async () => {
        const denied = await request('rpc/save_match_with_statistics', { role: 'anon', body: payload() })
        assert.ok(denied.status >= 400)
        await expectRpcError(payload({ p_match_id: match(9) }), 'P0002')
        await expectRpcError(payload({ p_match_id: match(99) }), 'P0002')
        const updateOther = await request(`matches?id=eq.${match(9)}`, { method: 'PATCH', body: { opponent: 'Forbidden' } })
        assert.equal(updateOther.status, 204)
        const updateOtherStat = await request(`statistics?id=eq.${stat(9)}`, { method: 'PATCH', body: { goals: 9 } })
        assert.equal(updateOtherStat.status, 204)
        const deleteOther = await request(`matches?id=eq.${match(9)}`, { method: 'DELETE' })
        assert.equal(deleteOther.status, 204)
        const spoof = await request('statistics', { body: { player_id: player(2), match_id: match(1) } })
        assert.equal(spoof.data.code, '42501')
        assert.throws(() => asPlayer(`SELECT ${sqlCall()}`, 99), /violates foreign key constraint/)
        assert.throws(() => sql(`BEGIN; SET LOCAL ROLE authenticated; SELECT ${sqlCall()};`), /Authentication required/)
        assert.equal(sql(`SELECT has_function_privilege('anon',p.oid,'EXECUTE')||':'||
          has_function_privilege('authenticated',p.oid,'EXECUTE')||':'||has_function_privilege('service_role',p.oid,'EXECUTE')
          FROM pg_proc p WHERE p.proname='save_match_with_statistics';`), 'false:true:false')
        assert.deepEqual(snapshot(), initial)
      })

      await t.test(`${phase}: errors on second write roll back creation and editing`, async () => {
        const failedCreate = await expectRpcError(payload({ p_goals: 13 }), 'P0001')
        assert.equal(failedCreate.data.message, 'Test-only statistics write failure')
        const failedEdit = await expectRpcError(payload({ p_match_id: match(1), p_goals: 13, p_opponent: 'Must roll back' }), 'P0001')
        assert.equal(failedEdit.data.message, 'Test-only statistics write failure')
        const orphan = match(90)
        sql(`INSERT INTO matches(id,player_id,match_date,opponent,competition_type) VALUES(${quote(orphan)},${quote(player(1))},'2026-10-15','No statistics','LEAGUE');`)
        await expectRpcError(payload({ p_match_id: orphan, p_opponent: 'Must also roll back' }), 'P0002')
        assert.equal(sql(`SELECT opponent FROM matches WHERE id=${quote(orphan)};`), 'No statistics')
        assert.equal((await request(`matches?id=eq.${orphan}`, { method: 'DELETE' })).status, 204)
        assert.deepEqual(snapshot(), initial)
      })

      await t.test(`${phase}: SQL boundary validation matches form discipline rules`, async () => {
        for (const changes of [
          { p_has_played: false, p_yellow_cards: 3 }, { p_has_played: false, p_red_cards: 2 },
          { p_has_played: false, p_yellow_cards: null }, { p_minutes_played: 121 },
          { p_position_played: 'invalid' }, { p_goals: -1 }, { p_team_score: 100 },
          { p_opponent: 'x' }, { p_competition_type: 'OTHER' }, { p_has_played: null },
        ]) await expectRpcError(payload(changes), '22023')
        const fraction = await rpc(payload({ p_yellow_cards: 0.5 }))
        assert.ok(fraction.status >= 400)
        const invalidDate = await rpc(payload({ p_match_date: '2026-02-30' }))
        assert.ok(invalidDate.status >= 400)
        assert.deepEqual(snapshot(), initial)
      })
    }

    await t.test('composite FK blocks insert/retarget across owners even with RLS bypass', async () => {
      const insert = await request('statistics', { body: { player_id: player(1), match_id: match(9) } })
      assert.equal(insert.data.code, '23503')
      const retarget = await request(`statistics?id=eq.${stat(1)}`, { method: 'PATCH', body: { match_id: match(9) } })
      assert.equal(retarget.data.code, '23503')
      assert.throws(() => sql(`INSERT INTO statistics(player_id,match_id) VALUES(${quote(player(1))},${quote(match(9))});`), /violates foreign key constraint/)
      assert.throws(() => sql(`UPDATE statistics SET match_id=${quote(match(9))} WHERE id=${quote(stat(1))};`), /violates foreign key constraint/)
      assert.throws(() => sql(`UPDATE matches SET player_id=${quote(player(2))} WHERE id=${quote(match(1))};`), /violates foreign key constraint/)
      assert.throws(() => sql(`INSERT INTO statistics(player_id,match_id) VALUES(${quote(player(1))},${quote(match(1))});`), /duplicate key/)
      asPlayer(`INSERT INTO matches(id,player_id,match_date,opponent,competition_type)
        VALUES(${quote(match(91))},${quote(player(1))},'2026-10-15','Legitimate direct write','LEAGUE');
        INSERT INTO statistics(player_id,match_id) VALUES(${quote(player(1))},${quote(match(91))})`)
      sql(`BEGIN; DELETE FROM profiles WHERE id=${quote(player(3))};
        DO $$ BEGIN IF EXISTS(SELECT 1 FROM statistics WHERE player_id=${quote(player(3))})
          OR EXISTS(SELECT 1 FROM matches WHERE player_id=${quote(player(3))})
          THEN RAISE EXCEPTION 'Profile cascade failed'; END IF; END $$; ROLLBACK;`)
      assert.deepEqual(snapshot(), initial)
    })

    await t.test('concurrent edit then deletion serializes without partial data', async () => {
      const created = await rpc(payload())
      assert.equal(created.status, 200)
      const id = created.data
      const worker = spawn('docker', ['--host', dockerSocket, ...psqlArgs, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] })
      let workerError = ''
      worker.stderr.on('data', data => { workerError += data })
      const completion = new Promise((resolve, reject) => {
        worker.on('error', reject)
        worker.on('close', code => code === 0 ? resolve() : reject(new Error(workerError)))
      })
      worker.stdin.end(`BEGIN; SET LOCAL application_name='footstats-concurrent-edit'; SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub: player(1) })}',true);
        SELECT ${sqlCall(id)}; SELECT pg_sleep(0.6); COMMIT;`)
      let holding = false
      for (let i = 0; i < 40; i++) {
        if (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='footstats-concurrent-edit' AND wait_event='PgSleep';") === '1') { holding = true; break }
        await delay(20)
      }
      assert.ok(holding, 'concurrent editor did not reach its open transaction')
      const deletion = await request(`matches?id=eq.${id}`, { method: 'DELETE' })
      await completion
      assert.equal(deletion.status, 204)
      assert.equal(sql(`SELECT count(*) FROM statistics WHERE match_id=${quote(id)};`), '0')
      assert.deepEqual(snapshot(), initial)
    })

    await t.test('SEC-003 aggregates still match underlying statistics after all writes', async () => {
      const expected = json(`SELECT jsonb_agg(to_jsonb(a) ORDER BY player_id) FROM (
        SELECT player_id,count(id) AS matches_played,sum(goals) AS total_goals,sum(assists) AS total_assists,
          sum(minutes_played) AS total_minutes FROM statistics GROUP BY player_id) a;`)
      const actual = await request('player_season_aggregates?order=player_id')
      assert.equal(actual.status, 200)
      assert.deepEqual(actual.data, expected)
      assert.deepEqual((await request('player_season_aggregates', { role: 'anon' })).data, [])
      assert.deepEqual(security(), initialSecurity)
      assert.deepEqual(snapshot(), initial)
    })

    await t.test('RLS correction also preserves a fully hardened production-shaped schema', () => {
      const hardening = () => json(`SELECT jsonb_build_object(
        'constraints', (SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid))
          ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('public.matches'::regclass,'public.statistics'::regclass)),
        'rpc', (SELECT jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text)
          FROM pg_proc WHERE proname='save_match_with_statistics' AND pronamespace='public'::regnamespace),
        'view', (SELECT jsonb_build_object('options',reloptions,'acl',relacl::text)
          FROM pg_class WHERE oid='public.player_season_aggregates'::regclass));`)
      // This additional safe owner policy exists in the supplied production
      // export, but is absent from the historical migration. It must survive.
      sql(`CREATE POLICY "Strict Match Owner Control" ON public.matches FOR ALL TO authenticated
        USING (player_id=auth.uid()) WITH CHECK (player_id=auth.uid());`)
      const before = { security: security(), hardening: hardening(), data: snapshot() }
      sql(rlsCorrection)
      assert.deepEqual({ security: security(), hardening: hardening(), data: snapshot() }, before)
      sql('DROP POLICY "Strict Match Owner Control" ON public.matches;')
      assert.deepEqual(security(), initialSecurity)
    })
  } catch (error) {
    if (apiStarted) console.error('Local PostgREST logs:', docker(['logs', api]))
    if (dbStarted) console.error('Local PostgreSQL logs:', docker(['logs', db]))
    throw error
  } finally {
    if (apiStarted) docker(['rm', '--force', api])
    if (dbStarted) docker(['rm', '--force', db])
    if (networkCreated) docker(['network', 'rm', network])
  }
})
