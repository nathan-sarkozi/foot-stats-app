import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// Disposable, synthetic PostgreSQL 17.6 + PostgREST 14.5 only. Never reads .env,
// credentials, external Docker contexts, existing databases, or real user data.
// Requires the pinned images already installed locally; never pulls images.
// Run: node --test --test-isolation=none tests/season-goals-db.test.mjs
const socket = 'unix:///var/run/docker.sock'
const postgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.113'
const postgrestImage = 'postgrest/postgrest:v14.5'
const secret = 'footstats-season-goals-isolated-only-jwt-secret'
const root = fileURLToPath(new URL('../', import.meta.url))
const migrationName = '20261021120000_create_season_goals.sql'
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const player = i => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const quote = value => `'${String(value).replaceAll("'", "''")}'`

function dockerResult(args, input) {
  return spawnSync('docker', ['--host', socket, ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  })
}

function docker(args, input) {
  const result = dockerResult(args, input)
  assert.equal(result.status, 0, `local docker ${args[0]}: ${result.stderr || result.error || result.stdout}`)
  return result.stdout.trim()
}

test('season goals: isolated PostgreSQL and PostgREST owner security', { timeout: 240_000 }, async t => {
  const suffix = randomUUID().slice(0, 8)
  const network = `footstats-goals-${suffix}`
  const db = `footstats-goals-pg-${suffix}`
  const api = `footstats-goals-rest-${suffix}`
  let networkCreated = false
  let dbStarted = false
  let apiStarted = false
  const args = ['exec', '-i', db, 'psql', '-h', '/tmp', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'footstats_test']
  const sql = text => docker(args, text)
  const json = text => JSON.parse(sql(text))
  const asPlayer = (text, i = 1) => sql(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '${JSON.stringify({ role: 'authenticated', sub: player(i) })}';
    ${text}; ROLLBACK;`)
  const sqlFailure = (text, pattern) => {
    const result = dockerResult(args, text)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, pattern)
  }
  const existingState = () => json(`SELECT jsonb_build_object(
    'matches', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.matches m),
    'statistics', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.statistics s),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p
      WHERE schemaname='public' AND tablename<>'season_goals'),
    'relations', (SELECT jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,
      'options',reloptions,'acl',relacl::text) ORDER BY relname) FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') AND relname<>'season_goals'),
    'constraints', (SELECT jsonb_agg(jsonb_build_object('relation',c.conrelid::regclass::text,
      'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid,c.conname)
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE r.relnamespace='public'::regnamespace AND r.relname<>'season_goals'),
    'rpc', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      WHERE p.proname='save_match_with_statistics' AND p.pronamespace='public'::regnamespace),
    'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d));`)
  const token = (role, i = 1) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role,
      ...(role === 'authenticated' ? { sub: player(i) } : {}), exp: Math.floor(Date.now() / 1000) + 600 })}`
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
  }
  let baseUrl
  const request = async (path, { role = 'authenticated', i = 1, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(`${baseUrl}/${path}`, {
      method, headers: { Authorization: `Bearer ${token(role, i)}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000),
    })
    const raw = await response.text()
    return { status: response.status, data: raw ? JSON.parse(raw) : null }
  }
  const create = (overrides = {}, options = {}) => request('season_goals', {
    body: { season_start: 2026, metric: 'goals', target: 15, ...overrides }, ...options,
  })
  const expectCode = async (promise, code) => {
    const result = await promise
    assert.ok(result.status >= 400, JSON.stringify(result))
    assert.equal(result.data.code, code, JSON.stringify(result))
  }
  let goalId
  let unchanged

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
      if (dockerResult(['exec', db, 'pg_isready', '-h', '/tmp', '-U', 'postgres']).status === 0) { ready = true; break }
      await delay(100)
    }
    assert.ok(ready, 'Local PostgreSQL must be ready')
    docker(['exec', '-i', db, 'psql', '-h', '/tmp', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], 'CREATE DATABASE footstats_test;')
    sql(`CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'local-test-only';
      GRANT anon,authenticated,service_role TO authenticator;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`)
    for (const name of readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort()) {
      if (name.endsWith('.sql') && name < migrationName) sql(migration(name))
    }
    sql(readFileSync(new URL('../supabase/tests/match_writes.sql', import.meta.url), 'utf8'))
    unchanged = existingState()

    await t.test('additive migration replays after every prior migration without changing existing state', () => {
      sql(migration(migrationName))
      assert.deepEqual(existingState(), unchanged)
      assert.equal(sql('SELECT count(*) FROM public.season_goals;'), '0')
      assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.season_goals'::regclass;"), 't')
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='season_goals';"), '4')
    })

    await t.test('authenticated column grants and trusted service administration are explicit', () => {
      assert.deepEqual(json(`SELECT jsonb_build_object(
        'read',has_table_privilege('authenticated','public.season_goals','SELECT'),
        'delete',has_table_privilege('authenticated','public.season_goals','DELETE'),
        'insert_all',has_table_privilege('authenticated','public.season_goals','INSERT'),
        'insert_target',has_column_privilege('authenticated','public.season_goals','target','INSERT'),
        'insert_owner',has_column_privilege('authenticated','public.season_goals','player_id','INSERT'),
        'update_target',has_column_privilege('authenticated','public.season_goals','target','UPDATE'),
        'update_owner',has_column_privilege('authenticated','public.season_goals','player_id','UPDATE'),
        'truncate',has_table_privilege('authenticated','public.season_goals','TRUNCATE'),
        'service_all',has_table_privilege('service_role','public.season_goals','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
        'service_bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'));`), {
        read: true, delete: true, insert_all: false, insert_target: true, insert_owner: false,
        update_target: true, update_owner: false, truncate: false, service_all: true, service_bypass: true,
      })
      assert.equal(sql("SELECT has_any_column_privilege('anon','public.season_goals','SELECT,INSERT,UPDATE,REFERENCES');"), 'f')
    })

    await t.test('RLS refuses spoofed owners independently of column grants', () => {
      sqlFailure(`BEGIN; GRANT INSERT (player_id) ON public.season_goals TO authenticated;
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims='${JSON.stringify({ role: 'authenticated', sub: player(1) })}';
        INSERT INTO public.season_goals(player_id,season_start,metric,target)
        VALUES(${quote(player(2))},2026,'goals',15); ROLLBACK;`, /row-level security policy/)
      assert.equal(sql("SELECT has_column_privilege('authenticated','public.season_goals','player_id','INSERT');"), 'f')
    })

    docker(['run', '--detach', '--name', api, '--network', network, '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '-e', `PGRST_DB_URI=postgresql://authenticator:local-test-only@${db}:5432/footstats_test`,
      '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
      '-e', 'PGRST_DB_CONFIG=false', '-e', `PGRST_JWT_SECRET=${secret}`, postgrestImage])
    apiStarted = true
    const networks = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', api]))
    assert.deepEqual(Object.keys(networks), [network])
    const address = networks[network].IPAddress
    assert.match(address, /^\d+\.\d+\.\d+\.\d+$/)
    baseUrl = `http://${address}:3000`
    let apiReady = false
    for (let i = 0; i < 40; i++) {
      try { if ((await request('season_goals?select=id')).status === 200) { apiReady = true; break } } catch { /* startup */ }
      await delay(100)
    }
    assert.ok(apiReady, 'Local PostgREST must be ready')

    await t.test('owner creates goal with server-derived owner, UUID and timestamp', async () => {
      const result = await create()
      assert.equal(result.status, 201, JSON.stringify(result))
      assert.equal(result.data.length, 1)
      assert.equal(result.data[0].player_id, player(1))
      assert.equal(result.data[0].target, 15)
      assert.match(result.data[0].id, /^[\da-f-]{36}$/)
      assert.ok(Number.isFinite(Date.parse(result.data[0].created_at)))
      goalId = result.data[0].id
    })

    await t.test('owner reads goal and another player cannot read it even by ID', async () => {
      assert.equal((await request(`season_goals?id=eq.${goalId}`)).data.length, 1)
      assert.deepEqual((await request(`season_goals?id=eq.${goalId}`, { i: 2 })).data, [])
      assert.deepEqual((await request('season_goals', { i: 2 })).data, [])
    })

    await t.test('embedding goals from a publicly readable profile never exposes another player goals', async () => {
      const result = await request(`profiles?id=eq.${player(1)}&select=id,season_goals(season_start,metric,target)`, { i: 2 })
      assert.equal(result.status, 200)
      assert.deepEqual(result.data, [{ id: player(1), season_goals: [] }])
    })

    await t.test('anonymous CRUD is denied despite authenticated public profile access', async () => {
      for (const options of [{}, { body: { target: 1 }, method: 'PATCH' }, { method: 'DELETE' }]) {
        await expectCode(request(`season_goals?id=eq.${goalId}`, { ...options, role: 'anon' }), '42501')
      }
      await expectCode(create({}, { role: 'anon' }), '42501')
    })

    await t.test('column grants reject spoofed owner, client IDs and timestamps', async () => {
      for (const extra of [{ player_id: player(2) }, { player_id: player(1) },
        { id: randomUUID() }, { created_at: '2000-01-01T00:00:00Z' }]) {
        await expectCode(create({ metric: 'assists', ...extra }), '42501')
      }
    })

    await t.test('owner updates only target and cannot relocate season, metric or owner', async () => {
      const result = await request(`season_goals?id=eq.${goalId}`, { method: 'PATCH', body: { target: 20 } })
      assert.equal(result.status, 200)
      assert.equal(result.data[0].target, 20)
      for (const body of [{ player_id: player(2) }, { season_start: 2025 }, { metric: 'assists' },
        { id: randomUUID() }, { created_at: '2000-01-01T00:00:00Z' }]) {
        await expectCode(request(`season_goals?id=eq.${goalId}`, { method: 'PATCH', body }), '42501')
      }
    })

    await t.test('UPDATE WITH CHECK prevents owner transfer independently of column grants', () => {
      sqlFailure(`BEGIN; GRANT UPDATE (player_id) ON public.season_goals TO authenticated;
        SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims='${JSON.stringify({ role: 'authenticated', sub: player(1) })}';
        UPDATE public.season_goals SET player_id=${quote(player(2))} WHERE id=${quote(goalId)};
        ROLLBACK;`, /row-level security policy/)
      assert.equal(sql("SELECT has_column_privilege('authenticated','public.season_goals','player_id','UPDATE');"), 'f')
      assert.equal(sql(`SELECT player_id FROM public.season_goals WHERE id=${quote(goalId)};`), player(1))
    })

    await t.test('cross-owner update and delete affect no row', async () => {
      for (const options of [{ method: 'PATCH', body: { target: 99 } }, { method: 'DELETE' }]) {
        const result = await request(`season_goals?id=eq.${goalId}`, { ...options, i: 2 })
        assert.equal(result.status, 200)
        assert.deepEqual(result.data, [])
      }
      assert.equal((await request(`season_goals?id=eq.${goalId}`)).data[0].target, 20)
    })

    await t.test('uniqueness allows same metric in another season or for another owner', async () => {
      await expectCode(create(), '23505')
      assert.equal((await create({ season_start: 2025 })).status, 201)
      assert.equal((await create({}, { i: 2 })).status, 201)
      assert.equal((await create({ metric: 'assists' })).status, 201)
      assert.equal((await create({ metric: 'appearances' })).status, 201)
      assert.equal((await create({ metric: 'motm' })).status, 201)
      assert.equal((await request('season_goals')).data.length, 5)
    })

    await t.test('positive integer target, valid metric and season constraints reject invalid writes', async () => {
      for (const target of [0, -1]) await expectCode(create({ season_start: 2024, target }), '23514')
      await expectCode(create({ season_start: 2024, target: null }), '23502')
      await expectCode(create({ season_start: 2024, target: 1.5 }), '22P02')
      await expectCode(create({ season_start: 2024, target: 2147483648 }), '22003')
      await expectCode(create({ season_start: 2024, metric: 'minutes' }), '23514')
      await expectCode(create({ season_start: 2024, metric: null }), '23502')
      for (const season_start of [0, 9999]) await expectCode(create({ season_start }), '23514')
      await expectCode(create({ season_start: null }), '23502')
      await expectCode(request(`season_goals?id=eq.${goalId}`, { method: 'PATCH', body: { target: 0 } }), '23514')
      assert.equal((await request(`season_goals?id=eq.${goalId}`)).data[0].target, 20)
    })

    await t.test('SQL boundary seasons and targets are accepted while missing identities are rejected', async () => {
      assert.equal((await create({ season_start: 1, target: 1 })).status, 201)
      assert.equal((await create({ season_start: 9998, target: 2147483647 })).status, 201)
      await expectCode(create({ season_start: 2024, player_id: null }, { role: 'service_role' }), '23502')
      sqlFailure(`BEGIN; SET LOCAL ROLE authenticated;
        SET LOCAL request.jwt.claims='{"role":"authenticated"}';
        INSERT INTO public.season_goals(season_start,metric,target) VALUES(2024,'goals',1);
        ROLLBACK;`, /row-level security policy|violates not-null constraint/)
    })

    await t.test('legitimate zero metrics remain independent from positive goal targets', async () => {
      assert.equal((await create({ season_start: 2024, target: 1 })).status, 201)
      assert.equal(sql(`SELECT count(*) FROM public.statistics WHERE goals=0;`) !== '0', true)
    })

    await t.test('authenticated TRUNCATE is denied and leaves every goal intact', () => {
      const count = sql('SELECT count(*) FROM public.season_goals;')
      sqlFailure(`SET ROLE authenticated; TRUNCATE public.season_goals;`, /permission denied/)
      assert.equal(sql('SELECT count(*) FROM public.season_goals;'), count)
    })

    await t.test('trusted service role retains administrative restore and TRUNCATE rights', () => {
      const count = sql('SELECT count(*) FROM public.season_goals;')
      assert.equal(sql(`BEGIN; SET LOCAL ROLE service_role;
        INSERT INTO public.season_goals(id,player_id,season_start,metric,target,created_at)
        VALUES('${randomUUID()}',${quote(player(3))},2020,'goals',9,'2020-01-01T00:00:00Z');
        UPDATE public.season_goals SET player_id=${quote(player(2))},target=10 WHERE season_start=2020;
        TRUNCATE public.season_goals; SELECT count(*) FROM public.season_goals; ROLLBACK;`), '0')
      assert.equal(sql('SELECT count(*) FROM public.season_goals;'), count)
    })

    await t.test('profile foreign key rejects orphan owner even for trusted administration', () => {
      sqlFailure(`SET ROLE service_role; INSERT INTO public.season_goals(player_id,season_start,metric,target)
        VALUES('${randomUUID()}',2026,'goals',1);`, /violates foreign key constraint/)
    })

    await t.test('deleting a profile cascades only its goals and rolls back cleanly', () => {
      const count = sql('SELECT count(*) FROM public.season_goals;')
      assert.equal(sql(`BEGIN; DELETE FROM public.profiles WHERE id=${quote(player(2))};
        SELECT count(*) FROM public.season_goals WHERE player_id=${quote(player(2))}; ROLLBACK;`), '0')
      assert.equal(sql('SELECT count(*) FROM public.season_goals;'), count)
    })

    await t.test('owner deletes its goal without modifying another owner', async () => {
      const result = await request(`season_goals?id=eq.${goalId}`, { method: 'DELETE' })
      assert.equal(result.status, 200)
      assert.equal(result.data[0].id, goalId)
      assert.deepEqual((await request(`season_goals?id=eq.${goalId}`)).data, [])
      assert.equal((await request('season_goals', { i: 2 })).data.length, 1)
    })

    await t.test('SEC-002, SEC-003, match RPC, existing RLS, grants and data remain unchanged', async () => {
      assert.deepEqual(existingState(), unchanged)
      assert.match(sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='statistics_match_id_fkey';"),
        /FOREIGN KEY \(match_id, player_id\).*ON DELETE CASCADE/)
      assert.equal(sql("SELECT reloptions::text FROM pg_class WHERE oid='public.player_season_aggregates'::regclass;"), '{security_invoker=true}')
      assert.deepEqual((await request('player_season_aggregates', { role: 'anon' })).data, [])
      assert.equal((await request('statistics?select=id')).data.length, 23)
      assert.equal(asPlayer('SELECT count(*) FROM public.season_goals WHERE player_id<>auth.uid()'), '0')
    })
  } finally {
    if (apiStarted) docker(['rm', '--force', api])
    if (dbStarted) docker(['rm', '--force', db])
    if (networkCreated) docker(['network', 'rm', network])
  }
})
