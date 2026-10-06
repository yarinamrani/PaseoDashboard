"""מאחד דוחות "דוח מפורט" של שיפטאורגנייזר (גיליון לכל עובד) לקובץ שכר אחד.

שימוש:  python3 build_payroll.py <out.xlsx> מטבח=<kitchen.xlsx> [מטבח=<more.xlsx>] [פלור=<floor.xlsx>]
- גיליון "סיכום שכר": שורה לעובד, מחולק למחלקות/סניפים (וכוח אדם בנפרד). שעות כמו בשיפט, ולכל עובד
  סכום אחד — שכר סופי (כולל בונוס), נטו או ברוטו: תעריף נטו × סיכום שעות, או תעריף ברוטו × שעות לפי האחוזים.
  בלי המרת נטו↔ברוטו ובלי הערכות — זה אצל רואת החשבון.
- גיליון "פירוט יומי": כל המשמרות מכל הגיליונות, לבדיקה.
- "<out> - לרואת החשבון.xlsx": שם, חברה, שעות, בונוס, מפרעה, שכר סופי (נטו/ברוטו) — בלי הערות פנימיות.
קלט אופציונלי (לא נשמר בריפו — נתוני שכר) בקובץ JSON דרך PAYROLL_INPUTS:
  {"exclude": [שמות], "drop_agency": true, "tala_hint": [שמות],
   "rates": {"שם": [תעריף, "נטו"|"ברוטו", null|"total", "מקור"]},  ← "total" = תעריף כולל על סיכום שעות; מקור שמתחיל ב"הנחה" נצבע כתום
   "venue": {"שם": "טאלה"},                                     ← מפצל כל מחלקה ל"<מחלקה> פסאו" / "<מחלקה> טאלה" (ברירת מחדל פסאו)
   "split_rates": {"שם": {"basis": "נטו", "bands": [[1, 4, 60], [5, 7, 65]]}},  ← תעריף לפי יום בשבוע (WEEKDAY: א'=1 … ש'=7)
   "venue_confirmed": [שמות],                                   ← לא לסמן "עבד בטאלה/אומינו" (אושר שהם של הסניף)
   "notes": {"שם": "הערה לעמודת לבדיקה"},
   "bonus": {"שם": [סכום, "מקור"]},
   "fixed": {"שם": [סכום, "ברוטו"|"נטו", "מקור"]},
   "real_rate": {"שם": 60},  ← פלור: שכר אמיתי לשעה; שכר סופי = תעריף × סך השעות + טיפים + השלמה + בונוס, ו"בונוס 2" = הפער מעל התלוש
   "floor_final": [שמות],  ← פלור: שכר סופי רק להם; לשאר ריק (רואת החשבון מחשבת)
   "blatam_as": {"שם": "אחמש"},  ← שעות בלת"מ של העובד נספרות בתפקיד הזה  ← משכורת גלובלית — שכר סופי קבוע, בלי קשר לשעות
   "tala_101": [שמות], "no_101": [שמות],  ← לפי טופסי 101 ב-BUK: מי במקטע טאלה; מי בלי טופס בכלל (מסומן)
   "role_rates": [["טבח", 55, "ברוטו"], ["שוטף", 40, "ברוטו"], ...]}  ← תעריף בסיס לפי תפקיד בשיפט, למי שאין לו תעריף אישי
פלור: "דוח סיכומים" (שורה לעובד×תפקיד) — מזוהה אוטומטית ומאוחד לשורה אחת לעובד. שכר סופי = טיפים (אחרי גביית אוכל)
+ השלמה (מחושבת בשיפט לכל משמרת עד תעריף הבסיס) + תעריף התפקיד × שעות לפי אחוזים לתפקידים בלי טיפים.
עבד רק בתפקידי "טאלה" → מקטע טאלה; עבד בשני המקומות → פסאו (תלוש בגג על הים).
הקריאה לפי שורת הכותרות (מספר העמודות משתנה בין עובדים: 1-3 משבצות תפקיד ביום).
"""
import sys, re, datetime as dt
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

BUCKETS = ["רגילות", "125%", "150%", "שבת/חג", "מיוחד 200%"]
HCOLS_ACC = ["רגילות", "125%", "150%", "שבת/חג", "מיוחד 200%"]
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
        # דוחות מאפליקציות אחרות (למשל אומינו) בלי 125%/150% — עמודה חסרה = 0
        bidx = {b: (hdr.index(b) if b in hdr else None) for b in BUCKETS}
        cidx = hdr.index("עלות") if "עלות" in hdr else None
        val = lambda r, i: (r[i] if i is not None else None)
        tidx = hdr.index("סיכום")
        totals, roles, daily, issues, cost = None, [], [], [], None
        for r in rows[hi + 1:]:
            if r[0] and str(r[0]).startswith("סיכום כללי"):
                totals = {b: float(val(r, bidx[b]) or 0) for b in BUCKETS}
                totals["סיכום"] = float(r[tidx] or 0)
                cost = float(val(r, cidx) or 0) or None
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
                hours = {b: val(r, bidx[b]) for b in BUCKETS}
                if segs or any(hours.values()):
                    daily.append((r[0], r[1], segs, hours, r[tidx]))
        emps.append(dict(name=name, month=month, days=days, shifts=shifts, clock=clock,
                         roles=roles, totals=totals or {b: 0 for b in BUCKETS + ["סיכום"]},
                         daily=daily, issues=issues, agency="כוח אדם" in name, cost=cost, source=path))
    return emps


