// Prevent VS Code Live Server from force-reloading the page when uploaded files
// or SQLite database files are written inside the project folder during enrollment.
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

// This wizard is operated by an authenticated admissions officer on behalf of a student.
const ENROLL_APP_KEY = "admin_enroll_application_id";

let sessionData = {
    userId: sessionStorage.getItem("enroll_target_user_id"),
    fullName: sessionStorage.getItem("enroll_target_name"),
    applicationId: sessionStorage.getItem(ENROLL_APP_KEY)
};

function exitToAdminPortal() {
    sessionStorage.removeItem(ENROLL_APP_KEY);
    sessionStorage.removeItem("enrollment_wizard_step");
    sessionStorage.removeItem("enroll_target_user_id");
    sessionStorage.removeItem("enroll_target_name");
    window.location.href = "admin.html";
}

let uploadedDocs = {
    reportCard: null,
    birthCert: null
};

let currentWizardStep = "step-programs";

function selectPaymentCard(methodValue) {
    const selectEl = document.getElementById("pay-method");
    if (selectEl) selectEl.value = methodValue;
    document.querySelectorAll(".payment-card").forEach(card => card.classList.remove("selected"));
    const activeCard = document.getElementById(`card-${methodValue}`);
    if (activeCard) activeCard.classList.add("selected");
}

function updateStepperUI(stepId) {
    const s1 = document.getElementById("indicator-step-1");
    const s2 = document.getElementById("indicator-step-2");
    const s3 = document.getElementById("indicator-step-3");
    const b1 = document.getElementById("badge-step-1");
    const b2 = document.getElementById("badge-step-2");
    const b3 = document.getElementById("badge-step-3");

    [s1, s2, s3].forEach(el => el.classList.remove("active-step", "completed-step"));

    if (stepId === "step-programs") {
        s1.classList.add("active-step");
        b1.innerHTML = "1";
        b2.innerHTML = "2";
        b3.innerHTML = "3";
    } else if (stepId === "step-documents") {
        s1.classList.add("completed-step");
        b1.innerHTML = "&#10003;";
        s2.classList.add("active-step");
        b2.innerHTML = "2";
        b3.innerHTML = "3";
    } else if (stepId === "step-payment") {
        s1.classList.add("completed-step");
        b1.innerHTML = "&#10003;";
        s2.classList.add("completed-step");
        b2.innerHTML = "&#10003;";
        s3.classList.add("active-step");
        b3.innerHTML = "3";
    }
}

window.onload = async function () {
    if (!sessionData.userId) {
        alert("Please select a student to enroll from the Admissions Officer Portal.");
        window.location.href = "admin.html";
        return;
    }
    document.getElementById("display-user-badge").innerText =
        `Enrolling: ${sessionData.fullName ? sessionData.fullName + " (" + sessionData.userId + ")" : sessionData.userId}`;

    // Always load programs list so students can choose or change programs freely
    await loadProgramsForEnrollment();

    // If an application ID is stored, verify it and restore the active wizard step
    if (sessionData.applicationId) {
        const isValidDraft = await syncExistingApplication(sessionData.applicationId);
        if (isValidDraft) {
            const savedStep = sessionStorage.getItem("enrollment_wizard_step");
            if (uploadedDocs.reportCard && uploadedDocs.birthCert) {
                if (savedStep === "step-programs" || savedStep === "step-documents") {
                    showStep(savedStep);
                } else {
                    showStep("step-payment");
                }
            } else if (savedStep === "step-programs") {
                showStep("step-programs");
            } else {
                showStep("step-documents");
            }
        }
    }
};

async function syncExistingApplication(applicationId) {
    try {
        const response = await fetch(`${API_BASE}/applications/${applicationId}`);
        if (!response.ok) {
            clearActiveApplication();
            return false;
        }
        const appData = await response.json();
        if (appData.user_id !== sessionData.userId || appData.status !== "draft") {
            clearActiveApplication();
            return false;
        }

        document.getElementById("active-app-id").innerText = appData.application_id;
        uploadedDocs = { reportCard: null, birthCert: null };
        document.getElementById("status-report-card").innerHTML = "";
        document.getElementById("status-birth-cert").innerHTML = "";
        const trackReport = document.getElementById("progress-track-report");
        const trackBirth = document.getElementById("progress-track-birth");
        if (trackReport) trackReport.style.display = "none";
        if (trackBirth) trackBirth.style.display = "none";

        if (appData.documents && appData.documents.length > 0) {
            appData.documents.forEach(doc => {
                if (doc.document_type === "Report Card") {
                    uploadedDocs.reportCard = doc.file_name;
                    document.getElementById("status-report-card").innerHTML =
                        `<p class='success-msg'>&#10003; Uploaded (${doc.file_name}). Select a new file above only if you wish to replace it.</p>`;
                } else if (doc.document_type === "Birth Certificate") {
                    uploadedDocs.birthCert = doc.file_name;
                    document.getElementById("status-birth-cert").innerHTML =
                        `<p class='success-msg'>&#10003; Uploaded (${doc.file_name}). Select a new file above only if you wish to replace it.</p>`;
                }
            });
        }
        return true;
    } catch (e) {
        clearActiveApplication();
        return false;
    }
}

