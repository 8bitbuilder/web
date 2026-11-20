"""Restyle Quarto's default pptx reference doc to match aaic_slides_style.scss.

Regenerate aaic-slides-template.pptx (run from this folder):
    quarto pandoc -o ref-default.pptx --print-default-data-file reference.pptx
    mkdir ref && (cd ref && unzip -q ../ref-default.pptx)
    python3 build-pptx-template.py ref ../3-regression/images/logo_white_smaller.png aaic-slides-template.pptx
    rm -rf ref ref-default.pptx
Edit FOOTER below for other modules.
"""
import re, shutil, sys, zipfile, os
from pathlib import Path

SRC = Path(sys.argv[1])        # unpacked default reference dir
LOGO = Path(sys.argv[2])       # images/logo_white_smaller.png
OUT = Path(sys.argv[3])        # output .pptx
FOOTER = "AAIC — Water Quality"

work = OUT.with_suffix(".build")
if work.exists():
    shutil.rmtree(work)
shutil.copytree(SRC, work)
P = work / "ppt"

def rd(p): return (P / p).read_text(encoding="utf-8")
def wr(p, s): (P / p).write_text(s, encoding="utf-8")

# ---------------------------------------------------------------- theme
t = rd("theme/theme1.xml")
clr = ('<a:clrScheme name="AAIC">'
       '<a:dk1><a:srgbClr val="222222"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>'
       '<a:dk2><a:srgbClr val="006C93"/></a:dk2><a:lt2><a:srgbClr val="F5F5F5"/></a:lt2>'
       '<a:accent1><a:srgbClr val="006C93"/></a:accent1><a:accent2><a:srgbClr val="00746F"/></a:accent2>'
       '<a:accent3><a:srgbClr val="FF8200"/></a:accent3><a:accent4><a:srgbClr val="2197A9"/></a:accent4>'
       '<a:accent5><a:srgbClr val="8D2048"/></a:accent5><a:accent6><a:srgbClr val="579584"/></a:accent6>'
       '<a:hlink><a:srgbClr val="2197A9"/></a:hlink><a:folHlink><a:srgbClr val="00746F"/></a:folHlink>'
       '</a:clrScheme>')
t = re.sub(r'<a:clrScheme .*?</a:clrScheme>', clr, t, flags=re.S)
t = re.sub(r'(<a:majorFont><a:latin typeface=")[^"]*"', r'\1Tinos"', t)
t = re.sub(r'(<a:minorFont><a:latin typeface=")[^"]*"', r'\1Montserrat"', t)
t = re.sub(r'<a:fontScheme name="[^"]*"', '<a:fontScheme name="AAIC"', t)
t = re.sub(r'<a:theme ([^>]*)name="[^"]*"', r'<a:theme \1name="AAIC"', t)
wr("theme/theme1.xml", t)

# ---------------------------------------------------------------- master
m = rd("slideMasters/slideMaster1.xml")
EMU = 914400
# title: top, left-aligned, globe blue Tinos
m = m.replace('<a:off x="457200" y="205979"/><a:ext cx="8229600" cy="857250"/>',
              '<a:off x="457200" y="182880"/><a:ext cx="8229600" cy="640080"/>')
m = m.replace('rtlCol="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title',
              'rtlCol="0" anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title')
# body below the yellow rule
m = m.replace('<a:off x="457200" y="1200151"/><a:ext cx="8229600" cy="3394472"/>',
              '<a:off x="457200" y="1005840"/><a:ext cx="8229600" cy="3657600"/>')
# footer / slide number: Montserrat gray, footer text filled in
m = m.replace('<a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr>', '<a:srgbClr val="7F7F7F"/>')
m = m.replace('<p:ph type="ftr" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3124200" y="4767263"/><a:ext cx="2895600" cy="273844"/>',
              '<p:ph type="ftr" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="2286000" y="4767263"/><a:ext cx="4572000" cy="273844"/>')
