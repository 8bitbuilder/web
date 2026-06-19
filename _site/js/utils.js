// ============================================================
// Shared Utilities
// ============================================================

/**
 * Generate a random password of given length.
 * Uses a mix of uppercase, lowercase, digits, and symbols.
 */
function generatePassword(length = 12) {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const allChars = uppercase + lowercase + digits + symbols;

  // Ensure at least one of each type
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/**
 * Show a popup/modal with a message.
 * Uses a simple div-based modal.
 */
function showPopup(title, content, onClose) {
  // Remove existing popup if any
  const existing = document.getElementById("app-popup-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "app-popup-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 10000;
    display: flex; align-items: center; justify-content: center;
  `;

  const popup = document.createElement("div");
  popup.style.cssText = `
    background: white; border-radius: 12px; padding: 2rem;
    max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;

  popup.innerHTML = `
    <h3 style="margin-top:0; color:#333;">${title}</h3>
    <div style="margin: 1rem 0; color:#555;">${content}</div>
    <button id="popup-close-btn" style="
      background: #4f46e5; color: white; border: none; padding: 0.6rem 1.5rem;
      border-radius: 6px; cursor: pointer; font-size: 1rem;
    ">OK</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  document.getElementById("popup-close-btn").addEventListener("click", () => {
    overlay.remove();
    if (onClose) onClose();
  });
}

/**
 * Show a confirmation popup. Returns a Promise<boolean>.
 */
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const existing = document.getElementById("app-popup-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "app-popup-overlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
    `;

    const popup = document.createElement("div");
    popup.style.cssText = `
      background: white; border-radius: 12px; padding: 2rem;
      max-width: 500px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    `;

    popup.innerHTML = `
      <h3 style="margin-top:0; color:#d32f2f;">${title}</h3>
      <p style="color:#555; line-height: 1.6;">${message}</p>
      <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
        <button id="confirm-cancel" style="
          background: #e0e0e0; color: #333; border: none; padding: 0.6rem 1.5rem;
          border-radius: 6px; cursor: pointer;
        ">Cancel</button>
        <button id="confirm-ok" style="
          background: #d32f2f; color: white; border: none; padding: 0.6rem 1.5rem;
          border-radius: 6px; cursor: pointer;
        ">Yes, Delete</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    document.getElementById("confirm-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
    document.getElementById("confirm-ok").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
  });
}

/**
 * Show a status message in a target element.
 */
function showStatus(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#d32f2f" : "#2e7d32";
  el.style.display = "block";
}

/**
 * Parse a .txt file into an array of usernames (one per line).
 */
function parseTxtFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const usernames = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      resolve(usernames);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}