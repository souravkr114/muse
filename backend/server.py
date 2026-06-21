import os
import io
import uuid
import logging
import sqlite3
import base64
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv
import bcrypt
import jwt
from google import genai
from google.genai import types

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DB_URL = os.environ.get("DATABASE_URL", str(ROOT_DIR / "muse.db"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-muse-key-12345")

JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = 720

# Initialize Gemini Client
genai_client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="Muse — Motivator API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("muse")

# ---------- Dual Database Adapter (SQLite & PostgreSQL) ----------
class Database:
    def __init__(self, url: str):
        self.url = url
        self.is_postgres = url.startswith("postgres://") or url.startswith("postgresql://")
        logger.info(f"Database initialized. Type: {'PostgreSQL' if self.is_postgres else 'SQLite'}")

    def get_connection(self):
        if self.is_postgres:
            import psycopg2
            conn_url = self.url
            if conn_url.startswith("postgres://"):
                conn_url = conn_url.replace("postgres://", "postgresql://", 1)
            return psycopg2.connect(conn_url)
        else:
            conn = sqlite3.connect(self.url)
            conn.row_factory = sqlite3.Row
            return conn

    def execute(self, query: str, params: tuple = ()) -> int:
        if self.is_postgres:
            query = query.replace("?", "%s")
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
        rowcount = cursor.rowcount
        conn.close()
        return rowcount

    def fetchone(self, query: str, params: tuple = ()) -> Optional[dict]:
        if self.is_postgres:
            query = query.replace("?", "%s")
        conn = self.get_connection()
        if self.is_postgres:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
        else:
            cursor = conn.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def fetchall(self, query: str, params: tuple = ()) -> List[dict]:
        if self.is_postgres:
            query = query.replace("?", "%s")
        conn = self.get_connection()
        if self.is_postgres:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
        else:
            cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def init_db(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quotes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                quote TEXT NOT NULL,
                attribution TEXT NOT NULL,
                mood TEXT NOT NULL,
                source_type TEXT NOT NULL,
                input_preview TEXT NOT NULL,
                image_thumb TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()

db = Database(DB_URL)
db.init_db()

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    created_at: str

class AuthOut(BaseModel):
    token: str
    user: UserOut

class GenerateIn(BaseModel):
    source_type: Literal["text", "voice", "image"]
    text: Optional[str] = None
    image_base64: Optional[str] = None  # raw base64, no data: prefix
    image_mime: Optional[str] = "image/jpeg"

class QuoteOut(BaseModel):
    id: str
    user_id: str
    quote: str
    attribution: str
    mood: str
    source_type: str
    input_preview: str
    image_thumb: Optional[str] = None
    is_favorite: bool = False
    created_at: str

class TranscribeOut(BaseModel):
    text: str

# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    row = db.fetchone("SELECT id, email, name, created_at FROM users WHERE id = ?", (user_id,))
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return row

# ---------- Auth ----------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    if db.fetchone("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    password_hash = hash_password(body.password)
    
    db.execute(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, email, body.name, password_hash, created_at)
    )
    
    user_out = UserOut(id=user_id, email=email, name=body.name, created_at=created_at)
    return AuthOut(token=make_token(user_id), user=user_out)

@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    row = db.fetchone("SELECT * FROM users WHERE email = ?", (email,))
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_out = UserOut(id=row["id"], email=row["email"], name=row["name"], created_at=row["created_at"])
    return AuthOut(token=make_token(row["id"]), user=user_out)

@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return UserOut(**user)

# ---------- Transcription ----------
@api.post("/transcribe", response_model=TranscribeOut)
async def transcribe(file: UploadFile = File(...), user: dict = Depends(current_user)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio")
    
    suffix = Path(file.filename).suffix if file.filename else ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(raw)
        tmp_path = tmp_file.name

    try:
        logger.info(f"Uploading audio file {tmp_path} to Gemini...")
        uploaded_file = genai_client.files.upload(file=tmp_path)
        logger.info(f"Uploaded successfully. Name: {uploaded_file.name}")
        
        logger.info("Transcribing audio using gemini-2.5-flash...")
        response = genai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded_file,
                "Transcribe this audio recording exactly. Write only the transcribed words, nothing else. If there is no speech, return an empty string."
            ]
        )
        text = response.text or ""
        
        logger.info("Deleting file from Gemini...")
        genai_client.files.delete(name=uploaded_file.name)
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
    return TranscribeOut(text=text.strip())

# ---------- Quote Generation ----------
QUOTE_SYSTEM = (
    "You are Muse — a poetic, intimate motivator. "
    "Given a user's mood, situation, or an image, respond with EXACTLY one short, original, "
    "powerful motivational quote (12–28 words). It must feel hand-written by a thoughtful friend, "
    "never clichéd, never preachy. "
    "Then on the next line return a short single-word MOOD label (e.g. Resolve, Stillness, Spark, Tender, Bold). "
    "Format strictly as:\n\n"
    "QUOTE: <the quote text>\n"
    "MOOD: <one word>\n\n"
    "Do not add anything else."
)

def parse_llm_response(raw: str) -> dict:
    quote_text = ""
    mood = "Spark"
    for line in (raw or "").splitlines():
        s = line.strip()
        if s.upper().startswith("QUOTE:"):
            quote_text = s[6:].strip().strip('"').strip("“”")
        elif s.upper().startswith("MOOD:"):
            mood = s[5:].strip().strip(".,").split()[0] if s[5:].strip() else "Spark"
    if not quote_text:
        for line in (raw or "").splitlines():
            if line.strip():
                quote_text = line.strip().strip('"').strip("“”")
                break
    if not quote_text:
        quote_text = "Even the quietest spark can outlast the longest night."
    return {"quote": quote_text, "mood": mood or "Spark"}

@api.post("/quotes/generate", response_model=QuoteOut)
async def generate_quote(body: GenerateIn, user: dict = Depends(current_user)):
    if body.source_type == "image" and not body.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 required for image input")
    if body.source_type in ("text", "voice") and not (body.text and body.text.strip()):
        raise HTTPException(status_code=400, detail="text required")

    config = types.GenerateContentConfig(
        system_instruction=QUOTE_SYSTEM,
        temperature=0.7,
    )

    if body.source_type == "image":
        prompt = (
            "Look closely at this image. Sense its mood, story, light, and feeling. "
            "Write one motivational quote inspired by what you see."
        )
        try:
            image_bytes = base64.b64decode(body.image_base64)
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=body.image_mime or "image/jpeg")
            contents = [image_part, prompt]
        except Exception as e:
            logger.exception("Failed to decode image base64")
            raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")
        input_preview = "Image input"
    else:
        prompt = (
            f"The user shares this with you:\n"
            f"\"{body.text.strip()}\"\n\n"
            "Write one motivational quote that meets them exactly where they are."
        )
        contents = prompt
        input_preview = body.text.strip()[:140]

    try:
        response = genai_client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=contents,
            config=config
        )
        raw = response.text
    except Exception as e:
        logger.exception("Gemini API error during quote generation")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    parsed = parse_llm_response(str(raw))
    quote_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    db.execute("""
        INSERT INTO quotes (id, user_id, quote, attribution, mood, source_type, input_preview, is_favorite, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    """, (quote_id, user["id"], parsed["quote"], "— Muse", parsed["mood"], body.source_type, input_preview, created_at))
    
    return QuoteOut(
        id=quote_id,
        user_id=user["id"],
        quote=parsed["quote"],
        attribution="— Muse",
        mood=parsed["mood"],
        source_type=body.source_type,
        input_preview=input_preview,
        is_favorite=False,
        created_at=created_at
    )