FTR_P = f'<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>{FOOTER}</a:t></a:r></a:p>'
m = re.sub(r'(name="Footer Placeholder 4".*?</a:lstStyle>)<a:p><a:endParaRPr lang="en-US"/></a:p>',
           r'\1' + FTR_P, m, flags=re.S)
# yellow rule (the <hr> from the scss) under the title
RULE = ('<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="7" name="Title Rule"/><p:cNvCxnSpPr/><p:nvPr userDrawn="1"/></p:nvCxnSpPr>'
        '<p:spPr><a:xfrm><a:off x="548640" y="868680"/><a:ext cx="8046720" cy="0"/></a:xfrm>'
        '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>'
        '<a:ln w="38100" cap="rnd"><a:solidFill><a:srgbClr val="EBEA64"/></a:solidFill><a:round/></a:ln></p:spPr></p:cxnSp>')
m = m.replace('</p:spTree>', RULE + '</p:spTree>', 1)
# title style
m = re.sub(r'(<p:titleStyle><a:lvl1pPr[^>]*?)algn="ctr"', r'\1algn="l"', m)
m = re.sub(r'(<p:titleStyle>.*?<a:defRPr )sz="\d+"([^>]*>)<a:solidFill>.*?</a:solidFill>',
           r'\1sz="3200"\2<a:solidFill><a:schemeClr val="tx2"/></a:solidFill>', m, flags=re.S)
# body style: sizes + round bullets
sizes = {1: 2000, 2: 1800, 3: 1600, 4: 1600, 5: 1600}
def body(mo):
    s = mo.group(0)
    for lvl, sz in sizes.items():
        s = re.sub(rf'(<a:lvl{lvl}pPr[^>]*>.*?<a:defRPr )sz="\d+"', rf'\g<1>sz="{sz}"', s, count=1, flags=re.S)
    s = re.sub(r'<a:buChar char="[^"]*"/>', '<a:buChar char="•"/>', s)
    s = re.sub(r'<a:spcBef><a:spcPct val="20000"/></a:spcBef>', '<a:spcBef><a:spcPts val="900"/></a:spcBef>', s)
    s = re.sub(r'(<a:lvl1pPr[^>]*>)<a:spcBef>.*?</a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/>',
               r'\1<a:spcBef><a:spcPts val="900"/></a:spcBef><a:buClr><a:schemeClr val="accent2"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>', s, count=1, flags=re.S)
    return s
m = re.sub(r'<p:bodyStyle>.*?</p:bodyStyle>', body, m, flags=re.S)
# header/footer visibility: pandoc copies footer + slide number only when <p:hf> exists
m = m.replace('<p:txStyles>', '<p:hf hdr="0" dt="0"/><p:txStyles>', 1)
wr("slideMasters/slideMaster1.xml", m)

# ---------------------------------------------------------------- shared bits for dark layouts
GRAD_BG = ('<p:bg><p:bgPr><a:gradFill flip="none" rotWithShape="1"><a:gsLst>'
           '<a:gs pos="0"><a:srgbClr val="00746F"/></a:gs><a:gs pos="100000"><a:srgbClr val="006C93"/></a:gs>'
           '</a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>')

def logo_pic(pid, x, y, cx, cy):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{pid}" name="AAIC Logo" descr="Appalachian A.I. Corps logo"/>'
            '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
            '<p:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')

(P / "media").mkdir(exist_ok=True)
shutil.copy(LOGO, P / "media/image1.png")
ct = (work / "[Content_Types].xml").read_text()
if 'Extension="png"' not in ct:
    ct = ct.replace('<Default Extension="xml"', '<Default Extension="png" ContentType="image/png"/><Default Extension="xml"')
    (work / "[Content_Types].xml").write_text(ct)

def add_logo_rel(n):
    rp = P / f"slideLayouts/_rels/slideLayout{n}.xml.rels"
    r = rp.read_text()
    r = r.replace('</Relationships>',
                  '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>')
    rp.write_text(r)

