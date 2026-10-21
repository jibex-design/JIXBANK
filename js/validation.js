// validation.js - checks sign-up values. Returns "" if all is fine,
// otherwise returns the error message to show.

export function validateRegisterForm({ name, email, password, terms }) {
  if (name.length < 2) return "Please enter your full name.";
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(name)) return "Name can only contain letters and spaces.";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";

  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[A-Za-z]/.test(password)) return "Password must contain at least one letter.";

  if (!terms) return "Please agree to the Privacy & Policy.";
  return "";
}
