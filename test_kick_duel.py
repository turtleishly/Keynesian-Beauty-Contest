from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_kick_and_duel():
    client.post("/api/admin/reset")
    client.post("/api/admin/update_settings", json={
        "starting_lives": 3,
        "rules": {
            "clash_penalty": True,
            "exact_mean_penalty": True,
            "duel_zero_hundred": True
        }
    })

    # Join 3 players
    client.post("/api/player/join", json={"player_id": "u1", "name": "Alice"})
    client.post("/api/player/join", json={"player_id": "u2", "name": "Bob"})
    client.post("/api/player/join", json={"player_id": "u3", "name": "Charlie"})

    # Admin kicks Charlie before start
    r = client.post("/api/admin/kick", json={"player_id": "u3"})
    assert r.status_code == 200
    state = client.get("/api/game/state").json()
    assert state["total_players"] == 2
    assert [p["name"] for p in state["players"]] == ["Alice", "Bob"]

    # Start game with 2 players
    client.post("/api/admin/start")

    # Alice: 0, Bob: 100 -> Duel rule: 100 wins!
    client.post("/api/player/submit", json={"player_id": "u1", "guess": 0})
    client.post("/api/player/submit", json={"player_id": "u2", "guess": 100})

    r = client.post("/api/admin/reveal")
    res = r.json()["result"]
    assert res["winners"] == ["Bob"]
    assert any("100 beats 0" in note for note in res["notes"])

    state = client.get("/api/game/state").json()
    alice = [p for p in state["players"] if p["id"] == "u1"][0]
    bob = [p for p in state["players"] if p["id"] == "u2"][0]
    assert bob["lives"] == 3
    assert alice["lives"] == 2

    print("[PASS] Kick and duel integration test passed!")

if __name__ == "__main__":
    test_kick_and_duel()
