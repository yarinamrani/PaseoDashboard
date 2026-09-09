from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

F = "Arial"
H_FILL = PatternFill("solid", fgColor="1F3864")
H_FONT = Font(name=F, bold=True, color="FFFFFF", size=11)
IN_FILL = PatternFill("solid", fgColor="FFFF00")
WARN = PatternFill("solid", fgColor="FCE4E4")
OK    = PatternFill("solid", fgColor="E6F2E6")
TITLE = Font(name=F, bold=True, size=14)
BOLD  = Font(name=F, bold=True)
BASE  = Font(name=F)
THIN  = Side(style="thin", color="BFBFBF")
BOX   = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
NIS   = '₪#,##0.00'
RATE  = '0.00'
HRS   = '0.00'

drops = [  # name, id, r7, r8, q_base, q125, q150
 ("יוסופוב יעקב","303929798",65,51,188.29,26.35,38.21),
 ("פלדינגר עדי","209188671",60,51,158.28,9.43,44.69),
 ("Monday hillary Omeje","B00748150",51,36,117.97,5.28,6.18),
 ("ופרו ניקולאי","347894453",56,51,93.45,0.35,55.95),
 ("שרף אראל","214152936",44,40,93.50,0.43,1.94),
 ("בן גיאת אריאל","326438272",44.4,36,45.37,0.53,0),
 ("עמיר נעם","324230218",40,36,52.41,0,20.99),
 ("הרוש עינת שחר","209362243",51,40,0.53,0,5.40),
 ("בביש יהלי","328209879",36.8,36,22.76,0,8.92),
 ("סטפנצ'קוב מקסים","345600043",52,51,5.03,0.13,2.97),
]

rises = [
 ("גראדאת דאהוד","328187315",46,51,"העלאה פרטנית"),
 ("אמויאל שירה","214217358",35.41,40,"העלאה פרטנית"),
 ("נועם ליאל","326466398",35.41,40,"העלאה פרטנית"),
 ("בכר נוגה","333000958",35.10,36,"עדכון רוחבי"),
]
across = ["בוך ניר מאור","בן ארי יהונתן","סנואני טליה","טל אלה","בריינר שני","כהן אליאן",
 "סויסה יובל","וופנה אליעזר","עמית ניר אברהם","כהן שקד","הוכברג עידו","מזרחי אורן",
 "קיזמן נאור","בזוב יצחק","לוצי רוני","משה אורי","בזיס עמית","בן חמו שחר",
 "שפוליאנסקי אלון","מגן עמית","רוזמן יקטרינה"]

wb = Workbook()

# ---------------- Sheet 1: סיכום ----------------
s = wb.active; s.title = "סיכום"; s.sheet_view.rightToLeft = True
s["A1"] = "התאמת תעריפים שעתיים — יולי מול אוגוסט 2026"; s["A1"].font = TITLE
s["A2"] = "פסאו · גג על הים ראשון בע״מ"; s["A2"].font = Font(name=F, size=11, color="595959")

rows = [
 ("", ""),
 ("מה נבדק", "התעריף השעתי בתלוש של כל עובד בחודש 07/2026 מול 08/2026"),
 ("מקור הנתונים", "BUK — שדה price של רכיב ״משכורת״ בתלוש. זהו התעריף הרשום בתלוש, לא חישוב משוער."),
 ("אימות", "שעות הנוספות מאשרות: כשהתעריף יורד מ-51 ל-36, רכיב 125% יורד מ-63.75 ל-45 ורכיב 150% מ-76.50 ל-54."),
 ("תאריך הפקה", "09/09/2026"),
 ("", ""),
 ("עובדים בתלושי יולי", 67),
 ("עובדים בתלושי אוגוסט", 78),
 ("עובדים שהתעריף שלהם ירד", 10),
 ("עובדים שהתעריף שלהם עלה", 25),
 ("", ""),
]
r = 4
for a,b in rows:
    s.cell(r,1,a).font = BOLD if a else BASE
    c = s.cell(r,2,b); c.font = BASE; c.alignment = Alignment(wrap_text=True, vertical="top")
    r += 1

