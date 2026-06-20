// js/admin.js
// ============================================================
// DASHBOARD LOGIC — student management, groups, account deletion
// ============================================================

var currentTeacher = null;
var allStudents = [];
var allGroups = [];
var activeGroup = 'All';

document.addEventListener('DOMContentLoaded', async function () {
  var authData = await requireTeacher();
  if (!authData) return;

  currentTeacher = authData;

  // Set welcome message
  var welcomeEl = document.getElementById('dashboardWelcome');
  if (welcomeEl) {
    welcomeEl.textContent = 'Welcome, ' + authData.profile.username;
  }

  await loadGroups();
  await loadStudents();
  initMethodTabs();
});

// ------ Load Groups ------

async function loadGroups() {
  var result = await _supabase
    .from('groups')
    .select('*')
    .eq('teacher_id', currentTeacher.session.user.id)
    .order('name');

  allGroups = result.data || [];
  renderGroupTabs();
  renderGroupSelect();
}

function renderGroupTabs() {
  var container = document.getElementById('groupTabs');
  if (!container) return;

  var html = '<button class="group-tab active" onclick="filterByGroup(\'All\')">All</button>';
  allGroups.forEach(function (g) {
    html += '<button class="group-tab" onclick="filterByGroup(\'' +
      g.name.replace(/'/g, "\\'") + '\')">' + g.name + '</button>';
  });
  container.innerHTML = html;
}

function renderGroupSelect() {
  var selects = document.querySelectorAll('.group-select');
  selects.forEach(function (sel) {
    var html = '<option value="Default">Default</option>';
    allGroups.forEach(function (g) {
      html += '<option value="' + g.name + '">' + g.name + '</option>';
    });
    sel.innerHTML = html;
  });
}

function filterByGroup(groupName) {
  activeGroup = groupName;

  // Update tab styles
  document.querySelectorAll('.group-tab').forEach(function (tab) {
    tab.classList.remove('active');
    if (tab.textContent === groupName) tab.classList.add('active');
  });

  renderStudentTable();
}

// ------ Create Group ------

async function handleCreateGroup(event) {
  if (event) event.preventDefault();
  var input = document.getElementById('newGroupName');
  var name = input.value.trim();
  var msgEl = document.getElementById('groupMessage');

  if (!name) return;

  var result = await _supabase.from('groups').insert({
    teacher_id: currentTeacher.session.user.id,
    name: name,
  });

  if (result.error) {
    if (result.error.message.includes('duplicate')) {
      showAuthMessage(msgEl, 'A group with that name already exists.', 'error');
    } else {
      showAuthMessage(msgEl, result.error.message, 'error');
    }
    return;
  }

  input.value = '';
  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';
  await loadGroups();
  await loadStudents();
}

// ------ Load Students ------

async function loadStudents() {
  var result = await _supabase
    .from('profiles')
    .select('id, username, group_name, created_at')
    .eq('teacher_id', currentTeacher.session.user.id)
    .eq('role', 'student')
    .order('username');

  allStudents = result.data || [];
  renderStudentTable();
}

function renderStudentTable() {
  var container = document.getElementById('studentTableBody');
  if (!container) return;

  var filtered = allStudents;
  if (activeGroup !== 'All') {
    filtered = allStudents.filter(function (s) { return s.group_name === activeGroup; });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:2rem;">No students found in this group.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (s) {
    var date = new Date(s.created_at).toLocaleDateString();
    html += '<tr>' +
      '<td>' + s.username + '</td>' +
      '<td>' + (s.group_name || 'Default') + '</td>' +
      '<td>' + date + '</td>' +
      '<td class="actions">' +
        '<button class="dash-btn small danger" onclick="deleteStudent(\'' + s.id + '\', \'' + s.username.replace(/'/g, "\\'") + '\')">Delete</button>' +
      '</td>' +
    '</tr>';
  });
  container.innerHTML = html;

  // Update count
  var countEl = document.getElementById('studentCount');
  if (countEl) {
    countEl.textContent = allStudents.length + ' student' + (allStudents.length !== 1 ? 's' : '') + ' total';
  }
}

// ------ Method Tabs (Add Single / Add Multiple / Import File) ------

function initMethodTabs() {
  var tabs = document.querySelectorAll('.method-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      // Deactivate all
      document.querySelectorAll('.method-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.method-panel').forEach(function (p) { p.classList.remove('active'); });
      // Activate clicked
      tab.classList.add('active');
      var target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add('active');
    });
  });
}

