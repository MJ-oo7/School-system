const API_BASE = "http://127.0.0.1:8000";

let currentStudent = {
    userId: null,
    fullName: null,
    email: null
};

window.onload = function () {
    const savedUserId = localStorage.getItem("student_user_id");
    const savedName = localStorage.getItem("student_name");

    if (savedUserId) {
        currentStudent.userId = savedUserId;
        currentStudent.fullName = savedName || "Student";
        switchView("dashboard");
    }
};

function switchView(viewName) {
    document.getElementById("auth-view").classList.remove("active");
    document.getElementById("dashboard-view").classList.remove("active");
    const adminLink = document.getElementById("admin-portal-link");

    if (viewName === "dashboard") {
        if (adminLink) adminLink.style.display = "none";
        document.getElementById("dashboard-view").classList.add("active");
        document.getElementById("welcome-user-text").innerText = `Welcome, ${currentStudent.fullName}`;
        document.getElementById("session-user-id").innerText = currentStudent.userId;
    } else {
        if (adminLink) adminLink.style.display = "inline-block";
        document.getElementById("auth-view").classList.add("active");
    }
}

async function loginStudent() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const resultDiv = document.getElementById("login-result");
    resultDiv.innerHTML = "";

    if (!email || !password) {
        resultDiv.innerHTML = "<p class='error-msg'>Please enter your email and password.</p>";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, user_password: password })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Invalid email or password.");
        }

        const data = await response.json();
        currentStudent.userId = data.user_id;
        currentStudent.fullName = data.full_name;
        currentStudent.email = data.email;

        localStorage.setItem("student_user_id", data.user_id);
        localStorage.setItem("student_name", data.full_name);

        switchView("dashboard");

    } catch (error) {
        resultDiv.innerHTML = "<p class='error-msg'>Error: " + error.message + "</p>";
    }
}

function logoutStudent() {
    currentStudent = { userId: null, fullName: null, email: null };
    localStorage.removeItem("student_user_id");
    localStorage.removeItem("student_name");
    localStorage.removeItem("student_application_id");
    sessionStorage.removeItem("enrollment_wizard_step");
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
    switchView("auth");
}
