-- 0013 rollback: işlem kaydı tetikleyicileri, fonksiyonları ve tablosu kaldırılır.
-- UYARI: audit_log tablosu silinir; geri almadan önce gerekiyorsa dışa aktarın (select * from public.audit_log).
do $$ declare t text;
begin
  foreach t in array array['customers','contracts','invoices','documents','mail_items','inspections','requests'] loop
    execute format('drop trigger if exists audit_row on public.%I', t);
  end loop;
end $$;
drop function if exists public.audit_row();
drop trigger if exists audit_log_no_change on public.audit_log;
drop table if exists public.audit_log;
drop function if exists public.audit_log_immutable();
