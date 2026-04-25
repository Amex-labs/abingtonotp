const authKey = "abington-otp-auth";
const sourceKey = "abington-otp-source";
const defaultSourceUrl = "https://abingtonbank.onrender.com";
const jsonpTimeoutMs = 12000;
let jsonpSequence = 0;

const adminCredential = {
    email: "abingtonbank@aol.com",
    password: "Inbox!2026"
};

const state = {
    authenticated: false,
    sourceUrl: defaultSourceUrl,
    sessions: [],
    inboxTarget: adminCredential.email,
    serverStartedAt: "",
    sessionCount: 0,
    loading: false,
    error: "",
    lastLoadedAt: "",
    sourceFeedback: ""
};

function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(Number(value || 0));
}

function formatDateTime(value) {
    if (!value) {
        return "Not available";
    }
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(value));
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function titleCaseStatus(status) {
    return String(status || "")
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (character) => character.toUpperCase());
}

function normalizeBaseUrl(value) {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "");
}

function buildApiUrl(pathname) {
    const baseUrl = normalizeBaseUrl(state.sourceUrl || defaultSourceUrl);
    return new URL(pathname, `${baseUrl}/`).toString();
}

function buildApiRequestUrl(pathname, params = {}) {
    const url = new URL(buildApiUrl(pathname));
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
            return;
        }
        url.searchParams.set(key, String(value));
    });
    return url;
}

function toAbsoluteUrl(possiblyRelativeUrl) {
    if (!possiblyRelativeUrl) {
        return "#";
    }
    try {
        return new URL(possiblyRelativeUrl, `${normalizeBaseUrl(state.sourceUrl || defaultSourceUrl)}/`).toString();
    } catch (error) {
        return "#";
    }
}

async function readJsonResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "The approval inbox could not be loaded.");
    }
    return payload;
}

function loadJsonp(pathname, params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = `__abingtonOtpJsonp_${Date.now()}_${jsonpSequence += 1}`;
        const script = document.createElement("script");
        const requestUrl = buildApiRequestUrl(pathname, params);
        requestUrl.searchParams.set("callback", callbackName);

        const cleanup = () => {
            window.clearTimeout(timeoutId);
            delete window[callbackName];
            script.remove();
        };

        window[callbackName] = (payload) => {
            cleanup();
            if (!payload || payload.ok === false) {
                reject(new Error(payload?.error || "The approval inbox could not be loaded."));
                return;
            }
            resolve(payload);
        };

        const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error("The bank backend did not answer the live inbox request in time."));
        }, jsonpTimeoutMs);

        script.async = true;
        script.src = requestUrl.toString();
        script.onerror = () => {
            cleanup();
            reject(new Error("The bank backend could not be reached from the OTP desk."));
        };

        document.head.appendChild(script);
    });
}

function setLoginFeedback(message) {
    const target = document.getElementById("login-feedback");
    target.hidden = !message;
    target.textContent = message || "";
}

function setSourceFeedback(message) {
    const target = document.getElementById("source-feedback");
    if (!target) {
        return;
    }
    target.textContent = message || "Christian and Gabriele approvals appear together here when the bank site issues them.";
}

function bindPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        if (button.dataset.passwordToggleBound === "true") {
            return;
        }
        const field = button.closest(".password-field");
        const input = field?.querySelector("input");
        const label = button.querySelector("[data-password-toggle-text]");
        if (!input) {
            return;
        }

        const setVisible = (visible) => {
            input.type = visible ? "text" : "password";
            button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
            button.setAttribute("aria-pressed", String(visible));
            if (label) {
                label.textContent = visible ? "Hide" : "Show";
            }
        };

        setVisible(false);
        button.addEventListener("click", () => {
            setVisible(input.type === "password");
        });
        button.dataset.passwordToggleBound = "true";
    });
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

function saveSource() {
    try {
        window.localStorage.setItem(sourceKey, JSON.stringify({ sourceUrl: state.sourceUrl }));
    } catch (error) {
        // Ignore storage errors.
    }
}

