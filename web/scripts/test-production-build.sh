#!/usr/bin/env bash
set -euo pipefail

grep -Fq 'void loadCatalog()' src/App.jsx
grep -Fq 'void loadCatalog()' src/SatinAl.jsx
grep -Fq 'void loadCatalog()' src/panel/PanelApp.jsx
grep -Fq 'onCatalog(()=>setCatalogVersion' src/panel/PanelApp.jsx
grep -Fq 'return unsubscribe' src/panel/PanelApp.jsx
if grep -Fq 'loadCatalog' src/main.jsx; then printf '%s\n' 'FAIL: global katalog loader public tüm routeları etkiliyor' >&2; exit 1; fi
grep -Fq 'if (inFlight) return inFlight' src/catalog.js
grep -Fq 'if (loaded) return Promise.resolve(true)' src/catalog.js

env \
  VITE_SUPABASE_URL='https://synthetic-ref.supabase.co' \
  VITE_SUPABASE_ANON_KEY='synthetic-public-anon-key' \
  GANU_LEGAL_TRADE_NAME='GANU Kurumsal Hizmetler Limited Şirketi' \
  GANU_LEGAL_ADDRESS='Kavacık Mahallesi Okul Caddesi No 29 Beykoz İstanbul' \
  GANU_LEGAL_TAX_OFFICE='Beykoz Vergi Dairesi' \
  GANU_LEGAL_TAX_NUMBER='1234567890' \
  GANU_LEGAL_MERSIS_NUMBER='0123456789012345' \
  GANU_LEGAL_REGISTRY_OFFICE='İstanbul Ticaret Sicili Müdürlüğü' \
  GANU_LEGAL_REGISTRY_NUMBER='123456' \
  GANU_LEGAL_EMAIL='hukuk@ganu.invalid' \
  GANU_LEGAL_PHONE='+90 216 555 00 00' \
  GANU_LEGAL_APPROVED_AT='2026-08-15' \
  GANU_LEGAL_TEXT_VERSION='2026-08-15.v1' \
  GANU_LEGAL_RETENTION_VERSION='2026-08-15.v1' \
  GANU_LEGAL_CROSS_BORDER_STATUS='none' \
  GANU_LEGAL_CONSENT_FLOW_VERSION='0009' \
  npm run build

printf '%s\n' 'production-like Supabase/legal build PASS'
