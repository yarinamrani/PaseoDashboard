-- טריגר על wa_inbox (התור ש-wa-green ממלא מ-Green API): פקודות שעות / אוכל עובדים בקבוצת ההתראות
-- עוברות ל-shift-clock-watch (פרוס כ-contest-watch) ולא לעוזר הכללי, ומפעילות אותו מיד דרך pg_net.
-- נוסף 10/10. במקביל: cron 24 (wa-green, איסוף הודעות מוואטסאפ) שונה מכל דקה ל-'15 seconds'.
create or replace function wa_inbox_route_clock() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; tgt text; tm text; hit boolean := false;
begin
  select value into tgt from app_config where key = 'SHIFT_CLOCK_WA_TARGET';
  if tgt is null or new.chat_id is distinct from tgt then return new; end if;
  tm := new.body->'messageData'->>'typeMessage';
  if tm = 'quotedMessage' then hit := true;
  elsif tm in ('textMessage', 'extendedTextMessage') then
    t := coalesce(new.body->'messageData'->'textMessageData'->>'textMessage', new.body->'messageData'->'extendedTextMessageData'->>'text', '');
    if t ~ '^\s*(אוכל|שעות)' or (
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
create trigger wa_inbox_route_clock before insert on wa_inbox for each row execute function wa_inbox_route_clock();
