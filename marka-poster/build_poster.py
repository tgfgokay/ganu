#!/usr/bin/env python3
# GANU — "Meridian Quiet" brand poster
# A cartographic editorial plate: the address as a single located coordinate.
import math, random
from PIL import Image, ImageDraw, ImageFont

FONTS = "/Users/gul/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/faded661-eda0-4df4-a4e0-80fc38fd4940/6a082a12-31b4-4a9d-b2b7-cc53b1770976/skills/canvas-design/canvas-fonts"
OUT   = "/Users/gul/sanal/marka-poster/GANU-meridian-quiet.png"

S  = 2                      # supersample
W, H = 2000*S, 2600*S       # working space
M  = 200*S                  # outer margin

PAPER = (244, 239, 231)
NAVY  = (10, 37, 64)
TEAL  = (0, 212, 178)
INK   = (10, 37, 64)

def navy(a):   return NAVY + (a,)
def teal(a):   return TEAL + (a,)

def font(name, size): return ImageFont.truetype(f"{FONTS}/{name}", int(size))

# ---- type families (Fraunces->InstrumentSerif editorial, Jakarta->Outfit, mono->GeistMono)
SERIF   = "InstrumentSerif-Regular.ttf"
SERIF_I = "InstrumentSerif-Italic.ttf"
SANS    = "Outfit-Regular.ttf"
SANS_B  = "Outfit-Bold.ttf"
MONO    = "GeistMono-Regular.ttf"

img  = Image.new("RGB", (W, H), PAPER)
draw = ImageDraw.Draw(img, "RGBA")

