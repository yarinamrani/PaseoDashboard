-- 11/10: צמצום מידע — הבוט חבר בקבוצת "פסאו ניהול פלור" אבל לא שומרים ממנה הודעות.
-- wa-green מושך הכל מ-Green API ומכניס ל-wa_inbox; הטריגר הזה זורק (return null) הודעות מצ'אטים שב-app_config.WA_IGNORE_CHATS.
-- wa-green מתעלם מכשל הכנסה ומוחק את ההתראה ב-Green API, כך שההודעה לא נשמרת בשום מקום אצלנו.
-- השם מתחיל ב-"a_" כדי לרוץ לפני wa_inbox_route_clock (טריגרים רצים לפי סדר אלפביתי).
insert into app_config(key, value) values ('WA_IGNORE_CHATS', '120363403053828942@g.us')
  on conflict (key) do update set value = excluded.value;
create or replace function wa_inbox_drop_ignored() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.chat_id = any (string_to_array(replace(coalesce((select value from app_config where key = 'WA_IGNORE_CHATS'), ''), ' ', ''), ',')) then
    return null;
  end if;
  return new;
end $$;
-- set lock_timeout = '3s';  (cron 24 נוגע בטבלה כל 15 שניות)
create trigger wa_inbox_a_drop_ignored before insert on wa_inbox for each row execute function wa_inbox_drop_ignored();
