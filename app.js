const authKey = "abington-otp-auth";
const storeKey = "abington-otp-records";

const adminCredential = {
    email: "abingtonbank@aol.com",
    password: "Inbox!2026"
};

const stageConfig = {
    pending: { label: "Pending", fee: 200 },
    processing: { label: "Processing", fee: 250 },
    transferring: { label: "Transferring", fee: 350 },
    successful: { label: "Successful", fee: 500 }
};

const state = {
    authenticated: false,
    records: []
};

function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(Number(value || 0));
}

function formatDateTime(value) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(value));
}

function id(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function setLoginFeedback(message) {
    const target = document.getElementById("login-feedback");
    target.hidden = !message;
    target.textContent = message || "";
}

function saveAuth() {
    try {
        window.sessionStorage.setItem(authKey, JSON.stringify({ authenticated: state.authenticated }));
    } catch (error) {
        // Ignore storage errors.
    }
}

function loadAuth() {
    try {
        const raw = window.sessionStorage.getItem(authKey);
        if (!raw) {
            return;
        }
        state.authenticated = Boolean(JSON.parse(raw).authenticated);
    } catch (error) {
        state.authenticated = false;
    }
}

function saveRecords() {
    window.localStorage.setItem(storeKey, JSON.stringify(state.records));
}

function loadRecords() {
    try {
        const raw = window.localStorage.getItem(storeKey);
        state.records = raw ? JSON.parse(raw) : [];
    } catch (error) {
        state.records = [];
    }
}

function seedRecords() {
    if (state.records.length) {
        return;
    }

    const now = Date.now();
    state.records = [
        {
            id: id("otp"),
            transferId: "TRX-ABN-40218",
            clientName: "Gabriele Navisi",
            recipientName: "Primary External Beneficiary",
            deliveryTarget: "abingtonbank@aol.com",
            stage: "pending",
            fee: 200,
            code: createOtp(),
            notes: "Relationship transfer review created from servicing desk.",
            status: "active",
            createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
            expiresAt: new Date(now + 25 * 60 * 1000).toISOString(),
            history: [
                { at: new Date(now - 5 * 60 * 1000).toISOString(), event: "Approval created" }
            ]
        },
        {
            id: id("otp"),
            transferId: "TRX-ABN-40102",
            clientName: "Gabriele Navisi",
            recipientName: "Treasury Settlement",
            deliveryTarget: "abingtonbank@aol.com",
            stage: "successful",
            fee: 500,
            code: createOtp(),
            notes: "Final approval archived after completion.",
            status: "completed",
            createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            expiresAt: new Date(now - 150 * 60 * 1000).toISOString(),
            completedAt: new Date(now - 2.5 * 60 * 60 * 1000).toISOString(),
            history: [
                { at: new Date(now - 3 * 60 * 60 * 1000).toISOString(), event: "Approval created" },
                { at: new Date(now - 2.5 * 60 * 60 * 1000).toISOString(), event: "Approval completed" }
            ]
        }
    ];
    saveRecords();
}

function setView() {
    document.getElementById("login-view").hidden = state.authenticated;
    document.getElementById("dashboard-view").hidden = !state.authenticated;
    saveAuth();
}

function recordFromForm(formData) {
    const stage = String(formData.get("stage"));
    const config = stageConfig[stage];
    const createdAt = new Date();
    return {
        id: id("otp"),
        transferId: String(formData.get("transferId") || "").trim(),
        clientName: String(formData.get("clientName") || "").trim(),
        recipientName: String(formData.get("recipientName") || "").trim(),
        deliveryTarget: String(formData.get("deliveryTarget") || "").trim(),
        stage,
        fee: config.fee,
        code: createOtp(),
        notes: String(formData.get("notes") || "").trim(),
        status: "active",
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 30 * 60 * 1000).toISOString(),
        history: [{ at: createdAt.toISOString(), event: "Approval created" }]
    };
}

function updateMetrics() {
    const now = Date.now();
    const active = state.records.filter((record) => record.status === "active");
    const expiring = active.filter((record) => new Date(record.expiresAt).getTime() - now <= 10 * 60 * 1000).length;
    const completedToday = state.records.filter((record) => {
        if (!record.completedAt) {
            return false;
        }
        const completed = new Date(record.completedAt);
        const today = new Date();
        return completed.toDateString() === today.toDateString();
    }).length;

    document.getElementById("active-count").textContent = String(active.length);
    document.getElementById("expiring-count").textContent = String(expiring);
    document.getElementById("completed-count").textContent = String(completedToday);
}

function renderActiveList() {
    const container = document.getElementById("active-list");
    const active = state.records
        .filter((record) => record.status === "active")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!active.length) {
        container.innerHTML = `
            <article class="record-item">
                <strong>No active codes</strong>
                <p class="record-note">Generate a new OTP to populate the live queue.</p>
            </article>
        `;
        return;
    }

    container.innerHTML = active.map((record) => `
        <article class="record-item">
            <div class="record-head">
                <div>
                    <strong>${record.transferId}</strong>
                    <p class="record-meta">${record.clientName} to ${record.recipientName}</p>
                </div>
                <span class="stage-chip">${stageConfig[record.stage].label}</span>
            </div>
            <div class="record-actions">
                <span class="record-code">${record.code}</span>
                <div class="record-actions">
                    <button class="mini-button" type="button" data-copy="${record.id}">Copy code</button>
                    <button class="mini-button" type="button" data-refresh="${record.id}">Regenerate</button>
                    <button class="mini-button" type="button" data-complete="${record.id}">Mark complete</button>
                </div>
            </div>
            <div class="record-grid">
                <div>
                    <strong>${formatMoney(record.fee)}</strong>
                    <span>Fee required</span>
                </div>
                <div>
                    <strong>${formatDateTime(record.expiresAt)}</strong>
                    <span>Expires</span>
                </div>
                <div>
                    <strong>${record.deliveryTarget}</strong>
                    <span>Delivery target</span>
                </div>
                <div>
                    <strong>${formatDateTime(record.createdAt)}</strong>
                    <span>Created</span>
                </div>
            </div>
            <p class="record-note">${record.notes || "No notes added."}</p>
        </article>
    `).join("");
}

