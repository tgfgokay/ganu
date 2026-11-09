#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DB_URL:?Empty isolated LOCAL test DB URL required}"
python3 - <<'PY'
import os,urllib.parse
u=urllib.parse.urlparse(os.environ['DB_URL'])
if u.hostname not in ('127.0.0.1','localhost') or not u.path.rsplit('/',1)[-1].startswith('ganu_test'):
 raise SystemExit('Only localhost ganu_test* isolated databases are allowed')
PY
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/local_supabase_fixture.sql >/dev/null
for migration in supabase/migrations/*.sql; do psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$migration" >/dev/null; done
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/staging_0018_payment_claim_tests.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/staging_0019_parasut_oauth_tests.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/staging_0020_single_operator_tests.sql
python3 scripts/test-operations-races.py
# A down migration may not silently discard unresolved/uncertain provider evidence.
if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/rollbacks/0020_single_operator_flow.down.sql >/dev/null 2>&1; then
  echo 'FAIL: rollback discarded pending jobs'; exit 1
fi
printf '%s\n' 'PASS: rollback refuses unresolved operation jobs'
# Terminal fixtures permit reversal; tables/audit survive and UP may be reapplied. Entire check rolls back.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
  -c "begin; update public.operation_jobs set state='done',claim_token=null;" \
  -f supabase/rollbacks/0020_single_operator_flow.down.sql \
  -f supabase/migrations/0020_single_operator_flow.sql \
  -c 'rollback;' >/dev/null
printf '%s\n' 'PASS: safe rollback and reapply preserve operation evidence tables'
