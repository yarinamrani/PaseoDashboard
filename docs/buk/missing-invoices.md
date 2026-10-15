# חוסרי חשבוניות מ-buk (פסאו)

קריאה בלבד מ-buk + מעקב התאמה מול תיבות המייל. **שום שליחה / העברה ל-buk / סימון במייל בלי אישור ירין.** המהלך שקט — לא מעדכנים אף אחד.

## מקור ב-buk
מסך "חשבוניות חסרות" בפורטל (portal.buk.co.il) קורא Firestore:
`companies/{companyId}/accounts_matching` עם `filters array-contains "missingTransData"`.
כל מסמך הוא קבוצה; השורות ב-`entries` (map). המשתמש של טופסי 101 (`BUK_REFRESH_TOKEN`, `app_config.BUK_FB_API_KEY`) מורשה לשאילתה הזו בדיוק — פנייה לנתיב אחר מחזירה 403.

| classification | משמעות |
|---|---|
| `missingTransData` | חשבונית ספק שלא נקלטה (המסך "חשבוניות חסרות") |
| `missingInvoice` | תשלום בבנק/אשראי בלי קבלה |

`publishDate` קיים = מוצג בפורטל; חסר = מנה"ח עוד לא פרסמה.

## טבלאות (Supabase, RLS בלי policies — service role בלבד)
- `buk_missing_invoices` — שורה לכל רשומה (unique: company_id + buk_group_id + buk_entry_id). נטען 15/10/2026: 182+56 missingTransData, 317+2 missingInvoice.
- `buk_mail_search` — תוצאת חיפוש לפי תיבה + regex ספק + תקופה. **insert בלבד**; כל שיחה מוסיפה שורות לתיבה שלה (`paseo.rishon` / `paseooffice12`).
- `buk_mail_candidates` — מסמכים שנמצאו במייל ועשויים להשלים חוסר (thread id, האם הועבר ל-buk).
- `buk_missing_invoices_v` — השורות מ-buk + `mail_rishon` / `mail_office12` (התוצאה האחרונה לכל תיבה).

> UPDATE/DELETE דרך כלי ה-SQL ממתינים לאישור שלא מגיע בסשן הענן — לכן המעקב בנוי על insert.

## רענון מ-buk
פונקציית הבדיקה (`shift-open-week-dish`, סלוט זמני) עם `op=query&raw=1&parent=companies/VRP5IK2cpacu2ZmPMcjt` ו-structuredQuery על `accounts_matching` (limit 50), ואז `insert ... on conflict do update set last_seen=now()` מתוך `net._http_response`.

## כתובות קליטה של buk (מהמייל)
גג על הים — `516544764@buk.co.il` · אסייתי בחוף — `516819364@buk.co.il`.
