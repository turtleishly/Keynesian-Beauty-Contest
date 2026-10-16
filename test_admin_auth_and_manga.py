import os
from fastapi.testclient import TestClient
from main import app, MANGA_DIR, get_ordered_manga_images

client = TestClient(app)

def test_no_admin_links_on_user_pages():
    # Home page should not leak admin link
    r_home = client.get("/")
    assert r_home.status_code == 200
    assert 'href="/admin"' not in r_home.text

    # Rules page should not leak admin link
    r_rules = client.get("/rules")
    assert r_rules.status_code == 200
    assert 'href="/admin"' not in r_rules.text
    assert 'href="/rules/manga"' in r_rules.text
    print("[PASS] No admin links found on player/rules pages.")


def test_admin_password_protection():
    # 1. Verify endpoint checks
    r_fail = client.post("/api/admin/verify", json={"password": "wrong"})
    assert r_fail.status_code == 401

    r_ok = client.post("/api/admin/verify", json={"password": "1234"})
    assert r_ok.status_code == 200
    assert r_ok.json()["success"] is True

    # 2. Endpoints blocked without password header
    r_unauth = client.post("/api/admin/start")
    assert r_unauth.status_code == 401

    # 3. Endpoints succeed with correct header
    headers = {"x-admin-key": "1234"}
    
    # Reset
    r_reset = client.post("/api/admin/reset", headers=headers)
    assert r_reset.status_code == 200

    # Add players
    client.post("/api/player/join", json={"player_id": "p1", "name": "Player 1"})
    client.post("/api/player/join", json={"player_id": "p2", "name": "Player 2"})

    r_start = client.post("/api/admin/start", headers=headers)
    assert r_start.status_code == 200
    assert r_start.json()["phase"] == "ROUND_ACTIVE"
    print("[PASS] Admin password protection (1234) verified.")


def test_manga_page_and_sorting():
    # Test empty manga page
    r = client.get("/rules/manga")
    assert r.status_code == 200
    assert "Manga Edition" in r.text

    ordered = get_ordered_manga_images()
    # Check that filenames parse to ascending order
    stems = [int(os.path.splitext(os.path.basename(u))[0]) for u in ordered if os.path.splitext(os.path.basename(u))[0].isdigit()]
    assert stems == sorted(stems), f"Images should be in ascending order, got: {stems}"

    r_with_images = client.get("/rules/manga")
    assert r_with_images.status_code == 200
    assert "manga-page-img" in r_with_images.text
    print(f"[PASS] Manga sequential numerical ordering verified with {len(ordered)} pages: {ordered}")


if __name__ == "__main__":
    test_no_admin_links_on_user_pages()
    test_admin_password_protection()
    test_manga_page_and_sorting()
    print("All new feature tests passed successfully!")
