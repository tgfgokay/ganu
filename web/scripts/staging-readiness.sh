#!/usr/bin/env bash
# Staging çalıştırılabilirlik denetimi. Secret DEĞERLERİNİ asla yazdırmaz;
# yalnız gerekli dosya/anahtar/araçların varlığını PASS/BLOCK olarak raporlar.
set -u

ROOT="${GANU_READINESS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
fail=0
pass() { printf 'PASS  %s\n' "$1"; }
block() { printf 'BLOCK %s\n' "$1"; fail=1; }

env_file=''
for candidate in "$ROOT/.env.local" "$ROOT/.env" "$ROOT/.env.staging"; do
  if [ -f "$candidate" ]; then env_file="$candidate"; break; fi
done
if [ -z "$env_file" ]; then
  block 'staging istemci env dosyası yok'
else
  pass 'staging istemci env dosyası var (değerler gizlendi)'
  for key in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
    if grep -Eq "^${key}=.+" "$env_file"; then pass "$key tanımlı"; else block "$key eksik/boş"; fi
  done
fi

if command -v supabase >/dev/null 2>&1; then pass 'Supabase CLI kullanılabilir'; else block 'Supabase CLI yok'; fi
if [ -f "$ROOT/supabase/config.toml" ]; then pass 'Supabase function deploy config var'; else block 'supabase/config.toml yok'; fi
if [ -s "$ROOT/supabase/.temp/project-ref" ]; then
  pass 'Supabase project link metadata var (ref gizlendi)'
else
  block 'Supabase project link metadata yok'
fi

migrations=(
  0001_pricing_catalog 0002_private_storage 0003_auth_hardening
  0004_prod_gate 0005_rbac_auth_storage 0006_customer_portal_auth
  0007_purchase_flow 0008_pos_reconciliation 0009_legal_consent_evidence
)
for n in "${migrations[@]}"; do
  if [ -f "$ROOT/supabase/migrations/${n}.sql" ] && [ -f "$ROOT/supabase/migrations/${n}.down.sql" ]; then
    pass "migration ${n} up/down var"
  else
    block "migration ${n} up/down eksik"
  fi
done

functions=(pos-payment purchase-flow admin-gate get-file send-notification issue-einvoice)
for fn in "${functions[@]}"; do
  if [ -f "$ROOT/supabase/functions/${fn}/index.ts" ]; then pass "function ${fn} kaynağı var"; else block "function ${fn} eksik"; fi
done

for spec in 'pos-payment:false' 'purchase-flow:false' 'admin-gate:true' 'get-file:true' 'send-notification:true' 'issue-einvoice:true'; do
  fn="${spec%%:*}"; expected="${spec##*:}"
  actual="$(awk -v section="[functions.${fn}]" '
    $0==section { inside=1; next }
    inside && /^\[/ { exit }
    inside && /^[[:space:]]*verify_jwt[[:space:]]*=/ {
      sub(/^[^=]*=[[:space:]]*/, ""); gsub(/[[:space:]]/, ""); print; exit
    }
  ' "$ROOT/supabase/config.toml" 2>/dev/null || true)"
  if [ "$actual" = "$expected" ]; then pass "config ${fn} verify_jwt=${expected}"; else block "config ${fn} verify_jwt=${expected} değil/eksik"; fi
done

tests=(
  staging_section2_tests.sql staging_0005_rbac_tests.sql
  staging_0006_customer_portal_tests.sql staging_0007_purchase_flow_tests.sql
  staging_0008_pos_reconciliation_tests.sql staging_0009_legal_consent_tests.sql
)
for test_file in "${tests[@]}"; do
  if [ -f "$ROOT/supabase/tests/$test_file" ]; then
    pass "SQL test $test_file var"
  else
    block "SQL test $test_file eksik"
  fi
done

for required in STAGING-RUNBOOK.md supabase/prod_readiness_gate.sql scripts/prod-gate.sh; do
  if [ -f "$ROOT/$required" ]; then pass "readiness kaynağı $required var"; else block "readiness kaynağı $required eksik"; fi
done

if [ "$fail" -ne 0 ]; then
  printf 'SONUÇ BLOCKED — canlı test için yukarıdaki bağlantı/araç eksikleri tamamlanmalı.\n' >&2
  exit 1
fi
printf 'SONUÇ READY — bu yalnız ön koşul kontrolüdür; migration/deploy/test PASS kanıtı değildir.\n'
