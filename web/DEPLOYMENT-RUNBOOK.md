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
