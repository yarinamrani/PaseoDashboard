import base64, json, html
ranges=json.load(open('ranges.json'))
def ff(sub): return base64.b64encode(open(f'heebo-{sub}.woff2','rb').read()).decode()
FONT=''.join(f"@font-face{{font-family:Heebo;font-weight:100 900;src:url(data:font/woff2;base64,{ff(s)}) format('woff2');unicode-range:{ranges[s]};}}" for s in ('hebrew','latin'))

DAYS=["ראשון 27.09","שני 28.09","שלישי 29.09","רביעי 30.09","חמישי 01.10","שישי 02.10","שבת 03.10"]
CLOSED="__closed__"
# dishwashers: per day: paseo_m, paseo_e, tala, umino_m, umino_e
DISH=[
 [["ג'ונתן 10:00"],["הילארי 17:00"],["אנזו 18:00"],["ג'רמי 11:00"],["פטל 18:00"]],
 [["ג'ונתן 10:00"],["הילארי 17:00"],["ג'ונתן 18:00"],["ג'רמי 10:00"],["פטל 18:00"]],
 [["אנזו 10:00"],["הילארי 17:00"],["ג'ונתן 18:00"],["ג'רמי 10:00"],["פטל 18:00"]],
 [["אנזו 10:00"],["הילארי 17:00"],["ג'ונתן 18:00"],["ג'רמי 10:00"],["פטל 18:00"]],
 [["אנזו 10:00"],["אנזו 17:00"],["טוני 19:00"],["ג'רמי 10:00"],["פטל 18:00"]],
 [["ג'ונתן 08:00","אנזו 13:00"],["הילארי 17:00","טוני 19:00"],[CLOSED],["ג'רמי 10:00"],[CLOSED]],
 [["ג'ונתן 08:00"],["אנזו 16:00"],["הילארי 19:30"],[CLOSED],["ג'רמי 19:30"]],
]
COOK=[
 [["עידו 10:00 (פתיחה)","מולו 11:00"],["יעקב 16:00","אביעד 17:00","מאיר 17:00"]],
 [["עידו 10:00 (פתיחה)","מאיר 11:00"],["יעקב 16:00","אביעד 17:00","בני 18:00"]],
 [["עידו 10:00 (פתיחה)","מולו 10:30"],["בני 15:00","אביעד 17:00","מאיר 17:00"]],
 [["עידו 10:00 (פתיחה)","מאיר 11:00","בני 12:00"],["יעקב 16:00","אביעד 17:00","מולו 18:00"]],
 [["עידו 10:00 (פתיחה)","מאיר 11:00","בני 12:00"],["יעקב 16:00","אביעד 17:00","מולו 17:00","בני 18:00"]],
 [["עידו 08:00 (פתיחה, עד 15:00)","מאיר 09:00","בני 11:00","אמג'ד 13:00"],["אמג'ד 17:00","מולו 17:00","בני 18:00"]],
 [["אמג'ד 09:00 (פתיחה)","מולו 10:00","בני 11:00"],["אמג'ד 17:00","מולו 17:00","בני 18:00"]],
]
CSS=FONT+"""
:root{--ink:#1c1f24;--muted:#6b7280;--line:#e5e7eb;--bg:#f6f5f2;--card:#fff;
--paseo:#0f766e;--paseo-bg:#e6f4f2;--tala:#b45309;--tala-bg:#fdf1e3;--umino:#4338ca;--umino-bg:#ecebfb;--cook:#9f1239;--cook-bg:#fcecef;}
*{box-sizing:border-box;margin:0;padding:0}
#wrap{padding:36px;background:var(--bg)} body{font-family:Heebo,sans-serif;background:var(--bg);color:var(--ink);direction:rtl;width:WIDTHpx}
h1{font-size:34px;font-weight:800;letter-spacing:-.3px}
.sub{color:var(--muted);font-size:18px;margin-top:4px}
table{width:100%;border-collapse:separate;border-spacing:0;margin-top:22px;background:var(--card);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.05)}
th,td{padding:12px 14px;text-align:right;vertical-align:top;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:none}
thead th{font-size:17px;font-weight:700}
thead tr.grp th{font-size:20px;font-weight:800;color:#fff;text-align:center;padding:10px}
thead tr.sh th{font-size:15px;font-weight:600;color:var(--muted);text-align:center;background:#fafafa}
td.day{font-weight:800;font-size:18px;white-space:nowrap;background:#fafafa;width:140px}
td .n{font-size:18px;font-weight:600;line-height:1.55;white-space:nowrap}
td .n .t{font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums}
td.closed{color:#9ca3af;font-size:16px;text-align:center;background:repeating-linear-gradient(135deg,#fafafa 0 8px,#f3f4f6 8px 16px)}
.paseo{background:var(--paseo)} .tala{background:var(--tala)} .umino{background:var(--umino)} .cook{background:var(--cook)}
td.cp{background:var(--paseo-bg)} td.ct{background:var(--tala-bg)} td.cu{background:var(--umino-bg)} td.cc{background:var(--cook-bg)}
tr:nth-child(even) td.cp{background:#d9eeeb} tr:nth-child(even) td.ct{background:#fae8d3} tr:nth-child(even) td.cu{background:#e1dff8} tr:nth-child(even) td.cc{background:#f9e0e5}
.foot{margin-top:16px;font-size:16px;color:var(--muted);line-height:1.6}
.foot b{color:var(--ink)}
"""
def cell(items,cls):
    if items==[CLOSED]: return '<td class="closed">סגור</td>'
    out=[]
    for it in items:
        if ' ' in it:
            name,rest=it.split(' ',1)
            out.append(f'<div class="n">{html.escape(name)} <span class="t">{html.escape(rest)}</span></div>')
        else: out.append(f'<div class="n">{html.escape(it)}</div>')
    return f'<td class="{cls}">{"".join(out)}</td>'
