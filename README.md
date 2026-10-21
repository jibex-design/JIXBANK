# JIXBANK: complete project

All money is simulated. This is a learning project, not a real bank.

## SIMPLE MODE (default): works on the free Firebase plan
No Java, no terminal, no emulator, no Cloud Functions.

### One-time setup in the Firebase console (console.firebase.google.com, project my-jixbank)
1. Build > Authentication > Get started > Sign-in method:
   - Email/Password > Enable > Save
   - Google > Enable > choose a support email > Save
2. Build > Firestore Database > Create database (production mode is fine).
3. Firestore Database > Rules tab:
   - delete everything there
   - paste the WHOLE contents of the file `firestore.rules` from this project
   - click Publish   <-- if you skip this, nothing will save

### Run it
1. Open this folder in VS Code and install the "Live Server" extension.
2. Right-click `register.html` > Open with Live Server.
3. For Google sign-in, open the site as http://localhost:5500 (not 127.0.0.1).
4. Register, then use the dashboard.

### Test a transfer
1. Register User A in a normal window and User B in a private/incognito window.
2. Copy B's account number from B's dashboard.
3. As A: Add Money, then Transfer to B's account number.
4. B's balance, Recent Transactions and notification bell update by themselves.

## Honest limits of simple mode
The money logic (js/local-bank.js) runs in the browser, so a technical user could
edit it with DevTools and cheat. Also, any signed-in user can read other users'
names and balances. That is fine for learning and for a school demo, but a real bank
must do this on a server. Say so in your presentation.

## SECURE MODE (optional): Cloud Functions
1. In js/firebase-config.js set USE_CLOUD_FUNCTIONS = true and USE_EMULATORS = true.
2. Replace the contents of firestore.rules with firestore.secure.rules.
3. cd functions, npm install, cd .., then
   firebase emulators:start --export-on-exit=./emulator-data
   (needs Node 22 and Java 21)
4. js/security-test.js only makes sense in this mode.
