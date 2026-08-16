#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT

mkdir -p "$fixture/supabase/migrations" "$fixture/supabase/rollbacks" "$fixture/supabase/functions" \
  "$fixture/supabase/tests" "$fixture/supabase/.temp" "$fixture/scripts" "$fixture/bin"
printf '%s\n' 'VITE_SUPABASE_URL=https://fixture.invalid' 'VITE_SUPABASE_ANON_KEY=FIXTURE_SECRET_MUST_NOT_LEAK' > "$fixture/.env.local"
printf '%s\n' 'project_id = "fixture"' \
  '[functions.pos-payment]' 'verify_jwt = false' \
  '[functions.purchase-flow]' 'verify_jwt = false' \
  '[functions.admin-gate]' 'verify_jwt = true' \
  '[functions.get-file]' 'verify_jwt = true' \
  '[functions.send-notification]' 'verify_jwt = true' \
  '[functions.issue-einvoice]' 'verify_jwt = true' > "$fixture/supabase/config.toml"
printf '%s\n' 'fixture-project-ref' > "$fixture/supabase/.temp/project-ref"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$fixture/bin/supabase"
chmod +x "$fixture/bin/supabase"

printf '%s\n' '-- fixture canonical base' > "$fixture/supabase-schema.sql"
cp "$fixture/supabase-schema.sql" "$fixture/supabase/migrations/0000_base_schema.sql"
for n in 0001_pricing_catalog 0002_private_storage 0003_auth_hardening 0004_prod_gate 0005_rbac_auth_storage 0006_customer_portal_auth 0007_purchase_flow 0008_pos_reconciliation; do
  : > "$fixture/supabase/migrations/${n}.sql"
  : > "$fixture/supabase/rollbacks/${n}.down.sql"
done
: > "$fixture/supabase/migrations/0009_legal_consent_evidence.sql"
for fn in pos-payment admin-gate get-file send-notification issue-einvoice; do mkdir -p "$fixture/supabase/functions/$fn"; : > "$fixture/supabase/functions/$fn/index.ts"; done
for t in staging_section2_tests.sql staging_0005_rbac_tests.sql staging_0006_customer_portal_tests.sql staging_0007_purchase_flow_tests.sql staging_0008_pos_reconciliation_tests.sql; do
  : > "$fixture/supabase/tests/$t"
done
: > "$fixture/STAGING-RUNBOOK.md"; : > "$fixture/supabase/prod_readiness_gate.sql"; : > "$fixture/scripts/prod-gate.sh"

set +e
output="$(GANU_READINESS_ROOT="$fixture" PATH="$fixture/bin:$PATH" bash "$SCRIPT_DIR/staging-readiness.sh" 2>&1)"
status=$?
set -e
if [ "$status" -eq 0 ]; then printf '%s\n' 'FAIL: negatif fixture READY döndü' >&2; exit 1; fi
for expected in \
  'rollback 0009_legal_consent_evidence eksik' \
  'function purchase-flow eksik' \
  'SQL test staging_0009_legal_consent_tests.sql eksik'; do
  if ! grep -Fq "$expected" <<<"$output"; then printf 'FAIL: beklenen BLOCK yok: %s\n' "$expected" >&2; exit 1; fi
done
if grep -Fq 'FIXTURE_SECRET_MUST_NOT_LEAK' <<<"$output"; then printf '%s\n' 'FAIL: env değeri çıktıya sızdı' >&2; exit 1; fi

: > "$fixture/supabase/rollbacks/0009_legal_consent_evidence.down.sql"
mkdir -p "$fixture/supabase/functions/purchase-flow"; : > "$fixture/supabase/functions/purchase-flow/index.ts"
: > "$fixture/supabase/tests/staging_0009_legal_consent_tests.sql"
positive="$(GANU_READINESS_ROOT="$fixture" PATH="$fixture/bin:$PATH" bash "$SCRIPT_DIR/staging-readiness.sh" 2>&1)"
if ! grep -Fq 'SONUÇ READY' <<<"$positive"; then printf '%s\n' 'FAIL: eksiksiz fixture READY dönmedi' >&2; exit 1; fi
printf '%s\n' 'staging-readiness negative fixture PASS'
