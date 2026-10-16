import uuid
from typing import Dict, List, Optional, Any
from collections import Counter


class Player:
    def __init__(self, player_id: str, name: str, starting_lives: int):
        self.id = player_id
        self.name = name.strip()
        self.lives = starting_lives
        self.is_alive = True
        self.current_guess: Optional[int] = None

    def to_dict(self, hide_guess: bool = False) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "lives": self.lives,
            "is_alive": self.is_alive,
            "has_submitted": self.current_guess is not None,
            "current_guess": None if hide_guess else self.current_guess,
        }


class GameEngine:
    def __init__(self):
        self.phase: str = "LOBBY"  # LOBBY, ROUND_ACTIVE, ROUND_REVEALED, GAME_OVER
        self.round_number: int = 1
        self.starting_lives: int = 10
        self.target_ratio: float = 2.0 / 3.0  # Default 2/3 ≈ 0.6667
        
        # Rule Toggles
        self.rules: Dict[str, bool] = {
            "clash_penalty": True,        # Duplicate guesses immediately lose (-1 life)
            "exact_mean_penalty": True,   # Guessing rounded mean inflicts -2 lives to all other players
            "duel_zero_hundred": True,    # When 2 players left: if 0 and 100 chosen, 100 wins
        }
        
        self.players: Dict[str, Player] = {}
        self.last_result: Optional[Dict[str, Any]] = None
        self.game_winner: Optional[str] = None

    def get_active_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.is_alive]

    def register_or_reconnect_player(self, player_id: str, name: str) -> Player:
        """Connects a player using their localStorage UUID, or creates a new slot if in LOBBY."""
        if player_id in self.players:
            # Player already exists, update name if in lobby
            player = self.players[player_id]
            if self.phase == "LOBBY" and name:
                player.name = name.strip()
            return player

        # If game is already started, new players cannot join
        if self.phase != "LOBBY":
            raise ValueError("Game has already started. No new players may join.")

        new_player = Player(
            player_id=player_id or str(uuid.uuid4()),
            name=name.strip() or f"Player {len(self.players) + 1}",
            starting_lives=self.starting_lives
        )
        self.players[new_player.id] = new_player
        return new_player

    def kick_player(self, player_id: str) -> bool:
        if player_id in self.players:
            del self.players[player_id]
            # Check if kicking during game leaves 1 or 0 players
            if self.phase in ("ROUND_ACTIVE", "ROUND_REVEALED"):
                alive = self.get_active_players()
                if len(alive) <= 1:
                    self.phase = "GAME_OVER"
                    self.game_winner = alive[0].name if alive else "None"
            return True
        return False

    def update_settings(self, starting_lives: Optional[int] = None, 
                        target_ratio: Optional[float] = None, 
                        rules: Optional[Dict[str, bool]] = None):
        if self.phase == "LOBBY" and starting_lives is not None:
            self.starting_lives = max(1, int(starting_lives))
            for p in self.players.values():
                p.lives = self.starting_lives

        if target_ratio is not None:
            self.target_ratio = float(target_ratio)

        if rules:
            for k in ("clash_penalty", "exact_mean_penalty", "duel_zero_hundred"):
                if k in rules:
                    self.rules[k] = bool(rules[k])

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("At least 2 players are required to start.")
        
        self.phase = "ROUND_ACTIVE"
        self.round_number = 1
        self.last_result = None
        self.game_winner = None
        
        # Reset player states
        for p in self.players.values():
            p.lives = self.starting_lives
            p.is_alive = True
            p.current_guess = None

    def submit_guess(self, player_id: str, guess: int):
        if self.phase != "ROUND_ACTIVE":
            raise ValueError("Submissions are not currently open.")
        
        if player_id not in self.players:
            raise ValueError("Player not registered.")
        
        player = self.players[player_id]
        if not player.is_alive:
            raise ValueError("Player has been eliminated.")

        if not isinstance(guess, int) or guess < 0 or guess > 100:
            raise ValueError("Guess must be an integer between 0 and 100.")

        player.current_guess = guess

    def calculate_and_reveal_round(self) -> Dict[str, Any]:
        if self.phase != "ROUND_ACTIVE":
            raise ValueError("Cannot reveal: round is not active.")

        active_players = self.get_active_players()
        submitted_players = [p for p in active_players if p.current_guess is not None]

        if not submitted_players:
            raise ValueError("No active players submitted a guess.")

        # If some active players missed submitting, give them -1 life and proceed
        missed_players = [p for p in active_players if p.current_guess is None]

        guesses = [p.current_guess for p in submitted_players]
        n = len(submitted_players)
        total_sum = sum(guesses)
        mean = total_sum / n
        rounded_mean = round(mean)
        target = self.target_ratio * mean

        notes: List[str] = []
        winners: List[Player] = []
        is_duel_resolved = False

        # --- Rule 3: 2 Players Left Duel Rule (0 vs 100) ---
        if self.rules.get("duel_zero_hundred") and len(active_players) == 2 and n == 2:
            p1, p2 = submitted_players[0], submitted_players[1]
            g1, g2 = p1.current_guess, p2.current_guess
            if {g1, g2} == {0, 100}:
                winner = p1 if g1 == 100 else p2
                winners = [winner]
                notes.append("Duel Rule Triggered: With only 2 players left, 100 beats 0!")
                is_duel_resolved = True

        # Standard calculation if duel rule not triggered
        clashed_guesses = set()
        penalty_amount = 1

        if not is_duel_resolved:
            # --- Rule 1: Clash Penalty (same guesses lose immediately) ---
            if self.rules.get("clash_penalty"):
                counts = Counter(guesses)
                clashed_guesses = {g for g, c in counts.items() if c > 1}
                if clashed_guesses:
                    clash_list_str = ", ".join(str(g) for g in sorted(clashed_guesses))
                    notes.append(f"Clash Rule: Duplicate guess(es) [{clash_list_str}] disqualified and lose 1 life.")

            # --- Rule 2: Exact Rounded Mean Penalty (-2 to other players) ---
            if self.rules.get("exact_mean_penalty"):
                exact_hitters = [p for p in submitted_players if p.current_guess == rounded_mean]
                if exact_hitters:
                    penalty_amount = 2
                    hitters_str = ", ".join(p.name for p in exact_hitters)
                    notes.append(f"Exact Mean Hit ({rounded_mean}) by {hitters_str}! Non-winners lose 2 lives.")

            # Eligible winners: submitted players who did not clash
            eligible = [p for p in submitted_players if p.current_guess not in clashed_guesses]

            if not eligible:
                winners = []
                notes.append("All submitted players clashed! No winners this round.")
            else:
                # Find player(s) closest to target
                min_diff = min(abs(p.current_guess - target) for p in eligible)
                winners = [p for p in eligible if abs(abs(p.current_guess - target) - min_diff) < 1e-6]

        # Apply life deductions
        player_summaries = []
        winner_ids = {w.id for w in winners}

        # Format formula string: e.g. "Guesses: 10 + 20 + 30 / 3 = 20.00"
        formula_str = f"({' + '.join(str(g) for g in guesses)}) / {n} = {mean:.2f}"
        target_str = f"{self.target_ratio:.4f} × {mean:.2f} = {target:.2f}"

        for p in active_players:
            lives_before = p.lives
            clashed = p.current_guess in clashed_guesses
            is_winner = p.id in winner_ids
            missed = p.current_guess is None

            if is_winner:
                change = 0
            else:
                change = -penalty_amount

            p.lives = max(0, p.lives + change)
            if p.lives == 0:
                p.is_alive = False

            diff = abs(p.current_guess - target) if p.current_guess is not None else None

            player_summaries.append({
                "id": p.id,
                "name": p.name,
                "guess": p.current_guess,
                "diff": diff,
                "is_winner": is_winner,
                "clashed": clashed,
                "missed": missed,
                "lives_before": lives_before,
                "change": change,
                "lives_after": p.lives,
                "is_alive": p.is_alive
            })

        # Check Game Over
        remaining_alive = self.get_active_players()
        if len(remaining_alive) == 1:
            self.phase = "GAME_OVER"
            self.game_winner = remaining_alive[0].name
            notes.append(f"🏆 {self.game_winner} is the last player standing and wins the game!")
        elif len(remaining_alive) == 0:
            self.phase = "GAME_OVER"
            self.game_winner = "Nobody (All players eliminated simultaneously!)"
            notes.append("💀 All players were eliminated in the same round! It's a draw.")
        else:
            self.phase = "ROUND_REVEALED"

        self.last_result = {
            "round_number": self.round_number,
            "formula_str": formula_str,
            "target_str": target_str,
            "mean": round(mean, 2),
            "rounded_mean": rounded_mean,
            "target": round(target, 2),
            "winners": [w.name for w in winners],
            "notes": notes,
            "player_summaries": player_summaries,
            "penalty_amount": penalty_amount
        }
        return self.last_result

    def next_round(self):
        if self.phase not in ("ROUND_REVEALED",):
            raise ValueError("Cannot start next round until current round results are revealed.")
        
        self.round_number += 1
        self.phase = "ROUND_ACTIVE"
        
        # Reset guesses for active players
        for p in self.players.values():
            p.current_guess = None

    def end_game(self):
        self.phase = "GAME_OVER"
        alive = self.get_active_players()
        if len(alive) == 1:
            self.game_winner = alive[0].name
        elif len(alive) > 1:
            # Player with most lives
            max_lives = max(p.lives for p in alive)
            leaders = [p.name for p in alive if p.lives == max_lives]
            self.game_winner = " & ".join(leaders) + f" (Highest Lives: {max_lives})"
        else:
            self.game_winner = "None"

    def reset_game(self):
        """Resets everything back to LOBBY, reviving all players with starting lives."""
        self.phase = "LOBBY"
        self.round_number = 1
        self.last_result = None
        self.game_winner = None
        for p in self.players.values():
            p.lives = self.starting_lives
            p.is_alive = True
            p.current_guess = None

    def get_state(self, requester_id: Optional[str] = None, is_admin: bool = False) -> Dict[str, Any]:
        """
        Returns full state.
        If round is ROUND_ACTIVE, player guesses are HIDDEN from other players.
        Admin can see who submitted, but guesses are hidden until REVEALED.
        """
        hide_guesses = self.phase == "ROUND_ACTIVE"
        
        player_list = []
        for p in self.players.values():
            # A player can always see their own guess
            hide_this_guess = hide_guesses and not (requester_id and p.id == requester_id)
            player_list.append(p.to_dict(hide_guess=hide_this_guess))

        # Sort: Alive players first, then by lives descending
        player_list.sort(key=lambda x: (not x["is_alive"], -x["lives"], x["name"]))

        return {
            "phase": self.phase,
            "round_number": self.round_number,
            "starting_lives": self.starting_lives,
            "target_ratio": self.target_ratio,
            "rules": self.rules,
            "players": player_list,
            "total_players": len(self.players),
            "alive_players": len(self.get_active_players()),
            "submitted_count": len([p for p in self.get_active_players() if p.current_guess is not None]),
            "last_result": self.last_result,
            "game_winner": self.game_winner,
        }
