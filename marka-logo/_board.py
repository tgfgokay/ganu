#!/usr/bin/env python3
"""Presentation board for GANU 4.2 wordmark — for approval before applying to site."""
import _draw as D

W, H = 1600, 1500
NAVY, TEAL, PAPER = D.NAVY, D.TEAL, D.PAPER
GROUND = "#EEF1F4"

def f(x): return f"{x:.2f}"

# wordmark natural box
nat_w = D.Wtot
nat_h = D.Hbot - D.Htop

o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
o.append('<defs><style>'
         ".sans{font-family:\'Plus Jakarta Sans\',sans-serif;}"
         '</style></defs>')
o.append(f'<rect width="{W}" height="{H}" fill="{GROUND}"/>')

# header
o.append(f'<text x="120" y="112" class="sans" font-size="21" font-weight="600" '
         f'letter-spacing="4" fill="#4c637b">GANU · MARKA İŞARETİ — 4.2 “İÇ BOŞLUK AKSANI”</text>')
o.append(f'<line x1="120" y1="146" x2="{W-120}" y2="146" stroke="{NAVY}" stroke-opacity="0.16" stroke-width="1.4"/>')

# ---- Card 1: primary wordmark on paper ----
c1x, c1y, c1w, c1h = 120, 196, W-240, 470
o.append(f'<rect x="{c1x}" y="{c1y}" width="{c1w}" height="{c1h}" rx="32" fill="#FFFFFF" '
         f'stroke="{NAVY}" stroke-opacity="0.08" stroke-width="1.4"/>')
o.append(f'<text x="{c1x+44}" y="{c1y+52}" class="sans" font-size="18" font-weight="700" '
         f'letter-spacing="2.5" fill="#4c637b">01 · ANA İŞARET</text>')
# place wordmark centered in card
target_w = c1w - 320
s1 = target_w / nat_w
wm_w = nat_w * s1
wm_h = nat_h * s1
tx1 = c1x + (c1w - wm_w)/2
ty1 = c1y + (c1h - wm_h)/2 + 24 - D.Htop*s1
o.append(D.wordmark_group(ink=NAVY, dotc=TEAL, tx=tx1, ty=ty1, s=s1))
o.append(f'<text x="{c1x+c1w/2}" y="{c1y+c1h-30}" text-anchor="middle" class="sans" '
         f'font-size="15" font-weight="400" fill="#7488a0">'
         f'teal “adres noktası”, ‘a’ harfinin iç boşluğunda — bir işletmenin var oluş noktası.</text>')

# ---- Card 2: reversed on navy ----
c2x, c2y, c2w, c2h = 120, 700, (W-240-40)/2, 420
o.append(f'<rect x="{c2x}" y="{c2y}" width="{c2w}" height="{c2h}" rx="32" fill="{NAVY}"/>')
o.append(f'<text x="{c2x+44}" y="{c2y+52}" class="sans" font-size="18" font-weight="700" '
         f'letter-spacing="2.5" fill="#F4EFE7" fill-opacity="0.55">02 · KOYU ZEMİN</text>')
tw2 = c2w - 180
s2 = tw2 / nat_w
tx2 = c2x + (c2w - nat_w*s2)/2
ty2 = c2y + (c2h - nat_h*s2)/2 + 20 - D.Htop*s2
o.append(D.wordmark_group(ink=PAPER, dotc=TEAL, tx=tx2, ty=ty2, s=s2))

# ---- Card 3: favicon / app icon ----
c3x, c3y, c3w, c3h = 120 + c2w + 40, 700, (W-240-40)/2, 420
o.append(f'<rect x="{c3x}" y="{c3y}" width="{c3w}" height="{c3h}" rx="32" fill="#FFFFFF" '
         f'stroke="{NAVY}" stroke-opacity="0.08" stroke-width="1.4"/>')
o.append(f'<text x="{c3x+44}" y="{c3y+52}" class="sans" font-size="18" font-weight="700" '
         f'letter-spacing="2.5" fill="#4c637b">03 · FAVİKON · APP İKON</text>')
