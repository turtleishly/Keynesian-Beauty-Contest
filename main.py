import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from game_engine import GameEngine

app = FastAPI(title="Keynesian Beauty Contest - Elimination Game")

# Setup directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Single in-memory game instance
engine = GameEngine()


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


# --- Web Page Routes ---
@app.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/rules", response_class=HTMLResponse)
async def rules_page(request: Request):
    return templates.TemplateResponse(request=request, name="rules.html")


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


@app.post("/api/admin/start")
async def admin_start():
    try:
        engine.start_game()
        return {"success": True, "phase": engine.phase}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/kick")
async def admin_kick(payload: KickRequest):
    success = engine.kick_player(payload.player_id)
    if not success:
        raise HTTPException(status_code=404, detail="Player not found.")
    return {"success": True}


@app.post("/api/admin/update_settings")
async def admin_update_settings(payload: UpdateSettingsRequest):
    engine.update_settings(
        starting_lives=payload.starting_lives,
        target_ratio=payload.target_ratio,
        rules=payload.rules
    )
    return {"success": True, "rules": engine.rules, "starting_lives": engine.starting_lives}


@app.post("/api/admin/reveal")
async def admin_reveal():
    try:
        result = engine.calculate_and_reveal_round()
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/next_round")
async def admin_next_round():
    try:
        engine.next_round()
        return {"success": True, "round_number": engine.round_number}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/admin/end_game")
async def admin_end_game():
    engine.end_game()
    return {"success": True, "game_winner": engine.game_winner}


@app.post("/api/admin/reset")
async def admin_reset():
    engine.reset_game()
    return {"success": True, "phase": engine.phase}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
