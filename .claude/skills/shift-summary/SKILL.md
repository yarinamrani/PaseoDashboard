---
name: shift-summary
description: |
  **Paseo Shift Report Digest**: Read one or many AM (אחמ"ש) shift reports and produce a prioritized meta-summary — what recurs, what's urgent, what's missing — plus a WhatsApp-ready file to forward to the management group.
  - MANDATORY TRIGGERS: סיכום משמרת, סיכום משמרות, דוח משמרת, דוחות משמרת, סיכום של הסיכומים, אחמש, אחמ"ש, משמרת שישי, משמרת מוצאש, מה חזר על עצמו, נקודות חריגות, shift report, shift summary, AM report, סכם לי את המשמרות, תסכם את הדוחות
  - Use this skill whenever the user pastes or forwards shift reports from managers (usually copied out of WhatsApp) and wants them digested, or asks what's recurring / what needs handling. Trigger even for casual phrasing like "תקרא את זה ותגיד לי מה לעשות" when the pasted content is shift reports.
---

# Paseo Shift Report Digest

Owner: ירין עמרני, פסאו (גג על הים), ראשון לציון. Reports come from the AMs — currently עמית קדוש and עדי פלדינגר — pasted straight out of WhatsApp with timestamps.

The owner does not need the reports retold. He needs to know **what to act on**. Retelling is the failure mode.

## The core principle

**Recurrence is priority.** Something two different managers raise independently, or the same issue in two shifts, outranks a dramatic one-off. Lead with what repeats.

A single manager mentioning a broken tap once is a maintenance ticket. Two managers flagging the same employee's behaviour is a management decision. Rank accordingly.

## Report anatomy

Paseo AM reports follow a loose standing template. Use it to parse, but never assume a section exists:

`פלור` · `בר` · `מטבח` · `מארחת` · `דיגיי` · `ביטולים` · `על הבית` · `תקלות` · `חוסרים` · `טיפ לשעה`

Plus a free narrative opening about traffic and timing.

`טיפ לשעה` appears in almost every report and is the only consistent number across shifts — always extract it and show the trend.

## Output — two artifacts, always

### 1. In-chat analysis

Structured in this order. Skip any section with nothing real in it; do not pad.

**דחוף — לטיפול השבוע.** Food safety, anything that can hurt a guest, open equipment faults, and revenue leaks. Usually 2–4 items. Say what to do, not just what happened.

**חוזר על עצמו — דורש החלטה.** The heart of the digest. For each: quote the managers verbatim (their wording carries weight the paraphrase loses), name who raised it and when, then state the decision needed. When two managers said the same thing separately, say so explicitly — that is the signal.

**דפוסים.** Things no single report calls a problem but that show up across shifts. Example seen in practice: three separate complaints that surfaced only at the end of the meal, after a check-back where the guest said everything was fine — the procedure works, the guest just doesn't speak up. Patterns like this are the highest-value output of the skill because no individual manager can see them.

**חוסרים ומלאי.** Straight list by date. Flag anything appearing twice — a stockout two shifts running is a purchasing problem, not a stockout.

**חריגים נקודתיים.** Incidents, walkouts, cancellations, early departures. Include anything with insurance or liability weight (injuries, evacuations) and say it should be verified as documented.

**פרגון.** Always last, always present if earned. Quote the praise. Note when someone criticised in one shift was praised in the next — that arc matters to the owner.

**טיפ לשעה.** Table across all shifts, with a one-line read of the trend.

### 2. WhatsApp-ready file

Write a `.txt` to the scratchpad and deliver it with SendUserFile (`display: "attach"`). Formatting rules:

- `*bold*` for headers and emphasis — WhatsApp renders it
- `━━━━━━━━━━━━━━━` as section separators
- Emoji section markers: 🔴 דחוף · 🟠 חוזר · ⚠️ דפוס · 📦 חוסרים · 📌 חריגים · 👏 פרגון · 📈 טיפ
- `👈` before each action item
- Never use markdown tables — they do not render in WhatsApp. Use `•` lists and line breaks.
- Keep it scannable. The owner reads it on a phone.

## The sensitivity rule — this matters

Shift reports name people in a critical context: an employee who steps out without telling the AM, a waiter who prioritises review-collection over service, a hostess arriving without energy.

**Default to writing for the managers group, and say so.** In a circle of AMs that is management; in the all-staff group it is damage.

Two hard rules:

1. **Never put a personal-mood or interpersonal observation in the shareable file.** Things like "she arrives without a smile, maybe because of friction with X" belong in the chat analysis for the owner and nowhere else. Say explicitly that you left it out and why.
2. **Tell the owner which lines to delete** if he sends it to a wider group, by section name.

## Standing context

**The Google review contest is live.** Reports frequently touch it — both that it works (guests naming staff to the AM) and that it hurts service (waiters working the review instead of the table). Always surface both sides. The owner runs this contest; he needs the honest picture, and the staff named are usually the contest leaders.

**Named recurring subjects to date:** יוסף (checker position / leaving the station), the מארחות as a group (table transfers, availability, menu presentation, autonomy), פס חם plating quality, DJ playlists going stale. If these appear again, connect them to the earlier occurrence rather than presenting them as new.

## Rules

- **Never invent.** If a shift didn't mention the kitchen, the kitchen is not in the summary. Silence is not "all fine".
- **Quote when wording carries weight.** "נראה כאילו מישהו פילט אותו והרכיב את העור בחזרה" lands harder than "plating was poor".
- **Attribute.** Which AM, which shift, which date. It lets the owner follow up.
- **Suggest the owner add his own opening lines** to the WhatsApp message — a digest that arrives from the owner with a position behind it reads differently from one that only reports.
- Hebrew throughout.

## Optional follow-up

Offer — do not do unprompted — to load the shifts into the `shift_reports` table in Supabase (project `vzeowbriddhvhpishmhn`). It has dedicated columns: `shift_date`, `shift_type`, `manager_name`, `shift_narrative`, `floor_notes`, `kitchen_notes`, `discipline_issues`, `shortages`, `credits`, `returned_dishes`, `late_arrivals`, `tech_issues`. Once loaded, the WhatsApp bot can answer "מה חזר על עצמו החודש" without re-reading anything.
