// ============================================================
// Student Management Logic
// Handles: Add Single, Add Multiple, Import from File,
//          Reset Password, Delete Student
// ============================================================

// --- Add Single Student ---
async function handleAddSingleStudent(e) {
  e.preventDefault();

  const username = document.getElementById("single-username").value.trim();
  const groupName =
    document.getElementById("single-group-select").value || "Default";

  if (!username) {
    showStatus("single-status", "Please enter a username.", true);
    return;
  }

  const password = generatePassword(10);

  try {
    showStatus("single-status", "Creating student...", false);

    const data = await callEdgeFunction("create-students", {
      usernames: [username],
      password: password,
      group_name: groupName,
    });

    if (data.conflicts && data.conflicts.length > 0) {
      showPopup(
        "Username Conflict",
        `<p>The username <strong>${username}</strong> already exists. Please choose a different username.</p>`
      );
      showStatus("single-status", "", false);
      return;
    }

    if (data.errors && data.errors.length > 0) {
      showStatus("single-status", "Error: " + data.errors[0].error, true);
      return;
    }

    // Show popup with credentials
    showPopup(
      "Student Created!",
      `
      <p>Save these credentials — the student will need them to log in.</p>
      <div style="background:#f5f5f5; padding:1rem; border-radius:8px; font-family:monospace;">
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Password:</strong> ${password}</p>
      </div>
      `
    );

    document.getElementById("single-username").value = "";
    showStatus("single-status", "Student created successfully!", false);
    await loadStudents();
  } catch (err) {
    showStatus("single-status", "Error: " + err.message, true);
  }
}

// --- Add Multiple Students ---
async function handleAddMultipleStudents(e) {
  e.preventDefault();

  const prefix = document.getElementById("bulk-prefix").value.trim();
  const count = parseInt(document.getElementById("bulk-count").value);
  const groupName =
    document.getElementById("bulk-group-select").value || "Default";

  if (!prefix || !count || count < 1) {
    showStatus("bulk-status", "Please enter a prefix and a valid count.", true);
    return;
  }

  if (count > 100) {
    showStatus("bulk-status", "Maximum 100 students at a time.", true);
    return;
  }

  // Generate usernames
  const usernames = [];
  for (let i = 1; i <= count; i++) {
    usernames.push(`${prefix}${i}`);
  }

  const password = generatePassword(10);

  try {
    showStatus("bulk-status", `Creating ${count} students...`, false);

    const data = await callEdgeFunction("create-students", {
      usernames,
      password,
      group_name: groupName,
    });

    if (data.conflicts && data.conflicts.length > 0) {
      showPopup(
        "Username Conflicts",
        `
        <p>The following usernames already exist:</p>
        <ul>${data.conflicts.map((c) => `<li><strong>${c}</strong></li>`).join("")}</ul>
        <p>No accounts were created. Please choose a different prefix or remove the conflicts.</p>
        `
      );
      showStatus("bulk-status", "", false);
      return;
    }

    if (data.created && data.created.length > 0) {
      showPopup(
        "Students Created!",
        `
        <p><strong>${data.created.length}</strong> students created successfully.</p>
        <p>All students share the same password:</p>
        <div style="background:#f5f5f5; padding:1rem; border-radius:8px; font-family:monospace;">
          <p><strong>Usernames:</strong> ${data.created[0]} → ${data.created[data.created.length - 1]}</p>
          <p><strong>Password:</strong> ${password}</p>
        </div>
        `
      );
    }

    document.getElementById("bulk-prefix").value = "";
    document.getElementById("bulk-count").value = "";
    showStatus("bulk-status", `${data.created?.length || 0} students created!`, false);
    await loadStudents();
  } catch (err) {
    showStatus("bulk-status", "Error: " + err.message, true);
  }
}

// --- Import Students from File ---
async function handleFileUpload() {
  const fileInput = document.getElementById("file-upload");
  const file = fileInput.files[0];

  if (!file) {
    showStatus("import-status", "Please select a file.", true);
    return;
  }

  if (!file.name.endsWith(".txt")) {
    showStatus("import-status", "Please upload a .txt file.", true);
    return;
  }

  try {
    const usernames = await parseTxtFile(file);

    if (usernames.length === 0) {
      showStatus("import-status", "File is empty.", true);
      return;
    }

    // Show preview table
    const previewContainer = document.getElementById("import-preview");
    previewContainer.innerHTML = `
      <h5>Preview (${usernames.length} students)</h5>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead><tr><th>#</th><th>Username</th></tr></thead>
          <tbody>
            ${usernames
              .map(
                (u, i) => `<tr><td>${i + 1}</td><td>${u}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <button class="btn btn-primary" id="confirm-import-btn">
        Create ${usernames.length} Students
      </button>
    `;
    previewContainer.style.display = "block";

    // Handle confirm
    document
      .getElementById("confirm-import-btn")
      .addEventListener("click", async () => {
        const groupName =
          document.getElementById("import-group-select").value || "Default";
        const password = generatePassword(10);

        try {
          showStatus("import-status", "Creating students...", false);

          const data = await callEdgeFunction("create-students", {
            usernames,
            password,
            group_name: groupName,
          });

          if (data.conflicts && data.conflicts.length > 0) {
            showPopup(
              "Username Conflicts",
              `
              <p>The following usernames already exist:</p>
              <ul>${data.conflicts
                .map((c) => `<li><strong>${c}</strong></li>`)
                .join("")}</ul>
              <p>No accounts were created.</p>
              `
            );
            showStatus("import-status", "", false);
            return;
          }

          if (data.created && data.created.length > 0) {
            showPopup(
              "Students Imported!",
              `
              <p><strong>${data.created.length}</strong> students created successfully.</p>
              <div style="background:#f5f5f5; padding:1rem; border-radius:8px; font-family:monospace;">
                <p><strong>Password (for all):</strong> ${password}</p>
              </div>
              `
            );
          }

          previewContainer.style.display = "none";
          fileInput.value = "";
          showStatus("import-status", "Import complete!", false);
          await loadStudents();
        } catch (err) {
          showStatus("import-status", "Error: " + err.message, true);
        }
      });
  } catch (err) {
    showStatus("import-status", "Error reading file: " + err.message, true);
  }
}

// --- Reset Student Password ---
async function resetStudentPassword(studentId, username) {
  const newPassword = generatePassword(10);

  try {
    const data = await callEdgeFunction("reset-student-password", {
      student_id: studentId,
      new_password: newPassword,
    });

    showPopup(
      "Password Reset",
      `
      <p>New credentials for this student:</p>
      <div style="background:#f5f5f5; padding:1rem; border-radius:8px; font-family:monospace;">
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>New Password:</strong> ${newPassword}</p>
      </div>
      <p>Give these to the student. The old password no longer works.</p>
      `
    );
  } catch (err) {
    showPopup("Error", `<p>Failed to reset password: ${err.message}</p>`);
  }
}

// --- Delete Student ---
async function deleteStudent(studentId, username) {
  const confirmed = await showConfirm(
    "Delete Student",
    `Are you sure you want to delete <strong>${username}</strong> and all of their work? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await callEdgeFunction("delete-student", {
      student_id: studentId,
    });

    showStatus("dashboard-status", `Student "${username}" deleted.`, false);
    await loadStudents();
  } catch (err) {
    showPopup("Error", `<p>Failed to delete student: ${err.message}</p>`);
  }
}