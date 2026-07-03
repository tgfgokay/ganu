#!/usr/bin/env python3
# GANU — Eleştiri sonrası: ALTIN-SIZ radikal sadelik + ownable harf denemesi + stres testleri
import os, subprocess
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs("out", exist_ok=True)

NAVY="#15243B"; BONE="#F4F1EA"; INK="#11161F"
SANS="'Plus Jakarta Sans', sans-serif"
def w(n,s): open(f"out/{n}.svg","w").write(s)

# ---------- A: Sober wordmark (font bağımsız fonksiyon) ----------
# Altın YOK. Tek renk lacivert. Çizgi yok. Sadece harf + küçük tracked descriptor.
def sober(serif, gpx, gls, name):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 230">
  <rect width="560" height="230" fill="{BONE}"/>
  <text x="280" y="120" text-anchor="middle" font-family="{serif}" font-weight="600" font-size="{gpx}" letter-spacing="{gls}" fill="{NAVY}">GANU</text>
  <text x="285" y="162" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="11.5" letter-spacing="11" fill="{NAVY}">SANAL OFİS · İSTANBUL</text>
</svg>'''
w("A-fraunces",  sober("Fraunces, serif",      86, 2, "Fraunces"))
w("B-cormorant", sober("Cormorant, serif",     98, 3, "Cormorant"))
w("C-baskerv",   sober("Baskerville, serif",   84, 3, "Baskerville"))
w("D-crimson",   sober("'Crimson Pro', serif", 92, 2, "Crimson"))

# ---------- E: Custom monogram denemesi (vektör, fonttan bağımsız) ----------
# "Kemer / kilit taşı" — adres/bina metaforu, soyut. Lacivert ince kontur.
# Namus borcu: bunu el ile çizdim; type designer işi değil. Dürüst değerlendir.
mono = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="{BONE}"/>
  <!-- kemer (arch) ince kontur -->
  <path d="M180 430 L180 300 A120 120 0 0 1 420 300 L420 430"
        fill="none" stroke="{NAVY}" stroke-width="14" stroke-linecap="square"/>
  <!-- kilit taşı (keystone) -->
  <path d="M270 196 L330 196 L342 250 L258 250 Z" fill="{NAVY}"/>
  <!-- taban çizgisi (adres satırı) -->
  <line x1="150" y1="430" x2="450" y2="430" stroke="{NAVY}" stroke-width="14" stroke-linecap="square"/>
  <text x="300" y="510" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="60" letter-spacing="6" fill="{NAVY}">GANU</text>
</svg>'''
w("E-monogram", mono)

# ---------- STRES TESTLERİ (kazanan estetik = sober, iki-tonlu) ----------
# 1) Daire avatar (WhatsApp/IG kırpması) — köşe güvenli mi?
circ = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs><clipPath id="c"><circle cx="300" cy="300" r="300"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect width="600" height="600" fill="{NAVY}"/>
    <text x="300" y="418" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="360" fill="{BONE}">G</text>
  </g>
</svg>'''
w("T-daire-avatar", circ)

# 2) Gri ton / kaşe / faks — iki-tonlu olduğu için zaten güvenli (lacivert->koyu gri, kemik->açık)
gray = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 230">
  <rect width="560" height="230" fill="#FFFFFF"/>
  <text x="280" y="120" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="86" letter-spacing="2" fill="#222222">GANU</text>
  <text x="285" y="162" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="11.5" letter-spacing="11" fill="#222222">SANAL OFİS · İSTANBUL</text>
</svg>'''
w("T-griton", gray)

# 3) Tek renk kaşe (outline, mühür çerçeve) — antet/kaşe senaryosu
stamp = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="{BONE}"/>
  <circle cx="300" cy="300" r="250" fill="none" stroke="{NAVY}" stroke-width="6"/>
  <circle cx="300" cy="300" r="232" fill="none" stroke="{NAVY}" stroke-width="2"/>
  <text x="300" y="320" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="120" letter-spacing="4" fill="{NAVY}">GANU</text>
  <text x="300" y="370" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="20" letter-spacing="10" fill="{NAVY}">SANAL OFİS</text>
  <text x="300" y="210" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="17" letter-spacing="6" fill="{NAVY}">İSTANBUL</text>
</svg>'''
w("T-kase", stamp)

# 4) Tabela (pirinç/taş levha üstünde kazıma) — bina girişi
tabela = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 380">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f46"/><stop offset="1" stop-color="#2a2e34"/></linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBF8F1"/><stop offset="1" stop-color="#ECE6D8"/></linearGradient>
  </defs>
  <rect width="700" height="380" fill="url(#wall)"/>
  <rect x="120" y="80" width="460" height="220" rx="6" fill="url(#plate)"/>
  <rect x="120" y="80" width="460" height="220" rx="6" fill="none" stroke="#00000022" stroke-width="2"/>
  <circle cx="140" cy="100" r="4" fill="#9a958a"/><circle cx="560" cy="100" r="4" fill="#9a958a"/>
  <circle cx="140" cy="280" r="4" fill="#9a958a"/><circle cx="560" cy="280" r="4" fill="#9a958a"/>
  <text x="350" y="195" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="78" letter-spacing="3" fill="{NAVY}">GANU</text>
  <text x="352" y="235" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="13" letter-spacing="9" fill="{NAVY}">SANAL OFİS · İSTANBUL</text>
</svg>'''
w("T-tabela", tabela)

print("SVG:", len([f for f in os.listdir('out') if f.endswith('.svg')]))

# ---------- RENDER ----------
def r(s,p,a): subprocess.run(["rsvg-convert",*a,f"out/{s}.svg","-o",f"out/{p}"],check=True)
for n in ["A-fraunces","B-cormorant","C-baskerv","D-crimson","T-griton"]:
    r(n,f"{n}@2x.png",["-z","2"])
r("E-monogram","E-monogram@2x.png",["-z","1.4"])
r("T-tabela","T-tabela@2x.png",["-z","1.6"])
r("T-kase","T-kase.png",["-w","400","-h","400"])
# daire avatar: büyük + 96 + 48
for s in (512,96,48): r("T-daire-avatar",f"T-daire-{s}.png",["-w",str(s),"-h",str(s)])
# favicon 16/32 (Fraunces G, köşe yuvarlak)
fav=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{NAVY}"/><text x="32" y="47" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="46" fill="{BONE}">G</text></svg>'''
w("T-favicon",fav)
for s in (16,32): r("T-favicon",f"T-favicon-{s}.png",["-w",str(s),"-h",str(s)])
print("PNG render tamam")