def set_bg(s):
    s = re.sub(r'<p:bg>.*?</p:bg>', '', s, flags=re.S)
    return s.replace('<p:cSld name="', '<p:cSld name="', 1).replace('<p:spTree>', GRAD_BG + '<p:spTree>', 1)

def hide_master_shapes(s):
    # don't draw master's yellow rule on dark layouts
    return s.replace('<p:sldLayout ', '<p:sldLayout showMasterSp="0" ', 1) if 'showMasterSp' not in s else s

def ph_lst(s, phtype, lst, xfrm=None, anchor=None):
    """Replace lstStyle (and optionally xfrm / anchor) of the placeholder with given type."""
    pat = re.compile(r'(<p:sp>(?:(?!</p:sp>).)*?<p:ph type="%s"(?:(?!</p:sp>).)*?</p:sp>)' % phtype, re.S)
    mo = pat.search(s)
    assert mo, phtype
    sp = mo.group(1)
    sp = re.sub(r'<a:lstStyle>.*?</a:lstStyle>|<a:lstStyle/>', lst, sp, count=1, flags=re.S)
    if xfrm:
        if '<a:xfrm>' in sp:
            sp = re.sub(r'<a:xfrm>.*?</a:xfrm>', xfrm, sp, count=1, flags=re.S)
        else:
            sp = sp.replace('<p:spPr/>', f'<p:spPr>{xfrm}</p:spPr>').replace('<p:spPr>', '<p:spPr>' + xfrm, 1) if '<p:spPr/>' not in sp else sp.replace('<p:spPr/>', f'<p:spPr>{xfrm}</p:spPr>')
    if anchor:
        sp = re.sub(r'<a:bodyPr([^>]*?)(/?)>', lambda b: '<a:bodyPr' + re.sub(r'\s*anchor="[^"]*"', '', b.group(1)) + f' anchor="{anchor}"' + b.group(2) + '>', sp, count=1)
    return s[:mo.start()] + sp + s[mo.end():]

def lst1(sz, color, algn="ctr", font="+mj-lt", bold=False):
    b = ' b="1"' if bold else ''
    return (f'<a:lstStyle><a:lvl1pPr marL="0" indent="0" algn="{algn}"><a:buNone/>'
            f'<a:defRPr sz="{sz}"{b}><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
            f'<a:latin typeface="{font}"/></a:defRPr></a:lvl1pPr></a:lstStyle>')

def xf(x, y, cx, cy):
    return f'<a:xfrm><a:off x="{int(x)}" y="{int(y)}"/><a:ext cx="{int(cx)}" cy="{int(cy)}"/></a:xfrm>'

W, H = 9144000, 5143500
# logo at 30% width, centered, top at 9% (matches title-slide-attributes)
lw = int(W * 0.30); lh = int(lw * 282 / 750)
lx = (W - lw) // 2; ly = int(H * 0.09)

# ---------------------------------------------------------------- Title Slide (layout 1)
s = rd("slideLayouts/slideLayout1.xml")
s = set_bg(hide_master_shapes(s))
s = ph_lst(s, "ctrTitle", lst1(4000, "EBEA64", bold=True), xf(457200, ly + lh + 182880, W - 914400, 1005840), anchor="b")
s = ph_lst(s, "subTitle", lst1(2200, "FFFFFF", font="+mn-lt"), xf(457200, ly + lh + 182880 + 1005840 + 91440, W - 914400, 1188720), anchor="t")
# date / footer / slide number: hide on title slide (revealjs shows none there)
for ph in ("dt", "ftr", "sldNum"):
    s = re.sub(r'<p:sp>(?:(?!</p:sp>).)*?<p:ph type="%s"(?:(?!</p:sp>).)*?</p:sp>' % ph, '', s, flags=re.S)
