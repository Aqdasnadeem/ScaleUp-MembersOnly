import math, html
from spec import *
W,Hh=2746,1790
NAVY='#1B2745'; BROWN='#7A5C18'; BG='#FFFFFF'
out=[]; 
def esc(s): return html.escape(s,quote=True)
FOOT={
 'businesses':['CHECK date_format IN (DD/MM/YYYY, MM/DD/YYYY)','CHECK low_stock_threshold >= 0'],
 'users':['UQ (email)'],
 'ingestion_jobs':['CHECK upload_type IN (sales, inventory, expenses, feedback)','CHECK status IN (pending, processing, completed,','        completed_with_warnings, failed, replaced)','CHECK total, loaded, rejected, skipped, returned rows >= 0'],
 'customers':['UQ (business_id, customer_key)'],
 'products':['UQ (business_id, product_key)','CHECK cost_price IS NULL OR cost_price >= 0'],
 'column_mappings':['UQ (business_id, upload_type)','CHECK upload_type IN (sales, inventory, expenses, feedback)'],
 'sales':['UQ (business_id, order_id, product_id)','CHECK quantity > 0 · unit_price >= 0 · total_amount >= 0'],
 'inventory':['UQ (business_id, product_id, snapshot_date)','CHECK stock_quantity >= 0'],
 'expenses':['UQ (business_id, row_hash)','CHECK amount >= 0'],
 'feedback':['UQ (business_id, row_hash)','CHECK rating IS NULL OR rating BETWEEN 1 AND 5'],
 'rejected_rows':['CHECK row_number >= 1'],
}
def height(n): return 52+30*len(T[n]['cols'])+26*len(FOOT[n])+16
POS={}
def place(n,x,y,w): POS[n]=(x,y,w,height(n))
x0=80
place('users',60,80,700)
place('businesses',60,80+height('users')+50,700)
place('ingestion_jobs',60,POS['businesses'][1]+height('businesses')+50,700)
place('column_mappings',60,POS['ingestion_jobs'][1]+height('ingestion_jobs')+60,700)
yA=80
for n in ['customers','products','expenses','rejected_rows']:
    place(n,900,yA,700); yA+=height(n)+50
yB=80
for n in ['sales','inventory','feedback']:
    place(n,1840,yB,720); yB+=height(n)+50
def box(n):
    x,y,w,h=POS[n]; t=T[n]; gold=n in('customers','products')
    fill='#FFF6DF' if gold else '#FFFFFF'; stroke='#C8A45D' if gold else NAVY
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="3"/>'
    s+=f'<path d="M{x} {y+52} V{y+10} a10 10 0 0 1 10 -10 H{x+w-10} a10 10 0 0 1 10 10 V{y+52} Z" fill="{NAVY}"/>'
    s+=f'<text x="{x+18}" y="{y+35}" class="th">{n}</text>'
    s+=f'<text x="{x+w-18}" y="{y+35}" text-anchor="end" class="ts">{esc(t["purpose"])}</text>'
    for i,(cn,ty,null,d,k) in enumerate(t['cols']):
        ry=y+52+30*i
        if i%2==1: s+=f'<rect x="{x+2}" y="{ry}" width="{w-4}" height="30" fill="#F3EEE2"/>'
        yy=ry+21
        badge=k if k else ''
        if k=='PK': s+=f'<rect x="{x+12}" y="{ry+5}" width="42" height="20" rx="4" fill="{NAVY}"/><text x="{x+33}" y="{yy-1}" text-anchor="middle" class="bd" fill="#fff">PK</text>'
        if k=='FK': s+=f'<rect x="{x+12}" y="{ry+5}" width="42" height="20" rx="4" fill="{BROWN}"/><text x="{x+33}" y="{yy-1}" text-anchor="middle" class="bd" fill="#fff">FK</text>'
        bold=' font-weight="700"' if k=='PK' else ''
        s+=f'<text x="{x+68}" y="{yy}" class="cn"{bold}>{cn}</text>'
        s+=f'<text x="{x+290}" y="{yy}" class="ct">{esc(ty)}</text>'
        s+=f'<text x="{x+470}" y="{yy-1}" class="cf">{"NULL" if null else "NOT NULL"}</text>'
        par=FK.get((n,cn))
        if par: s+=f'<text x="{x+548}" y="{yy-1}" class="cr">&#8594; {par}</text>'
    fy=y+52+30*len(t['cols'])
    s+=f'<line x1="{x+10}" y1="{fy+4}" x2="{x+w-10}" y2="{fy+4}" stroke="#B9A97E" stroke-width="1.5"/>'
    for j,l in enumerate(FOOT[n]):
        s+=f'<text x="{x+18}" y="{fy+26+26*j}" class="cc">{esc(l)}</text>'
    return s
