// Keynesian Beauty Contest - Player Client (Polling Architecture)

const POLL_INTERVAL_MS = 1500;
let playerId = localStorage.getItem("kbc_player_id");
let playerName = localStorage.getItem("kbc_player_name") || "";
let pollTimer = null;
let lastKnownPhase = null;
let lastKnownRound = null;
let lastKnownRules = null;
let soundEnabled = localStorage.getItem("kbc_sound_enabled") !== "false";
let audioCtx = null;
let historyExpanded = false;

// Audio Synthesizer (Zero External Dependencies)
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playRoundStartSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Two-tone rising chime (C5 523Hz -> G5 784Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.14);
    gain2.gain.setValueAtTime(0.22, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn("Audio chime prevented or unavailable:", err);
  }
}

// Generate or retrieve persistent UUID
function getOrCreatePlayerId() {
  if (!playerId) {
    playerId = (crypto.randomUUID && crypto.randomUUID()) || 
      'p_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem("kbc_player_id", playerId);
  }
  return playerId;
}

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  getOrCreatePlayerId();

  // Unlock AudioContext on first user interaction
  const unlockAudio = () => {
    getAudioContext();
    document.removeEventListener("click", unlockAudio);
    document.removeEventListener("touchstart", unlockAudio);
  };
  document.addEventListener("click", unlockAudio, { once: true });
  document.addEventListener("touchstart", unlockAudio, { once: true });

  const joinCard = document.getElementById("join-card");
  const gameCard = document.getElementById("game-card");
  const joinForm = document.getElementById("join-form");
  const nameInput = document.getElementById("player-name-input");
  const guessForm = document.getElementById("guess-form");
  const guessInput = document.getElementById("guess-input");
  const soundBtn = document.getElementById("btn-toggle-sound");
  const historyToggleBtn = document.getElementById("history-toggle-btn");

  // Sound toggle button setup
  if (soundBtn) {
    soundBtn.textContent = soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF";
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem("kbc_sound_enabled", soundEnabled ? "true" : "false");
      soundBtn.textContent = soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF";
      if (soundEnabled) playRoundStartSound();
    });
  }

  // History toggle button setup
  if (historyToggleBtn) {
    historyToggleBtn.addEventListener("click", () => {
      historyExpanded = !historyExpanded;
      const content = document.getElementById("history-content");
      const chevron = document.getElementById("history-chevron");
      if (content && chevron) {
        content.style.display = historyExpanded ? "block" : "none";
        chevron.textContent = historyExpanded ? "▲ Hide" : "▼ Show";
      }
    });
  }

  // Name change in Lobby setup
  const saveNameBtn = document.getElementById("btn-save-name");
  const changeNameInput = document.getElementById("change-name-input");
  const changeNameStatus = document.getElementById("change-name-status");

  if (saveNameBtn && changeNameInput) {
    saveNameBtn.addEventListener("click", async () => {
      const newName = changeNameInput.value.trim();
      if (!newName) {
        alert("Please enter a valid name.");
        return;
      }
      try {
        const res = await fetch("/api/player/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_id: playerId, new_name: newName })
        });
        const data = await res.json();
        if (res.ok) {
          playerName = newName;
          localStorage.setItem("kbc_player_name", newName);
          document.getElementById("display-player-name").textContent = newName;
          if (changeNameStatus) {
            changeNameStatus.style.display = "block";
            changeNameStatus.style.color = "#10b981";
            changeNameStatus.textContent = "✓ Name updated!";
            setTimeout(() => { changeNameStatus.style.display = "none"; }, 3000);
          }
          fetchState();
        } else {
          alert(data.detail || "Failed to update name.");
        }
      } catch (err) {
        console.error("Rename error:", err);
        alert("Network error updating name.");
      }
    });
  }

  // If already registered name
  if (playerName) {
    nameInput.value = playerName;
    attemptJoinOrReconnect(playerName);
  } else {
    joinCard.style.display = "block";
    gameCard.style.display = "none";
  }

  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const enteredName = nameInput.value.trim();
    if (!enteredName) return;
    attemptJoinOrReconnect(enteredName);
  });

  guessForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawVal = guessInput.value.trim();
    if (rawVal === "" || isNaN(rawVal)) {
      alert("Please enter a valid integer between 0 and 100.");
      return;
    }
    const intVal = parseInt(rawVal, 10);
    if (intVal < 0 || intVal > 100) {
      alert("Your guess must be between 0 and 100.");
      return;
    }

    try {
      const res = await fetch("/api/player/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, guess: intVal })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Failed to submit guess.");
      } else {
        fetchState();
      }
    } catch (err) {
      console.error("Submission error:", err);
      alert("Network error submitting guess.");
    }
  });

  // Quick adjustment buttons
  document.querySelectorAll(".quick-adjust").forEach(btn => {
    btn.addEventListener("click", () => {
      const delta = parseInt(btn.dataset.delta, 10);
      let cur = parseInt(guessInput.value || "0", 10);
      if (isNaN(cur)) cur = 50;
      let next = Math.max(0, Math.min(100, cur + delta));
      guessInput.value = next;
    });
  });
});

