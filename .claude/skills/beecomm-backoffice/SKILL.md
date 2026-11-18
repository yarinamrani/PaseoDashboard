---
name: beecomm-backoffice
description: >
  Safely create and change items, catalog branches, menu categories/sub-categories,
  menu prices and modifier groups in the BeeComm (ביקום) back office for Paseo, via a
  Claude-in-Chrome session the owner is logged into. Use for: הקמת פריטים בביקום,
  תפריט חדש בקופה, תת קטגוריה, הצבה בתפריט, מחירים בקופה, תוספות, "כמה כוסות",
  שידור תפריט, החלפת תפריט יינות / תפריט תאילנדי. Contains the verified UI mechanics
  (what saves immediately vs. needs "שמור שינויים"), the safety protocol, and a
  ready-to-paste prompt template for the Chrome session.
---

# BeeComm back office (ביקום) – menu & item operations

Learned and verified on 2026-11-18 while launching Paseo's new wine list
(19 items, new menu category, modifier groups). BeeComm has **no public docs and no
API** we can use; login is phone-OTP + reCAPTCHA. The only working path is a
**Claude in Chrome** session on the owner's computer, in a tab already logged in to
the back office. A cloud Claude Code session cannot reach it — it writes the prompts,
reviews the Chrome session's reports, and the owner pastes between them.