def page(title,sub,head,rows,foot,width):
    return f'<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>{CSS.replace("WIDTH",str(width))}</style></head><body><div id="wrap"><h1>{title}</h1><div class="sub">{sub}</div><table>{head}<tbody>{rows}</tbody></table><div class="foot">{foot}</div></div></body></html>'

head='''<thead><tr class="grp"><th style="background:#374151">יום</th><th class="paseo" colspan="2">פסאו</th><th class="tala">טאלה</th><th class="umino" colspan="2">אומינו</th></tr>
<tr class="sh"><th></th><th>בוקר</th><th>ערב</th><th>ערב</th><th>בוקר</th><th>ערב</th></tr></thead>'''
rows=''.join(f'<tr><td class="day">{d}</td>'+cell(r[0],'cp')+cell(r[1],'cp')+cell(r[2],'ct')+cell(r[3],'cu')+cell(r[4],'cu')+'</tr>' for d,r in zip(DAYS,DISH))
foot='<b>סה"כ משמרות:</b> ג\'ונתן 7 · ג\'רמי 7 · אנזו 7 · הילארי 6 · פטל 5 · טוני 2<br>אומינו: ג\'רמי בבקרים, פטל בערבים (א׳–ה׳). &nbsp;·&nbsp; פטל חופש בשישי ושבת.'
open('dish.html','w').write(page('סידור שוטפים','<bdi dir="ltr">27.09–03.10</bdi> · חול המועד סוכות',head,rows,foot,1240))

head2='''<thead><tr class="grp"><th style="background:#374151">יום</th><th class="cook">בוקר</th><th class="cook">ערב</th></tr></thead>'''
rows2=''.join(f'<tr><td class="day">{d}</td>'+cell(r[0],'cc')+cell(r[1],'cc')+'</tr>' for d,r in zip(DAYS,COOK))
foot2='<b>סה"כ משמרות:</b> בני 9 · מולו 7 · עידו 6 · מאיר 6 · אביעד 5 · יעקב 4 · אמג\'ד 4<br>פסאו פתוחה מ-12:00 · עידו פותח כל בוקר ראשון–שישי'
open('cooks.html','w').write(page('סידור טבחים – פסאו','<bdi dir="ltr">27.09–03.10</bdi> · חול המועד סוכות',head2,rows2,foot2,900))
