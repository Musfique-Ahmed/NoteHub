// Template for firebase-config.js. Copy this file to firebase-config.js
// (at the repo root) and fill in your own values. firebase-config.js is
// listed in .gitignore so your real keys never get committed.
//
//   cp firebase-config.example.js firebase-config.js
//
// Then edit firebase-config.js with:
//   - Your Firebase web-app SDK config
//       (Firebase Console → Project settings → Your apps → Web app → Config)
//   - Your deployed drive-upload.gs Web App URL
//   - Your BRIDGE_TOKEN (set in Apps Script → Project Settings →
//     Script Properties; same string here and in the script)

window.NOTEHUB_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  },

  driveUploadUrl: "PASTE_YOUR_APPS_SCRIPT_DEPLOYMENT_URL_HERE",

  // Shared secret with the Apps Script Web App. If unset in the script,
  // the bridge accepts any caller (dev mode). Strongly recommended in prod.
  bridgeToken: "YOUR_BRIDGE_TOKEN"
};