s.cell(r,1,"סך הפער בגין ירידות התעריף (ברוטו)").font = Font(name=F, bold=True, size=12)
tot = s.cell(r,2,"='ירידות תעריף'!G14"); tot.font = Font(name=F, bold=True, size=12, color="C00000"); tot.number_format = NIS
r += 2

s.cell(r,1,"הממצא").font = Font(name=F, bold=True, size=12)
r += 1
for line in [
 "כל עשר הירידות נחתו בדיוק על מדרגות התעריף הסטנדרטיות (35.40 / 36 / 40 / 51).",
 "ביולי היו לעובדים האלה תעריפים אישיים חריגים (65, 60, 56, 52, 44.40, 44) — באוגוסט כולם נצמדו למדרגה.",
 "הדפוס הזה מתאים לטבלת תעריפים שנבנתה מחדש והתעריפים האישיים אבדו, ולא להחלטה פרטנית לגבי כל אחד מעשרת העובדים.",
 "העלייה מ-35.41 ל-36 אצל 21 עובדים היא עדכון רוחבי ותקין — היא מופיעה בגיליון ״עליות״ לשם שקיפות בלבד.",
 "לתשומת לב: הורדת שכר שעתי לעובד קיים מחייבת את הסכמתו.",
]:
    c = s.cell(r,1,"• " + line); c.font = BASE; c.alignment = Alignment(wrap_text=True)
    s.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2); r += 1
r += 1

s.cell(r,1,"מה נדרש מהנהלת החשבונות").font = Font(name=F, bold=True, size=12); r += 1
for line in [
 "לאשר לגבי כל שורה בגיליון ״ירידות תעריף״ האם השינוי מכוון או טעות.",
 "למלא את שלוש העמודות הצהובות: ״מכוון?״ (כן/לא), ״סיבה״, ״לתיקון בשכר 09/2026?״ (כן/לא).",
 "דוגמה למילוי: מכוון? = לא · סיבה = טעות בעדכון טבלת תעריפים · לתיקון = כן",
 "רק התאים הצהובים מיועדים למילוי. כל שאר התאים מחושבים ואין לשנותם.",
]:
    c = s.cell(r,1,"• " + line); c.font = BASE; c.alignment = Alignment(wrap_text=True)
    s.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2); r += 1

s.column_dimensions["A"].width = 46; s.column_dimensions["B"].width = 78

# ---------------- Sheet 2: ירידות תעריף ----------------
d = wb.create_sheet("ירידות תעריף"); d.sheet_view.rightToLeft = True
d["A1"] = "ירידות בתעריף השעתי — 07/2026 ← 08/2026"; d["A1"].font = TITLE
hdr = ["שם העובד/ת","ת.ז / דרכון","תעריף 07","תעריף 08","הפרש",
       "שעות משוקללות 08","פער בשכר (ברוטו)","מכוון?","סיבה","לתיקון בשכר 09/2026?"]
for i,h in enumerate(hdr,1):
    c = d.cell(3,i,h); c.font = H_FONT; c.fill = H_FILL; c.border = BOX
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

for i,(nm,idn,r7,r8,qb,q1,q2) in enumerate(drops):
    rr = 4+i
    d.cell(rr,1,nm).font = BOLD
    d.cell(rr,2,idn).font = BASE
    d.cell(rr,3,r7).number_format = RATE
    d.cell(rr,4,r8).number_format = RATE
    d.cell(rr,5,f"=D{rr}-C{rr}").number_format = RATE
    d.cell(rr,6,f"={qb}+1.25*{q1}+1.5*{q2}").number_format = HRS
    d.cell(rr,7,f"=(C{rr}-D{rr})*F{rr}").number_format = NIS
    for col in range(1,11):
        cell = d.cell(rr,col); cell.border = BOX
        if cell.font is None or not cell.font.name: cell.font = BASE
    for col in (8,9,10):
        d.cell(rr,col).fill = IN_FILL
    d.cell(rr,5).fill = WARN; d.cell(rr,7).fill = WARN

