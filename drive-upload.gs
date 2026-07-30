/**
 * NoteHub — Google Drive upload bridge
 * ------------------------------------
 * Deploy this as a Google Apps Script Web App:
 *   1. Open https://script.google.com → New project.
 *   2. Paste this entire file (Code.gs).
 *   3. Click "Deploy" → "New deployment" → type "Web app".
 *   4. Execute as:  Me  (your Google account)
 *   5. Who has access:  Anyone
 *   6. Click "Deploy" and copy the URL it gives you
 *      (it looks like https://script.google.com/macros/s/AKfy.../exec).
 *   7. Paste that URL into index.html as the value of DRIVE_UPLOAD_URL.
 *
 * How it works:
 *   The browser POSTs JSON { filename, mimeType, bytes } where `bytes` is the
 *   file base64-encoded. The script decodes it, creates a file in your Drive,
 *   makes it readable by anyone with the link, and returns { id, name, webViewLink }.
 *
 * Quotas (free tier):
 *   - Apps Script daily executions: ~20k
 *   - Per-request URL fetch payload: ~50 MB
 *   - Drive storage: 15 GB free
 *
 * Keep file size under 10 MB to be safe.
 */

var MAX_BYTES = 10 * 1024 * 1024; // 10 MB
var ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (!data || !data.filename || !data.mimeType || !data.bytes) {
      throw new Error('Missing required fields: filename, mimeType, bytes');
    }

    var raw = Utilities.base64Decode(data.bytes);
    if (raw.length > MAX_BYTES) {
      throw new Error('File too large. Max ' + (MAX_BYTES / 1024 / 1024) + ' MB.');
    }

    if (ALLOWED_MIME.indexOf(data.mimeType) === -1) {
      throw new Error('Unsupported file type: ' + data.mimeType);
    }

    var blob = Utilities.newBlob(raw, data.mimeType, data.filename);
    var file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return ContentService
      .createTextOutput(JSON.stringify({
        id: file.getId(),
        name: file.getName(),
        mimeType: file.getMimeType(),
        size: file.getSize(),
        webViewLink: file.getUrl(),
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err && err.message ? err.message : err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  // Health check — useful for testing whether the deployment is live.
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'NoteHub Drive bridge' }))
    .setMimeType(ContentService.MimeType.JSON);
}
