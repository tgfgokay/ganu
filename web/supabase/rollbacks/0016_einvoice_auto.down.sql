-- 0016 rollback: otomatik e-Belge aday fonksiyonu kaldırılır (kesilmiş belgeler ve fatura kayıtları etkilenmez).
drop function if exists public.einvoice_auto_candidates(date, integer);
