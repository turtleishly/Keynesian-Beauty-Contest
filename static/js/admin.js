// Keynesian Beauty Contest - Admin Dashboard Logic with Password Protection

const POLL_INTERVAL_MS = 1500;
let pollTimer = null;
let currentPhase = null;
let adminPassword = sessionStorage.getItem("kbc_admin_pw") || "";

document.addEventListener("DOMContentLoaded", () => {
  const authCard = document.getElementById("admin-auth-card");
  const dashboardView = document.getElementById("admin-dashboard-view");
  const authForm = document.getElementById("admin-auth-form");
  const passwordInput = document.getElementById("admin-password-input");
  const authError = document.getElementById("admin-auth-error");
  const logoutBtn = document.getElementById("btn-admin-logout");

  // Check existing session
  if (adminPassword) {
    verifyAndUnlock(adminPassword, false);
  } else {
    showAuthGate();
  }

  // Handle password submission
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = passwordInput.value.trim();
    if (!entered) return;
    await verifyAndUnlock(entered, true);
  });

  // Handle logout / lock
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("kbc_admin_pw");
    adminPassword = "";
    showAuthGate();
  });

  // Setup event listeners for admin controls
  document.getElementById("btn-start-game").addEventListener("click", handleStartGame);
  document.getElementById("btn-reveal-round").addEventListener("click", handleRevealRound);
  document.getElementById("btn-next-round").addEventListener("click", handleNextRound);
  document.getElementById("btn-end-game").addEventListener("click", handleEndGame);
  document.getElementById("btn-reset-game").addEventListener("click", handleResetGame);

  // Rule and setting change listeners
  document.getElementById("admin-starting-lives").addEventListener("change", syncSettings);
  document.getElementById("admin-target-ratio").addEventListener("change", syncSettings);
  document.getElementById("rule-clash").addEventListener("change", syncSettings);
  document.getElementById("rule-exact-mean").addEventListener("change", syncSettings);
  document.getElementById("rule-duel").addEventListener("change", syncSettings);

  // History toggle listener
  let adminHistoryExpanded = false;
  const adminHistoryToggleBtn = document.getElementById("admin-history-toggle-btn");
  if (adminHistoryToggleBtn) {
    adminHistoryToggleBtn.addEventListener("click", () => {
      adminHistoryExpanded = !adminHistoryExpanded;
      const content = document.getElementById("admin-history-content");
      const chevron = document.getElementById("admin-history-chevron");
      if (content && chevron) {
        content.style.display = adminHistoryExpanded ? "block" : "none";
        chevron.textContent = adminHistoryExpanded ? "▲ Hide" : "▼ Show";
      }
    });
  }
});

async function verifyAndUnlock(pw, showErrorOnFail) {
  const authCard = document.getElementById("admin-auth-card");
  const dashboardView = document.getElementById("admin-dashboard-view");
  const authError = document.getElementById("admin-auth-error");
  const logoutBtn = document.getElementById("btn-admin-logout");

  try {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });

    if (res.ok) {
      adminPassword = pw;
      sessionStorage.setItem("kbc_admin_pw", pw);
      authCard.style.display = "none";
      dashboardView.style.display = "block";
      logoutBtn.style.display = "inline-flex";
      authError.style.display = "none";

      fetchAdminState();
      if (!pollTimer) {
        pollTimer = setInterval(fetchAdminState, POLL_INTERVAL_MS);
      }
    } else {
      if (showErrorOnFail) {
        authError.style.display = "block";
      } else {
        sessionStorage.removeItem("kbc_admin_pw");
        showAuthGate();
      }
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    if (showErrorOnFail) authError.style.display = "block";
  }
}

function showAuthGate() {
  document.getElementById("admin-auth-card").style.display = "block";
  document.getElementById("admin-dashboard-view").style.display = "none";
  document.getElementById("btn-admin-logout").style.display = "none";
  document.getElementById("admin-password-input").value = "";
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Authenticated fetch wrapper
async function adminFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-admin-key": adminPassword,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    alert("Admin session expired or password invalid.");
    sessionStorage.removeItem("kbc_admin_pw");
    showAuthGate();
    throw new Error("Unauthorized");
  }
  return res;
}

async function fetchAdminState() {
  if (!adminPassword) return;
  try {
    const res = await fetch("/api/game/state");
    if (!res.ok) return;
    const state = await res.json();
    renderAdminUI(state);
  } catch (err) {
    console.warn("Admin polling error:", err);
  }
}

