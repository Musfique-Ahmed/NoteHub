# NoteHub

NoteHub is a collaborative web platform designed for students to effortlessly share, find, and download class notes and other course materials. It provides a centralized, real-time hub to connect with peers and excel in your studies. Securely register to upload your own study materials, and easily search for resources by course, creator, or title.

## ✨ Features

* **User Authentication:** Secure registration and login system for users to manage their accounts. Profile modal with display name, bio, and Gravatar avatar.
* **Share Notes:** An intuitive modal allows authenticated users to upload their notes (PDF, DOCX, TXT) with details like title, creator name, and course. Per-note visibility: public, or shared with selected study groups.
* **Real-time Database:** Built with Firebase Firestore, the platform updates in real-time as new notes are shared.
* **Dynamic Search:** Instantly search and filter through all available notes by title, creator, or course name.
* **Download Materials:** Download any note with a single click.
* **Notes drawer:** Open any note to read its description, upvote it, and join the comment thread (one level of nesting).
* **Study groups:** Open groups are discoverable in a directory and joined in one click; private groups are joined with an invite code that the owner generates. Group detail pages show members, sessions, and invite links.
* **Study sessions:** Members of a group can schedule a session with title, description, start/end, and location. Everyone in the group gets a notification; RSVPs (yes / maybe / no) update response counts in real time. Past sessions support an "I was there" attendance toggle.
* **Notifications:** In-app inbox with a bell badge in the sidebar. Click a notification to jump to the relevant session or note.
* **Email digest (opt-in):** When a session is scheduled, members who haven't opted out of email get a notification through the Apps Script bridge. Daily per-group caps prevent runaway sends.
* **Responsive Design:** A clean, modern, and fully responsive user interface built with a custom design system (vanilla CSS), ensuring a great experience on any device.

## 💻 Technology Stack (all free tier)

* **Frontend:** HTML5, vanilla CSS, JavaScript (ES6 modules).
* **Auth & metadata:** Firebase Authentication + Cloud Firestore (Spark plan).
* **File storage:** Google Drive via a Google Apps Script Web App bridge (no Firebase Storage, no Blaze upgrade required).

## ▶️ Run Locally

Because the app uses ES modules, serve it over `http://` (not `file://`). From the repo root:

```sh
# macOS / Linux
python3 -m http.server 3050

# Windows (PowerShell or Git Bash)
py -m http.server 3050
```

Then open <http://localhost:3050>.

> `npx serve -l 3050` works too if you don't have Python.

## 🔐 One-time setup (10 minutes)

You need each of these configured once. After that, the app runs forever.

### 1. Firebase (free Spark plan)

1. Open the [Firebase Console](https://console.firebase.google.com/) and create a project (or use an existing one).
2. **Authentication → Sign-in method → Email/Password** → Enable.
3. **Firestore Database → Create database** → start in production mode (or test mode during development).
4. **Firestore → Rules tab** → paste the rules from the bottom of `index.html` (the `Firestore Security Rules` comment block).
5. **Project settings → Your apps → Web app** → copy the `firebaseConfig` object.

Now create your local config file (this is gitignored so secrets stay out of the repo):

```sh
cp firebase-config.example.js firebase-config.js
```

Open `firebase-config.js` and paste your real values into the `firebase:` and `driveUploadUrl` fields (leave the `driveUploadUrl` placeholder until step 2 below).

### 2. Google Drive upload bridge (free Apps Script)

This is what lets the app store files in your Google Drive instead of Firebase Storage.

1. Open <https://script.google.com> and create a new project.
2. Paste the entire contents of `drive-upload.gs` into `Code.gs`.
3. **Project Settings → Script Properties** → add `BRIDGE_TOKEN` (any long random string). The same value goes into `firebase-config.js` → `bridgeToken`. If you skip this step, the bridge accepts any caller (dev mode).
4. **Deploy → New deployment → Web app**.
   - Execute as: **Me** (your Google account)
   - Who has access: **Anyone**
5. Copy the deployment URL (it looks like `https://script.google.com/macros/s/AKfy.../exec`).
6. Paste it into `firebase-config.js` as `driveUploadUrl`.

That's it. The bridge uploads each file to your Drive, makes it readable by anyone with the link, and returns the public download URL stored in Firestore. It also handles `sendEmail` actions for session notifications (gated by group membership and a daily per-group send cap).

> ⚠️ The bridge URL is public — anyone on the internet can POST to it. `drive-upload.gs` enforces a 10 MB cap, an allowlist of MIME types (PDF, DOCX, TXT), per-IP rate limits, an optional `BRIDGE_TOKEN` shared secret, HTML sanitisation on email bodies, and a 5-email-per-group-per-day cap.

### 3. (Optional) Clean up old Firebase Storage references

If you previously enabled Firebase Storage and don't want it, leave it disabled — `index.html` no longer uses it.

## 📝 How to Use

1. **Register:** Create a new account using your email and a password.
2. **Login:** Sign in to your existing account.
3. **Browse & Search:** Once logged in, you can see all shared notes. Use the search bar to find specific materials.
4. **Download:** Click the "Download" button on any note card to save the file.
5. **Share:** Click the "Pin a note" button, fill in the details, select your file, and submit to upload it for others to see.
6. **Logout:** Click the logout button in the header to securely end your session.

## 🧪 Tests

End-to-end tests live in `tests/` and run with Playwright. From the `tests/` directory:

```sh
npm install
npx playwright install chromium
npx playwright test
```

Spec files cover: smoke (`smoke.spec.js`), auth (`auth.spec.js`), notes flow (`notes.spec.js`), note privacy (`notes-privacy.spec.js`), comments + reactions (`comments-reactions.spec.js`), groups (`groups.spec.js`), sessions (`sessions.spec.js`), notifications (`notifs.spec.js`), and profile (`profile.spec.js`).

The tests register users, upload notes, exercise search, and verify that logged-out users can browse. The Drive upload bridge is intercepted by the test harness (`tests/e2e/helpers/bridge-mock.js`) so the suite runs offline and doesn't pollute your Drive.

Two probes in `tests/e2e/firebase-probe.js` gate the suite against missing infrastructure:

* `probeEmailPasswordProvider()` — confirms the Email/Password provider is enabled in your Firebase project.
* `probeFirestoreRules()` — confirms the production rules from the bottom of `index.html` are deployed (without them, every Firestore call fails with `permission-denied`).

Tests skip cleanly when either probe fails, so the suite is always green locally even before the one-time setup is done.
