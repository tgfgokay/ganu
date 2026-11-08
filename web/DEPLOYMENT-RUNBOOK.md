# Production deployment — GitHub Pages

Production canonical hedefi `https://ganu.com.tr`, base path `/` olarak sabittir.
`deploy-pages.yml` yalnız elle başlatılır; readiness job'ı geçmeden build/deploy çalışmaz.
Yalnız `refs/heads/main` seçimi kabul edilir; workflow_dispatch ekranından başka ref
seçilmesi preflight aşamasında hard-fail eder.

## Dış durum engelleri

Workflow aşağıdakileri GitHub API ve gerçek HTTPS isteğiyle doğrular; herhangi biri
eksikse deploy **hard-fail** eder:

1. Pages publishing source `GitHub Actions` (`build_type=workflow`).
2. Custom domain `ganu.com.tr` ve `Enforce HTTPS` açık.
3. Sertifika doğrulanan `https://ganu.com.tr/` yalnız HTTPS yönlendirmeleriyle exact
   aynı URL'de HTTP 200 döndürür; HTTP downgrade veya başka host kabul edilmez.
4. Repository variables: `PROD_DEPLOY_INTEGRATED=true`,
   `GANU_PRODUCTION_ORIGIN=https://ganu.com.tr`, `GANU_PRODUCTION_BASE=/`.
5. `prod-gate.yml` içindeki Supabase, JWT/HMAC ve legal readiness secret/variable'ları.

16 Ağustos 2026 gözleminde Pages hâlâ legacy `gh-pages`, HTTPS enforcement kapalı
ve `https://ganu.com.tr` sertifika adı uyuşmuyordu. Bu ayarlar GitHub Pages/DNS
tarafında yetkili kullanıcı tarafından düzeltilmeden bu workflow deploy etmez.

GitHub `github-pages` environment protection kuralında yalnız bu workflow/deploy
job'ına izin verilmesi ve production branch protection uygulanması ayrıca zorunludur.


## 0018 — Ortak Paraşüt tahsilat sahipliği

`0018_parasut_payment_claim.sql` önce migration olarak uygulanmalı; ardından `issue-einvoice`, `paytr-link`,
`auto-einvoice` ve `parasut-sync` aynı kaynak sürümünden dağıtılmalı. Eski çalışan çağrıların tamamlanması beklenmeli;
karma eski/yeni sürümde eski kod bu korumaya katılmaz. `staging_0018_payment_claim_tests.sql` yalnız izole test/staging
veritabanında transaction/rollback ile doğrulanır. RPC eksikse yeni kod tahsilat POST etmeden hata verir.

Tahsilat POST'u başladıktan sonra yanıt ya da DB kaydı doğrulanamazsa `parasut_payment_claim_token` kalır.
Süre aşımıyla kilit otomatik açılmaz. Operatör Paraşüt'teki gerçek tahsilatları ve panel faturasını karşılaştırır:

- Tahsilat gerçekleşmişse mevcut token ile service-role `parasut_payment_complete` çağrılır.
- Gerçekleşmediği kesinleşmişse ve önceki çağrının artık çalışmadığı doğrulanmışsa mevcut token ile
  `parasut_payment_release` çağrılır; sonraki normal akış taze kalan tutarı okuyarak yeniden dener.
- Sonuç belirsizse token korunur. Canlı müşteri verisi herkese açık issue/log'a yazılmaz.

Claim, panelin güncel ödendi durumu, tutarı, Paraşüt fatura bağlantısı ve ödeme incelemesiyle atomik olarak alınır.
Tamamlama/bırakma yalnız aynı token ile mümkündür; anon ve personel JWT'lerine bu RPC'ler kapalıdır.

## 0019–0020 — OAuth ve tek kişi operasyonu

Paraşüt bağlantısı için [PARASUT-OAUTH-MIGRATION.md](PARASUT-OAUTH-MIGRATION.md), kabul/kargo/gönderim kurulumu için [SINGLE-OPERATOR-RUNBOOK.md](SINGLE-OPERATOR-RUNBOOK.md) izlenir. Yeni migration sayısı21 (0000–0020), rollback20 (0001–0020). Worker, sözleşme endpoint'i ve personel frontend'i birlikte dağıtılır. Yerel fake/izole test başarısı canlı e-posta/e-belge/ödeme kanıtı değildir; gerçek alıcı ve finansal test verisi seçilmeden dış işlem yapılmaz.
