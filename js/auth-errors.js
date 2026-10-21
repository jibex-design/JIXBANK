// Turns Firebase error codes into messages a normal person understands
export function friendlyAuthError(error) {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your internet connection.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.";
    case "auth/account-exists-with-different-credential":
      return "An account with this email already exists using another sign-in method. Log in with your email and password.";
    case "auth/unauthorized-domain":
      return "This website address isn't allowed in Firebase. Open the site as localhost (or add the domain under Authentication → Settings → Authorized domains).";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't enabled in Firebase yet. Turn it on under Authentication → Sign-in method.";
    default:
      console.error(error);
      return "Something went wrong. Please try again.";
  }
}