def parse_summaries(path):
    """"דוח סיכומים" של שיפט (פלור): שורה לעובד×תפקיד, עם טיפים והשלמה. מאוחד לרשומה אחת לעובד, עם פירוט לפי תפקיד (parts)."""
    ws = openpyxl.load_workbook(path).active
    rows = list(ws.iter_rows(values_only=True))
    month = next((str(r[0]).split(":", 1)[1].strip() for r in rows[:5] if r[0] and str(r[0]).startswith("חודש")), "")
    hi = next(i for i, r in enumerate(rows) if r[0] == "עובד")
    ix = {h: i for i, h in enumerate(rows[hi])}
    num = lambda r, h: float(r[ix[h]] or 0) if h in ix and isinstance(r[ix[h]], (int, float)) else 0.0
    by, days = {}, {}
    for r in rows[hi + 1:]:
        name, role = (str(r[0]).strip() if r[0] else None), str(r[1] or "")
        if not name or name in ("כולם", "עובד") or not role.startswith("סיכום "):
            continue
        if role == "סיכום כללי":
            days[name] = int(num(r, "ימי עבודה"))
            continue
        totals = {b: num(r, b) for b in BUCKETS}
        totals["סיכום"] = num(r, "סיכום")
        if totals["סיכום"] <= 0:
            continue
        tipped = num(r, "טיפ מזומן") > 0 or num(r, "טיפ אחרי") > 0
        by.setdefault(name, []).append(dict(role=role[6:].strip(), totals=totals,
                                            tips=num(r, "טיפ אחרי") if tipped else None,
                                            completion=num(r, "השלמה") if tipped else None))
    emps = []
    for name, parts in by.items():
        parts.sort(key=lambda p: -p["totals"]["סיכום"])
        tot = {b: sum(p["totals"][b] for p in parts) for b in BUCKETS + ["סיכום"]}
        tp = [p for p in parts if p["tips"] is not None]
        roles = [p["role"] for p in parts]
        emps.append(dict(name=name, key=name, role_row=", ".join(roles), all_tala=all("טאלה" in x for x in roles),
                         roles=roles, roles_disp=", ".join(f"{p['role']} {p['totals']['סיכום']:.1f}" for p in parts) if len(parts) > 1 else roles[0],
                         parts=parts, month=month, days=days.get(name, 0), shifts=days.get(name, 0), clock=None,
                         totals=tot, daily=[], issues=[], agency="כוח אדם" in name, cost=None,
                         tips=sum(p["tips"] for p in tp) if tp else None,
                         completion=sum(p["completion"] for p in tp) if tp else None, source=path))
    return emps


