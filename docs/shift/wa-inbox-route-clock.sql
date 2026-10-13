-- טריגר על wa_inbox (התור ש-wa-green ממלא מ-Green API): פקודות שעות / אוכל עובדים בקבוצת ההתראות
-- עוברות ל-shift-clock-watch (פרוס כ-contest-watch) ולא לעוזר הכללי, ומפעילות אותו מיד דרך pg_net.
-- נוסף 10/10. במקביל: cron 24 (wa-green, איסוף הודעות מוואטסאפ) שונה מכל דקה ל-'15 seconds'.
create or replace function wa_inbox_route_clock() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; tgt text; tm text; hit boolean := false;
begin
  -- 12/10: עובד ששולח לבוט בצ'אט פרטי הודעה עם שעה (תשובה ל"לא החתמת יציאה") — רק אם הנייד שייך לעובד פעיל בשיפט
  if new.chat_id like '%@c.us' then
    tm := new.body->'messageData'->>'typeMessage';
    if tm in ('textMessage', 'extendedTextMessage') then
      t := coalesce(new.body->'messageData'->'textMessageData'->>'textMessage', new.body->'messageData'->'extendedTextMessageData'->>'text', '');
      -- 12/10: גם "IN" / נכנסתי / เข้างาน בלי שעה — כניסה מוקדמת (לפני שהשעון בפסאו זמין)
      if (t ~ '(^|[^0-9])([01]?[0-9]|2[0-3])[:.][0-5][0-9]' or t ~* '^\s*(in|נכנסתי|נכנסת|הגעתי|เข้างาน|เข้า|ถึงแล้ว)\s*[.!]*\s*$') and exists (
           select 1 from shift_employees e where e.is_active
             and right(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(new.chat_id, '\D', '', 'g'), 9)) then
        new.status := 'clock_dm';
        perform net.http_get(url := 'https://vzeowbriddhvhpishmhn.supabase.co/functions/v1/contest-watch',
          params := jsonb_build_object('mode', 'replies', 'secret', (select value from app_config where key = 'ALFRED_SYNC_SECRET')),
          timeout_milliseconds := 60000);
      end if;
    end if;
    return new;
  end if;
  select value into tgt from app_config where key = 'SHIFT_CLOCK_WA_TARGET';
  if tgt is null or new.chat_id is distinct from tgt then return new; end if;
  tm := new.body->'messageData'->>'typeMessage';
  if tm = 'quotedMessage' then hit := true;
  elsif tm in ('textMessage', 'extendedTextMessage') then
    t := coalesce(new.body->'messageData'->'textMessageData'->>'textMessage', new.body->'messageData'->'extendedTextMessageData'->>'text', '');
    t := regexp_replace(t, '^\s*(ג[׳''`]?סי|jessie)[[:space:],:!.-]*', '', 'i'); -- 13/10: "ג׳סי, ..." — השם של הבוט
    -- 13/10: "1 לא הגיע" (כל השורות) · רשימת אוכל עם שורת "אוכל ..." בכל מקום (גם בסוף)
    if (select count(*) >= 1 and bool_and(l ~ '^#?[0-9]{1,2}[[:space:]]*[-.):]?[[:space:]]*(לא[[:space:]]+(הגיע|הגיעה|בא|באה|עבד|עבדה)|ביטול|בוטל|בוטלה)')
          from unnest(regexp_split_to_array(trim(t), '[[:space:]]*\n[[:space:]]*')) l where l <> '')
       or (t ~ '(^|\n)[[:space:]]*אוכל' and t ~ '[^0-9\n]{2,30}[[:space:]:–-]+[0-9]{1,3}') then
      new.status := 'clock_cmd'; hit := true;
    end if;
    -- 11/10: רשימת אוכל בלי כותרת (2+ שורות, כל שורה "שם סכום") ותשובה "בוקר"/"ערב" לשאלה פתוחה
    if hit then null;
    elsif (select count(*) >= 2 and bool_and(l ~ '^[^0-9]{2,30}[[:space:]:–-]+[0-9]{1,3}[[:space:]]*(₪|ש["״]?ח|שקל|שקלים|nis)?[[:space:].,]*$')
          from unnest(regexp_split_to_array(trim(t), '[[:space:]]*\n[[:space:]]*')) l where l <> '')
       or (t ~ '^\s*(בוקר|ערב)\s*$' and exists (select 1 from shift_food_pending where status = 'ask' and created_at > now() - interval '12 hours')) then
      new.status := 'clock_cmd'; hit := true;
    elsif t ~ '^\s*(אוכל|שעות)' or (
         t ~ '(^|[^0-9])([01]?[0-9]|2[0-3])[:.][0-5][0-9]' and t !~ '\?'
         and (t ~ '(כניסה|יציאה|נכנס|יצא|התחיל|סיים|עלה|עלתה|הגיע)' or coalesce(array_length(regexp_split_to_array(trim(t), '\s+'), 1), 0) <= 4)) then
      new.status := 'clock_cmd'; hit := true;
    end if;
  end if;
  if hit then
    perform net.http_get(url := 'https://vzeowbriddhvhpishmhn.supabase.co/functions/v1/contest-watch',
      params := jsonb_build_object('mode', 'replies', 'secret', (select value from app_config where key = 'ALFRED_SYNC_SECRET')),
      timeout_milliseconds := 60000);
  end if;
  return new;
end $$;
-- (הטריגר עצמו נוצר פעם אחת:)
-- create trigger wa_inbox_route_clock before insert on wa_inbox for each row execute function wa_inbox_route_clock();