function loadSource() {
    try {
        const raw = window.localStorage.getItem(sourceKey);
        if (!raw) {
            return;
        }
        const saved = JSON.parse(raw);
        if (saved.sourceUrl) {
            state.sourceUrl = normalizeBaseUrl(saved.sourceUrl);
        }
    } catch (error) {
        state.sourceUrl = defaultSourceUrl;
    }
}

function setView() {
    document.getElementById("login-view").hidden = state.authenticated;
    document.getElementById("dashboard-view").hidden = !state.authenticated;
    saveAuth();
}

function getSessionTimestamp(session) {
    return session.activeChallenge?.createdAt
        || session.lastReceiptDelivery?.generatedAt
        || session.challengeHistory?.[0]?.createdAt
        || "";
}

function getSortedSessions() {
    return state.sessions
        .slice()
        .sort((left, right) => getSessionTimestamp(right).localeCompare(getSessionTimestamp(left)));
}

function updateMetrics() {
    const now = Date.now();
    const active = state.sessions.filter((session) => session.activeChallenge);
    const expiring = active.filter((session) => {
        const expiresAt = new Date(session.activeChallenge.expiresAt).getTime();
        return Number.isFinite(expiresAt) && expiresAt - now <= 10 * 60 * 1000;
    }).length;
    const archived = state.sessions.filter((session) => !session.activeChallenge && session.challengeHistory?.length).length;

    document.getElementById("active-count").textContent = String(active.length);
    document.getElementById("expiring-count").textContent = String(expiring);
    document.getElementById("completed-count").textContent = String(archived);
}

function renderConnectionPanel() {
    const sourceUrlInput = document.getElementById("source-url-input");
    const sourceStatusChip = document.getElementById("source-status-chip");
    const inboxTarget = document.getElementById("inbox-target");
    const lastLoaded = document.getElementById("last-loaded");
    const sessionCount = document.getElementById("session-count");
    const connectionNote = document.getElementById("connection-note");
    const refreshButton = document.getElementById("refresh-button");

    if (sourceUrlInput) {
        sourceUrlInput.value = state.sourceUrl;
    }

    if (sourceStatusChip) {
        if (state.loading) {
            sourceStatusChip.textContent = "Syncing";
        } else if (state.error) {
            sourceStatusChip.textContent = "Offline";
        } else {
            sourceStatusChip.textContent = "Connected";
        }
    }

    if (inboxTarget) {
        inboxTarget.textContent = state.inboxTarget;
    }
    if (lastLoaded) {
        lastLoaded.textContent = state.lastLoadedAt ? formatDateTime(state.lastLoadedAt) : "Waiting";
    }
    if (sessionCount) {
        sessionCount.textContent = String(state.sessionCount);
    }
    if (connectionNote) {
        connectionNote.textContent = state.error
            ? state.error
            : state.serverStartedAt
                ? `Bank feed online since ${formatDateTime(state.serverStartedAt)}`
                : "Connected to the live bank approval feed.";
    }
    if (refreshButton) {
        refreshButton.disabled = state.loading;
        refreshButton.textContent = state.loading ? "Refreshing..." : "Refresh queue";
    }

    setSourceFeedback(state.sourceFeedback);
}