def parse_any(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    first = wb.worksheets[0]
    head = [c for r in first.iter_rows(max_row=5, values_only=True) for c in r if c]
    return parse_summaries(path) if any(str(c).startswith("דוח סיכומים") for c in head) else parse_file(path)


def role_label(roles):
    """תפקיד אחד וקצר לעמודת התפקידים: הראשי (ראשון ברשימה), בלי סניף/בלת"מ; שעות מתלמד → "התלמדות"."""
    def norm(x):
        x = re.sub(r"\b(טאלה|פסאו|פאסאו)\b", "", x).strip()
        return {"בר": "ברמן", "אחמש": 'אחמ"ש'}.get(x, x)
    trainee = any("מתלמד" in r for r in roles)
    main = [norm(r) for r in roles if "מתלמד" not in r and norm(r) != 'בלת"מ']
    if main:
        return main[0] + (" + התלמדות" if trainee else "")
    return "התלמדות" if trainee else (norm(roles[0]) if roles else "")


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


def build(out, depts, tala_hint=(), rates=None, drop_agency=False, split_rates=None, venue_ok=(), notes=None, bonus=None, role_rates=None, fixed=None,
          floor_final=None, real_rate=None):
    real_rate = real_rate or {}
    role_rates, fixed = role_rates or [], fixed or {}
    notes = notes or {}
    bonus = bonus or {}
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
            "רגילות", "125%", "150%", "שבת/חג", "מיוחד 200%", "סיכום", "טיפים (₪)", "השלמה (₪)",
            "תעריף שעתי (₪)", "נטו / ברוטו", "בונוס (₪)", "בונוס 2 – השלמה לשכר (₪)", "מפרעה (₪)", "שכר סופי (₪)", "לבדיקה"]
    widths = [4, 24, 9, 22, 11, 8, 8, 9, 8, 8, 9, 9, 10, 10, 10, 10, 9, 10, 12, 10, 13, 60]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[L(i)].width = w
    C = {c: i + 1 for i, c in enumerate(cols)}
    HCOLS = ["רגילות", "125%", "150%", "שבת/חג", "מיוחד 200%"]  # כותרות כמו בדוח של שיפט

    month = next((e["month"] for d in depts.values() for e in d if e["month"]), "")
    ws["A1"] = f"שכר — שעות עבודה {month}"
    ws["A1"].font = Font(name=F, size=14, bold=True)
    ws["A2"] = ("מקור: שיפטאורגנייזר, דוח מפורט. שעות = כחול (מהדוח, לא לשנות). תאים צהובים = למילוי: תעריף, נטו/ברוטו, בונוס, מפרעה. "
                "שכר סופי (כולל בונוס), נטו או ברוטו לפי העמודה נטו/ברוטו: "
                "תעריף נטו → תעריף × סיכום שעות + בונוס. "
                "תעריף ברוטו → תעריף × שעות לפי האחוזים (רגילות×1, 125%×1.25, 150%×1.5, שבת/חג×1.5, מיוחד 200%×2) + בונוס. "
                "מפרעה — לקיזוז בתלוש, לא נכללת בסכום. אין המרה בין נטו לברוטו — זה אצל רואת החשבון.")
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
        floor = any(e.get("role_row") for e in emps)
        order = (lambda e: (e["name"], -e["totals"]["סיכום"])) if floor else (lambda e: (-e["totals"]["סיכום"], e["name"]))
        for n, e in enumerate(sorted(emps, key=order), 1):
            t = e["totals"]
            co = "כוח אדם" if e["agency"] else ("" if e["name"] in tala_hint else e.get("venue", "פסאו"))
            vals = {"#": n, "שם עובד": e["name"], "מזהה שעון": e["clock"], "תפקידים": role_label(e["roles"]),
                    "טיפים (₪)": e.get("tips"), "השלמה (₪)": e.get("completion"),
                    "חברה בתלוש": co, "ימי עבודה": e["days"], "משמרות": e["shifts"],
                    "רגילות": t["רגילות"] or None, "125%": t["125%"] or None, "150%": t["150%"] or None,
                    "שבת/חג": t["שבת/חג"] or None, "מיוחד 200%": t["מיוחד 200%"] or None}
            for k, v in vals.items():
                ws.cell(r, C[k], v)
            ws.cell(r, C["סיכום"], f"=SUM({L(C['רגילות'])}{r}:{L(C['מיוחד 200%'])}{r})")
            H = lambda k: f"{L(C[k])}{r}"
            # שעות לפי אחוזים — בתוך הנוסחה, בלי עמודת עזר
            paid = f"({H('רגילות')}+1.25*{H('125%')}+1.5*{H('150%')}+1.5*{H('שבת/חג')}+2*{H('מיוחד 200%')})"
            own_rate, role_note = rates.get(e["name"]), None
            if own_rate is None and e["name"] not in split_rates:
                # תעריף בסיס לפי תפקיד בשיפט; כמה תפקידים עם תעריפים שונים → הגבוה, עם הערה
                hits = sorted({(rt, b, pat) for role in e["roles"] for pat, rt, b in role_rates if pat in role}, reverse=True)
                if hits:
                    rt, b, pat = hits[0]
                    own_rate = [rt, b, None, ("הנחה: מתלמד/ה — לפי תעריף התפקיד" if "מתלמד" in " ".join(e["roles"]) else "תעריף בסיס לפי תפקיד")
                                + f" ({pat}): {rt} {b} לשעה"]
                    if len({h[0] for h in hits}) > 1:
                        role_note = "כמה תפקידים בתעריפים שונים (" + ", ".join(f"{h[2]} {h[0]}" for h in hits) + ") — נלקח הגבוה"
            rate, basis, hmode, src = (list(own_rate or []) + [None] * 4)[:4]
            ws.cell(r, C["תעריף שעתי (₪)"], rate)
            ws.cell(r, C["נטו / ברוטו"], basis)
            if e["name"] in bonus:
                ws.cell(r, C["בונוס (₪)"], bonus[e["name"]][0])
                ws.cell(r, C["בונוס (₪)"]).comment = Comment(bonus[e["name"]][1], "Claude")
            O, P, V = H("תעריף שעתי (₪)"), H("נטו / ברוטו"), H("בונוס (₪)")
            # hmode "total" = תעריף כולל (למשל מתלוש קודם ÷ שעות) → על סיכום השעות בלי אחוזים
            hrs = f'{O}*{H("סיכום")}' if hmode == "total" else f'IF({P}="נטו",{O}*{H("סיכום")},{O}*{paid})'
            ws.cell(r, C["שכר סופי (₪)"], f'=IF({O}="","",{hrs}+{V})')
            if e.get("tips") is not None:
                # מלצר/בר: הטיפים הם השכר; השלמה = מה שהמסעדה משלימה עד תעריף הבסיס (שיפט מחשב לכל משמרת)
                ws.cell(r, C["שכר סופי (₪)"], f'={H("טיפים (₪)")}+{H("השלמה (₪)")}+{V}')
                ws.cell(r, C["שכר סופי (₪)"]).comment = Comment(
                    "טיפים (אחרי גביית אוכל) + השלמה מהמסעדה עד תעריף הבסיס לשעה — כפי שחושב בשיפט לכל משמרת.", "Claude")
                basis = basis or "ברוטו"
                ws.cell(r, C["נטו / ברוטו"], basis)
            if e["name"] in split_rates:
                sr = split_rates[e["name"]]
                rng = lambda c: f"'פירוט יומי'!${c}$2:${c}${daily_rows + 1}"
                parts = [f"{rt}*SUMPRODUCT(({rng('B')}={H('שם עובד')})*(WEEKDAY({rng('D')})>={lo})*(WEEKDAY({rng('D')})<={hi})*{rng('R')})"
                         for lo, hi, rt in sr["bands"]]
                ws.cell(r, C["תעריף שעתי (₪)"], sr["bands"][0][2])
                ws.cell(r, C["תעריף שעתי (₪)"]).comment = Comment(
                    "תעריף לפי יום: " + ", ".join(f"{'אבגדהוש'[lo-1]}'–{'אבגדהוש'[hi-1]}' {rt}" for lo, hi, rt in sr["bands"]) +
                    f" ({sr['basis']}), לפי סיכום שעות ביום בגיליון הפירוט.", "Claude")
                ws.cell(r, C["נטו / ברוטו"], sr["basis"])
                tot = "+".join(parts)
                ws.cell(r, C["שכר סופי (₪)"], f"={tot}+{V}")
            floor_note = None
            if e.get("parts") is not None:
                # פלור: שורה אחת לעובד. שכר סופי = טיפים + השלמה (תפקידי טיפ) + תעריף התפקיד × שעות לפי אחוזים (שאר התפקידים)
                pats = sorted(role_rates, key=lambda x: -len(x[0]))
                terms, priced, missing, rts, trainee = [], [], [], set(), False
                for pt in e["parts"]:
                    if pt["tips"] is not None:
                        priced.append(f"{pt['role']} {pt['totals']['סיכום']:.1f} ש': טיפים {pt['tips']:,.0f} + השלמה {pt['completion']:,.0f}")
                        continue
                    pr = rates.get(e["name"]) or next(([rt, b] for pat, rt, b in pats if pat in pt["role"]), None)
                    if pr is None:
                        missing.append(f"{pt['role']} ({pt['totals']['סיכום']:.1f} ש')")
                        continue
                    tt = pt["totals"]
                    terms.append(f"{pr[0]}*({tt['רגילות']:.4f}+1.25*{tt['125%']:.4f}+1.5*{tt['150%']:.4f}"
                                 f"+1.5*{tt['שבת/חג']:.4f}+2*{tt['מיוחד 200%']:.4f})")
                    rts.add(pr[0])
                    trainee |= "מתלמד" in pt["role"]
                    priced.append(f"{pt['role']} {tt['סיכום']:.1f} ש' × {pr[0]}" + (" (מתלמד/ה — לפי תעריף התפקיד)" if "מתלמד" in pt["role"] else ""))
                # תעריף בעמודה רק כשהוא חד-משמעי (תפקיד אחד בלי טיפים); אחרת הפירוט בהערה על השכר הסופי
                rate = next(iter(rts)) if len(rts) == 1 and e.get("tips") is None else None
                basis, src, role_note = "ברוטו", ("הנחה: מתלמד/ה לפי תעריף התפקיד" if trainee else None), None
                ws.cell(r, C["תעריף שעתי (₪)"]).value = rate
                ws.cell(r, C["נטו / ברוטו"], basis)
                tip_terms = [H("טיפים (₪)"), H("השלמה (₪)")] if e.get("tips") is not None else []
                if missing:
                    ws.cell(r, C["שכר סופי (₪)"]).value = None
                    floor_note = "חסר תעריף ל: " + ", ".join(missing)
                else:
                    ws.cell(r, C["שכר סופי (₪)"], "=" + "+".join(tip_terms + terms + [V]))
                ws.cell(r, C["שכר סופי (₪)"]).comment = Comment("\n".join(priced) or "-", "Claude")
                if e["name"] in real_rate and not missing:
                    # השכר האמיתי: תעריף אמיתי × סך השעות + טיפים + השלמה + בונוס.
                    # בונוס 2 = הפער מעל החישוב לפי תעריף התלוש (שאר התפקידים × תעריף התלוש לפי אחוזים)
                    rr = real_rate[e["name"]]
                    ws.cell(r, C["שכר סופי (₪)"]).value = "=" + "+".join([f'{rr}*{H("סיכום")}'] + tip_terms + [V])
                    ws.cell(r, C["בונוס 2 – השלמה לשכר (₪)"]).value = f'={rr}*{H("סיכום")}-(' + ("+".join(terms) or "0") + ")"
                    ws.cell(r, C["שכר סופי (₪)"]).comment = Comment(
                        f"שכר אמיתי: {rr} ₪ × סך השעות + טיפים + השלמה + בונוס.\nבונוס 2 = ההפרש מעל התלוש:\n" + "\n".join(priced), "Claude")
                # פלור: שכר סופי רק לעובדים שנבחרו; לשאר — רואת החשבון מחשבת מהשעות/טיפים/השלמה
                if floor_final is not None and e["name"] not in floor_final:
                    ws.cell(r, C["שכר סופי (₪)"]).value = None
                    ws.cell(r, C["שכר סופי (₪)"]).comment = None
                    ws.cell(r, C["נטו / ברוטו"]).value = None
                    rate, floor_note, src = None, None, None
                    ws.cell(r, C["תעריף שעתי (₪)"]).value = None
            if e["name"] in fixed:
                # משכורת גלובלית: סכום קבוע (+ בונוס), בלי קשר לשעות
                amt, fb, fsrc = (list(fixed[e["name"]]) + [None, None])[:3]
                rate, basis, src, role_note, floor_note = None, fb or "ברוטו", None, None, None
                ws.cell(r, C["תעריף שעתי (₪)"]).value = None
                ws.cell(r, C["נטו / ברוטו"]).value = basis
                ws.cell(r, C["שכר סופי (₪)"]).value = f"={amt}+{V}"
                ws.cell(r, C["שכר סופי (₪)"]).comment = Comment(fsrc or f"משכורת גלובלית {amt:,}", "Claude")
            rate_note = None
            if rate is not None and src:
                ws.cell(r, C["תעריף שעתי (₪)"]).comment = Comment(src, "Claude")
            if rate is None and e.get("tips") is None and e["name"] not in split_rates and e.get("parts") is None and e["name"] not in fixed:
                rate_note = "אין תעריף לתפקיד — להשלים"
            if rate is not None and not basis:
                rate_note = "לא צוין אם התעריף נטו או ברוטו — חושב כברוטו"
                ws.cell(r, C["נטו / ברוטו"], "ברוטו")
            assumed = bool(src and src.startswith("הנחה"))
            issues = " · ".join(x for x in e["issues"] if not re.match(r"\d\d/\d\d", x))
            if t["סיכום"] == 0:
                issues = ("0 שעות בחודש — לבדוק אם בכלל בתלוש" + (" · " + issues if issues else ""))
            if e["name"] in tala_hint:
                issues = "עבד/ה בטאלה — לבחור חברה לתלוש" + (" · " + issues if issues else "")
            if e["name"] in notes:
                issues = notes[e["name"]] + (" · " + issues if issues else "")
            if role_note:
                issues = role_note + (" · " + issues if issues else "")
            if floor_note:
                issues = floor_note + (" · " + issues if issues else "")
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
            for k in ["תעריף שעתי (₪)", "נטו / ברוטו", "בונוס (₪)", "מפרעה (₪)"] + ([] if co else ["חברה בתלוש"]):
                if not grey:
                    ws.cell(r, C[k]).fill = inp
            if assumed:
                ws.cell(r, C["תעריף שעתי (₪)"]).fill = PatternFill("solid", fgColor="F8CBAD")
            for k in HCOLS + ["סיכום"]:
                ws.cell(r, C[k]).number_format = '0.00;-0.00;"-"'
            for k in ["טיפים (₪)", "השלמה (₪)", "תעריף שעתי (₪)", "בונוס (₪)", "בונוס 2 – השלמה לשכר (₪)", "מפרעה (₪)", "שכר סופי (₪)"]:
                ws.cell(r, C[k]).number_format = '#,##0;-#,##0;"-"'
            ws.cell(r, C["לבדיקה"]).alignment = Alignment(wrap_text=True, vertical="top")
            dv_co.add(ws.cell(r, C["חברה בתלוש"]))
            dv_nb.add(ws.cell(r, C["נטו / ברוטו"]))
            r += 1
        last = r - 1
        ws.cell(r, C["שם עובד"], f'סה"כ {title}').font = bold
        for k in ["ימי עבודה", "משמרות"] + HCOLS + ["סיכום", "טיפים (₪)", "השלמה (₪)", "בונוס (₪)", "בונוס 2 – השלמה לשכר (₪)", "מפרעה (₪)"]:
            x = ws.cell(r, C[k], f"=SUM({L(C[k])}{first}:{L(C[k])}{last})")
            x.font = bold
            x.number_format = '#,##0;-#,##0;"-"' if "₪" in k else ('0;-0;"-"' if k in ("ימי עבודה", "משמרות") else '#,##0.00;-#,##0.00;"-"')
        for c in range(1, len(cols) + 1):
            ws.cell(r, c).fill = sub
            ws.cell(r, c).border = box
        subtotal_rows.append(r)
        rng = lambda k: f"{L(C[k])}{first}:{L(C[k])}{last}"
        for lbl, crit in (("נטו", '"נטו"'), ("ברוטו", '"<>נטו"')):
            r += 1
            ws.cell(r, C["שם עובד"], f"סה\"כ שכר סופי — {lbl}").font = Font(name=F, size=10, italic=True)
            x = ws.cell(r, C["שכר סופי (₪)"], f'=SUMIF({rng("נטו / ברוטו")},{crit},{rng("שכר סופי (₪)")})')
            x.number_format = '#,##0;-#,##0;"-"'
            x.font = bold
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
          "תפקיד 2", "כניסה 2", "יציאה 2", "הערות 2"] + HCOLS + ["סיכום"]
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
    cache_values(out)
    accountant_file(out)