## Roles
- **Planner (this skill's user, e.g. Claude Code):** decides, writes the paste-ready
  message for the Chrome session, reviews every report against the plan.
- **Executor (Claude in Chrome):** reads/clicks in the back office, stops at agreed points.
- **Owner:** pastes messages, approves prices and anything that touches existing data,
  is the only one who presses **שידור תפריט** (broadcast).

## Concepts (do not confuse)
| Term | What it is | Who sees it |
|---|---|---|
| ענף בקטלוג (catalog branch) | Internal tree, e.g. שתיה ‹ יין ‹ יינות לבנים. Drives reports. | Back office only |
| תפריט (menu) | "ראשי" (dine-in iPads) and "משלוחים" | Waiters / delivery |
| קטגוריה / תת-קטגוריה בתפריט | 4 fixed columns: תפריט ‹ קטגוריות ‹ תת קטגוריות ‹ פריטים. **No 4th level** – a sub-category cannot contain sub-categories. | Waiters (after broadcast) |
| הצבה (placement) | An item placed in a menu sub-category. **The price lives on the placement**; item base price is 0. One item can have several placements (e.g. ראשי and "תפריט פסח כשלפ"). | Waiters |
| מיקום הדפסה | 18 checkbox "print locations" on the item (בר מרכזי, פס חם, פס קר, צ'קר, קוקטיילים, בירות…). No printer screen in back office. | Kitchen/bar printers |
| קבוצת תוספות | Modifier group, defined in תפריט ‹ קבוצות תוספות; min/max, options, price live on the group. Item tab "תוספות" only attaches a group + "הצג תוספות אוטומטית". | Waiters |
| שידור תפריט | Pushes **all** pending menu changes (anyone's) to the iPads. Nothing reaches iPads before it. | — |

## What saves when (verified – this is the #1 source of surprises)
| Action | Saves to server |
|---|---|
| Catalog structure: "הוסף ילד" + row "שמור" | **Does NOT save.** Only top "שמור שינויים" → app confirm "האם אתה בטוח שברצונך לשמור את מבנה הקטלוג?" → שמור. |
| Item screen "שמור" | Immediately. |
| "שמור ושכפל" | Locked until the item is "dirty" (type+delete a char). Copy opens with **empty names**; "שם לעמדות הכנה" auto-fills from "שם הפריט". Copies branch, active flag, print locations, branch-store; **not** groups, not menu placements/prices. Safe to chain-duplicate from a clean new item. Never duplicate an item that has placements (risk of copying price). |
| Menu: category / sub-category dialog "אישור" | **Immediately** ("הפעולה בוצעה בהצלחה"). New one lands **first** on screen, but server order is unreliable until dragged. |
| Menu: drag (category / sub-category / item order) | **Immediately**, no "שמור שינויים". Every drag is a live change. |
| Menu: add items dialog "אישור" | Does **not** save; item appears with price 0 on screen; "שמור שינויים" enables. Type the price in the narrow field next to the item, then "שמור שינויים". |
| Menu: trash icon on a placement | Pending until "שמור שינויים". |
| Menu: delete sub-category (trash) | App confirm "מחיקת תת קטגוריה…" → immediate. Only delete when empty. |
| Modifier group save / attach group to item + save | Immediately. |
| Menu category has no "inactive" state | Only "פעיל לפי תזמון". To hide items: don't place them, or untick "פריט פעיל". |

## Known pitfalls
1. **Idle redirect:** after a few minutes without activity the back office jumps to
   `#/app/home`. Any unsaved change is lost. ⇒ Never leave a change pending while
   waiting for a human/planner reply. Pre-authorize "verify → save immediately" with
   explicit pass criteria instead of "stop before save".
2. **Hidden tab / window resizing:** if the owner switches away, the tab becomes
   `visibilityState: hidden` and the window size jumps (e.g. 1440×848 → 368×231).
   Position-based clicks then miss. ⇒ Back office in its own Chrome window, full
   screen, owner doesn't touch the computer; Stage Manager off. Inside pop-ups,
   element-clicks land on the backdrop and close the dialog ⇒ click by position right
   after a fresh screenshot and verify after every click; outside pop-ups click by element.
3. **"שייך לקבוצות" dialog bug:** closing it without "אישור" clears the selection on
   screen; pressing item "שמור" afterwards wipes the item's promo groups. Avoid the
   dialog unless needed; if opened, always close with "אישור".
4. **Two editors at once:** unexplained saves/navigation happened when a second Claude
   panel/tab or another user was active. One editor at a time; close other Claude panels.
5. Old item names have a trailing space ("כוס שאבלי "). Don't copy it.
6. Menu screen "שמור שינויים" saves the whole menu screen – check there is no other
   pending change before pressing.

## Safety protocol (always)
1. **Iron rules in every message:** don't delete/edit/disable anything existing unless
   the owner explicitly approved that specific change; don't broadcast; stop on any
   dialog whose wording isn't a plain save/confirm of the expected object.
2. **Stage 0 = read-only discovery.** Open a comparable existing object, record every
   field/tab, record "before" counts (catalog branches + item counts, menu categories
   order, sub-category item counts). Close with ביטול. Report and stop.
3. **One pilot item** end-to-end, refresh, verify on server, then the rest.
4. **Verify after refresh, not on screen** (prices in the item's "תפריטים/תמחור" tab
   show the full value, e.g. "ראשי | יין | יינות חדשים – ₪62.00").
5. **Before/after table** at the end: every count unchanged except the intended delta.
6. Prices are entered only from a table the owner approved – never a placeholder.
7. New items: "פריט פעיל" unticked until priced and placed. A placed+active item goes
   live at the next broadcast by anyone.
8. Broadcast only by the owner, after: stock is on site, nobody else has pending menu
   changes, staff briefed. Test one real order (modifier pops up, prints at bar).

## Paseo facts (as of 2026-11-18)
- Branch store: **ראשון לציון**. Drinks print to **בר מרכזי** only; cancel-print empty;
  VAT regular.
- Menus: ראשי, משלוחים. ראשי categories (order): אוכל עובדים, אוכל, שף מקס סביץ',
  תפריט ילדים, סופש ארוך של סושי, שתייה קלה, בירות, יין, יינות חדשים, קוקטיילים,
  אלכוהול, קינוחים, שונות, עסקיות, MEXICAN POP-UP, Its Sushi TIME, תפריט פסח כשלפ.
- ראשי ‹ יין sub-categories: בקבוקי יין רוזה(3), בקבוקי יין מבעבע(7), בקבוקי יין לבן(5),
  בקבוקי יין אדום(3), יין לבן(6), יין אדום(5), יין רוזה(3), מבעבע(2).
- ראשי ‹ יינות חדשים: יין לבן, יין אדום, יין רוזה, בקבוקי יין לבן/אדום/רוזה (19 items,
  catalog branch שתיה ‹ יין ‹ יינות חדשים).
- Promo groups on old wines: "1+1 על קוקטיילים, יינות ובירות", "30% אלכוהול", "אלכוהול HH".
  New wines: none yet (decide per wine when it replaces the old one).
- Modifier groups: "כוסות לבקבוק יין" (ללא כוסות, 1כ–6כ; min/max 1/1; 28 bottles),
  "כוסות למגנום" (ללא כוסות, 1כ–12כ; magnum only), "כוסות לקנקן". Options are free-text
  names, not catalog items. Total groups ≈ 91–92 (recount if it matters).
- Last broadcast before the wine launch: ~2026-11-06.

## Wine changeover (when an old wine's stock ends)
1. Remove the old wine's placement (don't delete the item – keeps report history).
2. Move the new item to its permanent catalog branch (יינות לבנים/אדומים/רוזה) and,
   if wanted, its placement to the matching ראשי ‹ יין sub-category.
3. Attach promo groups if the deal should apply.
4. Owner broadcasts.

## Prompt template for the Chrome session
```
אני מחובר לבק-אופיס של ביקום בכרום. משימה: <...>.
כללי ברזל: לא למחוק/לערוך/להשבית שום דבר קיים מלבד <שינויים שאושרו במפורש>. לא לשדר תפריט.
כל חלון שאינו אישור שמירה רגיל של האובייקט הצפוי – עצור.
מכניקה ידועה: אישור בחלון קטגוריה/תת-קטגוריה שומר מיד; גרירה שומרת מיד; הוספת פריטים לתת-קטגוריה
והסרת הצבות ממתינות ל"שמור שינויים"; הדף חוזר לבית אחרי כמה דקות בלי פעילות – אל תשאיר שינוי ממתין
בזמן המתנה לי: בדוק מול הקריטריונים ושמור מיד.
שלב 0 – קריאה בלבד: <מה לבדוק>, מצב "לפני" (<ספירות/סדר>). דווח ועצור.
שלב 1 – <פעולה>, קריטריון לשמירה: <...>. אחרי רענון אמת מול השרת.
בסוף: טבלת לפני/אחרי.
```