@api.get("/quotes", response_model=List[QuoteOut])
async def list_quotes(favorites_only: bool = False, user: dict = Depends(current_user)):
    if favorites_only:
        rows = db.fetchall("SELECT * FROM quotes WHERE user_id = ? AND is_favorite = 1 ORDER BY created_at DESC", (user["id"],))
    else:
        rows = db.fetchall("SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
    
    out = []
    for r in rows:
        d = dict(r)
        d["is_favorite"] = bool(d["is_favorite"])
        out.append(QuoteOut(**d))
    return out

@api.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote(quote_id: str, user: dict = Depends(current_user)):
    row = db.fetchone("SELECT * FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"]))
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    
    d = dict(row)
    d["is_favorite"] = bool(d["is_favorite"])
    return QuoteOut(**d)

@api.post("/quotes/{quote_id}/favorite", response_model=QuoteOut)
async def toggle_favorite(quote_id: str, user: dict = Depends(current_user)):
    row = db.fetchone("SELECT is_favorite FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"]))
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    
    new_val = 0 if row["is_favorite"] else 1
    db.execute("UPDATE quotes SET is_favorite = ? WHERE id = ?", (new_val, quote_id))
    
    row = db.fetchone("SELECT * FROM quotes WHERE id = ?", (quote_id,))
    d = dict(row)
    d["is_favorite"] = bool(d["is_favorite"])
    return QuoteOut(**d)

@api.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(current_user)):
    deleted = db.execute("DELETE FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"]))
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

@api.get("/")
async def root():
    return {"app": "Muse", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
