// Prevent VS Code Live Server from force-reloading the page when database
// or log files change inside the project folder.
(function () {
    const OriginalWebSocket = window.WebSocket;
    if (!OriginalWebSocket) return;
    window.WebSocket = function (url, protocols) {
        const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
        if (typeof url === "string" && url.includes("/ws")) {
            ws.addEventListener("message", function (event) {
                if (event.data === "reload") {
                    event.stopImmediatePropagation();
                }
            }, true);
            let customOnMessage = null;
            Object.defineProperty(ws, "onmessage", {
                get: function () { return customOnMessage; },
                set: function (fn) {
                    customOnMessage = function (event) {
                        if (event.data === "reload") return;
                        return fn.apply(this, arguments);
                    };
                    ws.addEventListener("message", customOnMessage);
                }
            });
        }
        return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
})();

const API_BASE = "http://127.0.0.1:8000";
let cachedApplications = [];

function showAdminDashboard(adminId, fullName) {
    document.getElementById("back-to-student-link").style.display = "none";
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("admin-dashboard").style.display = "block";
    document.getElementById("welcome-admin-text").innerText = `Welcome, ${fullName || "Administrator"}`;
    document.getElementById("session-admin-id").innerText = adminId || "ADMIN-001";
    fetchAllApplications();
}

window.onload = function () {
    if (sessionStorage.getItem("admin_authenticated") === "true") {
        const savedId = sessionStorage.getItem("admin_user_id") || "ADMIN-001";
        const savedName = sessionStorage.getItem("admin_full_name") || "System Administrator";
        showAdminDashboard(savedId, savedName);
    }
};

async function verifyAdminAccess() {
    const adminId = document.getElementById("admin-id-input").value.trim();
    const password = document.getElementById("admin-password-input").value;
    const errorDiv = document.getElementById("auth-error");
    errorDiv.innerHTML = "";

    if (!adminId || !password) {
        errorDiv.innerHTML = "<p class='error-msg'>Please enter both User ID and Password.</p>";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${encodeURIComponent(adminId)}/verify-admin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_password: password })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Authentication failed.");
        }

        const data = await response.json();

        sessionStorage.setItem("admin_authenticated", "true");
        sessionStorage.setItem("admin_user_id", data.user_id);
        sessionStorage.setItem("admin_full_name", data.full_name);

        showAdminDashboard(data.user_id, data.full_name);

    } catch (error) {
        errorDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

function logoutAdmin() {
    closeDossierDrawer();
    toggleEnrollPanel(false);
    sessionStorage.removeItem("admin_authenticated");
    sessionStorage.removeItem("admin_user_id");
    sessionStorage.removeItem("admin_full_name");
    document.getElementById("admin-id-input").value = "";
    document.getElementById("admin-password-input").value = "";
    document.getElementById("auth-error").innerHTML = "";
    document.getElementById("admin-dashboard").style.display = "none";
    document.getElementById("auth-section").style.display = "block";
    document.getElementById("back-to-student-link").style.display = "inline-block";
}

function clearEnrollForm() {
    ["reg-fullname", "reg-email", "reg-password", "reg-phone"].forEach(id => {
        document.getElementById(id).value = "";
    });
}

function toggleEnrollPanel(forceOpen) {
    const panel = document.getElementById("enroll-student-panel");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !panel.classList.contains("open");

    if (shouldOpen) {
        panel.classList.add("open");
        document.getElementById("reg-result").innerHTML = "";
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("reg-fullname").focus();
    } else {
        panel.classList.remove("open");
        clearEnrollForm();
        document.getElementById("reg-result").innerHTML = "";
    }
}

async function registerStudent() {
    const fullName = document.getElementById("reg-fullname").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const phone = document.getElementById("reg-phone").value.trim();
    const resultDiv = document.getElementById("reg-result");
    const submitBtn = document.getElementById("btn-create-student");
    resultDiv.innerHTML = "";

    if (!fullName || !email || !password) {
        resultDiv.innerHTML = "<p class='error-msg'>Please fill in the student's name, email, and initial password.</p>";
        return;
    }
    if (password.length < 6) {
        resultDiv.innerHTML = "<p class='error-msg'>Initial password must be at least 6 characters.</p>";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Creating Account...";

    try {
        const response = await fetch(`${API_BASE}/users/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                user_password: password,
                phone_number: phone || null,
                user_type: "student"
            })
        });

        if (!response.ok) {
            const err = await response.json();
            let errorMsg = "Failed to create student account.";
            if (typeof err.detail === "string") errorMsg = err.detail;
            else if (Array.isArray(err.detail)) errorMsg = err.detail.map(e => e.msg).join(', ');
            throw new Error(errorMsg);
        }

        const data = await response.json();
        clearEnrollForm();

        resultDiv.innerHTML = `
            <div class="credential-card">
                <div style="font-weight: 700; color: var(--success-text); margin-bottom: 8px;">
                    &#10003; Student account created successfully. Share these sign-in details with the student:
                </div>
                <div class="credential-row"><span>Student Name</span><strong>${data.full_name}</strong></div>
                <div class="credential-row"><span>Candidate ID</span><strong style="color: var(--primary);">${data.user_id}</strong></div>
                <div class="credential-row"><span>Login Email</span><strong>${data.email}</strong></div>
                <div class="credential-row"><span>Initial Password</span><strong>As entered by the officer</strong></div>
                <div style="margin-top: 12px; text-align: right;">
                    <button onclick="startAdminEnrollment('${data.user_id}', '${data.full_name.replace(/'/g, "\\'")}')" class="btn-accent" style="width: auto; margin-top: 0; padding: 8px 18px; font-size: 13px;">
                        Proceed to Program Enrollment Wizard &rarr;
                    </button>
                </div>
            </div>
        `;

    } catch (error) {
        resultDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Create Student Account";
    }
}

function startAdminEnrollment(userId, fullName, resumeAppId) {
    sessionStorage.setItem("enroll_target_user_id", userId);
    sessionStorage.setItem("enroll_target_name", fullName || userId);
    sessionStorage.removeItem("enrollment_wizard_step");
    if (resumeAppId) {
        sessionStorage.setItem("admin_enroll_application_id", resumeAppId);
        window.location.href = "enroll.html?resume=true";
    } else {
        sessionStorage.removeItem("admin_enroll_application_id");
        window.location.href = "enroll.html";
    }
}

async function launchEnrollmentForExistingStudent() {
    const inputEl = document.getElementById("existing-student-id");
    const errDiv = document.getElementById("existing-enroll-error");
    const userId = inputEl.value.trim();
    errDiv.innerHTML = "";

    if (!userId) {
        errDiv.innerHTML = "<p class='error-msg'>Please enter a Candidate User ID (e.g., USER-XXXXXXXX).</p>";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/role`);
        if (!response.ok) {
            throw new Error("Student User ID not found.");
        }
        const userData = await response.json();
        startAdminEnrollment(userData.user_id, userData.full_name);
    } catch (error) {
        errDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

async function createProgram() {
    const courseId = document.getElementById("prog-id").value.trim();
    const courseName = document.getElementById("prog-name").value.trim();
    const academicYear = document.getElementById("prog-year").value.trim();
    const resultDiv = document.getElementById("prog-result");
    resultDiv.innerHTML = "";

    if (!courseId || !courseName || !academicYear) {
        resultDiv.innerHTML = "<p class='error-msg'>Please fill in all program fields.</p>";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/programs/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                course_id: courseId,
                course_name: courseName,
                academic_year: academicYear,
                is_active: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            let errorMsg = "Failed to create program.";
            if (typeof err.detail === "string") errorMsg = err.detail;
            else if (Array.isArray(err.detail)) errorMsg = err.detail.map(e => e.msg).join(', ');
            throw new Error(errorMsg);
        }

        const data = await response.json();
        resultDiv.innerHTML = `<p class='success-msg'>&#10003; Program '${data.course_name}' (${data.course_id}) published successfully.</p>`;

        document.getElementById("prog-id").value = "";
        document.getElementById("prog-name").value = "";
        document.getElementById("prog-year").value = "";

    } catch (error) {
        resultDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

async function updateApplicationStatus(applicationId, newStatus) {
    const feedbackDiv = document.getElementById("admin-action-feedback");
    feedbackDiv.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE}/applications/${applicationId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to update application status.");
        }

        feedbackDiv.innerHTML = `<p class='success-msg'>&#10003; Dossier <strong>${applicationId}</strong> status updated to <strong>${newStatus.toUpperCase()}</strong>.</p>`;
        closeDossierDrawer();
        fetchAllApplications();

    } catch (error) {
        feedbackDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

function openDossierDrawer(applicationId) {
    const app = cachedApplications.find(a => a.application_id === applicationId);
    if (!app) return;

    document.getElementById("drawer-app-id").innerText = app.application_id;
    const badgeClass = `status-badge status-${app.status}`;
    const statusLabel = app.status.replace("_", " ").toUpperCase();

    let docsSection = `<p style="color: var(--on-surface-variant); font-size: 13px;">No documents uploaded yet.</p>`;
    if (app.documents && app.documents.length > 0) {
        docsSection = app.documents.map(doc => {
            const normalizedPath = (doc.file_path || "").replace(/\\/g, "/");
            const fileUrl = `${API_BASE}/${normalizedPath}`;
            return `
                <div style="background: var(--surface); border: 1px solid var(--surface-container); padding: 12px 14px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: var(--primary); font-size: 13px;">${doc.document_type}</div>
                        <div style="font-size: 12px; color: var(--on-surface-variant);">${doc.file_name}</div>
                    </div>
                    <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="doc-link">Open File &nearr;</a>
                </div>
            `;
        }).join("");
    }

    let paymentSection = `<p style="color: var(--on-surface-variant); font-size: 13px;">No fee deposit recorded.</p>`;
    if (app.payments && app.payments.length > 0) {
        paymentSection = app.payments.map(pay => `
            <div style="background: var(--surface); border: 1px solid var(--surface-container); padding: 12px 14px; border-radius: 6px;">
                <div style="font-size: 12px; color: var(--on-surface-variant);">Reference Number</div>
                <div style="font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 6px;">${pay.reference_number}</div>
                <div style="font-size: 13px;">Channel: <strong>${pay.payment_method.toUpperCase()}</strong> &bull; Amount: <strong>PHP ${Number(pay.amount).toFixed(2)}</strong></div>
            </div>
        `).join("");
    }

    document.getElementById("drawer-body-content").innerHTML = `
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--on-surface-variant);">Candidate User ID</span>
                <div style="font-size: 16px; font-weight: 600; color: var(--primary);">${app.user_id}</div>
            </div>
            <span class="${badgeClass}">${statusLabel}</span>
        </div>
        <div style="margin-bottom: 20px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--on-surface-variant);">Applied Program</span>
            <div style="font-size: 15px; font-weight: 600; color: var(--on-surface);">${app.program ? app.program.course_name : app.course_id} (${app.course_id})</div>
        </div>
        <hr style="border: none; border-top: 1px solid var(--surface-container); margin: 18px 0;">
        <h4 style="font-family: 'Source Serif 4', Georgia, serif; color: var(--primary); margin: 0 0 10px 0;">Submitted Academic Documents</h4>
        ${docsSection}
        <hr style="border: none; border-top: 1px solid var(--surface-container); margin: 18px 0;">
        <h4 style="font-family: 'Source Serif 4', Georgia, serif; color: var(--primary); margin: 0 0 10px 0;">Admissions Deposit Receipt</h4>
        ${paymentSection}
    `;

    const isApproved = app.status === "approved";
    const isRejected = app.status === "rejected";
    document.getElementById("drawer-footer-actions").innerHTML = `
        <button class="btn-approve" onclick="updateApplicationStatus('${app.application_id}', 'approved')" ${isApproved ? "disabled" : ""} style="padding: 8px 16px;">Approve Candidate</button>
        <button class="btn-reject" onclick="updateApplicationStatus('${app.application_id}', 'rejected')" ${isRejected ? "disabled" : ""} style="padding: 8px 16px;">Reject Dossier</button>
    `;

    document.getElementById("drawer-backdrop").classList.add("open");
    document.getElementById("inspection-drawer").classList.add("open");
}

function closeDossierDrawer() {
    document.getElementById("drawer-backdrop").classList.remove("open");
    document.getElementById("inspection-drawer").classList.remove("open");
}

async function fetchAllApplications() {
    const container = document.getElementById("admin-table-container");
    container.innerHTML = "<p style='color: var(--on-surface-variant);'>Loading admissions data...</p>";

    try {
        const response = await fetch(`${API_BASE}/admin/applications`);
        if (!response.ok) {
            throw new Error("Failed to fetch applications.");
        }
        const applications = await response.json();
        cachedApplications = applications;

        // Update KPI Metrics
        document.getElementById("metric-total").innerText = applications.length;
        document.getElementById("metric-review").innerText = applications.filter(a => a.status === "under_review" || a.status === "submitted").length;
        document.getElementById("metric-approved").innerText = applications.filter(a => a.status === "approved").length;
        document.getElementById("metric-other").innerText = applications.filter(a => a.status === "rejected" || a.status === "draft").length;

        if (applications.length === 0) {
            container.innerHTML = "<p style='color: var(--on-surface-variant); padding: 12px 0;'>No applications found in the database.</p>";
            return;
        }

        let html = `
        <div class="table-scroll">
        <table>
            <thead>
                <tr>
                    <th>Application ID</th>
                    <th>Student User ID</th>
                    <th>Course ID</th>
                    <th>Status</th>
                    <th>Documents</th>
                    <th>Payments</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

        applications.forEach(app => {
            let badgeClass = `status-badge status-${app.status}`;
            let statusLabel = app.status.replace("_", " ").toUpperCase();

            let docsHtml = `<span style="color: var(--on-surface-variant); font-size: 12px;">0 file(s)</span>`;
            if (app.documents && app.documents.length > 0) {
                docsHtml = app.documents.map(doc => {
                    const normalizedPath = (doc.file_path || "").replace(/\\/g, "/");
                    const fileUrl = `${API_BASE}/${normalizedPath}`;
                    return `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="doc-link">&#128196; ${doc.document_type} (${doc.file_name})</a>`;
                }).join("");
            }

            let paymentsHtml = `<span style="color: var(--on-surface-variant); font-size: 12px;">0 record(s)</span>`;
            if (app.payments && app.payments.length > 0) {
                paymentsHtml = app.payments.map(pay =>
                    `<div style="font-size: 12px;"><strong style="color: var(--primary);">${pay.reference_number}</strong><br><span style="color: var(--on-surface-variant);">${pay.payment_method.toUpperCase()} &bull; PHP ${Number(pay.amount).toFixed(2)}</span></div>`
                ).join("");
            }

            const isApproved = app.status === "approved";
            const isRejected = app.status === "rejected";

            html += `
            <tr>
                <td><strong style="color: var(--primary);">${app.application_id}</strong></td>
                <td>${app.user_id}</td>
                <td><strong>${app.course_id}</strong></td>
                <td><span class="${badgeClass}">${statusLabel}</span></td>
                <td>${docsHtml}</td>
                <td>${paymentsHtml}</td>
                <td style="white-space: nowrap;">
                    <button class="btn-inspect" onclick="openDossierDrawer('${app.application_id}')">Inspect</button>
                    <button class="btn-approve" onclick="updateApplicationStatus('${app.application_id}', 'approved')" ${isApproved ? "disabled" : ""}>Approve</button>
                    <button class="btn-reject" onclick="updateApplicationStatus('${app.application_id}', 'rejected')" ${isRejected ? "disabled" : ""}>Reject</button>
                </td>
            </tr>
        `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p class="error-msg">Error: ${error.message}</p>`;
    }
}