// ------ Add Single Student ------

async function handleAddSingle(event) {
  event.preventDefault();
  var msgEl = document.getElementById('addSingleMessage');
  var username = document.getElementById('singleUsername').value.trim();
  var group = document.getElementById('singleGroup').value;

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!username) {
    showAuthMessage(msgEl, 'Please enter a username.', 'error');
    return;
  }

  var btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  var response = await _supabase.functions.invoke('create-students', {
    body: {
      usernames: [username],
      group_name: group,
    },
  });

  btn.disabled = false;
  btn.textContent = 'Create Student';

  if (response.error || (response.data && response.data.error)) {
    var errorMsg = (response.data && response.data.error) || 'Failed to create student.';
    if (response.data && response.data.conflicts) {
      errorMsg = 'Username already exists: ' + response.data.conflicts.join(', ');
    }
    showAuthMessage(msgEl, errorMsg, 'error');
    return;
  }

  if (response.data && response.data.created && response.data.created.length > 0) {
    showPopup(
      'Student Created',
      '<p>The student account has been created successfully.</p>' +
      '<div class="credential-box"><strong>Username:</strong> ' + username + '</div>' +
      '<p>The student can now log in using their username.</p>',
      null
    );
    document.getElementById('singleUsername').value = '';
    await loadStudents();
  }

  if (response.data && response.data.errors && response.data.errors.length > 0) {
    var errList = response.data.errors.map(function (e) { return e.username + ': ' + e.message; }).join('<br>');
    showAuthMessage(msgEl, errList, 'error');
  }
}

// ------ Add Multiple Students ------

async function handleAddMultiple(event) {
  event.preventDefault();
  var msgEl = document.getElementById('addMultipleMessage');
  var prefix = document.getElementById('multiPrefix').value.trim();
  var count = parseInt(document.getElementById('multiCount').value, 10);
  var group = document.getElementById('multiGroup').value;

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!prefix || !count || count < 1) {
    showAuthMessage(msgEl, 'Please enter a prefix and a valid number.', 'error');
    return;
  }

  if (count > 100) {
    showAuthMessage(msgEl, 'Maximum 100 students at once.', 'error');
    return;
  }

  var usernames = [];
  for (var i = 1; i <= count; i++) {
    usernames.push(prefix + i);
  }

  var btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating ' + count + ' accounts...';

  var response = await _supabase.functions.invoke('create-students', {
    body: {
      usernames: usernames,
      group_name: group,
    },
  });

  btn.disabled = false;
  btn.textContent = 'Create Students';

  if (response.data && response.data.conflicts && response.data.conflicts.length > 0) {
    showPopup(
      'Username Conflicts',
      '<p>The following usernames already exist and were not created:</p>' +
      '<div class="credential-box">' + response.data.conflicts.join('<br>') + '</div>',
      null
    );
    return;
  }

  if (response.error || (response.data && response.data.error)) {
    showAuthMessage(msgEl, (response.data && response.data.error) || 'Failed to create students.', 'error');
    return;
  }

  if (response.data && response.data.created && response.data.created.length > 0) {
    showPopup(
      'Students Created',
      '<p>' + response.data.created.length + ' student accounts have been created successfully.</p>' +
      '<div class="credential-box">' + response.data.created.join('<br>') + '</div>' +
      '<p>Students can now log in using their usernames.</p>',
      null
    );
    document.getElementById('multiPrefix').value = '';
    document.getElementById('multiCount').value = '';
    await loadStudents();
  }
}

