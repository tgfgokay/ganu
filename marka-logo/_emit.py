#!/usr/bin/env python3
"""Render + measure the 'ganu' wordmark, then emit final assets:
   - ganu-4.2-master.svg / -preview.svg (tight viewBox)
   - favicon.svg  (letterless address-point mark)
   - GanuMark.jsx (React inline-SVG component)
   - prints the OG wordmark <g> snippet."""
import subprocess
import _draw as D
from PIL import Image

def f(x): return f"{x:.2f}"

# ---- 1. render generous master + measure exact ink bbox ----
open("_measure.svg", "w").write(D.svg(bg=None))
subprocess.run(["rsvg-convert", "_measure.svg", "-o", "_measure.png"], check=True)
im = Image.open("_measure.png").convert("RGBA")
l, t, r, b = im.getbbox()               # px; render is 1:1 with viewBox miny=Htop
PAD = 8
vx = l - PAD
vy = (t + D.Htop) - PAD
vw = (r - l) + 2*PAD
vh = (b - t) + 2*PAD
print(f"ink bbox svg-space: x[{l}..{r}] y[{t+D.Htop}..{b+D.Htop}]")
print(f"tight viewBox: {f(vx)} {f(vy)} {f(vw)} {f(vh)}  aspect {vw/vh:.3f}")

paths = D.build_paths()

def wordmark_svg(bg=None, w_attr=True):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" '
         + (f'width="{f(vw)}" height="{f(vh)}" ' if w_attr else '')
         + f'viewBox="{f(vx)} {f(vy)} {f(vw)} {f(vh)}">']
    if bg:
        o.append(f'  <rect x="{f(vx)}" y="{f(vy)}" width="{f(vw)}" height="{f(vh)}" fill="{bg}"/>')
    o.append(D.wordmark_group(ink=D.NAVY, dotc=D.TEAL))
    o.append('</svg>')
    return "\n".join(o)

open("ganu-4.2-master.svg", "w").write(wordmark_svg(bg=None))
open("ganu-4.2-preview.svg", "w").write(wordmark_svg(bg=D.PAPER))

# ---- 2. favicon: letterless address-point mark (navy square + cream ring + teal dot) ----
S = 64
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <rect width="{S}" height="{S}" rx="14" fill="{D.NAVY}"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="{D.PAPER}" stroke-width="5.5"/>
  <circle cx="32" cy="32" r="9.5" fill="{D.TEAL}"/>
</svg>
'''
open("favicon.svg", "w").write(fav)

# light favicon variant (paper bg) for reference
fav_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <rect width="{S}" height="{S}" rx="14" fill="{D.PAPER}"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="{D.NAVY}" stroke-width="5.5"/>
  <circle cx="32" cy="32" r="9.5" fill="{D.TEAL}"/>
</svg>
'''
open("favicon-light.svg", "w").write(fav_light)

# ---- 3. React component ----
path_lines = "\n".join(f'        <path d="{d}" />' for _k, d in paths)
jsx = '''// Auto-generated from marka-logo/_draw.py — GANU 4.2 wordmark ("ganu" + adres noktası).
// Edit the generator, not this file.
export default function GanuMark({
  color = 'currentColor',
  dot = '__TEAL__',
  title = 'ganu',
  className = '',
  ...rest
}) {
  return (
    <svg
      className={className}
      viewBox="__VB__"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <title>{title}</title>
      <g fill="none" stroke={color} strokeWidth="__W__" strokeLinecap="round" strokeLinejoin="round">
__PATHS__
      </g>
      <circle cx="__CA__" cy="__MID__" r="__DOTR__" fill={dot} />
    </svg>
  );
}
'''
jsx = (jsx.replace("__NAVY__", D.NAVY).replace("__TEAL__", D.TEAL)
          .replace("__VB__", f"{f(vx)} {f(vy)} {f(vw)} {f(vh)}")
          .replace("__W__", f(D.w)).replace("__PATHS__", path_lines)
          .replace("__CA__", f(D.Ca)).replace("__MID__", f(D.mid))
          .replace("__DOTR__", f(D.dot_r)))
open("GanuMark.jsx", "w").write(jsx)

# ---- 4. OG wordmark snippet (cream on navy), baseline ~112, left ~90 ----
s_og = 42.0 / D.xh          # x-height ~42px
tx_og = 90 - l * s_og
ty_og = 112 - D.base * s_og
og_group = D.wordmark_group(ink=D.PAPER, dotc=D.TEAL, tx=tx_og, ty=ty_og, s=s_og)
print("\n--- OG wordmark <g> (replace the GANU. <text> in og.svg) ---")
print(og_group)

print("\nwrote: ganu-4.2-master.svg, ganu-4.2-preview.svg, favicon.svg, favicon-light.svg, GanuMark.jsx")
