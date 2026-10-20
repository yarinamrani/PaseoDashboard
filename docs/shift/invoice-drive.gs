// Google Apps Script — מקבל חשבוניות מ-invoice-archive (Supabase) ושומר ב-Drive:
//   חשבוניות פסאו/<ספק>/<YYYY-MM>/<תאריך>_<מספר>.<סיומת>
// התקנה: script.google.com → פרויקט חדש → להדביק → להחליף את SECRET בערך של app_config.INVOICE_DRIVE_SECRET
// → Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → להעתיק את ה-URL ל-app_config.INVOICE_DRIVE_URL.
const SECRET = 'PUT_INVOICE_DRIVE_SECRET_HERE';
const ROOT = 'חשבוניות פסאו';

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.secret !== SECRET) return out({ ok: false, error: 'unauthorized' });
    const folder = path_([ROOT, b.supplier || 'לא מזוהה', b.month || 'ללא תאריך']);
    const same = folder.getFilesByName(b.name);
    if (same.hasNext()) return out({ ok: true, id: same.next().getId(), dup: true });
    const blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'application/octet-stream', b.name);
    return out({ ok: true, id: folder.createFile(blob).getId() });
  } catch (err) {
    return out({ ok: false, error: String(err).slice(0, 200) });
  }
}

// להרצה ידנית פעם אחת מהעורך — מאשר הרשאות ל-Drive ובודק שהתיקייה נוצרת
function test() {
  Logger.log(path_([ROOT]).getUrl());
}

function path_(names) {
  let f = DriveApp.getRootFolder();
  for (const n of names) {
    const it = f.getFoldersByName(n);
    f = it.hasNext() ? it.next() : f.createFolder(n);
  }
  return f;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
