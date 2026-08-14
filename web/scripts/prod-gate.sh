#!/usr/bin/env bash
# ============================================================
# GANU · Production readiness gate (CI / elle).
# FAIL → non-zero exit. Bu script ancak gerçek deploy job'ı kendisine bağlanırsa
# deployment'ı durdurur; mevcut entegrasyon durumu workflow guard'ında ayrıca aranır.
# Kontroller:
#   1) Hedef Supabase projesinin remote secret listesinde POS_TEST_FAULT OLMAMALI.
#   2) DB_URL aynı SUPABASE_PROJECT_REF'e ait olmalı.
#   3) Gerçek owner/admin JWT ile admin RPC çağrısı bu koşuda yapılmalı; dönen
#      nonce bağlı HMAC kanıtı CI tarafında doğrulanmalı.
#   4) DB readiness kontrolü owner/admin ve aynı RPC'nin audit kaydını doğrulamalı.
# Gerekli değerler yalnız CI secret/variable olarak tutulur; repoya konmaz.
# ============================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"   # web/

# 1) Yerel env değil, hedef projenin gerçek Edge Function secret listesi.
: "${SUPABASE_PROJECT_REF:?PROD GATE FAIL: SUPABASE_PROJECT_REF gerekli}"
: "${SUPABASE_ACCESS_TOKEN:?PROD GATE FAIL: SUPABASE_ACCESS_TOKEN gerekli (CI secret)}"
: "${DB_URL:?PROD GATE FAIL: DB_URL gerekli (CI secret; repoya konmaz)}"

# API/Functions/remote secrets ile DB'nin aynı Supabase projesi olduğuna bağlanır.
bash "$DIR/scripts/check-db-project-binding.sh"

command -v supabase >/dev/null || { echo "PROD GATE FAIL: Supabase CLI bulunamadı." >&2; exit 2; }
command -v jq >/dev/null || { echo "PROD GATE FAIL: jq bulunamadı." >&2; exit 2; }
command -v openssl >/dev/null || { echo "PROD GATE FAIL: openssl bulunamadı." >&2; exit 2; }

remote_secrets="$(supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" --output json)"
if printf '%s' "$remote_secrets" | jq -e '.[] | select(.name == "POS_TEST_FAULT")' >/dev/null; then
  echo "PROD GATE FAIL: hedef Supabase projesinde POS_TEST_FAULT remote secret'ı var." >&2
  exit 2
fi

# 3) DB dışı, nonce-bağlı kriptografik kanıt. SQL Editor'de tabloya kayıt
# eklemek bunu üretemez; HMAC yalnız CI ve admin-gate secret store'dadır.
: "${ADMIN_GATE_URL:?PROD GATE FAIL: ADMIN_GATE_URL gerekli}"
: "${SUPABASE_ANON_KEY:?PROD GATE FAIL: SUPABASE_ANON_KEY gerekli}"
: "${PROD_OWNER_ACCESS_TOKEN:?PROD GATE FAIL: taze PROD_OWNER_ACCESS_TOKEN gerekli (CI secret)}"
: "${PROD_GATE_HMAC_SECRET:?PROD GATE FAIL: PROD_GATE_HMAC_SECRET gerekli (CI secret)}"

nonce="$(openssl rand -hex 32)"
response="$(curl --fail-with-body --silent --show-error -X POST "$ADMIN_GATE_URL" \
  -H "Authorization: Bearer $PROD_OWNER_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  --data "$(jq -nc --arg nonce "$nonce" '{nonce:$nonce}')")"

ok="$(printf '%s' "$response" | jq -r '.ok // false')"
returned_nonce="$(printf '%s' "$response" | jq -r '.nonce // empty')"
uid="$(printf '%s' "$response" | jq -r '.uid // empty')"
role="$(printf '%s' "$response" | jq -r '.role // empty')"
method="$(printf '%s' "$response" | jq -r '.method // empty')"
issued_at="$(printf '%s' "$response" | jq -r '.issued_at // empty')"
signature="$(printf '%s' "$response" | jq -r '.signature // empty')"

if [ "$ok" != "true" ] || [ "$returned_nonce" != "$nonce" ] || [ -z "$uid" ] || \
   { [ "$role" != "owner" ] && [ "$role" != "admin" ]; } || [ "$method" != "jwt" ] || \
   ! [[ "$issued_at" =~ ^[0-9]+$ ]] || [ -z "$signature" ]; then
  echo "PROD GATE FAIL: admin-gate yanıtı eksik veya tutarsız." >&2
  exit 3
fi

now="$(date +%s)"
if [ "$issued_at" -gt "$((now + 60))" ] || [ "$issued_at" -lt "$((now - 300))" ]; then
  echo "PROD GATE FAIL: admin-gate kanıtı taze değil." >&2
  exit 3
fi

payload="${nonce}.${uid}.${role}.${issued_at}.${method}"
expected="$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$PROD_GATE_HMAC_SECRET" | awk '{print $NF}')"
if [ "$signature" != "$expected" ]; then
  echo "PROD GATE FAIL: admin-gate HMAC imzası doğrulanamadı." >&2
  exit 3
fi

# 4) DB gate (owner/admin + audit kaydı)
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/prod_readiness_gate.sql"

echo "PROD GATE PASS ✅ (remote fault secret yok + taze JWT/HMAC kanıtı + DB audit PASS)"