function renderAdminUI(state) {
  currentPhase = state.phase;

  // Header status
  const badge = document.getElementById("admin-phase-badge");
  badge.className = `badge badge-${state.phase.toLowerCase()}`;
  badge.textContent = state.phase.replace("_", " ");

  document.getElementById("admin-round-indicator").textContent = `Round ${state.round_number}`;
  document.getElementById("admin-alive-count").textContent = `${state.alive_players} / ${state.total_players} Alive`;
  document.getElementById("admin-submission-progress").textContent = `${state.submitted_count} / ${state.alive_players} Submitted`;

  // Sync inputs if not currently focused
  const livesInput = document.getElementById("admin-starting-lives");
  if (document.activeElement !== livesInput && state.phase === "LOBBY") {
    livesInput.value = state.starting_lives;
  }
  livesInput.disabled = state.phase !== "LOBBY";

  // Checkboxes
  const clashCb = document.getElementById("rule-clash");
  const exactCb = document.getElementById("rule-exact-mean");
  const duelCb = document.getElementById("rule-duel");
  if (document.activeElement !== clashCb) clashCb.checked = !!state.rules.clash_penalty;
  if (document.activeElement !== exactCb) exactCb.checked = !!state.rules.exact_mean_penalty;
  if (document.activeElement !== duelCb) duelCb.checked = !!state.rules.duel_zero_hundred;

  // Buttons Visibility
  const btnStart = document.getElementById("btn-start-game");
  const btnReveal = document.getElementById("btn-reveal-round");
  const btnNext = document.getElementById("btn-next-round");
  const btnEnd = document.getElementById("btn-end-game");
  const btnReset = document.getElementById("btn-reset-game");

  btnStart.style.display = state.phase === "LOBBY" ? "inline-flex" : "none";
  btnStart.disabled = state.total_players < 2;

  btnReveal.style.display = state.phase === "ROUND_ACTIVE" ? "inline-flex" : "none";
  btnReveal.disabled = state.submitted_count === 0;

  btnNext.style.display = state.phase === "ROUND_REVEALED" ? "inline-flex" : "none";
  btnEnd.style.display = (state.phase === "ROUND_ACTIVE" || state.phase === "ROUND_REVEALED") ? "inline-flex" : "none";
  btnReset.style.display = "inline-flex";

  // Render Player Roster
  const roster = document.getElementById("admin-player-roster");
  if (state.players.length === 0) {
    roster.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;">No players joined yet. Have participants scan or visit the home page!</div>`;
  } else {
    roster.innerHTML = state.players.map(p => {
      let submitStatus = "";
      if (state.phase === "ROUND_ACTIVE") {
        if (!p.is_alive) {
          submitStatus = `<span style="color:var(--text-dim);">Eliminated</span>`;
        } else if (p.has_submitted) {
          submitStatus = `<span style="color:#10b981;font-weight:600;">✓ Ready</span>`;
        } else {
          submitStatus = `<span style="color:#f59e0b;">⏳ Thinking...</span>`;
        }
      }

      return `
        <div class="player-item ${!p.is_alive ? 'is-eliminated' : ''}">
          <div class="player-meta">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="player-lives-tag">${p.lives} ❤️</span>
            ${submitStatus}
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="renamePlayer('${p.id}', '${escapeHtml(p.name)}')">Rename</button>
            <button class="btn btn-danger btn-sm" onclick="kickPlayer('${p.id}')">Kick</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Render Results Card
  const resultCard = document.getElementById("admin-result-card");
  if ((state.phase === "ROUND_REVEALED" || state.phase === "GAME_OVER") && state.last_result) {
    resultCard.style.display = "block";
    const res = state.last_result;
    document.getElementById("admin-calc-formula").textContent = res.formula_str;
    document.getElementById("admin-calc-target").textContent = res.target_str;
    document.getElementById("admin-calc-winners").textContent = res.winners.length > 0 ? res.winners.join(", ") : "None";

    const notesEl = document.getElementById("admin-round-notes");
    const notesList = [...(res.notes || [])];
    if (state.phase === "GAME_OVER") {
      notesList.unshift(`🏆 GAME OVER! Champion: ${state.game_winner || 'None'}`);
    }
    notesEl.innerHTML = notesList.map(n => `<div class="note-item ${n.includes('🏆') ? 'win' : ''}">${escapeHtml(n)}</div>`).join("");

    const tbody = document.getElementById("admin-summary-tbody");
    tbody.innerHTML = res.player_summaries.map(ps => `
      <tr>
        <td style="padding:8px 6px;">${escapeHtml(ps.name)}</td>
        <td style="padding:8px 6px;text-align:center;">${ps.guess !== null ? ps.guess : '—'}</td>
        <td style="padding:8px 6px;text-align:center;">${ps.diff !== null ? ps.diff.toFixed(2) : '—'}</td>
        <td style="padding:8px 6px;text-align:center;color:${ps.change === 0 ? '#10b981' : '#ef4444'};font-weight:700;">
          ${ps.change === 0 ? '-0 (Win)' : ps.change}
        </td>
        <td style="padding:8px 6px;text-align:center;font-weight:700;">${ps.lives_after} ❤️ ${!ps.is_alive ? '💀' : ''}</td>
      </tr>
    `).join("");
  } else if (state.phase === "GAME_OVER") {
    resultCard.style.display = "block";
    document.getElementById("admin-calc-formula").textContent = `GAME OVER - Winner: ${state.game_winner || 'None'}`;
    document.getElementById("admin-calc-target").textContent = "Game has concluded.";
    document.getElementById("admin-calc-winners").textContent = state.game_winner || "None";
    document.getElementById("admin-round-notes").innerHTML = `<div class="note-item win">Game concluded! Click "Reset Game" to start a new session.</div>`;
  } else {
    resultCard.style.display = "none";
  }

  // Render Admin Match History
  renderAdminHistory(state.history || []);
}

function renderAdminHistory(history) {
  const section = document.getElementById("admin-history-section");
  const content = document.getElementById("admin-history-content");
  const countEl = document.getElementById("admin-history-count");
  if (!section || !content) return;

  if (!history || history.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  if (countEl) countEl.textContent = history.length;

  content.innerHTML = [...history].reverse().map(h => {
    const winnersStr = h.winners && h.winners.length > 0 ? h.winners.join(", ") : "None";
    const notesHtml = (h.notes || []).map(n => `<div style="font-size:0.8rem;color:#f59e0b;margin-top:2px;">• ${escapeHtml(n)}</div>`).join("");

    const rows = (h.player_summaries || []).map(ps => `
      <tr>
        <td style="padding:4px 6px;">${escapeHtml(ps.name)}</td>
        <td style="padding:4px 6px;text-align:center;">${ps.guess !== null ? ps.guess : '—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${ps.change === 0 ? '#10b981' : '#ef4444'};font-weight:600;">${ps.change === 0 ? '-0' : ps.change}</td>
        <td style="padding:4px 6px;text-align:center;">${ps.lives_after} ❤️</td>
      </tr>
    `).join("");

    return `
      <div style="background:rgba(0,0,0,0.25);border:1px solid var(--bg-card-border);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="color:#fff;">Round ${h.round_number}</strong>
          <span style="font-size:0.85rem;color:#10b981;font-weight:600;">Winner: ${escapeHtml(winnersStr)}</span>
        </div>
        <div style="font-family:monospace;font-size:0.85rem;color:#38bdf8;margin-bottom:6px;">
          ${escapeHtml(h.formula_str)}<br>${escapeHtml(h.target_str)}
        </div>
        ${notesHtml}
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:0.82rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--bg-card-border);color:var(--text-dim);text-align:left;">
              <th style="padding:3px 6px;">Player</th>
              <th style="padding:3px 6px;text-align:center;">Guess</th>
              <th style="padding:3px 6px;text-align:center;">Change</th>
              <th style="padding:3px 6px;text-align:center;">Lives</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");
}

async function syncSettings() {
  const livesVal = parseInt(document.getElementById("admin-starting-lives").value, 10);
  const ratioVal = parseFloat(document.getElementById("admin-target-ratio").value);
  const clashVal = document.getElementById("rule-clash").checked;
  const exactVal = document.getElementById("rule-exact-mean").checked;
  const duelVal = document.getElementById("rule-duel").checked;

  try {
    await adminFetch("/api/admin/update_settings", {
      method: "POST",
      body: JSON.stringify({
        starting_lives: isNaN(livesVal) ? 10 : livesVal,
        target_ratio: isNaN(ratioVal) ? 0.6667 : ratioVal,
        rules: {
          clash_penalty: clashVal,
          exact_mean_penalty: exactVal,
          duel_zero_hundred: duelVal
        }
      })
    });
    fetchAdminState();
  } catch (err) {
    console.error("Failed to update settings:", err);
  }
}

async function handleStartGame() {
  if (!confirm("Start the game? No new players will be able to join once started.")) return;
  try {
    const res = await adminFetch("/api/admin/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) alert(data.detail || "Error starting game");
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch if 401
  }
}

async function handleRevealRound() {
  try {
    const res = await adminFetch("/api/admin/reveal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) alert(data.detail || "Error revealing round");
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

async function handleNextRound() {
  try {
    const res = await adminFetch("/api/admin/next_round", { method: "POST" });
    const data = await res.json();
    if (!res.ok) alert(data.detail || "Error starting next round");
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

async function handleEndGame() {
  if (!confirm("Are you sure you want to end the game early?")) return;
  try {
    await adminFetch("/api/admin/end_game", { method: "POST" });
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

async function handleResetGame() {
  if (!confirm("Reset game back to Lobby? All player lives and rounds will be reset.")) return;
  try {
    await adminFetch("/api/admin/reset", { method: "POST" });
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

async function renamePlayer(id, currentName) {
  const newName = prompt(`Enter new name for "${currentName}":`, currentName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    alert("Player name cannot be empty.");
    return;
  }
  try {
    const res = await adminFetch("/api/admin/rename_player", {
      method: "POST",
      body: JSON.stringify({ player_id: id, new_name: trimmed })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.detail || "Error renaming player.");
    }
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

async function kickPlayer(id) {
  if (!confirm("Kick this player?")) return;
  try {
    const res = await adminFetch("/api/admin/kick", {
      method: "POST",
      body: JSON.stringify({ player_id: id })
    });
    if (!res.ok) alert("Error kicking player.");
    fetchAdminState();
  } catch (err) {
    // handled in adminFetch
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
