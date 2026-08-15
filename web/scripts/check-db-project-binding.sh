#!/usr/bin/env bash
# DB_URL'nin SUPABASE_PROJECT_REF ile aynı hosted Supabase projesine ait olduğunu
# fail-closed doğrular. Yalnız Supabase'in resmî URI biçimleri kabul edilir:
#   direct/dedicated: postgres@db.<ref>.supabase.co:{5432,6543}/postgres
#   shared pooler:    postgres.<ref>@*.pooler.supabase.com:{5432,6543}/postgres
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?DB BINDING FAIL: SUPABASE_PROJECT_REF gerekli}"
: "${DB_URL:?DB BINDING FAIL: DB_URL gerekli}"

if ! [[ "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "DB BINDING FAIL: SUPABASE_PROJECT_REF biçimi geçersiz." >&2
  exit 4
fi

case "$DB_URL" in
  postgres://*) db_uri="${DB_URL#postgres://}" ;;
  postgresql://*) db_uri="${DB_URL#postgresql://}" ;;
  *) echo "DB BINDING FAIL: yalnız postgres:// veya postgresql:// URI kabul edilir." >&2; exit 4 ;;
esac

authority="${db_uri%%/*}"
path_query="${db_uri#*/}"
database="${path_query%%\?*}"
if [ "$authority" = "$db_uri" ] || [ "$database" != "postgres" ] || [[ "$authority" != *@* ]]; then
  echo "DB BINDING FAIL: DB_URL authority/database biçimi tanınmıyor." >&2
  exit 4
fi

# Son @ ayırıcıdır; paroladaki @ URI'de yüzde-kodlu olmalıdır.
userinfo="${authority%@*}"
hostport="${authority##*@}"
username="${userinfo%%:*}"
db_host="${hostport%%:*}"
db_port="${hostport##*:}"

if [ "$hostport" = "$db_host" ] || { [ "$db_port" != "5432" ] && [ "$db_port" != "6543" ]; }; then
  echo "DB BINDING FAIL: Supabase DB portu 5432 veya 6543 olmalı." >&2
  exit 4
fi

if [ "$db_host" = "db.${SUPABASE_PROJECT_REF}.supabase.co" ] && [ "$username" = "postgres" ]; then
  echo "DB TARGET BINDING PASS: direct/dedicated endpoint proje ref ile eşleşiyor."
  exit 0
fi

if [[ "$db_host" == *.pooler.supabase.com ]] && [ "$username" = "postgres.${SUPABASE_PROJECT_REF}" ]; then
  echo "DB TARGET BINDING PASS: shared pooler kullanıcı adı proje ref ile eşleşiyor."
  exit 0
fi

echo "DB BINDING FAIL: DB_URL, SUPABASE_PROJECT_REF ile aynı projeye bağlanmıyor." >&2
exit 4