function renderActiveList() {
    const container = document.getElementById("active-list");
    const active = getSortedSessions().filter((session) => session.activeChallenge);

    if (!active.length) {
        container.innerHTML = `
            <article class="record-item">
                <strong>No active codes</strong>
                <p class="record-note">When Gabriele or Christian submits a protected transfer, the live approval code will appear here.</p>
            </article>
        `;
        return;
    }

    container.innerHTML = active.map((session) => `
        <article class="record-item">
            <div class="record-head">
                <div>
                    <strong>${escapeHtml(session.clientName || "Relationship account")}</strong>
                    <p class="record-meta">${escapeHtml(session.destinationLabel)} • ${escapeHtml(session.railLabel)}</p>
                </div>
                <span class="stage-chip">${escapeHtml(titleCaseStatus(session.activeChallenge.stage))}</span>
            </div>
            <div class="record-actions">
                <span class="record-code">${escapeHtml(session.activeChallenge.preview?.previewCode || "------")}</span>
                <div class="record-actions">
                    <button class="mini-button" type="button" data-copy-transfer="${escapeHtml(session.transferId)}">Copy code</button>
                    <button class="mini-button" type="button" data-refresh-transfer="${escapeHtml(session.transferId)}" ${state.loading ? "disabled" : ""}>Regenerate</button>
                    <a class="mini-button mini-button--link" href="${escapeHtml(toAbsoluteUrl(session.activeChallenge.preview?.fileUrl))}" target="_blank" rel="noreferrer">Open preview</a>
                </div>
            </div>
            <div class="record-grid">
                <div>
                    <strong>${formatMoney(session.activeChallenge.reviewAmount)}</strong>
                    <span>Fee required</span>
                </div>
                <div>
                    <strong>${formatDateTime(session.activeChallenge.expiresAt)}</strong>
                    <span>Expires</span>
                </div>
                <div>
                    <strong>${formatMoney(session.amount)}</strong>
                    <span>Transfer amount</span>
                </div>
                <div>
                    <strong>${escapeHtml(session.approvalRecipient || state.inboxTarget)}</strong>
                    <span>Inbox target</span>
                </div>
            </div>
            <p class="record-note">${escapeHtml(session.receiptId || session.transferId)} • ${escapeHtml(session.clientName || "Relationship account")} approval is waiting for verification.</p>
        </article>
    `).join("");
}

function renderHistoryList() {
    const container = document.getElementById("history-list");
    const sessions = getSortedSessions().slice(0, 8);

    if (!sessions.length) {
        container.innerHTML = `
            <article class="record-item">
                <strong>No history yet</strong>
                <p class="record-note">The approval desk will show issued and archived transfer sessions once the bank site creates them.</p>
            </article>
        `;
        return;
    }

    container.innerHTML = sessions.map((session) => {
        const stage = titleCaseStatus(session.activeChallenge?.stage || session.challengeHistory?.[0]?.stage || "archived");
        const statusLabel = session.activeChallenge ? "Active" : "Archived";
        const previewLink = session.activeChallenge?.preview?.fileUrl
            ? `<a class="mini-button mini-button--link" href="${escapeHtml(toAbsoluteUrl(session.activeChallenge.preview.fileUrl))}" target="_blank" rel="noreferrer">Open preview</a>`
            : "";
        const receiptLink = session.lastReceiptDelivery?.emailPreviewUrl
            ? `<a class="mini-button mini-button--link" href="${escapeHtml(toAbsoluteUrl(session.lastReceiptDelivery.emailPreviewUrl))}" target="_blank" rel="noreferrer">Open receipt</a>`
            : "";

        return `
            <article class="record-item">
                <div class="record-head">
                    <div>
                        <strong>${escapeHtml(session.clientName || "Relationship account")}</strong>
                        <p class="record-meta">${escapeHtml(session.destinationLabel)} • ${escapeHtml(session.railLabel)}</p>
                    </div>
                    <span class="stage-chip">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="record-grid">
                    <div>
                        <strong>${formatMoney(session.amount)}</strong>
                        <span>Transfer amount</span>
                    </div>
                    <div>
                        <strong>${escapeHtml(stage)}</strong>
                        <span>Latest stage</span>
                    </div>
                    <div>
                        <strong>${formatDateTime(getSessionTimestamp(session))}</strong>
                        <span>Last update</span>
                    </div>
                    <div>
                        <strong>${escapeHtml(session.receiptId || session.transferId)}</strong>
                        <span>Reference</span>
                    </div>
                </div>
                <p class="record-note">${session.activeChallenge ? "Awaiting live code verification in the connected bank inbox." : "Recent approval session archived from the connected bank inbox."}</p>
                <div class="record-actions">
                    ${previewLink}
                    ${receiptLink}
                </div>
            </article>
        `;
    }).join("");
}

function renderDashboard() {
    renderConnectionPanel();
    updateMetrics();
    renderActiveList();
    renderHistoryList();
}