function clearActiveApplication() {
    sessionStorage.removeItem(ENROLL_APP_KEY);
    sessionStorage.removeItem("enrollment_wizard_step");
    sessionData.applicationId = null;
    uploadedDocs = { reportCard: null, birthCert: null };
    document.getElementById("active-app-id").innerText = "";
}

function showStep(stepId) {
    document.querySelectorAll(".wizard-step").forEach(el => el.classList.remove("active"));
    document.getElementById(stepId).classList.add("active");
    currentWizardStep = stepId;
    sessionStorage.setItem("enrollment_wizard_step", stepId);
    updateStepperUI(stepId);
}

function undoStep() {
    if (currentWizardStep === "step-payment") {
        showStep("step-documents");
    } else if (currentWizardStep === "step-documents") {
        showStep("step-programs");
    } else {
        exitToAdminPortal();
    }
}

async function loadProgramsForEnrollment() {
    const container = document.getElementById("programs-list-container");
    container.innerHTML = "<p style='color: var(--on-surface-variant);'>Loading active programs...</p>";

    try {
        const response = await fetch(`${API_BASE}/programs/`);
        if (!response.ok) throw new Error("Failed to load programs.");
        const programs = await response.json();

        if (programs.length === 0) {
            container.innerHTML = "<p style='color: var(--on-surface-variant);'>No active academic programs available at the moment.</p>";
            return;
        }

        let html = "";
        programs.forEach(prog => {
            html += `
                <div class="program-card">
                    <div>
                        <span class="program-code-pill">${prog.course_id}</span>
                        <h4 style="margin: 0 0 4px 0; font-family: 'Source Serif 4', Georgia, serif; font-size: 18px; color: var(--primary);">${prog.course_name}</h4>
                        <span style="font-size: 13px; color: var(--on-surface-variant);">Academic Year: <strong>${prog.academic_year}</strong></span>
                    </div>
                    <button type="button" onclick="joinProgram('${prog.course_id}')" style="width: auto; margin-top: 0; padding: 10px 20px;">Select Program &rarr;</button>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

async function joinProgram(courseId) {
    const errorDiv = document.getElementById("program-error");
    errorDiv.innerHTML = "";

    try {
        const payload = {
            user_id: sessionData.userId,
            course_id: courseId
        };
        if (sessionData.applicationId) {
            payload.application_id = sessionData.applicationId;
        }

        const response = await fetch(`${API_BASE}/applications/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to create application.");
        }

        const data = await response.json();
        sessionData.applicationId = data.application_id;
        sessionStorage.setItem(ENROLL_APP_KEY, data.application_id);
        document.getElementById("active-app-id").innerText = data.application_id;

        // Clear file inputs and sync existing uploaded documents for this draft
        document.getElementById("file-report-card").value = "";
        document.getElementById("file-birth-cert").value = "";
        document.getElementById("doc-validation-error").innerHTML = "";
        await syncExistingApplication(data.application_id);

        showStep("step-documents");

    } catch (error) {
        errorDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

async function uploadSingleFile(docType, file, statusDivId) {
    const statusDiv = document.getElementById(statusDivId);
    const isReport = docType === "Report Card";
    const trackEl = document.getElementById(isReport ? "progress-track-report" : "progress-track-birth");
    const barEl = document.getElementById(isReport ? "progress-bar-report" : "progress-bar-birth");

    if (trackEl && barEl) {
        trackEl.style.display = "block";
        barEl.style.width = "45%";
    }

    const formData = new FormData();
    formData.append("application_id", sessionData.applicationId);
    formData.append("document_type", docType);
    formData.append("file", file);

    statusDiv.innerHTML = "<p style='color: var(--on-surface-variant); font-size: 12px;'>Uploading document to admissions vault...</p>";
    const response = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        if (trackEl && barEl) {
            barEl.style.width = "0%";
            trackEl.style.display = "none";
        }
        let errorMsg = `Failed to upload ${docType}.`;
        try {
            const err = await response.json();
            if (typeof err.detail === "string") {
                errorMsg = err.detail;
            } else if (Array.isArray(err.detail)) {
                errorMsg = err.detail.map(e => typeof e === 'string' ? e : (e.msg || JSON.stringify(e))).join(', ');
            } else if (err.detail && typeof err.detail === 'object') {
                errorMsg = err.detail.msg || JSON.stringify(err.detail);
            }
        } catch (e) {
            const textErr = await response.text();
            if (textErr) errorMsg = textErr;
        }
        throw new Error(errorMsg);
    }

    const data = await response.json();
    if (trackEl && barEl) {
        barEl.style.width = "100%";
    }
    if (docType === "Report Card") {
        uploadedDocs.reportCard = data.file_name;
        document.getElementById("file-report-card").value = "";
    } else if (docType === "Birth Certificate") {
        uploadedDocs.birthCert = data.file_name;
        document.getElementById("file-birth-cert").value = "";
    }
    statusDiv.innerHTML = `<p class='success-msg'>&#10003; Uploaded successfully (${data.file_name})!</p>`;
    return true;
}

async function validateAndProceedToPayment() {
    const errorDiv = document.getElementById("doc-validation-error");
    errorDiv.innerText = "";

    const reportCardInput = document.getElementById("file-report-card");
    const birthCertInput = document.getElementById("file-birth-cert");

    if (!sessionData.applicationId) {
        errorDiv.innerHTML = "<p class='error-msg'>Application ID not found. Please go back and select a program first.</p>";
        return;
    }

    const hasNewReportCard = reportCardInput.files.length > 0;
    const hasNewBirthCert = birthCertInput.files.length > 0;

    if ((!hasNewReportCard && !uploadedDocs.reportCard) || (!hasNewBirthCert && !uploadedDocs.birthCert)) {
        errorDiv.innerHTML = "<p class='error-msg'>Please provide both required documents (Report Card and Birth Certificate).</p>";
        return;
    }

    try {
        // Pre-set target step in sessionStorage in case a dev server reloads the page upon file save
        sessionStorage.setItem("enrollment_wizard_step", "step-payment");

        const uploadTasks = [];
        if (hasNewReportCard) {
            uploadTasks.push(uploadSingleFile("Report Card", reportCardInput.files[0], "status-report-card"));
        }
        if (hasNewBirthCert) {
            uploadTasks.push(uploadSingleFile("Birth Certificate", birthCertInput.files[0], "status-birth-cert"));
        }

        if (uploadTasks.length > 0) {
            errorDiv.innerHTML = "<p style='color: var(--on-surface-variant);'>Uploading documents...</p>";
            await Promise.all(uploadTasks);
        }

        errorDiv.innerHTML = "";
        showStep("step-payment");

    } catch (error) {
        sessionStorage.setItem("enrollment_wizard_step", "step-documents");
        if (error.message.includes("Application ID not found")) {
            clearActiveApplication();
        }
        errorDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}

async function submitPayment() {
    const method = document.getElementById("pay-method").value;
    const resultDiv = document.getElementById("payment-result");
    resultDiv.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE}/payments/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                application_id: sessionData.applicationId,
                amount: 500.00,
                payment_method: method
            })
        });

        if (!response.ok) {
            const err = await response.json();
            let errorMsg = "Payment processing failed.";

            if (typeof err.detail === "string") {
                errorMsg = err.detail;
            } else if (Array.isArray(err.detail)) {
                errorMsg = err.detail.map(e => typeof e === 'string' ? e : (e.msg || JSON.stringify(e))).join(', ');
            } else if (err.detail && typeof err.detail === 'object') {
                errorMsg = err.detail.msg || JSON.stringify(err.detail);
            }

            throw new Error(errorMsg);
        }

        const data = await response.json();
        resultDiv.innerHTML = `<p class='success-msg'>&#10003; Payment confirmed! Official Receipt Reference: <strong>${data.reference_number}</strong>. Redirecting to Admissions Officer Portal...</p>`;

        setTimeout(() => {
            exitToAdminPortal();
        }, 1500);

    } catch (error) {
        resultDiv.innerHTML = `<p class='error-msg'>Error: ${error.message}</p>`;
    }
}