def accountant_file(out):
    """קובץ נקי לרואת החשבון, מתוך הערכים המחושבים של קובץ השכר: מה שהעובד צריך לקבל, בלי בונוס/יחס/ברוטו משוער."""
    src = openpyxl.load_workbook(out, data_only=True)["סיכום שכר"]
    hdr0 = next(({c.value: c.column for c in row} for row in src.iter_rows(min_row=4, max_row=8) if row[0].value == "#"), {})
    fin_col = hdr0.get("שכר סופי (₪)")
    if not fin_col or not any(isinstance(src.cell(r, fin_col).value, (int, float)) for r in range(6, src.max_row + 1)):
        print("אין ערכים מחושבים (pycel חסר) — קובץ רואת החשבון לא נוצר")
        return
    F = "Arial"
    num = lambda x: x if isinstance(x, (int, float)) else None
    sections, cur, hdr = [], None, {}
    for r in range(4, src.max_row + 1):
        a, b = src.cell(r, 1).value, src.cell(r, 2).value
        if a == "#":
            hdr = {src.cell(r, c).value: c for c in range(1, src.max_column + 1)}
        elif a and not b and isinstance(a, str):
            cur = [a, []]
            sections.append(cur)
        elif isinstance(a, int) and cur:
            g = lambda k: src.cell(r, hdr[k]).value
            fin = num(g("שכר סופי (₪)"))
            cur[1].append({"שם עובד": b, "חברה בתלוש": g("חברה בתלוש"), "ימי עבודה": g("ימי עבודה"),
                           **{k: num(g(k)) for k in HCOLS_ACC}, "סיכום": num(g("סיכום")),
                           "תפקיד": g("תפקידים"),
                           "טיפים (₪)": num(g("טיפים (₪)")), "השלמה (₪)": num(g("השלמה (₪)")),
                           "בונוס (₪)": num(g("בונוס (₪)")), "בונוס 2 – השלמה לשכר (₪)": num(g("בונוס 2 – השלמה לשכר (₪)")), "מפרעה (₪)": num(g("מפרעה (₪)")),
                           "שכר סופי (₪)": round(fin) if fin is not None else None,
                           "נטו / ברוטו": g("נטו / ברוטו") if fin is not None else None})
    rows = [e for _, es in sections for e in es]
    floor = any(e.get("טיפים (₪)") is not None for e in [x for _, es in sections for x in es])
    cols = ["#", "שם עובד"] + (["תפקיד"] if floor else []) + ["חברה בתלוש", "ימי עבודה"] + HCOLS_ACC + ["סיכום", "טיפים (₪)", "השלמה (₪)",
            "בונוס (₪)", "בונוס 2 – השלמה לשכר (₪)", "מפרעה (₪)", "שכר סופי (₪)", "נטו / ברוטו"]
    keep = ("#", "שם עובד", "בונוס (₪)", "מפרעה (₪)", "שכר סופי (₪)", "נטו / ברוטו")
    cols = [c for c in cols if c in keep or any(e.get(c) not in (None, "", 0) for e in rows)]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "שכר"
    ws.sheet_view.rightToLeft = True
    thin = Side(style="thin", color="BFBFBF")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    head = PatternFill("solid", fgColor="D9E1F2")
    sec = PatternFill("solid", fgColor="1F3864")
    month = (src["A1"].value or "").replace("שכר — ", "")
    ws["A1"] = f"שכר — {month}"
    ws["A1"].font = Font(name=F, size=14, bold=True)
    ws["A2"] = ("שעות: דוח מפורט משיפטאורגנייזר. שכר סופי = כולל הבונוס; נטו = מה שהעובד צריך לקבל ביד, ברוטו = ברוטו בתלוש. "
                "מפרעה — לקזז.")
    ws["A2"].font = Font(name=F, size=9, italic=True)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(cols))
    for i, c in enumerate(cols, 1):
        ws.column_dimensions[L(i)].width = {"#": 4, "שם עובד": 24, "תפקיד": 30, "חברה בתלוש": 11}.get(c, 11)
    r = 4
    for title, es in sections:
        if not es:
            continue
        ws.cell(r, 1, title).font = Font(name=F, size=12, bold=True, color="FFFFFF")
        for c in range(1, len(cols) + 1):
            ws.cell(r, c).fill = sec
        r += 1
        for c, name in enumerate(cols, 1):
            x = ws.cell(r, c, name)
            x.font = Font(name=F, size=10, bold=True)
            x.fill = head
            x.border = box
            x.alignment = Alignment(horizontal="center", wrap_text=True)
        r += 1
        first = r
        for n, e in enumerate(es, 1):
            for c, name in enumerate(cols, 1):
                x = ws.cell(r, c, n if name == "#" else e.get(name))
                x.font = Font(name=F, size=10, bold=name in ("שכר סופי (₪)", "נטו / ברוטו"))
                x.border = box
                if name in HCOLS_ACC + ["סיכום"]:
                    x.number_format = '0.00;-0.00;""'
                elif "₪" in name:
                    x.number_format = '#,##0.00;-#,##0.00;""' if "תעריף" in name else '#,##0;-#,##0;""'
            r += 1
        ws.cell(r, cols.index("שם עובד") + 1, f'סה"כ {title}').font = Font(name=F, size=10, bold=True)
        for c, name in enumerate(cols, 1):
            if name in ["ימי עבודה", "סיכום", "טיפים (₪)", "השלמה (₪)", "בונוס (₪)", "בונוס 2 – השלמה לשכר (₪)", "מפרעה (₪)"] + HCOLS_ACC:
                x = ws.cell(r, c, round(sum(e.get(name) or 0 for e in es), 2))
                x.font = Font(name=F, size=10, bold=True)
                x.number_format = '#,##0;-#,##0;""' if "₪" in name or name == "ימי עבודה" else '#,##0.00;-#,##0.00;""'
            ws.cell(r, c).fill = head
            ws.cell(r, c).border = box
        for lbl in ("נטו", "ברוטו"):
            tot = sum(e["שכר סופי (₪)"] or 0 for e in es if e["נטו / ברוטו"] == lbl or (lbl == "ברוטו" and e["נטו / ברוטו"] not in (None, "נטו")))
            if tot:
                r += 1
                ws.cell(r, cols.index("שם עובד") + 1, f'סה"כ שכר סופי — {lbl}').font = Font(name=F, size=10, italic=True)
                x = ws.cell(r, cols.index("שכר סופי (₪)") + 1, tot)
                x.font = Font(name=F, size=10, bold=True)
                x.number_format = '#,##0'
                ws.cell(r, cols.index("נטו / ברוטו") + 1, lbl).font = Font(name=F, size=10, bold=True)
        r += 2
    ws.freeze_panes = "C4"
    acc = re.sub(r"\.xlsx$", "", out) + " - לרואת החשבון.xlsx"
    wb.save(acc)
    print(f"קובץ לרואת החשבון: {acc}")