async function attemptJoinOrReconnect(name) {
  try {
    const res = await fetch("/api/player/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, name: name })
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Could not join game.");
      return;
    }

    playerName = name;
    localStorage.setItem("kbc_player_name", playerName);

    document.getElementById("join-card").style.display = "none";
    document.getElementById("game-card").style.display = "block";
    document.getElementById("display-player-name").textContent = playerName;

    // Start polling loop
    if (!pollTimer) {
      fetchState();
      pollTimer = setInterval(fetchState, POLL_INTERVAL_MS);
    }
  } catch (err) {
    console.error("Join error:", err);
    alert("Connection error. Please try again.");
  }
}

async function fetchState() {
  if (!playerId) return;

  try {
    const res = await fetch(`/api/game/state?player_id=${encodeURIComponent(playerId)}`);
    if (!res.ok) return;
    const state = await res.json();
    renderPlayerUI(state);
  } catch (err) {
    console.warn("Polling error:", err);
  }
}

function renderPlayerUI(state) {
  const currentMe = state.players.find(p => p.id === playerId);

  // If player was kicked or server wiped
  if (!currentMe) {
    document.getElementById("player-status-badge").className = "badge badge-gameover";
    document.getElementById("player-status-badge").textContent = "Not in Game";
    document.getElementById("join-card").style.display = "block";
    document.getElementById("game-card").style.display = "none";
    clearInterval(pollTimer);
    pollTimer = null;
    return;
  }

  // --- Sound Trigger for New Round ---
  const isEnteringRoundActive = state.phase === "ROUND_ACTIVE" && 
    (lastKnownPhase !== "ROUND_ACTIVE" || state.round_number !== lastKnownRound);

  if (isEnteringRoundActive) {
    playRoundStartSound();
  }

  // --- Notice for Newly Activated Rules ---
  if (lastKnownRules && state.rules) {
    const newlyAdded = [];
    if (state.rules.clash_penalty && !lastKnownRules.clash_penalty) {
      newlyAdded.push("Duplicate Clash Disqualification");
    }
    if (state.rules.exact_mean_penalty && !lastKnownRules.exact_mean_penalty) {
      newlyAdded.push("Exact Hit -2 Lives Penalty");
    }
    if (state.rules.duel_zero_hundred && !lastKnownRules.duel_zero_hundred) {
      newlyAdded.push("2-Player Duel (100 Beats 0)");
    }
    if (newlyAdded.length > 0) {
      showRuleNotice(`📢 New Rule Active for Round ${state.round_number}: ${newlyAdded.join(" & ")}!`);
    }
  }
  lastKnownRules = { ...state.rules };
  lastKnownPhase = state.phase;
  lastKnownRound = state.round_number;

  // Update header info and sync name if changed (e.g. by admin)
  if (currentMe.name !== playerName) {
    playerName = currentMe.name;
    localStorage.setItem("kbc_player_name", playerName);
  }
  document.getElementById("display-player-name").textContent = currentMe.name;
  document.getElementById("display-player-lives").textContent = currentMe.lives;

  const changeNameInput = document.getElementById("change-name-input");
  if (changeNameInput && document.activeElement !== changeNameInput && !changeNameInput.value) {
    changeNameInput.value = currentMe.name;
  }

  const statusBadge = document.getElementById("player-status-badge");
  statusBadge.className = `badge badge-${state.phase.toLowerCase()}`;
  statusBadge.textContent = state.phase.replace("_", " ");

  // Containers
  const lobbyView = document.getElementById("player-lobby-view");
  const activeView = document.getElementById("player-active-view");
  const revealedView = document.getElementById("player-revealed-view");
  const gameOverView = document.getElementById("player-gameover-view");

  lobbyView.style.display = "none";
  activeView.style.display = "none";
  revealedView.style.display = "none";
  gameOverView.style.display = "none";

  // Phase Handling
  if (state.phase === "LOBBY") {
    lobbyView.style.display = "block";
    document.getElementById("lobby-starting-lives").textContent = state.starting_lives;
    document.getElementById("lobby-players-count").textContent = state.total_players;
    
    // Render list of joined players
    const list = document.getElementById("lobby-players-list");
    list.innerHTML = state.players.map(p => `
      <div class="player-item">
        <span>${escapeHtml(p.name)} ${p.id === playerId ? "<strong>(You)</strong>" : ""}</span>
        <span class="player-lives-tag">${state.starting_lives} ❤️</span>
      </div>
    `).join("");

  } else if (state.phase === "ROUND_ACTIVE") {
    activeView.style.display = "block";
    document.getElementById("active-round-num").textContent = state.round_number;

    // Render active rules badges
    renderActiveRulesTags(state.rules);

    const guessForm = document.getElementById("guess-form");
    const eliminatedMsg = document.getElementById("eliminated-msg");
    const submittedNotice = document.getElementById("submitted-notice");
    const guessInput = document.getElementById("guess-input");

    if (!currentMe.is_alive) {
      guessForm.style.display = "none";
      eliminatedMsg.style.display = "block";
      submittedNotice.style.display = "none";
    } else {
      guessForm.style.display = "block";
      eliminatedMsg.style.display = "none";

      if (currentMe.has_submitted && currentMe.current_guess !== null) {
        submittedNotice.style.display = "block";
        document.getElementById("submitted-val").textContent = currentMe.current_guess;
        if (guessInput.value === "") {
          guessInput.value = currentMe.current_guess;
        }
      } else {
        submittedNotice.style.display = "none";
      }
    }

  } else if (state.phase === "ROUND_REVEALED") {
    revealedView.style.display = "block";
    document.getElementById("revealed-round-num").textContent = state.round_number;

    if (state.last_result) {
      renderResultCard(state.last_result);
    }

  } else if (state.phase === "GAME_OVER") {
    gameOverView.style.display = "block";
    document.getElementById("winner-name").textContent = state.game_winner || "None";

    // Show decisive final round results!
    const finalRoundBox = document.getElementById("gameover-final-round-box");
    if (state.last_result && finalRoundBox) {
      finalRoundBox.style.display = "block";
      document.getElementById("gameover-round-num").textContent = state.last_result.round_number;
      document.getElementById("gameover-calc-formula").textContent = state.last_result.formula_str;
      document.getElementById("gameover-calc-target").textContent = state.last_result.target_str;

      const finalNotes = document.getElementById("gameover-round-notes");
      if (state.last_result.notes && state.last_result.notes.length > 0) {
        finalNotes.innerHTML = state.last_result.notes.map(n => `<div class="note-item">${escapeHtml(n)}</div>`).join("");
      } else {
        finalNotes.innerHTML = "";
      }

      const tbody = document.getElementById("gameover-summary-tbody");
      tbody.innerHTML = state.last_result.player_summaries.map(ps => {
        const isMe = ps.id === playerId;
        const changeTag = ps.change === 0 
          ? `<span style="color:#10b981;font-weight:700;">-0 (Win)</span>` 
          : `<span style="color:#ef4444;font-weight:700;">${ps.change}</span>`;

        return `
          <tr style="${isMe ? 'background:rgba(99,102,241,0.15);' : ''}">
            <td style="padding:6px 4px;">${escapeHtml(ps.name)} ${isMe ? '(You)' : ''}</td>
            <td style="padding:6px 4px;text-align:center;">${ps.guess !== null ? ps.guess : '—'}</td>
            <td style="padding:6px 4px;text-align:center;">${ps.diff !== null ? ps.diff.toFixed(2) : '—'}</td>
            <td style="padding:6px 4px;text-align:center;">${changeTag}</td>
            <td style="padding:6px 4px;text-align:center;font-weight:700;">${ps.lives_after} ❤️ ${!ps.is_alive ? '💀' : ''}</td>
          </tr>
        `;
      }).join("");
    }

    const finalRoster = document.getElementById("final-roster");
    finalRoster.innerHTML = state.players.map(p => `
      <div class="player-item ${p.is_alive ? 'is-winner' : 'is-eliminated'}">
        <span>${escapeHtml(p.name)} ${p.id === playerId ? '<strong>(You)</strong>' : ''}</span>
        <span class="player-lives-tag">${p.lives} ❤️ ${p.is_alive ? '👑' : '💀'}</span>
      </div>
    `).join("");
  }

  // --- Render Match History ---
  renderHistory(state.history || []);
}