# ---------- subtle paper grain ----------
random.seed(29)
grain = Image.new("L", (W//4, H//4), 0)
gp = grain.load()
for y in range(grain.height):
    for x in range(grain.width):
        gp[x, y] = random.randint(0, 12)
grain = grain.resize((W, H))
noise = Image.new("RGB", (W, H), (0, 0, 0))
img = Image.composite(Image.new("RGB", (W, H), (222, 214, 201)), img, grain.point(lambda v: int(v*0.5)))
draw = ImageDraw.Draw(img, "RGBA")

# ---------- helpers ----------
def text_ls(xy, s, fnt, fill, ls=0, anchor_l=True, right=None):
    """draw letter-spaced text; returns total width"""
    x, y = xy
    widths = [draw.textlength(ch, font=fnt) for ch in s]
    total = sum(widths) + ls*(len(s)-1 if len(s) else 0)
    if right is not None:
        x = right - total
    elif not anchor_l:
        x = x - total/2
    cx = x
    for ch, w in zip(s, widths):
        draw.text((cx, y), ch, font=fnt, fill=fill)
        cx += w + ls
    return total

def hairline(p1, p2, fill, w=1):
    draw.line([p1, p2], fill=fill, width=int(w))

def ring(cx, cy, r, fill, w=2):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=fill, width=int(w))

def dashed_ring(cx, cy, r, fill, w=2, seg=6, gap=5):
    circ = 2*math.pi*r
    n = max(24, int(circ/(seg+gap)))
    for i in range(n):
        a0 = (i/n)*360
        a1 = a0 + (seg/(seg+gap))*(360/n)
        draw.arc([cx-r, cy-r, cx+r, cy+r], a0, a1, fill=fill, width=int(w))

# ======================================================================
# GRID FIELD  (faint atlas lattice)
# ======================================================================
gx0, gy0 = M, 388*S
gx1, gy1 = W-M, 2180*S
step = 68*S
# minor grid
x = gx0
while x <= gx1+1:
    hairline((x, gy0), (x, gy1), navy(15), 1*S)
    x += step
y = gy0
while y <= gy1+1:
    hairline((gx0, y), (gx1, y), navy(15), 1*S)
    y += step
# field frame
draw.rectangle([gx0, gy0, gx1, gy1], outline=navy(40), width=1*S)

# edge reference ticks + monospace indices (longitude top / latitude left)
mono_s = font(MONO, 15*S)
lon0 = 29.040
i = 0
x = gx0
while x <= gx1+1:
    long = (i % 5 == 0)
    tl = 16*S if long else 8*S
    hairline((x, gy0), (x, gy0 - tl), navy(70), 1*S)
    if long:
        lab = f"{lon0 + i*0.006:0.3f}"
        text_ls((x, gy0 - tl - 26*S), lab, mono_s, navy(120), 1, anchor_l=False)
    i += 1; x += step
lat0 = 41.150
j = 0
y = gy0
while y <= gy1+1:
    long = (j % 5 == 0)
    tl = 16*S if long else 8*S
    hairline((gx0, y), (gx0 - tl, y), navy(70), 1*S)
    if long:
        lab = f"{lat0 - j*0.006:0.3f}"
        draw.text((gx0 - tl - 12*S, y - 8*S), lab, font=mono_s, fill=navy(120), anchor="rm")
    j += 1; y += step

# ======================================================================
# MASTHEAD
# ======================================================================
# wordmark GANU.
wm = font(SANS_B, 52*S)
wx = M
draw.text((wx, 150*S), "GANU", font=wm, fill=NAVY)
wlen = draw.textlength("GANU", font=wm)
draw.text((wx + wlen + 4*S, 150*S), ".", font=wm, fill=TEAL)
# right kicker
kick = font(MONO, 20*S)
text_ls((0, 168*S), "PLAK Nº 01 — İSTANBUL", kick, navy(160), 3*S, right=W-M)
# thin rule under masthead
hairline((M, 250*S), (W-M, 250*S), navy(90), 1*S)
lab_s = font(SANS, 19*S)
text_ls((M, 262*S), "ANAHTAR TESLİM SANAL OFİS", lab_s, navy(120), 6*S)
text_ls((0, 262*S), "KAVACIK · BEYKOZ", lab_s, navy(120), 6*S, right=W-M)

# ======================================================================
# THE LOCATED POINT  (the address, as a postmark / coordinate)
# ======================================================================
px, py = int(1360*S), int(1010*S)

# full meridian crosshair, edge to edge within field
hairline((gx0, py), (gx1, py), navy(55), 1*S)
hairline((px, gy0), (px, gy1), navy(55), 1*S)

# concentric postmark rings
ring(px, py, 62*S,  navy(150), 2*S)
ring(px, py, 120*S, navy(90),  1*S)
ring(px, py, 188*S, TEAL + (255,), 3*S)          # the single accent ring
ring(px, py, 262*S, navy(60),  1*S)
dashed_ring(px, py, 328*S, navy(120), 2*S, seg=7, gap=6)   # cancellation ring

# crosshair ticks at center
for a in (0, 90, 180, 270):
    dx, dy = math.cos(math.radians(a)), math.sin(math.radians(a))
    hairline((px+dx*30*S, py+dy*30*S), (px+dx*52*S, py+dy*52*S), navy(200), 2*S)
# center dot
draw.ellipse([px-11*S, py-11*S, px+11*S, py+11*S], fill=TEAL)
draw.ellipse([px-4*S, py-4*S, px+4*S, py+4*S], fill=NAVY)

# leader + coordinate caption (below-right of the point)
lead_y = py + 400*S
hairline((px, py+328*S), (px, lead_y-30*S), navy(120), 1*S)
hairline((px, lead_y-30*S), (px+150*S, lead_y-30*S), navy(120), 1*S)
capx = px + 168*S
cap_small = font(MONO, 19*S)
cap_big   = font(MONO, 27*S)
text_ls((capx, lead_y-52*S), "TESCİLLİ NOKTA / THE ADDRESS", cap_small, navy(150), 2*S)
draw.text((capx, lead_y-14*S), "41.0918° K   29.0836° D", font=cap_big, fill=NAVY)
text_ls((capx, lead_y+30*S), "KAVACIK MAH. · OKUL CAD. Nº 29", cap_small, navy(150), 1*S)

# ======================================================================
# COMPASS + SCALE BAR  (cartographic marginalia, lower-right)
# ======================================================================
cxx, cyy = W-M-70*S, 1980*S
ring(cxx, cyy, 46*S, navy(120), 1*S)
hairline((cxx, cyy-58*S), (cxx, cyy-46*S), navy(180), 2*S)
draw.polygon([(cxx, cyy-40*S), (cxx-9*S, cyy+2*S), (cxx+9*S, cyy+2*S)], fill=NAVY)
draw.polygon([(cxx, cyy-40*S), (cxx-9*S, cyy+2*S), (cxx, cyy+2*S)], fill=navy(120))
text_ls((cxx, cyy-92*S), "N", font(SANS_B, 22*S), NAVY, 0, anchor_l=False)
# scale bar
sbx, sby, seg = W-M-320*S, 2070*S, 62*S
for k in range(4):
    fill = NAVY if k % 2 == 0 else PAPER
    draw.rectangle([sbx+k*seg, sby, sbx+(k+1)*seg, sby+10*S],
                   fill=fill, outline=NAVY, width=1*S)
text_ls((sbx, sby+22*S), "0", cap_small, navy(150), 0)
text_ls((sbx+4*seg-12*S, sby+22*S), "1 km", cap_small, navy(150), 0)

# ======================================================================
# DISPLAY STATEMENT (lower-left) — the anchor phrase, as art
# ======================================================================
d_roman = font(SERIF,   280*S)
d_ital  = font(SERIF_I, 280*S)
bx = M
draw.text((bx, 1740*S), "Adresin", font=d_roman, fill=NAVY)
draw.text((bx-6*S, 1988*S), "hazır", font=d_ital, fill=NAVY)
# small closing line with teal period
sl = font(SANS, 36*S)
cy2 = 2322*S
tw = text_ls((bx+8*S, cy2), "gerisi bizde", sl, navy(210), 10*S)
draw.text((bx+8*S+tw+8*S, cy2), ".", font=sl, fill=TEAL)

# ======================================================================
# COLOPHON
# ======================================================================
hairline((M, 2430*S), (W-M, 2430*S), navy(90), 1*S)
colo = font(MONO, 20*S)
text_ls((M, 2446*S), "GANU · SANAL OFİS — İSTANBUL", colo, navy(150), 2*S)
text_ls((0, 2446*S), "NAVY 0A2540 · TEAL 00D4B2", colo, navy(150), 2*S, right=W-M)

# corner registration crosshairs
def regmark(cx, cy):
    hairline((cx-18*S, cy), (cx+18*S, cy), navy(120), 1*S)
    hairline((cx, cy-18*S), (cx, cy+18*S), navy(120), 1*S)
for (cx, cy) in [(M-70*S, M-70*S), (W-M+70*S, M-70*S),
                 (M-70*S, H-M+70*S), (W-M+70*S, H-M+70*S)]:
    regmark(cx, cy)

# ---------- downscale for crisp anti-aliasing ----------
final = img.resize((W//S, H//S), Image.LANCZOS)
final.save(OUT, "PNG")
print("saved", OUT, final.size)
