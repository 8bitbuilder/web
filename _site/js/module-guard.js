// js/module-guard.js
// ============================================================
// MODULE PAGE GUARD
// Blocks access to any page under /modules/ unless the user
// is logged in (student or teacher) or browsing as a guest.
// If unauthorized, redirects to the role selection page.
// ============================================================

(function () {
  // Hide the page content immediately to prevent flash of content
  document.documentElement.style.visibility = 'hidden';

  // Check guest mode first (instant, no async needed)
  if (sessionStorage.getItem('aaic_guest') === 'true') {
    document.documentElement.style.visibility = '';
    return; // Guest is allowed -- stop here
  }

  // For students and teachers, we need to check Supabase
  function checkSupabaseAuth() {
    if (typeof _supabase === 'undefined' || !_supabase) {
      setTimeout(checkSupabaseAuth, 150);
      return;
    }

    _supabase.auth.getSession().then(function (result) {
      var session = result.data.session;
      if (session && session.user) {
        // User is logged in -- allow access
        document.documentElement.style.visibility = '';
      } else {
        // Not logged in, not a guest -- redirect
        // Use a path relative to the site root
        window.location.href = '/choose-role.html';
      }
    }).catch(function () {
      // If Supabase errors, redirect to be safe
      window.location.href = '/choose-role.html';
    });
  }

  checkSupabaseAuth();
})();