function renderResultCard(res) {
  document.getElementById("calc-formula").textContent = res.formula_str;
  document.getElementById("calc-target").textContent = res.target_str;

  // Winners text
  const winText = res.winners.length > 0 ? res.winners.join(", ") : "None (All clashed / disqualified)";
  document.getElementById("calc-winners").textContent = winText;

  // Notes
  const notesEl = document.getElementById("round-notes");
  if (res.notes && res.notes.length > 0) {
    notesEl.innerHTML = res.notes.map(n => `<div class="note-item">${escapeHtml(n)}</div>`).join("");
  } else {
    notesEl.innerHTML = "";
  }

  // Breakdown table
  const tbody = document.getElementById("round-summary-tbody");
  tbody.innerHTML = res.player_summaries.map(ps => {
    const isMe = ps.id === playerId;
    const changeTag = ps.change === 0 
      ? `<span style="color:#10b981;font-weight:700;">-0 (Win)</span>` 
      : `<span style="color:#ef4444;font-weight:700;">${ps.change}</span>`;

    return `
      <tr style="${isMe ? 'background:rgba(99,102,241,0.15);' : ''}">
        <td style="padding:8px 6px;">${escapeHtml(ps.name)} ${isMe ? '(You)' : ''}</td>
        <td style="padding:8px 6px;text-align:center;">${ps.guess !== null ? ps.guess : '—'}</td>
        <td style="padding:8px 6px;text-align:center;">${ps.diff !== null ? ps.diff.toFixed(2) : '—'}</td>
        <td style="padding:8px 6px;text-align:center;">${changeTag}</td>
        <td style="padding:8px 6px;text-align:center;font-weight:700;">${ps.lives_after} ❤️</td>
      </tr>
    `;
  }).join("");
}

