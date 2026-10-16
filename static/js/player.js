// Keynesian Beauty Contest - Player Client (Polling Architecture)

const POLL_INTERVAL_MS = 1500;
let playerId = localStorage.getItem("kbc_player_id");
let playerName = localStorage.getItem("kbc_player_name") || "";
let pollTimer = null;
let lastKnownPhase = null;
let lastKnownRound = null;

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

  const joinCard = document.getElementById("join-card");
  const gameCard = document.getElementById("game-card");
  const joinForm = document.getElementById("join-form");
  const nameInput = document.getElementById("player-name-input");
  const guessForm = document.getElementById("guess-form");
  const guessInput = document.getElementById("guess-input");

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

  // Update header info
  document.getElementById("display-player-name").textContent = currentMe.name;
  document.getElementById("display-player-lives").textContent = currentMe.lives;

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
      const res = state.last_result;
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

  } else if (state.phase === "GAME_OVER") {
    gameOverView.style.display = "block";
    document.getElementById("winner-name").textContent = state.game_winner || "None";

    const finalRoster = document.getElementById("final-roster");
    finalRoster.innerHTML = state.players.map(p => `
      <div class="player-item ${p.is_alive ? 'is-winner' : 'is-eliminated'}">
        <span>${escapeHtml(p.name)} ${p.id === playerId ? '<strong>(You)</strong>' : ''}</span>
        <span class="player-lives-tag">${p.lives} ❤️ ${p.is_alive ? '👑' : '💀'}</span>
      </div>
    `).join("");
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
