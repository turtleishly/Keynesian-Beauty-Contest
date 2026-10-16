from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_player_and_admin_rename():
    # Reset
    client.post("/api/admin/reset", headers={"x-admin-key": "1234"})

    # Join 2 players
    r1 = client.post("/api/player/join", json={"player_id": "u1", "name": "Alice"})
    assert r1.status_code == 200
    r2 = client.post("/api/player/join", json={"player_id": "u2", "name": "Bob"})
    assert r2.status_code == 200

    # 1. Player u1 renames to "Alicia" in lobby -> Should succeed
    r_rename1 = client.post("/api/player/rename", json={"player_id": "u1", "new_name": "Alicia"})
    assert r_rename1.status_code == 200
    assert r_rename1.json()["name"] == "Alicia"
    state = client.get("/api/game/state").json()
    assert state["players"][0]["name"] == "Alicia" or state["players"][1]["name"] == "Alicia"

    # 2. Admin renames player u2 to "Robert" -> Should succeed
    r_admin_rename = client.post("/api/admin/rename_player", json={"player_id": "u2", "new_name": "Robert"}, headers={"x-admin-key": "1234"})
    assert r_admin_rename.status_code == 200
    assert r_admin_rename.json()["name"] == "Robert"

    # 3. Admin rename without auth key -> Should fail 401
    r_unauth = client.post("/api/admin/rename_player", json={"player_id": "u2", "new_name": "Hacker"})
    assert r_unauth.status_code == 401

    # 4. Start game
    client.post("/api/admin/start", headers={"x-admin-key": "1234"})

    # 5. Player attempts to rename during active round -> Should fail 400
    r_fail = client.post("/api/player/rename", json={"player_id": "u1", "new_name": "Cheater"})
    assert r_fail.status_code == 400
    assert "lobby" in r_fail.json()["detail"].lower()

    # 6. Admin CAN still rename during active game (e.g. to moderate inappropriate name)
    r_admin_mod = client.post("/api/admin/rename_player", json={"player_id": "u1", "new_name": "SuperAlicia"}, headers={"x-admin-key": "1234"})
    assert r_admin_mod.status_code == 200
    state = client.get("/api/game/state").json()
    player_names = [p["name"] for p in state["players"]]
    assert "SuperAlicia" in player_names

    print("[PASS] Player and admin rename tests passed successfully!")

if __name__ == "__main__":
    test_player_and_admin_rename()