def cache_values(out):
    """openpyxl שומר נוסחאות בלי ערך מחושב, ותצוגה מקדימה (וואטסאפ, iPhone, Drive) מציגה תאים ריקים.
    מחשב עם pycel וכותב את הערך לתוך ה-XML ליד הנוסחה — הנוסחאות נשארות."""
    try:
        from pycel import ExcelCompiler
    except ImportError:
        print("pycel לא מותקן — הקובץ יחושב רק בפתיחה ב-Excel (pip install pycel)")
        return
    import zipfile, shutil, os, html
    xc = ExcelCompiler(filename=out)
    wb = openpyxl.load_workbook(out)
    names = {}
    with zipfile.ZipFile(out) as z:
        rels = z.read("xl/_rels/workbook.xml.rels").decode()
        book = z.read("xl/workbook.xml").decode()
    for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', book):
        tgt = re.search(rf'Id="{rid}"[^>]*Target="([^"]+)"', rels) or re.search(rf'Target="([^"]+)"[^>]*Id="{rid}"', rels)
        names["xl/" + tgt.group(1).lstrip("/").removeprefix("xl/")] = html.unescape(name)
    vals = {}
    for path, sheet in names.items():
        for row in wb[sheet].iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    try:
                        v = xc.evaluate(f"'{sheet}'!{c.coordinate}")
                    except Exception:
                        continue
                    vals[(path, c.coordinate)] = v

    def fill(path, xml):
        def sub(m):
            attrs, f = m.group(1), m.group(2)
            ref = re.search(r'\br="([A-Z]+\d+)"', attrs).group(1)
            if (path, ref) not in vals:
                return m.group(0)
            v = vals[(path, ref)]
            attrs = re.sub(r'\st="[^"]*"', "", attrs)
            if v is None or v == "":
                return f'<c{attrs} t="str">{f}<v></v></c>'
            if isinstance(v, bool):
                return f'<c{attrs} t="b">{f}<v>{int(v)}</v></c>'
            if isinstance(v, (int, float)):
                return f'<c{attrs}>{f}<v>{repr(float(v)) if isinstance(v, float) else v}</v></c>'
            return f'<c{attrs} t="str">{f}<v>{html.escape(str(v))}</v></c>'
        return re.sub(r'<c(\s[^>]*)>(<f>.*?</f>)(?:<v>.*?</v>|<v\s*/>)?</c>', sub, xml, flags=re.S)

    tmp = out + ".tmp"
    with zipfile.ZipFile(out) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename in names:
                data = fill(item.filename, data.decode()).encode()
            zout.writestr(item, data)
    shutil.move(tmp, out)
    print(f"ערכים מחושבים נשמרו ל-{len(vals)} תאי נוסחה")


