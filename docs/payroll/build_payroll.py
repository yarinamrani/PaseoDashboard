"""מאחד דוחות "דוח מפורט" של שיפטאורגנייזר (גיליון לכל עובד) לקובץ שכר אחד.

שימוש:  python3 build_payroll.py <out.xlsx> מטבח=<kitchen.xlsx> [פלור=<floor.xlsx>]
- גיליון "סיכום שכר": שורה לעובד, מחולק למחלקות (וכוח אדם בנפרד), עם עמודות קלט:
  בונוס / מפרעה / שכר סופי / נטו-ברוטו.
- גיליון "פירוט יומי": כל המשמרות מכל הגיליונות, לבדיקה.
קלט אופציונלי (לא נשמר בריפו — נתוני שכר) בקובץ JSON דרך PAYROLL_INPUTS:
  {"exclude": [שמות], "drop_agency": true, "tala_hint": [שמות],
   "rates": {"שם": [תעריף, "נטו"|"ברוטו"|null, יחס_נטו_לברוטו|null, "מקור"]}, "default_ratio": 0.9,
   "venue": {"שם": "טאלה"},
   "split_rates": {"שם": {"basis": "נטו", "bands": [[1, 4, 60], [5, 7, 65]]}},  ← תעריף לפי יום בשבוע (WEEKDAY: א'=1 … ש'=7)
   "venue_confirmed": [שמות]}  ← לא לסמן "עבד בטאלה/אומינו" (אושר שהם של הסניף)   ← מפצל כל מחלקה ל"<מחלקה> פסאו" / "<מחלקה> טאלה" (ברירת מחדל פסאו)
הקריאה לפי שורת הכותרות (מספר העמודות משתנה בין עובדים: 1-3 משבצות תפקיד ביום).
"""
import sys, re, datetime as dt
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

BUCKETS = ["רגילות", "125%", "150%", "שבת/חג", "מיוחד 200%"]
OTHER_VENUE = re.compile(r"(tala|טאלה|umino|אומינו)", re.I)
LONG_SHIFT_H = 14


def parse_file(path):
    wb = openpyxl.load_workbook(path)
    emps = []
    for ws in wb:
        rows = list(ws.iter_rows(values_only=True))
        hi = next(i for i, r in enumerate(rows) if len(r) > 1 and r[1] == "תאריך")
        hdr = rows[hi]
        info = " ".join(str(x) for x in rows[2] if x)
        name = re.search(r"שם עובד:\s*(.+?)\s*\n", str(rows[2][0]) + "\n").group(1).strip()
        month = (re.search(r"חודש:\s*(.+)", str(rows[2][0])) or [None, ""])[1].strip()
        days = int((re.search(r"ימי עבודה:\s*(\d+)", info) or [0, 0])[1])
        shifts = int((re.search(r"משמרות:\s*(\d+)", info) or [0, 0])[1])
        clock = (re.search(r"מזהה שעון:\s*(\S+)", info) or [None, ""])[1]
        # משבצות תפקיד: (תפקיד, כניסה, יציאה, הערות) חוזרות 1-3 פעמים
        slots = [i for i, h in enumerate(hdr) if h == "תפקיד"]
        bidx = {b: hdr.index(b) for b in BUCKETS}
        tidx = hdr.index("סיכום")
        totals, roles, daily, issues = None, [], [], []
        for r in rows[hi + 1:]:
            if r[0] and str(r[0]).startswith("סיכום כללי"):
                totals = {b: float(r[bidx[b]] or 0) for b in BUCKETS}
                totals["סיכום"] = float(r[tidx] or 0)
            elif r[0] and str(r[0]).startswith("סיכום "):
                if float(r[tidx] or 0) > 0:
                    roles.append(str(r[0])[6:].strip())
            elif isinstance(r[1], dt.datetime):
                segs = []
                for s in slots:
                    role, tin, tout, note = r[s], r[s + 1], r[s + 2], r[s + 3]
                    if not (role or tin or tout or note):
                        continue
                    segs.append((role, tin, tout, note))
                    d = r[1].strftime("%d/%m")
                    if (tin is None) != (tout is None):
                        issues.append(f"{d} חסרה {'יציאה' if tout is None else 'כניסה'}")
                    if tin and tout and (tout - tin).total_seconds() / 3600 > LONG_SHIFT_H:
                        issues.append(f"{d} משמרת {(tout - tin).total_seconds() / 3600:.1f} ש'")
                    if note and OTHER_VENUE.search(str(note)):
                        issues.append(f"{d} {note}")
                hours = {b: r[bidx[b]] for b in BUCKETS}
                if segs or any(hours.values()):
                    daily.append((r[0], r[1], segs, hours, r[tidx]))
        emps.append(dict(name=name, month=month, days=days, shifts=shifts, clock=clock,
                         roles=roles, totals=totals or {b: 0 for b in BUCKETS + ["סיכום"]},
                         daily=daily, issues=issues, agency="כוח אדם" in name))
    return emps