o.append(f'<text x="{c3x+44}" y="{c3y+78}" class="sans" font-size="13.5" font-weight="400" '
         f'fill="#7488a0">harfsiz · ortak-tarafsız · “adres noktası” özü</text>')

def favicon_tile(cx, cy, size, dark=True, label=""):
    r = size/2
    rx = size*0.24
    parts = []
    if dark:
        parts.append(f'<rect x="{f(cx-r)}" y="{f(cy-r)}" width="{f(size)}" height="{f(size)}" '
                     f'rx="{f(rx)}" fill="{NAVY}"/>')
        ring = "#F4EFE7"; ringop=0.9
    else:
        parts.append(f'<rect x="{f(cx-r)}" y="{f(cy-r)}" width="{f(size)}" height="{f(size)}" '
                     f'rx="{f(rx)}" fill="{PAPER}" stroke="{NAVY}" stroke-opacity="0.12" stroke-width="1.4"/>')
        ring = NAVY; ringop=1.0
    ring_r = size*0.29
    ring_w = size*0.075
    dot_r = size*0.135
    parts.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ring_r)}" fill="none" '
                 f'stroke="{ring}" stroke-opacity="{ringop}" stroke-width="{f(ring_w)}"/>')
    parts.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(dot_r)}" fill="{TEAL}"/>')
    if label:
        parts.append(f'<text x="{f(cx)}" y="{f(cy+size/2+34)}" text-anchor="middle" class="sans" '
                     f'font-size="14" font-weight="500" fill="#7488a0">{label}</text>')
    return "\n".join(parts)

tile_cy = c3y + c3h/2 - 6
o.append(favicon_tile(c3x + c3w*0.30, tile_cy, 168, dark=True,  label="koyu"))
o.append(favicon_tile(c3x + c3w*0.62, tile_cy, 168, dark=False, label="açık"))
# tiny 32px scale demo
o.append(favicon_tile(c3x + c3w*0.85, tile_cy-24, 56, dark=True, label=""))
o.append(f'<text x="{f(c3x + c3w*0.85)}" y="{f(tile_cy-24+56)}" text-anchor="middle" class="sans" '
         f'font-size="12" font-weight="600" letter-spacing="1" fill="#7488a0">32 px</text>')

# ---- Card 4: palette + note ----
c4x, c4y, c4w, c4h = 120, 1160, W-240, 200
o.append(f'<rect x="{c4x}" y="{c4y}" width="{c4w}" height="{c4h}" rx="32" fill="#FFFFFF" '
         f'stroke="{NAVY}" stroke-opacity="0.08" stroke-width="1.4"/>')
o.append(f'<text x="{c4x+44}" y="{c4y+52}" class="sans" font-size="18" font-weight="700" '
         f'letter-spacing="2.5" fill="#4c637b">PALET</text>')
chips = [(NAVY,"NAVY","#0A2540 · ana"),(TEAL,"TEAL","#00D4B2 · yalnız aksan"),(PAPER,"PAPER","#F4EFE7 · zemin")]
cxp = c4x+44
for col,name,hexd in chips:
    o.append(f'<rect x="{cxp}" y="{c4y+86}" width="52" height="52" rx="12" fill="{col}" '
             f'stroke="{NAVY}" stroke-opacity="0.12"/>')
    o.append(f'<text x="{cxp+70}" y="{c4y+108}" class="sans" font-size="17" font-weight="700" fill="{NAVY}">{name}</text>')
    o.append(f'<text x="{cxp+70}" y="{c4y+132}" class="sans" font-size="14" font-weight="400" fill="#7488a0">{hexd}</text>')
    cxp += 400

# footer
o.append(f'<text x="120" y="{H-42}" class="sans" font-size="17" font-weight="500" fill="#4c637b">'
         f'4.2 — yumuşak geometrik küçük harf “ganu”, tek çizgi (monoline), yuvarlak uçlar: davetkâr &amp; çağdaş.</text>')

o.append('</svg>')
open("ganu-yon-03.svg","w").write("\n".join(o))
print("wrote ganu-yon-03.svg", W, "x", H)
