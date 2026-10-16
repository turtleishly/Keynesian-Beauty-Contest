from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_full_game_flow():
    # 1. Check pages
    r = client.get("/")
    assert r.status_code == 200
    assert "Beauty Contest" in r.text
    
    r = client.get("/rules")
    assert r.status_code == 200
    assert "Contest Rules" in r.text

    r = client.get("/admin")
    assert r.status_code == 200
    assert "Admin Game Control" in r.text

    # 2. Reset game state
    client.post("/api/admin/reset")
    
    # 3. Configure settings: 5 starting lives, clash=True, exact_mean=True, duel=True
    r = client.post("/api/admin/update_settings", json={
        "starting_lives": 5,
        "target_ratio": 2/3,
        "rules": {
            "clash_penalty": True,
            "exact_mean_penalty": True,
            "duel_zero_hundred": True
        }
    })
    assert r.status_code == 200

    # 4. Join 3 players: Alice, Bob, Charlie
    r = client.post("/api/player/join", json={"player_id": "u1", "name": "Alice"})
    assert r.status_code == 200
    r = client.post("/api/player/join", json={"player_id": "u2", "name": "Bob"})
    assert r.status_code == 200
    r = client.post("/api/player/join", json={"player_id": "u3", "name": "Charlie"})
    assert r.status_code == 200

    # 5. Check state in lobby
    state = client.get("/api/game/state").json()
    assert state["phase"] == "LOBBY"
    assert state["total_players"] == 3
    assert state["starting_lives"] == 5

    # 6. Admin starts game
    r = client.post("/api/admin/start")
    assert r.status_code == 200
    state = client.get("/api/game/state").json()
    assert state["phase"] == "ROUND_ACTIVE"
    assert state["round_number"] == 1

    # 7. Alice submits 20, Bob submits 30, Charlie submits 40
    # Mean = 30.00. Target = 20.00.
    # Alice is exact winner! Bob hit exact rounded mean (30) -> non-winners lose 2 lives!
    client.post("/api/player/submit", json={"player_id": "u1", "guess": 20})
    client.post("/api/player/submit", json={"player_id": "u2", "guess": 30})
    client.post("/api/player/submit", json={"player_id": "u3", "guess": 40})

    # While round active, player's guess should be hidden from state unless it's their own
    state_for_alice = client.get("/api/game/state?player_id=u1").json()
    alice_data = [p for p in state_for_alice["players"] if p["id"] == "u1"][0]
    bob_data = [p for p in state_for_alice["players"] if p["id"] == "u2"][0]
    assert alice_data["current_guess"] == 20
    assert bob_data["current_guess"] is None  # Hidden from Alice!

    # 8. Admin reveals
    r = client.post("/api/admin/reveal")
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["winners"] == ["Alice"]
    assert res["mean"] == 30.0
    assert res["target"] == 20.0
    assert "(20 + 30 + 40) / 3 = 30.00" in res["formula_str"]
    assert res["penalty_amount"] == 2  # Exact mean rule triggered

    state = client.get("/api/game/state").json()
    assert state["phase"] == "ROUND_REVEALED"
    alice = [p for p in state["players"] if p["id"] == "u1"][0]
    bob = [p for p in state["players"] if p["id"] == "u2"][0]
    charlie = [p for p in state["players"] if p["id"] == "u3"][0]
    assert alice["lives"] == 5
    assert bob["lives"] == 3  # 5 - 2
    assert charlie["lives"] == 3  # 5 - 2

    # 9. Admin moves to next round
    r = client.post("/api/admin/next_round")
    assert r.status_code == 200
    state = client.get("/api/game/state").json()
    assert state["phase"] == "ROUND_ACTIVE"
    assert state["round_number"] == 2

    print("[PASS] Full game flow test completed successfully!")

if __name__ == "__main__":
    test_full_game_flow()
