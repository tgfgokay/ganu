#!/usr/bin/env bash
# ============================================================
# GANU · Production readiness gate (CI / elle).
# FAIL → non-zero exit → deployment DURUR.
# Kontroller:
#   1) POS_TEST_FAULT ortamda BULUNMAMALI (staging hata enjeksiyonu prod'a sızmasın).
#   2) prod_readiness_gate.sql: gerçek JWT ile owner/admin admin-RPC kanıtı (<24s).
# Gerekli: DB_URL (prod/staging connection string) — YALNIZ CI secret; repoya konmaz.
# ============================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"   # web/

# 1) Hata enjeksiyonu prod'da olmamalı
if [ -n "${POS_TEST_FAULT:-}" ]; then
  echo "PROD GATE FAIL: POS_TEST_FAULT set edilmiş (='${POS_TEST_FAULT}'). Prod'da olmamalı." >&2
  exit 2
fi

# 2) DB gate (owner/admin gerçek JWT kanıtı)
: "${DB_URL:?PROD GATE FAIL: DB_URL gerekli (CI secret; repoya konmaz)}"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/prod_readiness_gate.sql"

echo "PROD GATE PASS ✅ (POS_TEST_FAULT yok + gerçek JWT owner/admin kanıtı var)"