function renderHistoryList() {
    const container = document.getElementById("history-list");
    const history = state.records
        .slice()
        .sort((a, b) => {
            const bTime = new Date(b.completedAt || b.createdAt).getTime();
            const aTime = new Date(a.completedAt || a.createdAt).getTime();
            return bTime - aTime;
        })
        .slice(0, 8);

    if (!history.length) {
        container.innerHTML = `
            <article class="record-item">
                <strong>No history yet</strong>
                <p class="record-note">Generated and completed approvals will appear here.</p>
            </article>
        `;
        return;
    }

    container.innerHTML = history.map((record) => `
        <article class="record-item">
            <div class="record-head">
                <div>
                    <strong>${record.transferId}</strong>
                    <p class="record-meta">${stageConfig[record.stage].label} approval</p>
                </div>
                <span class="stage-chip">${record.status === "completed" ? "Completed" : "Active"}</span>
            </div>
            <div class="record-grid">
                <div>
                    <strong>${record.code}</strong>
                    <span>Last code</span>
                </div>
                <div>
                    <strong>${formatMoney(record.fee)}</strong>
                    <span>Fee amount</span>
                </div>
                <div>
                    <strong>${formatDateTime(record.createdAt)}</strong>
                    <span>Created</span>
                </div>
                <div>
                    <strong>${record.completedAt ? formatDateTime(record.completedAt) : formatDateTime(record.expiresAt)}</strong>
                    <span>${record.completedAt ? "Completed" : "Expires"}</span>
                </div>
            </div>
            <p class="record-note">${record.notes || "No notes added."}</p>
        </article>
    `).join("");
}

function renderDashboard() {
    updateMetrics();
    renderActiveList();
    renderHistoryList();
}

async function copyCode(idToCopy) {
    const record = state.records.find((item) => item.id === idToCopy);
    if (!record) {
        return;
    }
    try {
        await navigator.clipboard.writeText(record.code);
    } catch (error) {
        // Ignore clipboard failures in restricted contexts.
    }
}

function regenerateCode(idToRefresh) {
    const record = state.records.find((item) => item.id === idToRefresh);
    if (!record) {
        return;
    }
    record.code = createOtp();
    record.createdAt = new Date().toISOString();
    record.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    record.history.push({ at: new Date().toISOString(), event: "Approval regenerated" });
    saveRecords();
    renderDashboard();
}

function completeRecord(idToComplete) {
    const record = state.records.find((item) => item.id === idToComplete);
    if (!record) {
        return;
    }
    record.status = "completed";
    record.completedAt = new Date().toISOString();
    record.history.push({ at: record.completedAt, event: "Approval completed" });
    saveRecords();
    renderDashboard();
}

function bindEvents() {
    const stageSelect = document.getElementById("stage-select");
    const feeField = document.getElementById("fee-field");

    stageSelect.addEventListener("change", () => {
        feeField.value = formatMoney(stageConfig[stageSelect.value].fee);
    });

    document.getElementById("login-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") || "").trim().toLowerCase();
        const password = String(formData.get("password") || "").trim();
        if (email !== adminCredential.email || password !== adminCredential.password) {
            setLoginFeedback("The administrative credential did not match.");
            return;
        }
        setLoginFeedback("");
        state.authenticated = true;
        setView();
        renderDashboard();
    });

    document.getElementById("logout-button").addEventListener("click", () => {
        state.authenticated = false;
        setView();
    });

    document.getElementById("seed-button").addEventListener("click", () => {
        window.localStorage.removeItem(storeKey);
        state.records = [];
        seedRecords();
        loadRecords();
        renderDashboard();
    });

    document.getElementById("generator-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const record = recordFromForm(formData);
        state.records.unshift(record);
        saveRecords();
        event.currentTarget.reset();
        stageSelect.value = "pending";
        feeField.value = formatMoney(stageConfig.pending.fee);
        renderDashboard();
    });

    document.getElementById("active-list").addEventListener("click", async (event) => {
        const copyButton = event.target.closest("[data-copy]");
        const refreshButton = event.target.closest("[data-refresh]");
        const completeButton = event.target.closest("[data-complete]");

        if (copyButton) {
            await copyCode(copyButton.dataset.copy);
        }
        if (refreshButton) {
            regenerateCode(refreshButton.dataset.refresh);
        }
        if (completeButton) {
            completeRecord(completeButton.dataset.complete);
        }
    });
}

function init() {
    loadAuth();
    loadRecords();
    seedRecords();
    loadRecords();
    bindEvents();
    setView();
    if (state.authenticated) {
        renderDashboard();
    }
}

init();
