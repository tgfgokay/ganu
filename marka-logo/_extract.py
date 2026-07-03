#!/usr/bin/env python3
"""Extract 'ganu' glyph outlines as SVG paths + detect the 'a' counter centre."""
import sys
from fontTools import ttLib
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

def contour_bboxes(glyphset, gname):
    """Return list of (bbox, area) per contour for a glyph."""
    rec = RecordingPen()
    glyphset[gname].draw(rec)
    contours, cur = [], []
    for op, args in rec.value:
        if op == "moveTo":
            if cur: contours.append(cur)
            cur = [args[0]]
        elif op in ("lineTo","qCurveTo","curveTo"):
            for p in args:
                if p is not None: cur.append(p)
        elif op == "closePath":
            if cur: contours.append(cur); cur=[]
    if cur: contours.append(cur)
    out=[]
    for c in contours:
        xs=[p[0] for p in c]; ys=[p[1] for p in c]
        bb=(min(xs),min(ys),max(xs),max(ys))
        area=(bb[2]-bb[0])*(bb[3]-bb[1])
        out.append((bb,area))
    return out

def extract(font_path, text, wght=None, font_number=0):
    font = ttLib.TTFont(font_path, fontNumber=font_number)
    if wght is not None and "fvar" in font:
        instantiateVariableFont(font, {"wght": wght}, inplace=True)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    x=0; glyphs=[]
    for ch in text:
        gname = cmap[ord(ch)]
        pen = SVGPathPen(gs); gs[gname].draw(pen)
        d = pen.getCommands()
        adv = hmtx[gname][0]
        bp = BoundsPen(gs); gs[gname].draw(bp)
        info={"ch":ch,"gname":gname,"d":d,"x":x,"adv":adv,"bounds":bp.bounds}
        if ch=="a":
            cbs = contour_bboxes(gs, gname)
            cbs.sort(key=lambda t:t[1])          # smallest area first = counter
            counter = cbs[0][0]
            info["counter"] = counter
            info["counter_cx"] = x + (counter[0]+counter[2])/2
            info["counter_cy"] = (counter[1]+counter[3])/2
            info["counter_w"] = counter[2]-counter[0]
            info["counter_h"] = counter[3]-counter[1]
        glyphs.append(info)
        x += adv
    return {"upem":upem,"glyphs":glyphs,"advance":x}

if __name__=="__main__":
    import json
    font_path=sys.argv[1]; wght=float(sys.argv[2]) if len(sys.argv)>2 and sys.argv[2]!="-" else None
    fn=int(sys.argv[3]) if len(sys.argv)>3 else 0
    r=extract(font_path,"ganu",wght,fn)
    # strip 'd' for readable summary
    summ={"upem":r["upem"],"advance":r["advance"],
          "glyphs":[{k:v for k,v in g.items() if k!="d"} for g in r["glyphs"]]}
    print(json.dumps(summ,indent=2))