def compact_issues(issues):
    # מאחד "Tala"/"Paseo" חוזרים לשורה אחת לפי מקום
    out, venues = [], {}
    for x in issues:
        m = re.match(r"(\d\d/\d\d) (.+)", x)
        if m and OTHER_VENUE.search(m.group(2)) and not m.group(2).startswith("משמרת") and not m.group(2).startswith("חסרה"):
            v = "טאלה" if re.search("tala|טאלה", m.group(2), re.I) else "אומינו"
            venues.setdefault(v, []).append(m.group(1))
        else:
            out.append(x)
    out += [f"עבד ב{v}: {', '.join(ds)}" for v, ds in venues.items()]
    return " · ".join(out)


def build(out, depts, tala_hint=(), rates=None, drop_agency=False, default_ratio=0.9, split_rates=None, venue_ok=()):
    rates = rates or {}
    split_rates = split_rates or {}
    daily_rows = sum(len(e["daily"]) for d in depts.values() for e in d)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "סיכום שכר"
    ws.sheet_view.rightToLeft = True
    F = "Arial"
    thin = Side(style="thin", color="BFBFBF")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    inp = PatternFill("solid", fgColor="FFF2CC")
    sec = PatternFill("solid", fgColor="1F3864")
    sub = PatternFill("solid", fgColor="D9E1F2")
    agf = PatternFill("solid", fgColor="EDEDED")
    blue = Font(name=F, color="0000FF", size=10)
    norm = Font(name=F, size=10)
    bold = Font(name=F, size=10, bold=True)

    cols = ["#", "שם עובד", "מזהה שעון", "תפקידים", "חברה בתלוש", "ימי עבודה", "משמרות",
            "רגילות", "125%", "150%", "שבת/חג", "200%", 'סה"כ שעות', "שעות משוקללות",
            "תעריף שעתי (₪)", "בסיס תעריף", "יחס נטו/ברוטו", "ברוטו צפוי (₪)", "נטו צפוי (₪)",
            "בונוס (₪)", "מפרעה (₪)", "שכר סופי (₪)", "נטו / ברוטו", "לבדיקה"]
    widths = [4, 24, 9, 22, 11, 8, 8, 9, 8, 8, 9, 8, 10, 11, 10, 9, 9, 12, 12, 11, 11, 12, 11, 60]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[L(i)].width = w
    C = {c: i + 1 for i, c in enumerate(cols)}
    HCOLS = ["רגילות", "125%", "150%", "שבת/חג", "200%"]

    month = next((e["month"] for d in depts.values() for e in d if e["month"]), "")
    ws["A1"] = f"שכר — שעות עבודה {month}"
    ws["A1"].font = Font(name=F, size=14, bold=True)
    ws["A2"] = ("מקור: שיפטאורגנייזר, דוח מפורט (05/10/2026). שעות = כחול (מהדוח, לא לשנות). "
                "תאים צהובים = למילוי: תעריף שעתי, בונוס ידוע מראש, מפרעה לקיזוז, שכר סופי שרוצים שייצא בתלוש + נטו/ברוטו. "
                "שעות משוקללות = רגילות + 125%×1.25 + 150%×1.5 + שבת/חג×1.5 + 200%×2 (הנחה: שבת/חג משולם 150%). "
                "ברוטו/נטו צפוי — הערכה ±: תעריף ברוטו → ברוטו = תעריף×משוקללות + נסיעות (16 ₪ ליום, עד 315) + הבראה (2 ₪ לשעה רגילה) + בונוס, "
                "נטו = ברוטו × יחס נטו/ברוטו (מתלוש אוגוסט ב-BUK, או 0.90 כברירת מחדל) − מפרעה. "
                "תעריף נטו → נטו = תעריף×משוקללות + בונוס − מפרעה, ברוטו ≈ נטו ÷ יחס. "
                "תעריפים בכחול = נגזרו מתלוש אוגוסט (משכורת ÷ שעות); בכתום = הנחה, לאשר.")
    ws["A2"].font = Font(name=F, size=9, italic=True)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(cols))

    dv_co = DataValidation(type="list", formula1='"פסאו,טאלה,כוח אדם"', allow_blank=True)
    dv_nb = DataValidation(type="list", formula1='"נטו,ברוטו"', allow_blank=True)
    ws.add_data_validation(dv_co)
    ws.add_data_validation(dv_nb)

    r = 4
    subtotal_rows = []

    def header(row):
        for c, name in enumerate(cols, 1):
            x = ws.cell(row, c, name)
            x.font = Font(name=F, size=10, bold=True)
            x.fill = sub
            x.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            x.border = box

    def section(title, emps, grey=False, note=None):
        nonlocal r
        ws.cell(r, 1, title).font = Font(name=F, size=12, bold=True, color="FFFFFF")
        for c in range(1, len(cols) + 1):
            ws.cell(r, c).fill = sec
        if note:
            ws.cell(r, C["תפקידים"], note).font = Font(name=F, size=9, italic=True, color="FFFFFF")
        r += 1
        header(r)
        r += 1
        first = r
        for n, e in enumerate(sorted(emps, key=lambda e: (-e["totals"]["סיכום"], e["name"])), 1):
            t = e["totals"]
            co = "כוח אדם" if e["agency"] else ("" if e["name"] in tala_hint else e.get("venue", "פסאו"))
            vals = {"#": n, "שם עובד": e["name"], "מזהה שעון": e["clock"], "תפקידים": ", ".join(e["roles"]),
                    "חברה בתלוש": co, "ימי עבודה": e["days"], "משמרות": e["shifts"],
                    "רגילות": t["רגילות"] or None, "125%": t["125%"] or None, "150%": t["150%"] or None,
                    "שבת/חג": t["שבת/חג"] or None, "200%": t["מיוחד 200%"] or None}
            for k, v in vals.items():
                ws.cell(r, C[k], v)
            ws.cell(r, C['סה"כ שעות'], f"=SUM({L(C['רגילות'])}{r}:{L(C['200%'])}{r})")
            H = lambda k: f"{L(C[k])}{r}"
            ws.cell(r, C["שעות משוקללות"], f"={H('רגילות')}+1.25*{H('125%')}+1.5*{H('150%')}+1.5*{H('שבת/חג')}+2*{H('200%')}")
            rate, basis, ratio, src = (list(rates.get(e["name"]) or []) + [None] * 4)[:4]
            ws.cell(r, C["תעריף שעתי (₪)"], rate)
            ws.cell(r, C["בסיס תעריף"], basis)
            ws.cell(r, C["יחס נטו/ברוטו"], ratio if ratio else default_ratio)
            O, P, Q, N = H("תעריף שעתי (₪)"), H("בסיס תעריף"), H("יחס נטו/ברוטו"), H("שעות משוקללות")
            F_, H_, V, W = H("ימי עבודה"), H("רגילות"), H("בונוס (₪)"), H("מפרעה (₪)")
            gross_base = f"({O}*{N}+MIN(315,16*{F_})+2*{H_}+{V})"
            ws.cell(r, C["ברוטו צפוי (₪)"], f'=IF({O}="","",IF({P}="נטו",({O}*{N}+{V})/{Q},{gross_base}))')
            ws.cell(r, C["נטו צפוי (₪)"], f'=IF({O}="","",IF({P}="נטו",{O}*{N}+{V},{gross_base}*{Q})-{W})')
            if e["name"] in split_rates:
                sr = split_rates[e["name"]]
                rng = lambda c: f"'פירוט יומי'!${c}$2:${c}${daily_rows + 1}"
                parts = [f"{rt}*SUMPRODUCT(({rng('B')}={H('שם עובד')})*(WEEKDAY({rng('D')})>={lo})*(WEEKDAY({rng('D')})<={hi})*{rng('R')})"
                         for lo, hi, rt in sr["bands"]]
                net = "+".join(parts)
                ws.cell(r, C["תעריף שעתי (₪)"], sr["bands"][0][2])
                ws.cell(r, C["תעריף שעתי (₪)"]).comment = Comment(
                    "תעריף לפי יום: " + ", ".join(f"{'אבגדהוש'[lo-1]}'–{'אבגדהוש'[hi-1]}' {rt}" for lo, hi, rt in sr["bands"]) +
                    f" ({sr['basis']}), לפי שעות סה\"כ ביום בגיליון הפירוט, בלי תוספות שעות נוספות.", "Claude")
                ws.cell(r, C["בסיס תעריף"], sr["basis"])
                ws.cell(r, C["נטו צפוי (₪)"], f"={net}+{V}-{W}")
                ws.cell(r, C["ברוטו צפוי (₪)"], f"=({net}+{V})/{Q}")
            rate_note = None
            if rate is not None and src:
                ws.cell(r, C["תעריף שעתי (₪)"]).comment = Comment(src, "Claude")
            if rate is not None and not basis:
                rate_note = "לא צוין אם התעריף נטו או ברוטו — חושב כברוטו"
            assumed = bool(src and src.startswith("הנחה"))
            issues = compact_issues([x for x in e["issues"] if not (e["name"] in venue_ok and OTHER_VENUE.search(x))])
            if t["סיכום"] == 0:
                issues = ("0 שעות בחודש — לבדוק אם בכלל בתלוש" + (" · " + issues if issues else ""))
            if e["name"] in tala_hint:
                issues = "עבד/ה בטאלה — לבחור חברה לתלוש" + (" · " + issues if issues else "")
            if rate_note:
                issues = rate_note + (" · " + issues if issues else "")
            if assumed:
                issues = "תעריף משוער — לאשר" + (" · " + issues if issues else "")
            ws.cell(r, C["לבדיקה"], issues or None)
            for c in range(1, len(cols) + 1):
                x = ws.cell(r, c)
                x.border = box
                x.font = blue if cols[c - 1] in HCOLS + ["ימי עבודה", "משמרות"] else norm
            if rate is not None and src and not assumed:
                ws.cell(r, C["תעריף שעתי (₪)"]).font = blue
                if grey:
                    x.fill = agf
            for k in ["תעריף שעתי (₪)", "בסיס תעריף", "בונוס (₪)", "מפרעה (₪)", "שכר סופי (₪)", "נטו / ברוטו"] + ([] if co else ["חברה בתלוש"]):
                if not grey:
                    ws.cell(r, C[k]).fill = inp
            if assumed:
                ws.cell(r, C["תעריף שעתי (₪)"]).fill = PatternFill("solid", fgColor="F8CBAD")
            ws.cell(r, C["יחס נטו/ברוטו"]).number_format = "0.00"
            for k in HCOLS + ['סה"כ שעות', "שעות משוקללות"]:
                ws.cell(r, C[k]).number_format = '0.00;-0.00;"-"'
            for k in ["תעריף שעתי (₪)", "ברוטו צפוי (₪)", "נטו צפוי (₪)", "בונוס (₪)", "מפרעה (₪)", "שכר סופי (₪)"]:
                ws.cell(r, C[k]).number_format = '#,##0;-#,##0;"-"'
            ws.cell(r, C["לבדיקה"]).alignment = Alignment(wrap_text=True, vertical="top")
            dv_co.add(ws.cell(r, C["חברה בתלוש"]))
            dv_nb.add(ws.cell(r, C["נטו / ברוטו"]))
            dv_nb.add(ws.cell(r, C["בסיס תעריף"]))
            r += 1
        last = r - 1
        ws.cell(r, C["שם עובד"], f'סה"כ {title}').font = bold
        for k in ["ימי עבודה", "משמרות"] + HCOLS + ['סה"כ שעות', "שעות משוקללות", "ברוטו צפוי (₪)", "נטו צפוי (₪)", "בונוס (₪)", "מפרעה (₪)", "שכר סופי (₪)"]:
            x = ws.cell(r, C[k], f"=SUM({L(C[k])}{first}:{L(C[k])}{last})")
            x.font = bold
            x.number_format = '#,##0;-#,##0;"-"' if "₪" in k else ('0;-0;"-"' if k in ("ימי עבודה", "משמרות") else '#,##0.00;-#,##0.00;"-"')
        for c in range(1, len(cols) + 1):
            ws.cell(r, c).fill = sub
            ws.cell(r, c).border = box
        subtotal_rows.append(r)
        # עלות מעביד משוערת: ברוטו + ~20% (פנסיה 6.5%, פיצויים 6%, ביטוח לאומי ~7.6% מעל התקרה המופחתת — עיגול)
        r += 1
        ws.cell(r, C["שם עובד"], "עלות מעביד משוערת (ברוטו × 1.20)").font = Font(name=F, size=10, italic=True)
        x = ws.cell(r, C["ברוטו צפוי (₪)"], f"={L(C['ברוטו צפוי (₪)'])}{r - 1}*1.2")
        x.number_format = '#,##0;-#,##0;"-"'
        x.font = Font(name=F, size=10, italic=True)
        x.comment = Comment("הנחה: תוספת מעביד ~20% (פנסיה 6.5%, פיצויים 6%, ביטוח לאומי). לבדוק מול רואת החשבון.", "Claude")
        r += 2

    for dept, emps in depts.items():
        own = [e for e in emps if not e["agency"]]
        agency = [e for e in emps if e["agency"]]
        if own:
            section(dept, own)
        if agency and not drop_agency:
            section(f"{dept} — כוח אדם", agency, grey=True,
                    note="לא בתלוש — שעות להשוואה מול חשבונית חברת כוח האדם")
    ws.freeze_panes = "C4"

    # פירוט יומי
    d = wb.create_sheet("פירוט יומי")
    d.sheet_view.rightToLeft = True
    dh = ["מחלקה", "שם עובד", "יום", "תאריך", "תפקיד", "כניסה", "יציאה", "הערות",
          "תפקיד 2", "כניסה 2", "יציאה 2", "הערות 2"] + HCOLS + ['סה"כ']
    for c, h in enumerate(dh, 1):
        x = d.cell(1, c, h)
        x.font = Font(name=F, size=10, bold=True)
        x.fill = sub
        x.border = box
    for i, w in enumerate([8, 24, 6, 10, 16, 8, 8, 16, 14, 8, 8, 14, 8, 7, 7, 8, 7, 8], 1):
        d.column_dimensions[L(i)].width = w
    rr = 2
    for dept, emps in depts.items():
        for e in emps:
            for day, date, segs, hours, tot in e["daily"]:
                row = [dept, e["name"], day, date]
                for s in range(2):
                    row += list(segs[s]) if s < len(segs) else [None] * 4
                row += [hours[b] for b in BUCKETS] + [tot]
                for c, v in enumerate(row, 1):
                    x = d.cell(rr, c, v)
                    x.font = norm
                    if isinstance(v, dt.datetime):
                        x.number_format = "dd/mm" if c == 4 else "hh:mm"
                    elif isinstance(v, float):
                        x.number_format = "0.00"
                if len(segs) > 2:
                    d.cell(rr, 12).comment = Comment(f"עוד {len(segs) - 2} משבצות ביום — ראו דוח המקור", "Claude")
                rr += 1
    d.auto_filter.ref = f"A1:{L(len(dh))}{rr - 1}"
    d.freeze_panes = "C2"
    for x in wb.worksheets:
        for row in x.iter_rows():
            for c in row:
                if c.font and c.font.name != F:
                    c.font = Font(name=F, size=c.font.size or 10, bold=c.font.bold, color=c.font.color)
    # אין ערכים שמורים לנוסחאות (openpyxl) — אקסל יחשב בפתיחה
    from openpyxl.workbook.properties import CalcProperties
    wb.calculation = CalcProperties(fullCalcOnLoad=True)
    wb.save(out)


if __name__ == "__main__":
    out = sys.argv[1]
    depts = {}
    for a in sys.argv[2:]:
        k, p = a.split("=", 1)
        depts[k] = parse_file(p)
    import os, json
    inp = json.load(open(os.environ["PAYROLL_INPUTS"])) if os.environ.get("PAYROLL_INPUTS") else {}
    excl = set(inp.get("exclude", []))
    venue = inp.get("venue", {})
    split = {}
    for k in depts:
        emps = [e for e in depts[k] if e["name"] not in excl and not (inp.get("drop_agency") and e["agency"])]
        for e in emps:
            e["venue"] = venue.get(e["name"], "פסאו")
        if venue:
            for v in ("פסאו", "טאלה"):
                part = [e for e in emps if e["venue"] == v]
                if part:
                    split[f"{k} {v}"] = part
        else:
            split[k] = emps
    depts = split
    build(out, depts, set(inp.get("tala_hint", [])), inp.get("rates", {}), inp.get("drop_agency", False),
          inp.get("default_ratio", 0.9), inp.get("split_rates", {}), set(inp.get("venue_confirmed", [])))
