#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
expected_up=(
  0000_base_schema.sql 0001_pricing_catalog.sql 0002_private_storage.sql
  0003_auth_hardening.sql 0004_prod_gate.sql 0005_rbac_auth_storage.sql
  0006_customer_portal_auth.sql 0007_purchase_flow.sql
  0008_pos_reconciliation.sql 0009_legal_consent_evidence.sql
)
expected_down=(
  0001_pricing_catalog.down.sql 0002_private_storage.down.sql
  0003_auth_hardening.down.sql 0004_prod_gate.down.sql
  0005_rbac_auth_storage.down.sql 0006_customer_portal_auth.down.sql
  0007_purchase_flow.down.sql 0008_pos_reconciliation.down.sql
  0009_legal_consent_evidence.down.sql
)

actual_up="$(find "$ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sort)"
actual_down="$(find "$ROOT/supabase/rollbacks" -maxdepth 1 -type f -name '*.down.sql' -exec basename {} \; | sort)"
expected_up_text="$(printf '%s\n' "${expected_up[@]}")"
expected_down_text="$(printf '%s\n' "${expected_down[@]}")"

if [ "$actual_up" != "$expected_up_text" ]; then printf '%s\n' 'migration layout FAIL: UP listesi exact 0000-0009 değil' >&2; exit 1; fi
if [ "$actual_down" != "$expected_down_text" ]; then printf '%s\n' 'migration layout FAIL: rollback listesi exact 0001-0009 değil' >&2; exit 1; fi
if find "$ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.down.sql' | grep -q .; then printf '%s\n' 'migration layout FAIL: migrations içinde down SQL var' >&2; exit 1; fi
if ! cmp -s "$ROOT/supabase-schema.sql" "$ROOT/supabase/migrations/0000_base_schema.sql"; then printf '%s\n' 'migration layout FAIL: 0000 canonical şemadan farklı' >&2; exit 1; fi

printf '%s\n' 'migration layout PASS (UP 0000-0009; rollback 0001-0009; canonical base byte-exact)'
