// js/admin.js
// ============================================================
// DASHBOARD LOGIC v3 — student management, groups, deletion
// Depends on: _supabase (from supabase-config.js)
//             showPopup, showConfirmPopup, showAuthMessage (from auth.js)
// ============================================================

var currentTeacher = null;
var allStudents = [];
var allGroups = [];
var activeGroup = 'All';

// Called from dashboard.qmd after auth check passes
function initDashboard(session, profile) {
  currentTeacher = { session: session, profile: profile };

  var welcomeEl = document.getElementById('dashboardWelcome');
  if (welcomeEl) welcomeEl.textContent = 'Welcome, ' + profile.username;

  loadGroups();
  loadStudents();
}

// ================================================================
//  GROUPS
// ================================================================

function loadGroups() {
  _supabase
    .from('groups')
    .select('*')
    .eq('teacher_id', currentTeacher.session.user.id)
    .order('name')
    .then(function (result) {
      allGroups = result.data || [];
      renderGroupTabs();
      renderGroupSelects();
    });
}

function renderGroupTabs() {
  var container = document.getElementById('groupTabs');
  if (!container) return;

  var html =
    '<button class="group-tab' +
    (activeGroup === 'All' ? ' active' : '') +
    '" onclick="filterByGroup(\'All\')">All</button>';

  allGroups.forEach(function (g) {
    var esc = g.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    html +=
      '<span class="group-tab-wrapper">' +
      '<button class="group-tab' +
      (activeGroup === g.name ? ' active' : '') +
      '" onclick="filterByGroup(\'' + esc + '\')">' +
      g.name +
      '</button>' +
      '<button class="group-delete-x" onclick="event.stopPropagation(); handleDeleteGroup(\'' +
      esc +
      '\')" title="Delete group">&times;</button>' +
      '</span>';
  });
  container.innerHTML = html;
}

function renderGroupSelects() {
  var selects = document.querySelectorAll('.group-select');
  selects.forEach(function (sel) {
    var cur = sel.value;
    var html = '<option value="Default">Default</option>';
    allGroups.forEach(function (g) {
      html +=
        '<option value="' +
        g.name +
        '"' +
        (g.name === cur ? ' selected' : '') +
        '>' +
        g.name +
        '</option>';
    });
    sel.innerHTML = html;
  });
}

function filterByGroup(groupName) {
  activeGroup = groupName;
  renderGroupTabs();
  renderStudentTable();
}

function handleCreateGroup(event) {
  if (event) event.preventDefault();
  var input = document.getElementById('newGroupName');
  var name = input.value.trim();
  var msgEl = document.getElementById('groupMessage');

  if (!name) return;

  _supabase
    .from('groups')
    .insert({ teacher_id: currentTeacher.session.user.id, name: name })
    .then(function (result) {
      if (result.error) {
        if (result.error.message.includes('duplicate')) {
          showAuthMessage(msgEl, 'A group with that name already exists.', 'error');
        } else {
          showAuthMessage(msgEl, result.error.message, 'error');
        }
        return;
      }
      input.value = '';
      if (msgEl) {
        msgEl.className = 'auth-message';
        msgEl.style.display = 'none';
      }
      loadGroups();
      loadStudents();
    });
}

function handleDeleteGroup(groupName) {
  // First, find all students in this group
  var studentsInGroup = allStudents.filter(function (s) {
    return s.group_name === groupName;
  });

  var studentCount = studentsInGroup.length;
  var message =
    '<p>Are you sure you want to delete the group <strong>' +
    groupName +
    '</strong>?</p>';

  if (studentCount > 0) {
    message +=
      '<p>This will also permanently delete <strong>' +
      studentCount +
      ' student account' +
      (studentCount !== 1 ? 's' : '') +
      '</strong> in this group. This cannot be undone.</p>';
  } else {
    message += '<p>This group has no students.</p>';
  }

  showConfirmPopup(
    'Delete Group',
    message,
    function () {
      // If there are students, delete them all first
      if (studentCount === 0) {
        // No students — just delete the group
        deleteGroupRow(groupName, []);
        return;
      }

      var deletedNames = [];
      var deleteErrors = [];
      var completed = 0;

      studentsInGroup.forEach(function (student) {
        _supabase.functions
          .invoke('delete-student', {
            body: { student_id: student.id },
          })
          .then(function (response) {
            if (response.error || (response.data && response.data.error)) {
              deleteErrors.push(student.username);
            } else {
              deletedNames.push(student.username);
            }

            completed++;

            // When all student deletions are done, delete the group
            if (completed === studentCount) {
              deleteGroupRow(groupName, deletedNames, deleteErrors);
            }
          });
      });
    },
    null
  );
}

