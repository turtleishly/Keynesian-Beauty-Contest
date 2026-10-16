# Keynesian Beauty Contest (Classroom Elimination Game)

A real-time, mobile-friendly web application for running an interactive game-theory elimination tournament (inspired by the classic Keynesian Beauty Contest and the *King of Diamonds* trial).

---

## 🎮 Game Rules

1. **Integer Guesses:** Each round, active players input an integer from **0 to 100**.
2. **The Target:** The server computes the group average ($\mu$) and the Target:
   $$\text{Target} = \frac{2}{3} \times \text{Average}$$
3. **Winner(s):** The player(s) closest to the Target win the round (ties permitted).
4. **Lives System:**
   - All players start with **10 lives** (configurable by Admin).
   - Winners lose **0 lives**.
   - Losers lose **1 life** (or **2 lives** if exact mean rule triggers).
   - Players reaching 0 lives are eliminated and become spectators.
   - Last player standing wins the tournament!

### 🎲 Optional Dynamic Rules (Toggleable between rounds)
- **Duplicate Penalty (Clash Rule):** If 2 or more players enter the same number, they are disqualified from winning this round and immediately lose 1 life.
- **Exact Mean Penalty:** If any player guesses exactly the rounded mean ($\lfloor \mu \rceil$), all losers lose **2 lives** instead of 1.
- **Duel Rule (0 vs 100):** When only 2 players remain alive, if one enters `0` and the other enters `100`, the player who chose `100` wins!

---

## 🚀 Running Locally on Windows

Create a .venv with the requirements from rewuirements.txt

### Option 1: Double Click
Simply double-click [`run.bat`](file:///c:/Users/Aiden/Coding/python_ws/Keynesian%20Beauty%20Contest/run.bat).

### Option 2: Command Line
```powershell
.\.venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000
```
Then visit:
- **Player Screen:** `http://localhost:8000`
- **Rules Page:** `http://localhost:8000/rules`
- **Manga Rules Reader:** `http://localhost:8000/rules/manga` (Drop images into the `manga/` folder named `0.png`, `1.png`, etc.)
- **Admin Dashboard:** `http://localhost:8000/admin` (Unlinked; Protected with password: `1234`)

---

## 🌐 Deploying to Render.com

1. **Push your code to GitHub / GitLab**.
2. Log into [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Connect your repository.
4. Fill in the following settings:
   - **Name:** `keynesian-beauty-contest`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Click **Create Web Service**.

Once deployed, Render gives you a public HTTPS URL (e.g. `https://beauty-contest.onrender.com`). Generate a free QR code for this URL and display it on your classroom projector!
