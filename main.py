import os
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from game_engine import GameEngine

app = FastAPI(title="Keynesian Beauty Contest - Elimination Game")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "1234")

# Setup directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
MANGA_DIR = os.path.join(BASE_DIR, "manga")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(MANGA_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/manga", StaticFiles(directory=MANGA_DIR), name="manga")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Single in-memory game instance
engine = GameEngine()


def get_ordered_manga_images() -> List[str]:
    """Scans MANGA_DIR for image files and returns their URLs sorted in numerical order (0.png, 1.png, ...)."""
    if not os.path.exists(MANGA_DIR):
        return []
    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    files = [f for f in os.listdir(MANGA_DIR) if os.path.splitext(f)[1].lower() in valid_exts]

    def sort_key(filename: str):
        stem = os.path.splitext(filename)[0]
        try:
            return (0, int(stem))
        except ValueError:
            return (1, stem.lower())

    files.sort(key=sort_key)
    return [f"/manga/{f}" for f in files]


def verify_admin(request: Request):
    """Verifies that the request provides the correct admin password via header, cookie, or query param."""
    key = (
        request.headers.get("x-admin-key")
        or request.cookies.get("admin_key")
        or request.query_params.get("key")
    )
    if key != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid admin password.")
    return True


# --- Request Models ---
class JoinRequest(BaseModel):
    player_id: str
    name: str = Field(..., min_length=1, max_length=30)


class SubmitGuessRequest(BaseModel):
    player_id: str
    guess: int = Field(..., ge=0, le=100)


class KickRequest(BaseModel):
    player_id: str


class UpdateSettingsRequest(BaseModel):
    starting_lives: Optional[int] = None
    target_ratio: Optional[float] = None
    rules: Optional[Dict[str, bool]] = None


class VerifyAdminRequest(BaseModel):
    password: str


# --- Web Page Routes ---
@app.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/rules", response_class=HTMLResponse)
async def rules_page(request: Request):
    return templates.TemplateResponse(request=request, name="rules.html")


@app.get("/rules/manga", response_class=HTMLResponse)
async def rules_manga_page(request: Request):
    images = get_ordered_manga_images()
    return templates.TemplateResponse(
        request=request,
        name="manga.html",
        context={"images": images, "image_count": len(images)}
    )


@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    return templates.TemplateResponse(request=request, name="admin.html")


@app.get("/healthz")
async def health_check():
    return {"status": "ok", "phase": engine.phase}


# --- REST API Endpoints (Polled by Frontend) ---
@app.get("/api/game/state")
async def get_game_state(player_id: Optional[str] = None):
    return engine.get_state(requester_id=player_id)


@app.post("/api/player/join")
async def player_join(payload: JoinRequest):
    try:
        player = engine.register_or_reconnect_player(payload.player_id, payload.name)
        return {"success": True, "player": player.to_dict()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/player/submit")
async def player_submit(payload: SubmitGuessRequest):
    try:
        engine.submit_guess(payload.player_id, payload.guess)
        return {"success": True, "guess": payload.guess}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Admin API Endpoints (Password Protected with 1234) ---
@app.post("/api/admin/verify")
async def admin_verify(payload: VerifyAdminRequest):
    if payload.password == ADMIN_PASSWORD:
        return {"success": True}
    raise HTTPException(status_code=401, detail="Invalid admin password.")


@app.post("/api/admin/start", dependencies=[Depends(verify_admin)])
async def admin_start():
    try:
        engine.start_game()
        return {"success": True, "phase": engine.phase}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/kick", dependencies=[Depends(verify_admin)])
async def admin_kick(payload: KickRequest):
    success = engine.kick_player(payload.player_id)
    if not success:
        raise HTTPException(status_code=404, detail="Player not found.")
    return {"success": True}


@app.post("/api/admin/update_settings", dependencies=[Depends(verify_admin)])
async def admin_update_settings(payload: UpdateSettingsRequest):
    engine.update_settings(
        starting_lives=payload.starting_lives,
        target_ratio=payload.target_ratio,
        rules=payload.rules
    )
    return {"success": True, "rules": engine.rules, "starting_lives": engine.starting_lives}


@app.post("/api/admin/reveal", dependencies=[Depends(verify_admin)])
async def admin_reveal():
    try:
        result = engine.calculate_and_reveal_round()
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/next_round", dependencies=[Depends(verify_admin)])
async def admin_next_round():
    try:
        engine.next_round()
        return {"success": True, "round_number": engine.round_number}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/end_game", dependencies=[Depends(verify_admin)])
async def admin_end_game():
    engine.end_game()
    return {"success": True, "game_winner": engine.game_winner}


@app.post("/api/admin/reset", dependencies=[Depends(verify_admin)])
async def admin_reset():
    engine.reset_game()
    return {"success": True, "phase": engine.phase}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