# ---------- lines & crow's foot
L=[]
def line(a,b,col=NAVY,dash=''): L.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{col}" stroke-width="3" stroke-linecap="round"{(" stroke-dasharray=%s"%chr(34)+dash+chr(34)) if dash else ""}/>')
def parent_mark(p,u,opt,col=NAVY):
    n=(-u[1],u[0])
    def at(d): return (p[0]+u[0]*d,p[1]+u[1]*d)
    def bar(d,h=11):
        c=at(d); L.append(f'<line x1="{c[0]+n[0]*h:.1f}" y1="{c[1]+n[1]*h:.1f}" x2="{c[0]-n[0]*h:.1f}" y2="{c[1]-n[1]*h:.1f}" stroke="{col}" stroke-width="3" stroke-linecap="round"/>')
    if opt:
        bar(10); c=at(25); L.append(f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="7" fill="#fff" stroke="{col}" stroke-width="3"/>')
    else: bar(10); bar(19)
def foot(p2,u,e,col=NAVY):
    a=(p2[0]-u[0]*22,p2[1]-u[1]*22)
    for k in (-14,0,14):
        b=(p2[0]+e[0]*k,p2[1]+e[1]*k); L.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{col}" stroke-width="3" stroke-linecap="round"/>')
LAB=[]
def lab(x,y,t,anchor='middle',col=NAVY): LAB.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" class="card" fill="{col}" stroke="#fff" stroke-width="6" paint-order="stroke">{t}</text>')
def rel(p1,p2,pOpt,e,pl,cl,pa=None,ca=None,col=NAVY):
    dx,dy=p2[0]-p1[0],p2[1]-p1[1]; Ln=math.hypot(dx,dy); u=(dx/Ln,dy/Ln)
    line(p1,p2,col); parent_mark(p1,u,pOpt,col); foot(p2,u,e,col)
    return u
H=(1,0); V=(0,1)
# left column
bx=POS['businesses']; ux=POS['users']; jx=POS['ingestion_jobs']
cxL=60+350
rel((cxL,bx[1]),(cxL,ux[1]+ux[3]),False,H,'','')
lab(cxL+16,bx[1]-12,'1','start'); lab(cxL-16,ux[1]+ux[3]+34,'0..*','end')
rel((cxL,bx[1]+bx[3]),(cxL,jx[1]),False,H,'','')
lab(cxL+16,bx[1]+bx[3]+34,'1','start'); lab(cxL-16,jx[1]-12,'0..*','end')
# to group
GX=840
yb=bx[1]+bx[3]//2; yj=jx[1]+jx[3]//2
rel((760,yb),(GX,yb),False,V,'','')
lab(780,yb-16,'1'); lab(GX+36,yb-16,'0..*')
rel((760,yj),(GX,yj),False,V,'','',col=BROWN)
lab(780,yj-16,'1',col=BROWN); lab(GX+36,yj-16,'0..*',col=BROWN)
# customers -> sales
c=POS['customers']; s=POS['sales']; p=POS['products']; inv=POS['inventory']; fb=POS['feedback']
ycs=c[1]+120
rel((1600,ycs),(1840,ycs),True,V,'','')
lab(1636,ycs-18,'0..1'); lab(1812,ycs-18,'0..*')
# products bus
trunk=1700
ys=s[1]+300; yi=inv[1]+130; yf=fb[1]+130; yp=p[1]+p[3]//2
line((1600,yp),(trunk,yp)); parent_mark((1600,yp),(1,0),False)
line((trunk,ys),(trunk,yf))
lab(1636,yp-18,'1')
for yy,opt in ((ys,False),(yi,False),(yf,True)):
    line((trunk,yy),(1840,yy)); foot((1840,yy),(1,0),V)
    lab(1812,yy-18,'0..*')
# optional circle for feedback branch
L.append(f'<circle cx="{trunk+24}" cy="{yf}" r="7" fill="#fff" stroke="{NAVY}" stroke-width="3"/>')
L.append(f'<line x1="{trunk+10}" y1="{yf-11}" x2="{trunk+10}" y2="{yf+11}" stroke="{NAVY}" stroke-width="3" stroke-linecap="round"/>')
lab(trunk+10,yf+40,'0..1','start')
# group rect
gy=24; gh=max(POS[n][1]+POS[n][3] for n in ['expenses','feedback','rejected_rows'])+40-gy
group=f'<rect x="{GX}" y="{gy}" width="1780" height="{gh}" rx="22" fill="none" stroke="{BROWN}" stroke-width="3" stroke-dasharray="14 10"/>'
gl=f'<rect x="{GX+24}" y="{gy-4}" width="900" height="30" fill="#fff"/><text x="{GX+36}" y="{gy+19}" class="gl">Loaded from files: every row has business_id (navy) and job_id (brown), each 1 to 0..* from its parent</text>'
# legend (bottom right, outside the dashed group)
LX=1840; ly=gy+gh+14
leg=f'<rect x="{LX}" y="{ly}" width="720" height="190" rx="10" fill="#EFE6D2" stroke="#B9A97E" stroke-width="2"/>'
leg+=f'<text x="{LX+18}" y="{ly+30}" class="th2">Legend</text>'
def lg(y,txt,opt):
    rel((LX+30,y),(LX+110,y),opt,V,'','')
    LAB.append(f'<text x="{LX+136}" y="{y+7}" class="lt">{txt}</text>')
lg(ly+64,'1  to  0..*  (one parent, zero or many children)',False)
lg(ly+102,'0..1  to  0..*  (child may have no parent: NULL FK)',True)
LAB.append(f'<rect x="{LX+30}" y="{ly+128}" width="22" height="20" rx="4" fill="{NAVY}"/><text x="{LX+64}" y="{ly+144}" class="lt">PK primary key</text>')
LAB.append(f'<rect x="{LX+260}" y="{ly+128}" width="22" height="20" rx="4" fill="{BROWN}"/><text x="{LX+294}" y="{ly+144}" class="lt">FK foreign key</text>')
LAB.append(f'<text x="{LX+30}" y="{ly+176}" class="lt">UQ unique key · gold tables are built by the ETL · types are PostgreSQL</text>')
# businesses -> column_mappings: route along the left margin
cm=POS['column_mappings']; ybm=bx[1]+60; ycm=cm[1]+60
line((60,ybm),(28,ybm)); line((28,ybm),(28,ycm)); line((28,ycm),(60,ycm))
parent_mark((60,ybm),(-1,0),False); foot((60,ycm),(1,0),V)
lab(20,ybm-14,'1','end'); lab(20,ycm-14,'0..*','end')
style='''<style>
text{font-family:"Segoe UI",Inter,Arial,sans-serif}
.th{font-size:26px;font-weight:800;fill:#fff}.ts{font-size:15px;fill:#D9DEEC}
.cn{font-family:Consolas,"DejaVu Sans Mono",monospace;font-size:19px;fill:#1B2745}
.ct{font-family:Consolas,"DejaVu Sans Mono",monospace;font-size:18px;fill:#33405E}
.cf{font-size:14px;fill:#6B7385}.cr{font-size:14px;fill:#7A5C18}.bd{font-size:13px;font-weight:800}
.cc{font-family:Consolas,"DejaVu Sans Mono",monospace;font-size:15px;fill:#33405E}
.card{font-size:21px;font-weight:800}.gl{font-size:20px;font-weight:700;fill:#7A5C18}
.title{font-size:34px;font-weight:800;fill:#1B2745}.sub{font-size:18px;fill:#33405E}
.th2{font-size:22px;font-weight:800;fill:#1B2745}.lt{font-size:19px;fill:#1B2745}
</style>'''
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {Hh}" width="{W}" height="{Hh}">{style}<rect width="{W}" height="{Hh}" fill="#fff"/>'
svg+='<g transform="translate(46 0)"><text x="60" y="38" class="title">Scale Up: ERD (crow\'s foot)</text><text x="60" y="62" class="sub">PostgreSQL 16 · generated from the same spec as the migrations · 11 tables</text>'
svg+=group+leg+''.join(L)+''.join(box(n) for n in ORDER)+gl+''.join(LAB)+'</g></svg>'
open('erd.svg','w').write(svg)
open('erd.html','w').write('<!doctype html><html><head><meta charset="utf-8"><title>Scale Up ERD</title><style>body{margin:0;background:#fff}svg{width:100%;height:auto;display:block}</style></head><body>'+svg+'</body></html>')
print({n:POS[n] for n in POS}, 'bottom',max(v[1]+v[3] for v in POS.values()), 'legend bottom', ly+190)