function applyInboxPayload(payload, sourceMessage) {
    state.sessions = payload.sessions || [];
    state.inboxTarget = payload.inboxTarget || adminCredential.email;
    state.serverStartedAt = payload.serverStartedAt || "";
    state.sessionCount = payload.sessionCount || state.sessions.length;
    state.lastLoadedAt = new Date().toISOString();
    state.sourceFeedback = sourceMessage || "Connected to the live Abington Bank approval queue.";
}

async function refreshDashboard() {
    state.loading = true;
    state.error = "";
    renderDashboard();

    try {
        const response = await fetch(buildApiUrl("/api/inbox/overview"), {
            method: "GET",
            cache: "no-store"
        });
        applyInboxPayload(await readJsonResponse(response));
    } catch (fetchError) {
        try {
            applyInboxPayload(
                await loadJsonp("/api/inbox/overview"),
                "Connected to the live Abington Bank approval queue through the compatibility bridge."
            );
            state.error = "";
        } catch (jsonpError) {
            state.error = jsonpError instanceof Error ? jsonpError.message : String(jsonpError);
            state.sessions = [];
            state.sessionCount = 0;
            state.sourceFeedback = "The OTP desk could not reach the bank backend. Refresh the bank deployment or verify the source URL.";
        }
    } finally {
        state.loading = false;
        renderDashboard();
    }
}

async function copyCode(transferId) {
    const session = state.sessions.find((item) => item.transferId === transferId);
    const code = session?.activeChallenge?.preview?.previewCode;
    if (!code) {
        return;
    }
    try {
        await navigator.clipboard.writeText(code);
        state.sourceFeedback = `Copied the latest code for ${session.clientName || session.transferId}.`;
    } catch (error) {
        state.sourceFeedback = "Clipboard access is unavailable in this browser.";
    }
    renderConnectionPanel();
}

async function regenerateCode(transferId) {
    state.loading = true;
    state.error = "";
    renderDashboard();

    try {
        const response = await fetch(buildApiUrl("/api/inbox/regenerate-otp"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ transferId })
        });
        await readJsonResponse(response);
        state.sourceFeedback = "A fresh OTP code was issued from the live bank inbox.";
    } catch (fetchError) {
        try {
            await loadJsonp("/api/inbox/regenerate-otp", { transferId });
            state.error = "";
            state.sourceFeedback = "A fresh OTP code was issued from the live bank inbox.";
        } catch (jsonpError) {
            state.error = jsonpError instanceof Error ? jsonpError.message : String(jsonpError);
            state.sourceFeedback = "The bank backend could not regenerate the OTP code.";
        }
    } finally {
        await refreshDashboard();
    }
}

function bindEvents() {
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
        refreshDashboard().catch(() => {
            // Errors are handled in refreshDashboard.
        });
    });

    document.getElementById("logout-button").addEventListener("click", () => {
        state.authenticated = false;
        state.error = "";
        state.sourceFeedback = "";
        setView();
    });

    document.getElementById("refresh-button").addEventListener("click", () => {
        refreshDashboard().catch(() => {
            // Errors are handled in refreshDashboard.
        });
    });

    document.getElementById("source-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const sourceUrl = normalizeBaseUrl(formData.get("sourceUrl"));
        if (!sourceUrl) {
            state.sourceFeedback = "Enter a valid bank backend URL before saving.";
            renderConnectionPanel();
            return;
        }
        state.sourceUrl = sourceUrl;
        saveSource();
        state.sourceFeedback = "Bank source updated. Refreshing the live approval queue now.";
        refreshDashboard().catch(() => {
            // Errors are handled in refreshDashboard.
        });
    });

    document.getElementById("active-list").addEventListener("click", async (event) => {
        const copyButton = event.target.closest("[data-copy-transfer]");
        const refreshButton = event.target.closest("[data-refresh-transfer]");

        if (copyButton) {
            await copyCode(copyButton.dataset.copyTransfer);
        }
        if (refreshButton) {
            await regenerateCode(refreshButton.dataset.refreshTransfer);
        }
    });
}

function init() {
    loadAuth();
    loadSource();
    bindPasswordToggles();
    bindEvents();
    setView();
    if (state.authenticated) {
        refreshDashboard().catch(() => {
            // Errors are handled in refreshDashboard.
        });
    }
}

init();
