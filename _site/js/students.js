// js/students.js
// ============================================================
// STUDENT HUB — student landing page after login
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
  var authData = await requireStudent();
  if (!authData) return;

  var welcomeEl = document.getElementById('studentWelcome');
  if (welcomeEl) {
    welcomeEl.textContent = 'Welcome, ' + authData.profile.username;
  }

  var groupEl = document.getElementById('studentGroup');
  if (groupEl) {
    groupEl.textContent = 'Group: ' + (authData.profile.group_name || 'Default');
  }
});