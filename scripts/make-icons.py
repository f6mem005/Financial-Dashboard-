#!/usr/bin/env python3
"""Draws the app icons into icons/: a pie chart with a dollar sign in the middle and a small calculator in the corner
(pass --no-calculator for the plainer pie-and-dollar version). Needs Pillow and a bold sans font. Run: python3 scripts/make-icons.py
The PNGs are committed, so this only needs re-running if the design changes."""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont
BT,BB=(72,52,200),(24,160,220)   # indigo to sky blue
FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'Arial Bold.ttf']
def font(px):
    for f in FONTS:
        try: return ImageFont.truetype(f, px)
        except OSError: pass
    raise SystemExit('No bold font found for the dollar sign; install DejaVu Sans Bold or edit FONTS.')
def grad(n):
    im=Image.new('RGB',(n,n)); px=im.load()
    for y in range(n):
        for x in range(n):
            t=(x+y)/(2*n-2); px[x,y]=tuple(round(BT[i]+(BB[i]-BT[i])*t) for i in range(3))
    return im
EDGE=(255,255,255)    # thin white lines between the slices
HOLE=(44,40,150)      # deep indigo behind the dollar sign
GREEN,GOLD,CORAL,SKY='#2fd08a','#ffc83d','#ff6b6b','#5fd0ff'
def icon(size, safe, calc):
    S=3; n=size*S; im=grad(n); d=ImageDraw.Draw(im)
    R=n*safe*(0.36 if calc else 0.42)
    cx=n*(0.5-(0.07*safe if calc else 0)); cy=n*(0.5-(0.07*safe if calc else 0))
    slices=[(0,115,GREEN),(115,200,SKY),(200,292,CORAL),(292,360,GOLD)]
    for a,b,col in slices:
        mid=math.radians((a+b)/2); off=R*0.07 if col==GOLD else 0
        ox,oy=cx+off*math.cos(mid),cy+off*math.sin(mid)
        d.pieslice([ox-R,oy-R,ox+R,oy+R],a,b,fill=col,outline=EDGE,width=max(2,round(n*0.008)))
    hr=R*0.50
    d.ellipse([cx-hr,cy-hr,cx+hr,cy+hr],fill=HOLE,outline='white',width=max(2,round(n*0.008)))
    f=font(round(R*0.78))
    d.text((cx,cy),'$',font=f,fill='white',anchor='mm')
    if calc:
        w=n*safe*0.34; h=w*1.22; x1=n*0.5+n*safe*0.5-w*1.0; y1=n*0.5+n*safe*0.5-h*1.0
        x0,y0=x1-0,y1-0
        # body (with a blue halo so it separates from the pie)
        pad=n*0.014
        d.rounded_rectangle([x0-pad,y0-pad,x0+w+pad,y0+h+pad],radius=w*0.16,fill=HOLE)
        d.rounded_rectangle([x0,y0,x0+w,y0+h],radius=w*0.14,fill='#ffffff')
        m=w*0.12; d.rounded_rectangle([x0+m,y0+m,x0+w-m,y0+m+h*0.24],radius=w*0.05,fill=GREEN)
        ky=y0+m+h*0.24+m*0.9; kw=(w-2*m-2*m*0.6)/3; kh=(y0+h-m-ky-m*0.6)/2
        for r in range(2):
            for c in range(3):
                col=[[SKY,SKY,CORAL],[GOLD,SKY,GREEN]][r][c]
                kx=x0+m+c*(kw+m*0.6); kyy=ky+r*(kh+m*0.6)
                d.rounded_rectangle([kx,kyy,kx+kw,kyy+kh],radius=kw*0.2,fill=col)
    return im.resize((size,size),Image.LANCZOS)
def rounded(img):
    n=img.size[0]; m=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(m).rounded_rectangle([0,0,n*4-1,n*4-1],radius=n*4*0.22,fill=255)
    m=m.resize((n,n),Image.LANCZOS); o=Image.new('RGBA',(n,n),(0,0,0,0)); o.paste(img,(0,0),m); return o

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
CALC = '--no-calculator' not in sys.argv
os.makedirs(OUT, exist_ok=True)
rounded(icon(192, 0.9, CALC)).save(os.path.join(OUT, 'icon-192.png'), optimize=True)
rounded(icon(512, 0.9, CALC)).save(os.path.join(OUT, 'icon-512.png'), optimize=True)
icon(512, 0.62, CALC).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)   # full-bleed square: the OS crops it, so the art stays in the middle
icon(180, 0.8, CALC).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)     # iOS rounds the corners itself
print('icons written to', os.path.abspath(OUT), '(with calculator)' if CALC else '(without calculator)')
