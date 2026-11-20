// js/auth.js
// ============================================================
// AUTH LOGIC — handles navbar state, login, signup, logout
// ============================================================

// ------ Navbar Auth State ------

document.addEventListener('DOMContentLoaded', async function () {
  await updateNavbarAuth();
});

async function updateNavbarAuth() {
  var loggedOutEl = document.getElementById('authDropdownLoggedOut');
  var loggedInEl = document.getElementById('authDropdownLoggedIn');
  var navUsername = document.getElementById('navUsername');
  var navDashboardLink = document.getElementById('navDashboardLink');

  if (!loggedOutEl || !loggedInEl) return; // navbar not on this page

  try {
    var result = await _supabase.auth.getSession();
    var session = result.data.session;

    if (session && session.user) {
      // User is logged in — get their profile
      var profileResult = await _supabase
        .from('profiles')
        .select('username, role')
        .eq('id', session.user.id)
        .single();

      var profile = profileResult.data;

      if (profile) {
        loggedOutEl.classList.add('hidden');
        loggedInEl.classList.remove('hidden');
        navUsername.textContent = profile.username;

        // Show "Teacher Dashboard" link only for teachers
        if (navDashboardLink) {
          if (profile.role === 'teacher') {
            navDashboardLink.style.display = 'block';
          } else {
            navDashboardLink.style.display = 'none';
          }
        }
      }
    } else {
      loggedOutEl.classList.remove('hidden');
      loggedInEl.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error checking auth state:', err);
  }
}

// ------ Logout (called from navbar) ------

async function handleNavLogout(event) {
  if (event) event.preventDefault();
  await _supabase.auth.signOut();
  window.location.href = '/';
}

// ------ Teacher Signup ------

async function handleTeacherSignup(event) {
  event.preventDefault();
  var msgEl = document.getElementById('signupMessage');
  var btn = event.target.querySelector('button[type="submit"]');

  var username = document.getElementById('signupUsername').value.trim();
  var email = document.getElementById('signupEmail').value.trim();
  var password = document.getElementById('signupPassword').value;

  // Clear previous messages
  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!username || !email || !password) {
    showAuthMessage(msgEl, 'Please fill in all fields.', 'error');
    return;
  }

  if (password.length < 8) {
    showAuthMessage(msgEl, 'Password must be at least 8 characters.', 'error');
    return;
  }

  // Check if username is already taken
  var existCheck = await _supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .single();

  if (existCheck.data) {
    showAuthMessage(msgEl, 'That username is already taken. Please choose another.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  var result = await _supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        username: username,
        role: 'teacher',
      },
    },
  });

  btn.disabled = false;
  btn.textContent = 'Sign Up';

  if (result.error) {
    showAuthMessage(msgEl, result.error.message, 'error');
    return;
  }

  // Show success popup
  showPopup(
    'Account Created',
    '<p>Your teacher account has been created.</p>' +
    '<div class="credential-box"><strong>Username:</strong> ' + username + '<br><strong>Email:</strong> ' + email + '</div>' +
    '<p>Please check your email and click the verification link before logging in.</p>',
    function () {
      window.location.href = 'login-teacher.html';
    }
  );
}

// ------ Teacher Login ------

async function handleTeacherLogin(event) {
  event.preventDefault();
  var msgEl = document.getElementById('loginMessage');
  var btn = event.target.querySelector('button[type="submit"]');

  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!email || !password) {
    showAuthMessage(msgEl, 'Please fill in all fields.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in...';

  var result = await _supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  btn.disabled = false;
  btn.textContent = 'Log In';

  if (result.error) {
    if (result.error.message.includes('Email not confirmed')) {
      showAuthMessage(msgEl, 'Please verify your email before logging in. Check your inbox for a confirmation link.', 'error');
    } else {
      showAuthMessage(msgEl, 'Invalid email or password. Please try again.', 'error');
    }
    return;
  }

  // Verify this is a teacher account
  var profileResult = await _supabase
    .from('profiles')
    .select('role')
    .eq('id', result.data.user.id)
    .single();

  if (!profileResult.data || profileResult.data.role !== 'teacher') {
    await _supabase.auth.signOut();
    showAuthMessage(msgEl, 'This login page is for teachers only. Students should use the Student Login page.', 'error');
    return;
  }

  window.location.href = 'dashboard.html';
}

// ------ Student Login (username only, no password) ------

async function handleStudentLogin(event) {
  event.preventDefault();
  var msgEl = document.getElementById('loginMessage');
  var btn = event.target.querySelector('button[type="submit"]');

  var username = document.getElementById('loginUsername').value.trim();

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!username) {
    showAuthMessage(msgEl, 'Please enter your username.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    var response = await _supabase.functions.invoke('student-login', {
      body: { username: username },
    });

    btn.disabled = false;
    btn.textContent = 'Log In';

    if (response.error || (response.data && response.data.error)) {
      var errorMsg = (response.data && response.data.error) || 'Login failed. Please try again.';
      showAuthMessage(msgEl, errorMsg, 'error');
      return;
    }

    // Set the session from the Edge Function response
    if (response.data && response.data.session) {
      await _supabase.auth.setSession({
        access_token: response.data.session.access_token,
        refresh_token: response.data.session.refresh_token,
      });
      window.location.href = 'student-hub.html';
    } else {
      showAuthMessage(msgEl, 'Login failed. Please try again.', 'error');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Log In';
    showAuthMessage(msgEl, 'An error occurred. Please try again.', 'error');
  }
}

