#!/usr/bin/env python3
# GANU — TEAL brief keşfi: Navy #0A2540 + Teal #00D4B2 aksan, Wordmark.
# Yüksek kontrastlı serif (Fraunces). Tek teal aksan + negatif alan. Klişe ikon YOK.
# NOT: Bu mevcut iki-ton/altın-sız FİNAL paketten AYRI bir keşiftir (paket/ bozulmadı).
import os, subprocess
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs("svg", exist_ok=True); os.makedirs("png", exist_ok=True)

NAVY="#0A2540"; TEAL="#00D4B2"; WHITE="#FFFFFF"; LGRAY="#F4F6F8"
SERIF="Fraunces, serif"; SANS="'Plus Jakarta Sans', sans-serif"
def w(n,s): open(f"svg/{n}.svg","w").write(s)

# ===== YATAY (wordmark, tek teal aksan = "U" sonrası nokta) =====
def yatay(bg, fg, sep):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 220">
  <rect width="660" height="220" fill="{bg}"/>
  <text x="320" y="118" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="104" letter-spacing="2" fill="{fg}">GANU</text>
  <circle cx="512" cy="112" r="10" fill="{TEAL}"/>
  <text x="324" y="166" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="13" letter-spacing="13" fill="{fg}">SANAL OFİS<tspan fill="{TEAL}" dx="6">·</tspan><tspan dx="6">İSTANBUL</tspan></text>
</svg>'''
w("ganu-yatay",      yatay(LGRAY, NAVY, TEAL))
w("ganu-yatay-koyu", yatay(NAVY,  WHITE, TEAL))

# ===== DİKEY (stacked) =====
def dikey(bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 300">
  <rect width="520" height="300" fill="{bg}"/>
  <text x="248" y="150" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="112" letter-spacing="2" fill="{fg}">GANU</text>
  <circle cx="452" cy="144" r="10" fill="{TEAL}"/>
  <text x="262" y="202" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="13" letter-spacing="13" fill="{fg}">SANAL OFİS<tspan fill="{TEAL}" dx="6">·</tspan><tspan dx="6">İSTANBUL</tspan></text>
</svg>'''
w("ganu-dikey",      dikey(LGRAY, NAVY))
w("ganu-dikey-koyu", dikey(NAVY,  WHITE))

# ===== MONO (tek renk, teal YOK — tek-renk baskı/kaşe/faks) =====
def mono(bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 220">
  <rect width="660" height="220" fill="{bg}"/>
  <text x="320" y="118" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="104" letter-spacing="2" fill="{fg}">GANU</text>
  <circle cx="512" cy="112" r="10" fill="{fg}"/>
  <text x="324" y="166" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="13" letter-spacing="13" fill="{fg}">SANAL OFİS<tspan dx="6">·</tspan><tspan dx="6">İSTANBUL</tspan></text>
</svg>'''
w("ganu-mono",      mono(WHITE, NAVY))
w("ganu-mono-koyu", mono(NAVY,  WHITE))

# ===== Lettermark "G" (bonus: app ikonu/avatar) teal aksan nokta =====
def gmark(bg, fg, dot):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="{bg}"/>
  <text x="252" y="358" text-anchor="middle" font-family="{SERIF}" font-weight="600" font-size="320" fill="{fg}">G</text>
  <circle cx="372" cy="332" r="20" fill="{dot}"/>
</svg>'''
w("ganu-mark",       gmark(NAVY,  WHITE, TEAL))
w("ganu-mark-acik",  gmark(LGRAY, NAVY,  TEAL))

# ===== Yüksek-kontrastlı sans ALT (brief alternatifi) =====
def sans_yatay(bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 220">
  <rect width="660" height="220" fill="{bg}"/>
  <text x="322" y="116" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="96" letter-spacing="1" fill="{fg}">GANU</text>
  <circle cx="506" cy="110" r="10" fill="{TEAL}"/>
  <text x="326" y="166" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="13" letter-spacing="13" fill="{fg}">SANAL OFİS<tspan fill="{TEAL}" dx="6">·</tspan><tspan dx="6">İSTANBUL</tspan></text>
</svg>'''
w("ganu-sans",      sans_yatay(LGRAY, NAVY))
w("ganu-sans-koyu", sans_yatay(NAVY,  WHITE))

print("SVG:", len([f for f in os.listdir('svg') if f.endswith('.svg')]))

# ===== RENDER =====
def r(s,p,a): subprocess.run(["rsvg-convert",*a,f"svg/{s}.svg","-o",f"png/{p}"],check=True)
for n in ["ganu-yatay","ganu-yatay-koyu","ganu-mono","ganu-mono-koyu","ganu-sans","ganu-sans-koyu"]:
    r(n,f"{n}@2x.png",["-z","2"])
for n in ["ganu-dikey","ganu-dikey-koyu"]:
    r(n,f"{n}@2x.png",["-z","2"])
r("ganu-mark","ganu-mark-512.png",["-w","512","-h","512"])
r("ganu-mark-acik","ganu-mark-acik-512.png",["-w","512","-h","512"])
print("PNG:", len([f for f in os.listdir('png') if f.endswith('.png')]))