s = s.replace('</p:spTree>', logo_pic(20, lx, ly, lw, lh) + '</p:spTree>', 1)
wr("slideLayouts/slideLayout1.xml", s)
add_logo_rel(1)

# ---------------------------------------------------------------- Section Header (layout 3)
s = rd("slideLayouts/slideLayout3.xml")
s = set_bg(hide_master_shapes(s))
s = ph_lst(s, "title", lst1(4000, "FFFFFF", algn="ctr"), xf(685800, 1600200, W - 1371600, 1143000), anchor="b")
s = ph_lst(s, "body", lst1(2000, "B9E1E2", algn="ctr", font="+mn-lt"), xf(685800, 2834640, W - 1371600, 731520), anchor="t")
s = re.sub(r'<p:sp>(?:(?!</p:sp>).)*?<p:ph type="dt"(?:(?!</p:sp>).)*?</p:sp>', '', s, flags=re.S)
s = re.sub(r'<p:sp>(?:(?!</p:sp>).)*?<p:ph type="(ftr|sldNum)"(?:(?!</p:sp>).)*?</p:sp>',
           lambda mo: mo.group(0).replace('<a:lstStyle/>', '<a:lstStyle><a:lvl1pPr><a:defRPr><a:solidFill><a:srgbClr val="B9E1E2"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>'), s, flags=re.S)
sw = int(W * 0.16); sh = int(sw * 282 / 750)
s = s.replace('</p:spTree>', logo_pic(20, (W - sw) // 2, 640080, sw, sh) + '</p:spTree>', 1)
wr("slideLayouts/slideLayout3.xml", s)
add_logo_rel(3)

# ---------------------------------------------------------------- all layouts: footer text, drop date
for f in sorted((P / "slideLayouts").glob("slideLayout*.xml")):
    s = f.read_text(encoding="utf-8")
    s = re.sub(r'<p:sp>(?:(?!</p:sp>).)*?<p:ph type="dt"(?:(?!</p:sp>).)*?</p:sp>', '', s, flags=re.S)
    s = re.sub(r'(<p:sp>(?:(?!</p:sp>).)*?<p:ph type="ftr"(?:(?!</p:sp>).)*?<a:lstStyle(?:/>|>.*?</a:lstStyle>))<a:p>.*?</a:p>',
               lambda mo: mo.group(1) + FTR_P, s, flags=re.S)
    f.write_text(s, encoding="utf-8")

# ---------------------------------------------------------------- drop sample slides
pres = rd("presentation.xml")
pres = re.sub(r'<p:sldIdLst>.*?</p:sldIdLst>', '', pres, flags=re.S)
wr("presentation.xml", pres)
rels = rd("_rels/presentation.xml.rels")
rels = re.sub(r'<Relationship [^>]*Target="slides/slide\d+\.xml"/>', '', rels)
wr("_rels/presentation.xml.rels", rels)
shutil.rmtree(P / "slides"); shutil.rmtree(P / "notesSlides")
ct = (work / "[Content_Types].xml").read_text()
ct = re.sub(r'<Override PartName="/ppt/(slides|notesSlides)/[^"]+"[^>]*/>', '', ct)
(work / "[Content_Types].xml").write_text(ct)
app = (work / "docProps/app.xml").read_text()
app = re.sub(r'<Slides>\d+</Slides>', '<Slides>0</Slides>', app)
app = re.sub(r'<Notes>\d+</Notes>', '<Notes>0</Notes>', app)
(work / "docProps/app.xml").write_text(app)

# ---------------------------------------------------------------- zip
if OUT.exists(): OUT.unlink()
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(work / "[Content_Types].xml", "[Content_Types].xml")
    for root, _, files in os.walk(work):
        for fn in files:
            full = Path(root) / fn
            arc = full.relative_to(work).as_posix()
            if arc != "[Content_Types].xml":
                z.write(full, arc)
shutil.rmtree(work)
print("wrote", OUT)