// ------ Password Reset Request (Teacher) ------

async function handlePasswordResetRequest(event) {
  event.preventDefault();
  var msgEl = document.getElementById('resetMessage');
  var btn = event.target.querySelector('button[type="submit"]');
  var email = document.getElementById('resetEmail').value.trim();

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!email) {
    showAuthMessage(msgEl, 'Please enter your email address.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  var result = await _supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html',
  });

  btn.disabled = false;
  btn.textContent = 'Send Reset Link';

  if (result.error) {
    showAuthMessage(msgEl, result.error.message, 'error');
  } else {
    showAuthMessage(msgEl, 'If an account exists with that email, a reset link has been sent. Check your inbox.', 'success');
  }
}

// ------ Password Update (from reset link) ------

async function handlePasswordUpdate(event) {
  event.preventDefault();
  var msgEl = document.getElementById('resetMessage');
  var btn = event.target.querySelector('button[type="submit"]');

  var password = document.getElementById('newPassword').value;
  var confirm = document.getElementById('confirmPassword').value;

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!password || !confirm) {
    showAuthMessage(msgEl, 'Please fill in both fields.', 'error');
    return;
  }

  if (password.length < 8) {
    showAuthMessage(msgEl, 'Password must be at least 8 characters.', 'error');
    return;
  }

  if (password !== confirm) {
    showAuthMessage(msgEl, 'Passwords do not match.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating...';

  var result = await _supabase.auth.updateUser({ password: password });

  btn.disabled = false;
  btn.textContent = 'Update Password';

  if (result.error) {
    showAuthMessage(msgEl, result.error.message, 'error');
  } else {
    showPopup(
      'Password Updated',
      '<p>Your password has been updated successfully. You can now log in with your new password.</p>',
      function () {
        window.location.href = 'login-teacher.html';
      }
    );
  }
}

// ------ Utility: Show Message ------

function showAuthMessage(el, text, type) {
  el.textContent = text;
  el.className = 'auth-message ' + type;
  el.style.display = 'block';
}

// ------ Utility: Show Popup ------

function showPopup(title, bodyHTML, onClose) {
  // Remove any existing popup
  var existing = document.getElementById('authPopupOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'authPopupOverlay';
  overlay.className = 'auth-popup-overlay';

  overlay.innerHTML =
    '<div class="auth-popup">' +
      '<h3>' + title + '</h3>' +
      bodyHTML +
      '<button class="auth-popup-btn" id="popupCloseBtn">OK</button>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('popupCloseBtn').addEventListener('click', function () {
    overlay.remove();
    if (onClose) onClose();
  });
}

// ------ Utility: Show Confirmation Popup ------

function showConfirmPopup(title, bodyHTML, onConfirm, onCancel) {
  var existing = document.getElementById('authPopupOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'authPopupOverlay';
  overlay.className = 'auth-popup-overlay';

  overlay.innerHTML =
    '<div class="auth-popup">' +
      '<h3>' + title + '</h3>' +
      bodyHTML +
      '<div style="margin-top: 1rem;">' +
        '<button class="auth-popup-btn danger" id="popupConfirmBtn">Yes, Delete</button>' +
        '<button class="auth-popup-btn cancel" id="popupCancelBtn">Cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('popupConfirmBtn').addEventListener('click', function () {
    overlay.remove();
    if (onConfirm) onConfirm();
  });

  document.getElementById('popupCancelBtn').addEventListener('click', function () {
    overlay.remove();
    if (onCancel) onCancel();
  });
}

// ------ Page Protection ------

async function requireTeacher() {
  var result = await _supabase.auth.getSession();
  var session = result.data.session;

  if (!session) {
    window.location.href = 'login-teacher.html';
    return null;
  }

  var profileResult = await _supabase
    .from('profiles')
    .select('username, role')
    .eq('id', session.user.id)
    .single();

  if (!profileResult.data || profileResult.data.role !== 'teacher') {
    window.location.href = '/';
    return null;
  }

  return { session: session, profile: profileResult.data };
}

async function requireStudent() {
  var result = await _supabase.auth.getSession();
  var session = result.data.session;

  if (!session) {
    window.location.href = 'login-student.html';
    return null;
  }

  var profileResult = await _supabase
    .from('profiles')
    .select('username, role, group_name')
    .eq('id', session.user.id)
    .single();

  if (!profileResult.data || profileResult.data.role !== 'student') {
    window.location.href = '/';
    return null;
  }

  return { session: session, profile: profileResult.data };
}