# NoteHub

NoteHub is a collaborative web platform designed for students to effortlessly share, find, and download class notes and other course materials. It provides a centralized, real-time hub to connect with peers and excel in your studies. Securely register to upload your own study materials, and easily search for resources by course, creator, or title.

## ✨ Features

* **User Authentication:** Secure registration and login system for users to manage their accounts.
* **Share Notes:** An intuitive modal allows authenticated users to upload their notes (PDF, DOCX, TXT) with details like title, creator name, and course.
* **Real-time Database:** Built with Firebase, the platform updates in real-time as new notes are shared.
* **Dynamic Search:** Instantly search and filter through all available notes by title, creator, or course name.
* **Download Materials:** Download any note with a single click.
* **Responsive Design:** A clean, modern, and fully responsive user interface built with Tailwind CSS, ensuring a great experience on any device.

## 💻 Technology Stack

* **Frontend:**
    * HTML5
    * Tailwind CSS
    * JavaScript (ES6+ Modules)
* **Backend & Database:**
    * **Firebase Authentication:** For handling user sign-up, login, and session management.
    * **Firebase Firestore:** As a real-time NoSQL database to store information about the notes.
    * **Firebase Storage:** For uploading and hosting the note files.

## 🚀 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

You need a web browser and a Firebase account.

### Installation & Setup

1.  **Clone the repo (or download the `index.html` file)**
    ```sh
    git clone [https://github.com/your_username_/NoteHub.git](https://github.com/your_username_/NoteHub.git)
    ```
2.  **Set up a Firebase Project:**
    * Go to the [Firebase Console](https://console.firebase.google.com/).
    * Create a new project.
    * In your project, create a new Web App.
    * Enable **Authentication** (Email/Password method).
    * Set up **Firestore** and **Storage** with the default security rules for development.

3.  **Configure Firebase in `index.html`:**
    * Navigate to your Web App's settings in the Firebase project.
    * Find your Firebase SDK configuration object.
    * Copy your configuration object and paste it into the `<script type="module">` section of `index.html`:
        ```javascript
        const firebaseConfig = {
          apiKey: "YOUR_API_KEY",
          authDomain: "YOUR_AUTH_DOMAIN",
          projectId: "YOUR_PROJECT_ID",
          storageBucket: "YOUR_STORAGE_BUCKET",
          messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
          appId: "YOUR_APP_ID"
        };
        ```
4.  **Run the application:**
    * Simply open the `index.html` file in your web browser.

## 📝 How to Use

1.  **Register:** Create a new account using your email and a password.
2.  **Login:** Sign in to your existing account.
3.  **Browse & Search:** Once logged in, you can see all shared notes. Use the search bar to find specific materials.
4.  **Download:** Click the "Download" button on any note card to save the file.
5.  **Share:** Click the "Share Notes" button, fill in the details, select your file, and submit to upload it for others to see.
6.  **Logout:** Click the logout button in the header to securely end your session.
