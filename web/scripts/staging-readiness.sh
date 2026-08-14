#!/usr/bin/env bash
# Staging çalıştırılabilirlik denetimi. Secret DEĞERLERİNİ asla yazdırmaz;
# yalnız gerekli dosya/anahtar/araçların varlığını PASS/BLOCK olarak raporlar.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

for n in 0001_pricing_catalog 0002_private_storage 0003_auth_hardening 0004_prod_gate 0005_rbac_auth_storage; do
  if [ -f "$ROOT/supabase/migrations/${n}.sql" ] && [ -f "$ROOT/supabase/migrations/${n}.down.sql" ]; then
    pass "migration ${n} up/down var"
  else
    block "migration ${n} up/down eksik"
  fi
done

for fn in pos-payment admin-gate get-file; do
  if [ -f "$ROOT/supabase/functions/${fn}/index.ts" ]; then pass "function ${fn} kaynağı var"; else block "function ${fn} eksik"; fi
done

if [ -f "$ROOT/supabase/tests/staging_section2_tests.sql" ] && [ -f "$ROOT/supabase/tests/staging_0005_rbac_tests.sql" ]; then
  pass 'SQL staging test paketleri var'
else
  block 'SQL staging test paketi eksik'
fi

if [ "$fail" -ne 0 ]; then
  printf 'SONUÇ BLOCKED — canlı test için yukarıdaki bağlantı/araç eksikleri tamamlanmalı.\n' >&2
  exit 1
fi
printf 'SONUÇ READY — bu yalnız ön koşul kontrolüdür; migration/deploy/test PASS kanıtı değildir.\n'