function deleteGroupRow(groupName, deletedNames, deleteErrors) {
  _supabase
    .from('groups')
    .delete()
    .eq('teacher_id', currentTeacher.session.user.id)
    .eq('name', groupName)
    .then(function () {
      if (activeGroup === groupName) activeGroup = 'All';

      // Build success message
      var bodyHTML =
        '<p>The group <strong>' + groupName + '</strong> has been deleted.</p>';

      if (deletedNames && deletedNames.length > 0) {
        bodyHTML +=
          '<p>' +
          deletedNames.length +
          ' student account' +
          (deletedNames.length !== 1 ? 's were' : ' was') +
          ' deleted:</p>' +
          '<div class="credential-box">' +
          deletedNames.join('<br>') +
          '</div>';
      }

      if (deleteErrors && deleteErrors.length > 0) {
        bodyHTML +=
          '<p style="color:#E05933; margin-top:0.5rem;">Failed to delete: ' +
          deleteErrors.join(', ') +
          '</p>';
      }

      showPopup('Group Deleted', bodyHTML, null);

      loadGroups();
      loadStudents();
    });
}

// ================================================================
//  STUDENTS — Load & Render
// ================================================================

function loadStudents() {
  _supabase
    .from('profiles')
    .select('id, username, group_name, created_at')
    .eq('teacher_id', currentTeacher.session.user.id)
    .eq('role', 'student')
    .order('username')
    .then(function (result) {
      allStudents = result.data || [];
      renderStudentTable();

      var total = allStudents.length;
      var label = total + ' student' + (total !== 1 ? 's' : '') + ' total';
      var c1 = document.getElementById('studentCount');
      if (c1) c1.textContent = label;
      var c2 = document.getElementById('studentCount2');
      if (c2) c2.textContent = label;
    });
}

function renderStudentTable() {
  var container = document.getElementById('studentTableBody');
  if (!container) return;

  var filtered = allStudents;
  if (activeGroup !== 'All') {
    filtered = allStudents.filter(function (s) {
      return s.group_name === activeGroup;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML =
      '<tr><td colspan="4" style="text-align:center; color:#888; padding:2rem;">No students found.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (s) {
    var date = new Date(s.created_at).toLocaleDateString();
    var escName = s.username.replace(/'/g, "\\'");
    html +=
      '<tr>' +
      '<td style="text-align:center;">' + s.username + '</td>' +
      '<td style="text-align:center;">' + (s.group_name || 'Default') + '</td>' +
      '<td style="text-align:center;">' + date + '</td>' +
      '<td style="text-align:center;">' +
      '<button class="dash-btn small danger" onclick="deleteStudent(\'' +
      s.id + "', '" + escName +
      "')\">Delete</button></td>" +
      '</tr>';
  });
  container.innerHTML = html;
}

// ================================================================
//  ADD SINGLE STUDENT
// ================================================================

function handleAddSingle(event) {
  event.preventDefault();
  var msgEl = document.getElementById('addSingleMessage');
  var username = document.getElementById('singleUsername').value.trim();
  var group = document.getElementById('singleGroup').value;

  if (msgEl) { msgEl.className = 'auth-message'; msgEl.style.display = 'none'; }

  if (!username) {
    showAuthMessage(msgEl, 'Please enter a username.', 'error');
    return;
  }

  var btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  _supabase.functions
    .invoke('create-students', {
      body: { usernames: [username], group_name: group },
    })
    .then(function (response) {
      btn.disabled = false;
      btn.textContent = 'Create Student';

      if (response.error) {
        showAuthMessage(msgEl, response.error.message || 'Failed to create student.', 'error');
        return;
      }

      var data = response.data;

      if (data && data.conflicts && data.conflicts.length > 0) {
        showAuthMessage(msgEl, 'Username already exists: ' + data.conflicts.join(', '), 'error');
        return;
      }

      if (data && data.error) {
        showAuthMessage(msgEl, data.error, 'error');
        return;
      }

      if (data && data.created && data.created.length > 0) {
        showPopup(
          'Student Created',
          '<p>The following student account has been created successfully:</p>' +
          '<div class="credential-box"><strong>' + data.created.join('</strong><br><strong>') + '</strong></div>' +
          '<p>The student can now log in using their username.</p>',
          null
        );
        document.getElementById('singleUsername').value = '';
        loadStudents();
      }

      if (data && data.errors && data.errors.length > 0) {
        var errList = data.errors
          .map(function (e) { return e.username + ': ' + e.message; })
          .join('<br>');
        showAuthMessage(msgEl, errList, 'error');
      }
    });
}

// ================================================================
//  ADD MULTIPLE STUDENTS
// ================================================================

function handleAddMultiple(event) {
  event.preventDefault();
  var msgEl = document.getElementById('addMultipleMessage');
  var prefix = document.getElementById('multiPrefix').value.trim();
  var count = parseInt(document.getElementById('multiCount').value, 10);
  var group = document.getElementById('multiGroup').value;

  if (msgEl) { msgEl.className = 'auth-message'; msgEl.style.display = 'none'; }

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

  _supabase.functions
    .invoke('create-students', {
      body: { usernames: usernames, group_name: group },
    })
    .then(function (response) {
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
          '<p>' + response.data.created.length + ' student account' +
          (response.data.created.length !== 1 ? 's have' : ' has') +
          ' been created successfully:</p>' +
          '<div class="credential-box">' + response.data.created.join('<br>') + '</div>' +
          '<p>Students can now log in using their usernames.</p>',
          null
        );
        document.getElementById('multiPrefix').value = '';
        document.getElementById('multiCount').value = '';
        loadStudents();
      }
    });
}