// ------ Import Students from File ------

function handleFileSelect(input) {
  var file = input.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });

    // Show preview
    var preview = document.getElementById('filePreview');
    var previewBody = document.getElementById('filePreviewBody');

    if (lines.length === 0) {
      preview.classList.add('hidden');
      return;
    }

    var html = '';
    lines.forEach(function (name, i) {
      html += '<tr><td>' + (i + 1) + '</td><td>' + name + '</td></tr>';
    });
    previewBody.innerHTML = html;
    preview.classList.remove('hidden');

    // Store for submission
    window._importUsernames = lines;
  };
  reader.readAsText(file);
}

async function handleImportSubmit(event) {
  event.preventDefault();
  var msgEl = document.getElementById('importMessage');
  var group = document.getElementById('importGroup').value;
  var usernames = window._importUsernames;

  msgEl.className = 'auth-message';
  msgEl.style.display = 'none';

  if (!usernames || usernames.length === 0) {
    showAuthMessage(msgEl, 'Please select a file first.', 'error');
    return;
  }

  var btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating ' + usernames.length + ' accounts...';

  var response = await _supabase.functions.invoke('create-students', {
    body: {
      usernames: usernames,
      group_name: group,
    },
  });

  btn.disabled = false;
  btn.textContent = 'Import Students';

  if (response.data && response.data.conflicts && response.data.conflicts.length > 0) {
    showPopup(
      'Username Conflicts',
      '<p>The following usernames already exist and were not created:</p>' +
      '<div class="credential-box">' + response.data.conflicts.join('<br>') + '</div>',
      null
    );
    return;
  }

  if (response.error || (response.data && response.data.error)) {
    showAuthMessage(msgEl, (response.data && response.data.error) || 'Failed to import students.', 'error');
    return;
  }

  if (response.data && response.data.created && response.data.created.length > 0) {
    showPopup(
      'Students Imported',
      '<p>' + response.data.created.length + ' student accounts have been created successfully.</p>' +
      '<p>Students can now log in using their usernames.</p>',
      null
    );
    document.getElementById('filePreview').classList.add('hidden');
    window._importUsernames = null;
    await loadStudents();
  }
}

// ------ Delete Student ------

async function deleteStudent(studentId, username) {
  showConfirmPopup(
    'Delete Student Account',
    '<p>Are you sure you want to delete <strong>' + username + '</strong> and all of their work? This cannot be undone.</p>',
    async function () {
      var response = await _supabase.functions.invoke('delete-student', {
        body: { student_id: studentId },
      });

      if (response.error || (response.data && response.data.error)) {
        showPopup('Error', '<p>' + ((response.data && response.data.error) || 'Failed to delete student.') + '</p>', null);
      } else {
        showPopup('Student Deleted', '<p><strong>' + username + '</strong> has been deleted.</p>', null);
        await loadStudents();
      }
    },
    null
  );
}

// ------ Delete Teacher Account (Cascade) ------

async function handleDeleteTeacher() {
  showConfirmPopup(
    'Delete Your Account and All Students',
    '<p>Are you sure? This will delete your teacher account and all associated student accounts. This cannot be undone.</p>',
    async function () {
      var response = await _supabase.functions.invoke('delete-teacher-cascade', {
        body: {},
      });

      if (response.error || (response.data && response.data.error)) {
        showPopup('Error', '<p>' + ((response.data && response.data.error) || 'Failed to delete account.') + '</p>', null);
      } else {
        await _supabase.auth.signOut();
        window.location.href = '/';
      }
    },
    null
  );
}

// ------ Logout from Dashboard ------

async function handleDashboardLogout() {
  await _supabase.auth.signOut();
  window.location.href = '/';
}