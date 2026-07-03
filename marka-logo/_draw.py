#!/usr/bin/env python3
"""GANU 4.2 — custom geometric monoline lowercase 'ganu' with teal address-point in the 'a'.
Parametric so we can tune. Emits master (transparent) + preview (paper) SVGs."""
import math, sys

# ---- brand ----
NAVY = "#0A2540"
TEAL = "#00D4B2"
PAPER = "#F4EFE7"

# ---- type parameters (design units) ----
xh   = 300.0          # x-height
w    = 54.0           # monoline stroke width
R    = xh/2 - w/2     # bowl centreline radius (so outer edge spans full x-height)
ra   = 97.0           # arch radius for n / u
gap  = 46.0           # visual gap between adjacent strokes
mid  = 250.0          # bowl vertical centre (baseline 400, top 100)
top  = 100.0
base = 400.0
dd   = 150.0          # g descender depth below baseline

# tail geometry (g)
tail_r = 116.0

# dot
dot_r = 44.0

LM = 60.0             # left margin

# ---- x layout ----
Cg = LM + R                       # g bowl centre x
a_gap_stroke = gap
Ca = Cg + 2*R + gap               # a bowl centre x
a_stem_x = Ca + R
Nx = a_stem_x + w/2 + gap + w/2   # n left stem x (centre)
n_r_stem = Nx + 2*ra
Ux = n_r_stem + w/2 + gap + w/2   # u left stem x (centre)
u_r_stem = Ux + 2*ra
RM = 60.0
Wtot = u_r_stem + w/2 + RM
# vertical canvas
Htop = 40.0
Hbot = base + dd + w/2 + 40.0

def f(x): return f"{x:.2f}"

def circle_path(cx, cy, r):
    # full circle as two arcs
    return (f"M {f(cx-r)} {f(cy)} "
            f"A {f(r)} {f(r)} 0 1 0 {f(cx+r)} {f(cy)} "
            f"A {f(r)} {f(r)} 0 1 0 {f(cx-r)} {f(cy)} Z")

def build_paths():
    P = []
    # --- g : bowl + right stem descending into open tail ---
    P.append(('bowl', circle_path(Cg, mid, R)))
    # stem + tail (one open stroke)
    gsx = Cg + R
    tail_end_x = gsx - 2*tail_r + 24
    tail_end_y = base + dd - tail_r + 18
    g_stem = (f"M {f(gsx)} {f(top + w/2)} "
              f"L {f(gsx)} {f(base + dd - tail_r)} "
              f"A {f(tail_r)} {f(tail_r)} 0 0 1 {f(tail_end_x)} {f(tail_end_y)}")
    P.append(('gstem', g_stem))

    # --- a : bowl + full-height right stem ---
    P.append(('bowl', circle_path(Ca, mid, R)))
    astem = f"M {f(a_stem_x)} {f(top + w/2)} L {f(a_stem_x)} {f(base - w/2)}"
    P.append(('astem', astem))

    # --- n : left stem, upper arch, right stem ---
    cy_n = top + ra + w/2   # so arch OUTER ink apex lands exactly on x-height top
    n = (f"M {f(Nx)} {f(base - w/2)} "
         f"L {f(Nx)} {f(cy_n)} "
         f"A {f(ra)} {f(ra)} 0 0 1 {f(Nx + 2*ra)} {f(cy_n)} "
         f"L {f(Nx + 2*ra)} {f(base - w/2)}")
    P.append(('n', n))

    # --- u : left stem, lower arch, right stem ---
    cy_u = base - ra - w/2   # so arch OUTER ink apex lands exactly on baseline
    u = (f"M {f(Ux)} {f(top + w/2)} "
         f"L {f(Ux)} {f(cy_u)} "
         f"A {f(ra)} {f(ra)} 0 0 0 {f(Ux + 2*ra)} {f(cy_u)} "
         f"L {f(Ux + 2*ra)} {f(top + w/2)}")
    P.append(('u', u))
    return P

def wordmark_group(ink=NAVY, dotc=TEAL, tx=0.0, ty=0.0, s=1.0):
    """Return an <g> containing the 'ganu' wordmark, translated+scaled.
    Natural coordinate box is x:[0,Wtot], y:[Htop,Hbot]."""
    paths = build_paths()
    L = [f'<g transform="translate({f(tx)},{f(ty)}) scale({s})">']
    L.append(f'  <g fill="none" stroke="{ink}" stroke-width="{f(w)}" '
             f'stroke-linecap="round" stroke-linejoin="round">')
    for _kind, d in paths:
        L.append(f'    <path d="{d}"/>')
    L.append('  </g>')
    L.append(f'  <circle cx="{f(Ca)}" cy="{f(mid)}" r="{f(dot_r)}" fill="{dotc}"/>')
    L.append('</g>')
    return "\n".join(L)

def svg(bg=None):
    paths = build_paths()
    out = []
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(Wtot)}" height="{f(Hbot-Htop)}" '
               f'viewBox="0 {f(Htop)} {f(Wtot)} {f(Hbot-Htop)}">')
    if bg:
        out.append(f'  <rect x="0" y="{f(Htop)}" width="{f(Wtot)}" height="{f(Hbot-Htop)}" fill="{bg}"/>')
    out.append(f'  <g fill="none" stroke="{NAVY}" stroke-width="{f(w)}" '
               f'stroke-linecap="round" stroke-linejoin="round">')
    for kind, d in paths:
        if kind == 'bowl':
            out.append(f'    <path d="{d}"/>')
        else:
            out.append(f'    <path d="{d}"/>')
    out.append('  </g>')
    # teal address-point inside 'a'
    out.append(f'  <circle cx="{f(Ca)}" cy="{f(mid)}" r="{f(dot_r)}" fill="{TEAL}"/>')
    out.append('</svg>')
    return "\n".join(out)

if __name__ == "__main__":
    open("ganu-4.2-master.svg","w").write(svg(bg=None))
    open("ganu-4.2-preview.svg","w").write(svg(bg=PAPER))
    print("wrote ganu-4.2-master.svg + ganu-4.2-preview.svg")
    print(f"canvas {f(Wtot)} x {f(Hbot-Htop)}  (aspect {Wtot/(Hbot-Htop):.2f})")