function renderActiveRulesTags(rules) {
  const container = document.getElementById("active-rules-tags");
  if (!container || !rules) return;
  const tags = [];
  if (rules.clash_penalty) {
    tags.push(`<span class="badge" style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);">⚔️ Clash Disqualifies</span>`);
  }
  if (rules.exact_mean_penalty) {
    tags.push(`<span class="badge" style="background:rgba(245,158,11,0.15);color:#fde047;border:1px solid rgba(245,158,11,0.3);">🎯 Exact Hit: -2 Lives</span>`);
  }
  if (rules.duel_zero_hundred) {
    tags.push(`<span class="badge" style="background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.3);">👑 0 vs 100: 100 Wins</span>`);
  }
  container.innerHTML = tags.join(" ");
}

function showRuleNotice(msg) {
  const el = document.getElementById("rule-change-notice");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 8000);
}

function renderHistory(history) {
  const section = document.getElementById("history-section");
  const content = document.getElementById("history-content");
  const countEl = document.getElementById("history-count");
  if (!section || !content) return;

  if (!history || history.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  if (countEl) countEl.textContent = history.length;

  // Render cards in reverse order (newest first)
  content.innerHTML = [...history].reverse().map(h => {
    const winnersStr = h.winners && h.winners.length > 0 ? h.winners.join(", ") : "None";
    const notesHtml = (h.notes || []).map(n => `<div style="font-size:0.8rem;color:#f59e0b;margin-top:2px;">• ${escapeHtml(n)}</div>`).join("");

    const rows = (h.player_summaries || []).map(ps => {
      const isMe = ps.id === playerId;
      const changeColor = ps.change === 0 ? '#10b981' : '#ef4444';
      return `
        <tr style="${isMe ? 'background:rgba(99,102,241,0.12);' : ''}">
          <td style="padding:4px 6px;">${escapeHtml(ps.name)}</td>
          <td style="padding:4px 6px;text-align:center;">${ps.guess !== null ? ps.guess : '—'}</td>
          <td style="padding:4px 6px;text-align:center;color:${changeColor};font-weight:600;">${ps.change === 0 ? '-0' : ps.change}</td>
          <td style="padding:4px 6px;text-align:center;">${ps.lives_after} ❤️</td>
        </tr>
      `;
    }).join("");

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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