if __name__ == "__main__":
    out = sys.argv[1]
    depts = {}
    for a in sys.argv[2:]:
        k, p = a.split("=", 1)
        depts.setdefault(k, []).extend(parse_any(p))
    # אותו עובד בכמה קבצים (למשל דוח נפרד מאפליקציה אחרת) — נשאר זה עם יותר שעות
    for k in depts:
        best = {}
        for e in depts[k]:
            key = e.get("key", e["name"])
            if key not in best or e["totals"]["סיכום"] > best[key]["totals"]["סיכום"]:
                best[key] = e
        depts[k] = list(best.values())
    import os, json
    inp = json.load(open(os.environ["PAYROLL_INPUTS"])) if os.environ.get("PAYROLL_INPUTS") else {}
    excl = set(inp.get("exclude", []))
    # שעות בלת"מ של עובד מסוים נספרות כתפקיד אחר (למשל אחמ"ש / מארחת)
    for k in depts:
        for e in depts[k]:
            to = inp.get("blatam_as", {}).get(e["name"])
            if to:
                e["roles"] = [to if x == 'בלת"מ' else x for x in e["roles"]]
                for pt in e.get("parts", []):
                    if pt["role"] == 'בלת"מ':
                        pt["role"] = to
    venue = inp.get("venue", {})
    split = {}
    for k in depts:
        emps = [e for e in depts[k] if e["name"] not in excl and not (inp.get("drop_agency") and e["agency"])]
        for e in emps:
            # פלור: הסניף לפי התפקיד ("מלצר טאלה"); מטבח: לפי מיפוי השמות
            # פלור: רק מי שעבד בטאלה בלבד → טאלה; עבד בשני המקומות → פסאו (תלוש בגג על הים)
            e["venue"] = "טאלה" if e.get("all_tala") else venue.get(e["name"], "פסאו")
            # כשיש רשימת 101 מ-BUK — היא קובעת: טופס 101 בטאלה → טאלה, כל השאר פסאו (גג על הים)
            if "tala_101" in inp:
                e["venue"] = "טאלה" if e["name"] in inp["tala_101"] else "פסאו"
            if e["name"] in inp.get("no_101", []):
                e["issues"].insert(0, "אין טופס 101 ב-BUK (לא בפסאו ולא בטאלה)")
        if venue or "tala_101" in inp or any(e.get("role_row") for e in emps):
            for v in ("פסאו", "טאלה"):
                part = [e for e in emps if e["venue"] == v]
                if part:
                    split[f"{k} {v}"] = part
        else:
            split[k] = emps
    depts = split
    build(out, depts, set(inp.get("tala_hint", [])), inp.get("rates", {}), inp.get("drop_agency", False),
          inp.get("split_rates", {}), set(inp.get("venue_confirmed", [])),
          inp.get("notes", {}), inp.get("bonus", {}), inp.get("role_rates", []), inp.get("fixed", {}),
          set(inp["floor_final"]) if "floor_final" in inp else None, inp.get("real_rate", {}))
