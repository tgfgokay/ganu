#!/usr/bin/env python3
# GANU — FİNAL v2: Fraunces, ALTIN-SIZ (salt lacivert/kemik), radikal sadelik
import os, subprocess
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs("svg", exist_ok=True); os.makedirs("png", exist_ok=True)

# ---- Palet: yalnız iki ton (+ koyu mürekkep). ALTIN YOK. ----
NAVY="#15243B"; BONE="#F4F1EA"
SERIF="Fraunces, serif"; SANS="'Plus Jakarta Sans', sans-serif"
def w(name, svg): open(f"svg/{name}.svg","w").write(svg)

# ============== MERKEZ KİLİT (ANA LOGO) — sade, çizgisiz ==============
def dikey(bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 240">
  <rect width="520" height="240" fill="{bg}"/>
  <text x="260" y="128" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="96" letter-spacing="2" fill="{fg}">GANU</text>
  <text x="265" y="172" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="12" letter-spacing="12" fill="{fg}">SANAL OFİS · İSTANBUL</text>
</svg>'''
w("ganu-dikey",      dikey(BONE, NAVY))
w("ganu-dikey-koyu", dikey(NAVY, BONE))

# ============== YATAY (NAVBAR) — wordmark | descriptor (G tekrarı YOK) ==============
def yatay(bg, fg, rule):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 110">
  <rect width="440" height="110" fill="{bg}"/>
  <text x="36" y="72" font-family="{SERIF}" font-weight="600" font-size="58" letter-spacing="1" fill="{fg}">GANU</text>
  <line x1="262" y1="32" x2="262" y2="78" stroke="{rule}" stroke-width="1.3"/>
  <text x="280" y="50" font-family="{SANS}" font-weight="600" font-size="12" letter-spacing="5" fill="{fg}">SANAL OFİS</text>
  <text x="280" y="71" font-family="{SANS}" font-weight="500" font-size="11" letter-spacing="6.5" fill="{fg}">İSTANBUL</text>
</svg>'''
w("ganu-yatay",      yatay(BONE, NAVY, "#15243B66"))
w("ganu-yatay-koyu", yatay(NAVY, BONE, "#F4F1EA55"))

# ============== AVATAR / AMBLEM — sade G, alt çizgi YOK ==============
def avatar(bg, g, border=False):
    bd = f'stroke="{NAVY}" stroke-width="12"' if border else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect x="6" y="6" width="588" height="588" rx="132" fill="{bg}" {bd}/>
  <text x="300" y="416" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="368" fill="{g}">G</text>
</svg>'''
w("ganu-avatar",      avatar(NAVY, BONE))
w("ganu-avatar-acik", avatar(BONE, NAVY, border=True))

# ============== FAVICON ==============
favicon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="{NAVY}"/>
  <text x="32" y="47" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="46" fill="{BONE}">G</text>
</svg>'''
w("ganu-favicon", favicon)

# ============== KAŞE / MÜHÜR (resmi belge) ==============
kase = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="{BONE}"/>
  <circle cx="300" cy="300" r="250" fill="none" stroke="{NAVY}" stroke-width="6"/>
  <circle cx="300" cy="300" r="230" fill="none" stroke="{NAVY}" stroke-width="2"/>
  <text x="300" y="200" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="17" letter-spacing="6" fill="{NAVY}">İSTANBUL</text>
  <text x="300" y="322" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="112" letter-spacing="3" fill="{NAVY}">GANU</text>
  <text x="300" y="372" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="18" letter-spacing="9" fill="{NAVY}">SANAL OFİS</text>
</svg>'''
w("ganu-kase", kase)

# ============== KARTVİZİT (85x55mm) ==============
W,H = 510, 330
kart_on = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{NAVY}"/>
  <text x="{W/2}" y="170" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="78" letter-spacing="2" fill="{BONE}">GANU</text>
  <text x="{W/2+4}" y="205" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="11" letter-spacing="10" fill="{BONE}">SANAL OFİS · İSTANBUL</text>
</svg>'''
w("kartvizit-on", kart_on)

kart_arka = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BONE}"/>
  <text x="44" y="80" font-family="{SERIF}" font-weight="600" font-size="40" letter-spacing="1" fill="{NAVY}">GANU</text>
  <line x1="46" y1="100" x2="92" y2="100" stroke="{NAVY}" stroke-width="2"/>
  <text x="44" y="152" font-family="{SANS}" font-weight="600" font-size="13" letter-spacing="1" fill="{NAVY}">Ad Soyad</text>
  <text x="44" y="172" font-family="{SANS}" font-weight="500" font-size="11" letter-spacing="0.5" fill="{NAVY}">Ünvan</text>
  <text x="44" y="228" font-family="{SANS}" font-weight="500" font-size="10.5" letter-spacing="0.4" fill="{NAVY}">Kavacık Mah. Okul Cad. No:29 K:4 D:8</text>
  <text x="44" y="246" font-family="{SANS}" font-weight="500" font-size="10.5" letter-spacing="0.4" fill="{NAVY}">Beykoz / İstanbul</text>
  <text x="44" y="278" font-family="{SANS}" font-weight="600" font-size="10.5" letter-spacing="0.4" fill="{NAVY}">ganu.com.tr</text>
  <text x="44" y="296" font-family="{SANS}" font-weight="500" font-size="10.5" letter-spacing="0.4" fill="{NAVY}">+90 ___ ___ __ __</text>
</svg>'''
w("kartvizit-arka", kart_arka)

print("SVG yazıldı:", len([f for f in os.listdir('svg') if f.endswith('.svg')]))

# ============== RENDER ==============
def r(s,p,a): subprocess.run(["rsvg-convert",*a,f"svg/{s}.svg","-o",f"png/{p}"],check=True)
r("ganu-yatay","ganu-yatay@2x.png",["-z","3"]); r("ganu-yatay-koyu","ganu-yatay-koyu@2x.png",["-z","3"])
r("ganu-dikey","ganu-dikey@2x.png",["-z","2"]); r("ganu-dikey-koyu","ganu-dikey-koyu@2x.png",["-z","2"])
r("ganu-avatar","ganu-avatar-1024.png",["-w","1024","-h","1024"])
r("ganu-avatar","ganu-avatar-512.png",["-w","512","-h","512"])
r("ganu-avatar-acik","ganu-avatar-acik-1024.png",["-w","1024","-h","1024"])
r("ganu-kase","ganu-kase.png",["-w","600","-h","600"])
for s in (16,32,48,180,192,512): r("ganu-favicon",f"favicon-{s}.png",["-w",str(s),"-h",str(s)])
r("kartvizit-on","kartvizit-on@2x.png",["-w","1020","-h","660"])
r("kartvizit-arka","kartvizit-arka@2x.png",["-w","1020","-h","660"])
print("PNG render tamam:", len([f for f in os.listdir('png') if f.endswith('.png')]))
