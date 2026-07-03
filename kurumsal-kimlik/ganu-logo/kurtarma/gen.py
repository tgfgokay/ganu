#!/usr/bin/env python3
import os
os.makedirs("out", exist_ok=True)

# ---- Rafine "Corporate Premium / Old Money" paleti ----
BONE   = "#F4F1EA"   # %80 aydınlık zemin
NAVY   = "#15243B"   # gece laciverti (saf siyah değil)
ANTH   = "#22272D"   # antrasit alternatif
CHAMP  = "#A98A5E"   # mat şampanya/bronz — sarısı alınmış (aksan, büyük/fiziksel)
BRONZE = "#7C6239"   # metin-güvenli koyu bronz (küçük metin AA ≥4.5)
LCHAMP = "#C8AE82"   # koyu zeminde şampanya aksan

# ---- WCAG kontrast ----
def lin(c):
    c/=255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def Lum(h):
    h=h.lstrip('#'); r,g,b=int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)
def cr(a,b):
    la,lb=Lum(a),Lum(b); return round((max(la,lb)+.05)/(min(la,lb)+.05),2)
print("KONTRAST:")
for n,a,b in [("Navy/Bone",NAVY,BONE),("Champ/Bone",CHAMP,BONE),
              ("Bronze/Bone",BRONZE,BONE),("Bone/Navy",BONE,NAVY),
              ("LChamp/Navy",LCHAMP,NAVY),("Champ/Navy",CHAMP,NAVY)]:
    print(f"  {cr(a,b):>6}:1  {n}")

# ---- R1: Serif Authority (Playfair Display + Plus Jakarta otorite çapası) ----
r1 = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200">
  <rect width="520" height="200" fill="{BONE}"/>
  <text x="260" y="104" text-anchor="middle" font-family="'Playfair Display', serif" font-weight="600" font-size="80" letter-spacing="4" fill="{NAVY}">GANU</text>
  <line x1="150" y1="132" x2="240" y2="132" stroke="{CHAMP}" stroke-width="1.4"/>
  <line x1="280" y1="132" x2="370" y2="132" stroke="{CHAMP}" stroke-width="1.4"/>
  <text x="260" y="134" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="600" font-size="15" letter-spacing="9" fill="{NAVY}">SANAL OFİS</text>
  <text x="260" y="162" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500" font-size="11" letter-spacing="6" fill="{BRONZE}">İSTANBUL</text>
</svg>'''
open("out/R1-serif-yatay.svg","w").write(r1)

# ---- R2: Modern Premium Sans (Plus Jakarta Bold, hafif/havadar) ----
r2 = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200">
  <rect width="520" height="200" fill="{BONE}"/>
  <text x="260" y="104" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" font-size="74" letter-spacing="-1" fill="{NAVY}">GANU</text>
  <circle cx="396" cy="74" r="6" fill="{CHAMP}"/>
  <text x="260" y="140" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="600" font-size="13" letter-spacing="8" fill="{BRONZE}">SANAL OFİS · İSTANBUL</text>
</svg>'''
open("out/R2-sans-yatay.svg","w").write(r2)

# ---- R3: Cinzel engraved (kazınmış levha / old-money) ----
r3 = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200">
  <rect width="520" height="200" fill="{BONE}"/>
  <text x="260" y="100" text-anchor="middle" font-family="Cinzel, serif" font-weight="600" font-size="58" letter-spacing="8" fill="{NAVY}">GANU</text>
  <text x="260" y="138" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="600" font-size="12" letter-spacing="8" fill="{BRONZE}">SANAL OFİS · İSTANBUL</text>
</svg>'''
open("out/R3-cinzel-yatay.svg","w").write(r3)

# ---- Koyu zemin (old-money navy + şampanya) — R1 negatif ----
r1n = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200">
  <rect width="520" height="200" fill="{NAVY}"/>
  <text x="260" y="104" text-anchor="middle" font-family="'Playfair Display', serif" font-weight="600" font-size="80" letter-spacing="4" fill="{BONE}">GANU</text>
  <line x1="150" y1="132" x2="240" y2="132" stroke="{LCHAMP}" stroke-width="1.4"/>
  <line x1="280" y1="132" x2="370" y2="132" stroke="{LCHAMP}" stroke-width="1.4"/>
  <text x="260" y="134" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="600" font-size="15" letter-spacing="9" fill="{BONE}">SANAL OFİS</text>
  <text x="260" y="162" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="500" font-size="11" letter-spacing="6" fill="{LCHAMP}">İSTANBUL</text>
</svg>'''
open("out/R1-serif-negatif.svg","w").write(r1n)

# ---- Favicon dayanıklılık testi: küçükte "G" (her iki font) ----
fav_serif = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="22" fill="{NAVY}"/>
  <text x="60" y="84" text-anchor="middle" font-family="'Playfair Display', serif" font-weight="600" font-size="78" fill="{BONE}">G</text>
  <rect x="40" y="96" width="40" height="3" rx="1.5" fill="{LCHAMP}"/>
</svg>'''
open("out/fav-serif.svg","w").write(fav_serif)
fav_sans = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="22" fill="{NAVY}"/>
  <text x="60" y="86" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" font-size="74" fill="{BONE}">G</text>
  <circle cx="92" cy="44" r="7" fill="{LCHAMP}"/>
</svg>'''
open("out/fav-sans.svg","w").write(fav_sans)
print("yazildi: out/*.svg")
