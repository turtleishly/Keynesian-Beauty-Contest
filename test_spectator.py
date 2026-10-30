from fastapi.testclient import TestClient
from main import app, engine

client = TestClient(app)

def test_spectator_flow():
    # 1. Reset game
    client.post("/api/admin/reset", headers={"x-admin-key": "1234"})

    # 2. Starting lives: 2
    client.post("/api/admin/update_settings", json={
        "starting_lives": 2,
        "rules": {
            "clash_penalty": False,
            "exact_mean_penalty": False,
            "duel_zero_hundred": True
        }
    }, headers={"x-admin-key": "1234"})

    # 3. Join 3 players: Alice, Bob, Charlie
    client.post("/api/player/join", json={"player_id": "p1", "name": "Alice"})
    client.post("/api/player/join", json={"player_id": "p2", "name": "Bob"})
    client.post("/api/player/join", json={"player_id": "p3", "name": "Charlie"})

    # Start game (Round 1)
    client.post("/api/admin/start", headers={"x-admin-key": "1234"})

    # Set Bob's lives to 1 during round 1 to simulate Bob being on his last life
    engine.players["p2"].lives = 1

    # Round 1: Alice 20, Charlie 24, Bob 60
    # Mean: 34.67. Target: 23.11.
    # Charlie (diff 0.89) wins!
    # Alice loses 1 life (2 - 1 = 1 life left).
    # Bob loses 1 life (1 - 1 = 0 lives left -> Bob is ELIMINATED!).
    client.post("/api/player/submit", json={"player_id": "p1", "guess": 20})
    client.post("/api/player/submit", json={"player_id": "p2", "guess": 60})
    client.post("/api/player/submit", json={"player_id": "p3", "guess": 24})

    # Reveal Round 1
    r_rev = client.post("/api/admin/reveal", headers={"x-admin-key": "1234"})
    assert r_rev.status_code == 200

    # Bob should be eliminated, but game is NOT over because Alice and Charlie are alive!
    state_after_r1 = client.get("/api/game/state?player_id=p2").json()
    assert state_after_r1["phase"] == "ROUND_REVEALED"
    assert state_after_r1["alive_players"] == 2
    bob = [p for p in state_after_r1["players"] if p["id"] == "p2"][0]
    assert bob["lives"] == 0
    assert bob["is_alive"] is False

    # Admin advances to Round 2
    r_next = client.post("/api/admin/next_round", headers={"x-admin-key": "1234"})
    assert r_next.status_code == 200

    # In Round 2, phase is ROUND_ACTIVE
    state_r2 = client.get("/api/game/state?player_id=p2").json()
    assert state_r2["phase"] == "ROUND_ACTIVE"
    assert state_r2["round_number"] == 2
    assert state_r2["alive_players"] == 2

    # Bob is spectating. If Bob tries to submit a guess, he is blocked:
    r_submit = client.post("/api/player/submit", json={"player_id": "p2", "guess": 30})
    assert r_submit.status_code == 400
    assert "eliminated" in r_submit.json()["detail"].lower()

    # Alice and Charlie submit their guesses
    client.post("/api/player/submit", json={"player_id": "p1", "guess": 10})
    client.post("/api/player/submit", json={"player_id": "p3", "guess": 30})

    # While Alice and Charlie submit, Bob can poll and see submission progress
    state_progress = client.get("/api/game/state?player_id=p2").json()
    assert state_progress["submitted_count"] == 2
    assert state_progress["alive_players"] == 2

    # Admin reveals Round 2
    client.post("/api/admin/reveal", headers={"x-admin-key": "1234"})

    # Bob can see Round 2 results and history!
    state_r2_revealed = client.get("/api/game/state?player_id=p2").json()
    assert len(state_r2_revealed["history"]) == 2
    assert state_r2_revealed["last_result"]["round_number"] == 2

    print("[PASS] Spectator test completed successfully!")

if __name__ == "__main__":
    test_spectator_flow()
