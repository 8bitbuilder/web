// js/module-guard.js
// ============================================================
// MODULE ACCESS GUARD — Enhanced with content hiding
// ============================================================

(function() {
  // Hide the page body immediately to prevent content flash
  document.documentElement.style.visibility = 'hidden';

  function allowAccess() {
    document.documentElement.style.visibility = 'visible';
  }

  function denyAccess() {
    window.location.href = '/choose-role.html';
  }

  // 1. Check guest mode first (instant)
  if (sessionStorage.getItem('guestMode') === 'true') {
    allowAccess();
    return;
  }

  // 2. Check Supabase session
  function checkAccess() {
    if (typeof _supabase === 'undefined' || !_supabase) {
      setTimeout(checkAccess, 150);
      return;
    }

    _supabase.auth.getSession().then(function(result) {
      if (result.data.session) {
        allowAccess();
      } else {
        denyAccess();
      }
    }).catch(function() {
      denyAccess();
    });
  }

  checkAccess();
})();