// ================================================================
//  IMPORT STUDENTS FROM FILE (.txt or .csv)
// ================================================================

function handleFileSelect(input) {
  var file = input.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });

    // If CSV, take only the first column and skip header
    var isCSV = file.name.toLowerCase().endsWith('.csv');
    if (isCSV && lines.length > 0) {
      // Check if first line looks like a header
      var firstLine = lines[0].toLowerCase();
      if (firstLine.includes('username') || firstLine.includes('name') || firstLine.includes('student')) {
        lines.shift(); // Remove header row
      }
      // Extract first column from each row
      lines = lines.map(function (line) {
        return line.split(',')[0].trim().replace(/^["']|["']$/g, '');
      }).filter(function (l) { return l.length > 0; });
    }

    // Show preview
    var preview = document.getElementById('filePreview');
    var previewBody = document.getElementById('filePreviewBody');

    if (lines.length === 0) {
      if (preview) preview.style.display = 'none';
      return;
    }

    var html = '';
    lines.forEach(function (name, i) {
      html += '<tr><td style="text-align:center;">' + (i + 1) + '</td><td style="text-align:center;">' + name + '</td></tr>';
    });
    if (previewBody) previewBody.innerHTML = html;
    if (preview) preview.style.display = 'block';

    // Store for submission
    window._importUsernames = lines;
  };
  reader.readAsText(file);
}

function handleImportSubmit(event) {
  event.preventDefault();
  var msgEl = document.getElementById('importMessage');
  var group = document.getElementById('importGroup').value;
  var usernames = window._importUsernames;

  if (msgEl) { msgEl.className = 'auth-message'; msgEl.style.display = 'none'; }

  if (!usernames || usernames.length === 0) {
    showAuthMessage(msgEl, 'Please select a file first.', 'error');
    return;
  }

  var btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating ' + usernames.length + ' accounts...';

  _supabase.functions
    .invoke('create-students', {
      body: { usernames: usernames, group_name: group },
    })
    .then(function (response) {
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
          '<p>' + response.data.created.length + ' student account' +
          (response.data.created.length !== 1 ? 's have' : ' has') +
          ' been created successfully:</p>' +
          '<div class="credential-box">' + response.data.created.join('<br>') + '</div>' +
          '<p>Students can now log in using their usernames.</p>',
          null
        );
        var preview = document.getElementById('filePreview');
        if (preview) preview.style.display = 'none';
        window._importUsernames = null;
        loadStudents();
      }
    });
}

// ================================================================
//  DELETE STUDENT
// ================================================================

function deleteStudent(studentId, username) {
  showConfirmPopup(
    'Delete Student Account',
    '<p>Are you sure you want to delete <strong>' + username + '</strong> and all of their work? This cannot be undone.</p>',
    function () {
      _supabase.functions
        .invoke('delete-student', {
          body: { student_id: studentId },
        })
        .then(function (response) {
          if (response.error || (response.data && response.data.error)) {
            showPopup('Error', '<p>' + ((response.data && response.data.error) || 'Failed to delete student.') + '</p>', null);
          } else {
            showPopup('Student Deleted', '<p><strong>' + username + '</strong> has been deleted.</p>', null);
            loadStudents();
          }
        });
    },
    null
  );
}

// ================================================================
//  DELETE TEACHER ACCOUNT (CASCADE)
// ================================================================

function handleDeleteTeacher() {
  showConfirmPopup(
    'Delete Your Account and All Students',
    '<p>Are you sure? This will delete your teacher account and <strong>all</strong> associated student accounts. This action cannot be undone.</p>',
    function () {
      _supabase.functions
        .invoke('delete-teacher-cascade', {
          body: {},
        })
        .then(function (response) {
          if (response.error || (response.data && response.data.error)) {
            showPopup('Error', '<p>' + ((response.data && response.data.error) || 'Failed to delete account.') + '</p>', null);
          } else {
            _supabase.auth.signOut().then(function () {
              window.location.href = '/';
            });
          }
        });
    },
    null
  );
}