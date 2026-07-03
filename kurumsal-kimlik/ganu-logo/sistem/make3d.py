#!/usr/bin/env python3
# GANU P3 — 3D ekstrüzyon SVG üretici (faux-3D: katmanlı offset + gradyan + gölge)
FONT = "Bricolage Grotesque, sans-serif"

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i]-a[i])*t) for i in range(3))

def hx(c):
    return "#%02X%02X%02X" % c

def extrude_text(text, cx, cy, size, ls, front_hex, side_top, side_bot,
                 dx=0.85, dy=0.95, steps=30, anchor="middle", weight=700):
    """Geriden öne katmanlı text kopyaları = ekstrüzyon gövdesi, sonra ön yüz."""
    out = []
    # en derinden öne: i=steps (en uzak) -> i=1
    for i in range(steps, 0, -1):
        t = (i-1)/(steps-1) if steps > 1 else 0   # 1=en uzak(koyu), 0=öne yakın
        col = hx(lerp(side_bot, side_top, 1-t))
        ox, oy = dx*i, dy*i
        out.append(
            f'<text x="{cx+ox:.2f}" y="{cy+oy:.2f}" text-anchor="{anchor}" '
            f'font-family="{FONT!s}" font-weight="{weight}" font-size="{size}" '
            f'letter-spacing="{ls}" fill="{col}">{text}</text>')
    # ön yüz (gradyan ile)
    out.append(
        f'<text x="{cx:.2f}" y="{cy:.2f}" text-anchor="{anchor}" '
        f'font-family="{FONT!s}" font-weight="{weight}" font-size="{size}" '
        f'letter-spacing="{ls}" fill="url(#front)">{text}</text>')
    return "\n  ".join(out)

# ---------- 1) 3D AVATAR: kömür zeminde mercan ekstrüzyonlu "G" ----------
coral_front_top = (244,128,98)   # açık mercan (üst ışık)
coral_front_bot = (210,86,55)    # koyu mercan
coral_side_top  = (176,64,40)
coral_side_bot  = (110,38,22)

avatar = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <radialGradient id="bg" cx="38%" cy="30%" r="85%">
      <stop offset="0%" stop-color="#34373D"/>
      <stop offset="100%" stop-color="#202227"/>
    </radialGradient>
    <linearGradient id="front" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0%" stop-color="{hx(coral_front_top)}"/>
      <stop offset="100%" stop-color="{hx(coral_front_bot)}"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="6" dy="9" stdDeviation="9" flood-color="#000000" flood-opacity="0.40"/>
    </filter>
  </defs>
  <rect width="240" height="240" rx="48" fill="url(#bg)"/>
  <g filter="url(#sh)">
  {extrude_text("G", 108, 158, 168, -4, hx(coral_front_top), coral_side_top, coral_side_bot, dx=0.50, dy=0.56, steps=58)}
  </g>
  <!-- ince üst ışık çizgisi -->
  <rect x="74" y="182" width="86" height="10" rx="5" fill="#E2603F"/>
  <rect x="74" y="182" width="86" height="4" rx="2" fill="#F59E82" opacity="0.8"/>
</svg>'''

with open("P3-3d-avatar.svg", "w") as f:
    f.write(avatar)

# ---------- 2) 3D WORDMARK: açık zeminde kömür ekstrüzyonlu "GANU" ----------
char_front_top = (60,63,69)
char_front_bot = (33,35,40)
char_side_top  = (150,147,141)
char_side_bot  = (96,93,88)

word = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 220">
  <defs>
    <linearGradient id="front" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0%" stop-color="{hx(char_front_top)}"/>
      <stop offset="100%" stop-color="{hx(char_front_bot)}"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="3" dy="6" stdDeviation="6" flood-color="#3a2a22" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="520" height="220" fill="#FBFAF8"/>
  <g filter="url(#sh)">
  {extrude_text("GANU", 258, 130, 96, -3, hx(char_front_top), char_side_top, char_side_bot, dx=0.40, dy=0.46, steps=46)}
  </g>
  <rect x="196" y="150" width="128" height="7" rx="3.5" fill="#E2603F"/>
  <text x="260" y="190" text-anchor="middle" font-family="{FONT}" font-weight="700" font-size="13" letter-spacing="9" fill="#26282C" opacity="0.6">SANAL OFİS · İSTANBUL</text>
</svg>'''

with open("P3-3d-yatay.svg", "w") as f:
    f.write(word)

print("yazildi: P3-3d-avatar.svg, P3-3d-yatay.svg")