tr = 4+len(drops)
d.cell(tr,1,"סה״כ").font = Font(name=F, bold=True, size=12)
tc = d.cell(tr,7,f"=SUM(G4:G{tr-1})"); tc.font = Font(name=F, bold=True, size=12, color="C00000"); tc.number_format = NIS
for col in range(1,11): d.cell(tr,col).border = BOX

nr = tr+2
d.cell(nr,1,"הערות").font = BOLD
notes = [
 "״שעות משוקללות 08״ = שעות בסיס + 1.25 × שעות 125% + 1.5 × שעות 150%. כך הפער משקף גם את שעות הנוספות, שמתומחרות כאחוז מהתעריף.",
 "״פער בשכר״ = (תעריף 07 − תעריף 08) × שעות משוקללות 08. זהו סכום ברוטו לפני מס.",
 "הרוש עינת שחר וסטפנצ׳קוב מקסים עבדו באוגוסט מעט מאוד שעות, ולכן הפער הכספי זניח — אך ירידת התעריף עצמה אמיתית וצריכה החלטה.",
 "סהר איתי ירד מ-35.41 ל-35.40 (אגורה) ולא עבד באוגוסט — עיגול, לא נכלל בטבלה.",
 "מקור: BUK, רכיב ״משכורת״, שדה price. נמשך 09/09/2026.",
]
for i,t in enumerate(notes):
    c = d.cell(nr+1+i,1,"• "+t); c.font = Font(name=F, size=9); c.alignment = Alignment(wrap_text=True)
    d.merge_cells(start_row=nr+1+i, start_column=1, end_row=nr+1+i, end_column=10)

for col,w in zip("ABCDEFGHIJ",[24,15,10,10,10,18,18,12,34,20]):
    d.column_dimensions[col].width = w
d.freeze_panes = "A4"

# ---------------- Sheet 3: עליות ----------------
u = wb.create_sheet("עליות"); u.sheet_view.rightToLeft = True
u["A1"] = "עליות בתעריף — לשקיפות בלבד, לא נדרשת פעולה"; u["A1"].font = TITLE
for i,h in enumerate(["שם העובד/ת","ת.ז","תעריף 07","תעריף 08","הפרש","סוג"],1):
    c = u.cell(3,i,h); c.font = H_FONT; c.fill = H_FILL; c.border = BOX
    c.alignment = Alignment(horizontal="center", wrap_text=True)
rr = 4
for nm,idn,r7,r8,kind in rises:
    u.cell(rr,1,nm).font = BASE; u.cell(rr,2,idn).font = BASE
    u.cell(rr,3,r7).number_format = RATE; u.cell(rr,4,r8).number_format = RATE
    u.cell(rr,5,f"=D{rr}-C{rr}").number_format = RATE
    u.cell(rr,6,kind).font = BASE
    for col in range(1,7): u.cell(rr,col).border = BOX; u.cell(rr,col).fill = OK
    rr += 1
for nm in across:
    u.cell(rr,1,nm).font = BASE
    u.cell(rr,3,35.41).number_format = RATE; u.cell(rr,4,36).number_format = RATE
    u.cell(rr,5,f"=D{rr}-C{rr}").number_format = RATE
    u.cell(rr,6,"עדכון רוחבי").font = BASE
    for col in range(1,7): u.cell(rr,col).border = BOX; u.cell(rr,col).fill = OK
    rr += 1
c = u.cell(rr+1,1,"• 21 עובדים עלו מ-35.41 ל-36 — עדכון רוחבי זהה לכולם, כנראה עדכון שכר מינימום.")
c.font = Font(name=F, size=9); u.merge_cells(start_row=rr+1, start_column=1, end_row=rr+1, end_column=6)
for col,w in zip("ABCDEF",[24,15,10,10,10,18]): u.column_dimensions[col].width = w
u.freeze_panes = "A4"

wb.save("/home/user/PaseoDashboard/docs/payroll/התאמת-תעריפים-יולי-אוגוסט-2026.xlsx")
print("saved")
