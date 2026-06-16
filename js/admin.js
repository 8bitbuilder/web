// ============================================================
// Teacher Dashboard & Admin Logic
// ============================================================

// Load the teacher's dashboard data
async function loadDashboard() {
  const user = await getUser();
  if (!user) return;

  // Load teacher profile
  const { data: profile } = await _supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "teacher") {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("teacher-name").textContent = profile.username;

  // Load groups
  await loadGroups();

  // Load students
  await loadStudents();
}

// Load teacher's groups
async function loadGroups() {
  const user = await getUser();
  const { data: groups, error } = await _supabase
    .from("groups")
    .select("*")
    .eq("teacher_id", user.id)
    .order("name");

  if (error) {
    console.error("Error loading groups:", error);
    return;
  }

  const container = document.getElementById("groups-list");
  if (!container) return;

  if (!groups || groups.length === 0) {
    container.innerHTML = '<p class="text-muted">No groups yet.</p>';
    return;
  }

  container.innerHTML = groups
    .map(
      (g) => `
    <div class="group-card" style="display:inline-block; background:#f0f0f0; padding:0.5rem 1rem; border-radius:8px; margin:0.25rem;">
      <span>${g.name}</span>
      ${
        g.name !== "Default"
          ? `<button onclick="deleteGroup('${g.id}')" style="background:none; border:none; color:#d32f2f; cursor:pointer; margin-left:0.5rem;">×</button>`
          : ""
      }
    </div>
  `
    )
    .join("");

  // Also update group select dropdowns
  const selects = document.querySelectorAll(".group-select");
  selects.forEach((select) => {
    const currentValue = select.value;
    select.innerHTML =
      '<option value="">Select group...</option>' +
      groups.map((g) => `<option value="${g.name}">${g.name}</option>`).join("");
    if (currentValue) select.value = currentValue;
  });
}

// Create a new group
async function handleCreateGroup(e) {
  e.preventDefault();
  const name = document.getElementById("new-group-name").value.trim();
  if (!name) return;

  const user = await getUser();
  const { error } = await _supabase
    .from("groups")
    .insert({ teacher_id: user.id, name });

  if (error) {
    if (error.code === "23505") {
      showStatus("group-status", "A group with that name already exists.", true);
    } else {
      showStatus("group-status", "Error: " + error.message, true);
    }
    return;
  }

  document.getElementById("new-group-name").value = "";
  showStatus("group-status", "Group created!", false);
  await loadGroups();
}

// Delete a group
async function deleteGroup(groupId) {
  const confirmed = await showConfirm(
    "Delete Group",
    "Are you sure? Students in this group will be moved to 'Default'."
  );
  if (!confirmed) return;

  const user = await getUser();

  // Get the group name first
  const { data: group } = await _supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .single();

  if (group) {
    // Move students to Default group
    await _supabase
      .from("profiles")
      .update({ group_name: "Default" })
      .eq("teacher_id", user.id)
      .eq("group_name", group.name);
  }

  // Delete the group
  await _supabase.from("groups").delete().eq("id", groupId);
  await loadGroups();
  await loadStudents();
}

// Load all students for this teacher
async function loadStudents() {
  const user = await getUser();
  const { data: students, error } = await _supabase
    .from("profiles")
    .select("id, username, group_name, created_at")
    .eq("teacher_id", user.id)
    .eq("role", "student")
    .order("group_name")
    .order("username");

  if (error) {
    console.error("Error loading students:", error);
    return;
  }

  const container = document.getElementById("students-list");
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML =
      '<p class="text-muted">No students yet. Use the forms above to add students.</p>';
    return;
  }

  // Group students by group_name
  const grouped = {};
  students.forEach((s) => {
    const group = s.group_name || "Default";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(s);
  });

  let html = "";
  for (const [groupName, groupStudents] of Object.entries(grouped)) {
    html += `<h4 style="margin-top:1.5rem; color:#4f46e5;">📁 ${groupName}</h4>`;
    html += '<div class="table-responsive"><table class="table table-striped">';
    html += `
      <thead>
        <tr>
          <th>Username</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
    `;

    groupStudents.forEach((s) => {
      const date = new Date(s.created_at).toLocaleDateString();
      html += `
        <tr>
          <td><strong>${s.username}</strong></td>
          <td>${date}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="resetStudentPassword('${s.id}', '${s.username}')">
              Reset Password
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.id}', '${s.username}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table></div>";
  }

  container.innerHTML = html;

  // Update student count
  const countEl = document.getElementById("student-count");
  if (countEl) countEl.textContent = students.length;
}

// Delete the teacher's entire account (cascade)
async function handleDeleteTeacherAccount() {
  const confirmed = await showConfirm(
    "Delete Your Account",
    "Are you sure? This will delete your teacher account and ALL associated student accounts. This cannot be undone."
  );
  if (!confirmed) return;

  try {
    await callEdgeFunction("delete-teacher-cascade", {});
    await _supabase.auth.signOut();
    showPopup(
      "Account Deleted",
      "Your account and all associated data have been permanently deleted.",
      () => {
        window.location.href = "index.html";
      }
    );
  } catch (err) {
    showStatus("dashboard-status", "Error: " + err.message, true);
  }
}