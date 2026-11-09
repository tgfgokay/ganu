// Two real PG sessions. Requires an already initialized, disposable localhost database with 0019.
// Explicitly refuses remote databases and any database name other than ganu_oauth_0019_test.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
const url = new URL(process.env.TEST_DATABASE_URL || 'postgresql://localhost/ganu_oauth_0019_test')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/ganu_oauth_0019_test') throw new Error('Only disposable localhost ganu_oauth_0019_test database is allowed')
const psql = process.env.PSQL_BIN || 'psql', args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', url.href]
const query = (sql) => { const r = spawnSync(psql, [...args, '-c', sql], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('Test SQL failed'); return r.stdout.trim() }
const role = `set request.jwt.claims='{"role":"service_role"}'; set role service_role;`
const fixture = `select public.parasut_oauth_connect('RACE-0019','c','s','v1.test.tokens',now()+interval '1 hour',now()+interval '1 day','00000000-0000-4000-8000-000000000019'); update public.parasut_oauth_connections set access_expires_at=now()-interval '1 second' where company_id='RACE-0019';`
query(`${role} ${fixture}`)
function connection() {
  const p = spawn(psql, args, { stdio: ['pipe','pipe','pipe'] })
  let output = '', errors = ''
  p.stdout.on('data', (d) => { output += d }); p.stderr.on('data', (d) => { errors += d })
  const done = new Promise((resolve, reject) => p.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error('Concurrency SQL failed'))))
  return { p, done, output: () => output }
}
let first, second
try {
  first = connection()
  first.p.stdin.write(`${role}\nBEGIN;\nselect public.parasut_oauth_claim('RACE-0019','c','s',1);\n`)
  const deadline = Date.now() + 5000
  while (!/[0-9a-f]{8}-[0-9a-f-]{27,}/.test(first.output()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
  assert.match(first.output(), /[0-9a-f]{8}-[0-9a-f-]{27,}/, 'first session must acquire while transaction stays open')
  second = connection()
  second.p.stdin.end(`${role}\nset application_name='ganu_oauth_racer2';\nselect public.parasut_oauth_claim('RACE-0019','c','s',1);\n`)
  let blocked = false
  for (let i = 0; i < 30; i++) {
    blocked = query("select exists(select from pg_stat_activity where application_name='ganu_oauth_racer2' and wait_event_type='Lock')") === 't'
    if (blocked) break
    await new Promise((r) => setTimeout(r, 10))
  }
  assert.equal(blocked, true, 'second real session must wait on the first row lock')
  first.p.stdin.end('COMMIT;\n')
  const [one, two] = await Promise.all([first.done, second.done])
  assert.match(one, /[0-9a-f]{8}-[0-9a-f-]{27,}/); assert.equal(two, '')
  assert.equal(query("select count(*) from public.parasut_oauth_connections where company_id='RACE-0019' and refresh_owner is not null"), '1')
  console.log('PASS PG16 two-session refresh race: second session blocked, exactly one refresh owner')
} finally {
  first?.p.kill(); second?.p.kill()
  query("delete from public.parasut_oauth_connections where company_id='RACE-0019'")
}
