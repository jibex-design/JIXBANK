import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const avatarEl = document.getElementById("profileAvatar");
const nameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const accountInput = document.getElementById("accountNumber");
const photoInput = document.getElementById("photoInput");
const changePhotoBtn = document.getElementById("changePhotoBtn");
const saveBtn = document.getElementById("saveBtn");
const form = document.getElementById("profileForm");
const message = document.getElementById("profileMessage");

let currentUser = null;

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

// ---------- 1. Load the profile when the page opens ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  emailInput.value = user.email;
  avatarEl.src = FALLBACK_AVATAR;

  try {
    const [profileSnap, accountSnap] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDoc(doc(db, "accounts", user.uid))
    ]);

    if (profileSnap.exists()) {
      const profile = profileSnap.data();
      nameInput.value = profile.fullName || "";
      if (profile.photoURL) avatarEl.src = profile.photoURL;
    }
    if (accountSnap.exists()) {
      accountInput.value = accountSnap.data().accountNumber || "";
    }
  } catch (err) {
    console.error(err);
    showMessage("Could not load your profile. Please refresh.", "error");
  }
});

// ---------- 2. Save the name ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const name = nameInput.value.trim();
  if (name.length < 2) return showMessage("Please enter your full name.", "error");
  if (!/^\p{L}[\p{L}\s'.-]*$/u.test(name)) return showMessage("Name can only contain letters and spaces.", "error");

  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { fullName: name });
    await updateProfile(currentUser, { displayName: name });

    // the name people see when they send you money (ignore if not allowed in this mode)
    if (accountInput.value) {
      try { await updateDoc(doc(db, "accountNumbers", accountInput.value), { fullName: name }); }
      catch (e) { console.warn("Lookup name not updated:", e.code); }
    }
    showMessage("Profile updated ✅", "success");
  } catch (err) {
    console.error(err);
    showMessage("Could not save your changes. Please try again.", "error");
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- 3. Change the picture ----------
changePhotoBtn.addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file || !currentUser) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    photoInput.value = "";
    return showMessage("Please choose a JPG, PNG or WEBP picture.", "error");
  }
  if (file.size > 5 * 1024 * 1024) {
    photoInput.value = "";
    return showMessage("That picture is too big. Maximum is 5 MB.", "error");
  }

  changePhotoBtn.disabled = true;
  changePhotoBtn.textContent = "Uploading…";
  try {
    const dataUrl = await shrinkImage(file, 256);
    await updateDoc(doc(db, "users", currentUser.uid), { photoURL: dataUrl });
    avatarEl.src = dataUrl; // the top bar updates by itself (guard.js)
    showMessage("Profile picture updated ✅", "success");
  } catch (err) {
    console.error(err);
    showMessage("Could not update your picture. Please try another one.", "error");
  } finally {
    photoInput.value = "";
    changePhotoBtn.disabled = false;
    changePhotoBtn.textContent = "Change photo";
  }
});

// Crops the picture to a square and shrinks it, returning a text version
// ("data URL") that is small enough to store in Firestore.
function shrinkImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not a readable picture."));
    };
    img.src = url;
  });
}
