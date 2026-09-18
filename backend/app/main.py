from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import sqlite3
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

logger = logging.getLogger("atlas-api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

DATA_DIR = Path(os.getenv("DATA_DIR", "/home/liplin221/paper-trading-data"))
DB_PATH = DATA_DIR / "atlas.sqlite3"
INGEST_API_TOKEN = os.getenv("INGEST_API_TOKEN", "")
WECHAT_CALLBACK_TOKEN = os.getenv("WECHAT_CALLBACK_TOKEN", "")
WECHAT_WEBHOOK_URL = os.getenv("WECHAT_WEBHOOK_URL", "")
MAX_PAYLOAD_BYTES = int(os.getenv("MAX_PAYLOAD_BYTES", str(4 * 1024 * 1024)))
DATA_DIR.mkdir(parents=True, exist_ok=True)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PortfolioSummary(StrictModel):
    initial_capital: float = Field(gt=0)
    cash: float = Field(ge=0)
    total_value: float = Field(gt=0)
    daily_pnl: float
    daily_return: float
    cumulative_return: float
    currency: str = Field(default="USD", min_length=3, max_length=8)


class Position(StrictModel):
    symbol: str = Field(min_length=1, max_length=32)
    market: Literal["US", "HK"]
    name: str = Field(default="", max_length=120)
    quantity: float = Field(ge=0)
    price: float = Field(ge=0)
    market_value: float = Field(ge=0)
    weight: float = Field(ge=0, le=1)
    target_weight: float = Field(ge=0, le=1)
    daily_pnl: float = 0
    signal: Literal["BUY", "HOLD", "SELL"] = "HOLD"


class Signal(StrictModel):
    symbol: str = Field(min_length=1, max_length=32)
    market: Literal["US", "HK"]
    action: Literal["BUY", "HOLD", "SELL"]
    score: float = Field(ge=-1, le=1)
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(default="", max_length=500)


class MarketQuote(StrictModel):
    symbol: str = Field(min_length=1, max_length=32)
    market: Literal["US", "HK"]
    name: str = Field(default="", max_length=120)
    price: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=8)
    change_pct: float
    signal: Literal["BUY", "HOLD", "SELL"] = "HOLD"


class EquityPoint(StrictModel):
    date: date
    value: float = Field(gt=0)
    benchmark: float | None = Field(default=None, gt=0)


class BacktestMetrics(StrictModel):
    annual_return: float
    sharpe_ratio: float
    max_drawdown: float = Field(le=0)
    annual_volatility: float = Field(ge=0)
    win_rate: float = Field(ge=0, le=1)
    var_95: float = Field(le=0)
    beta: float


class ResearchReport(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2000)
    body_markdown: str = Field(default="", max_length=50_000)


class QuantRunPayload(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    run_id: str = Field(pattern=r"^[A-Za-z0-9._:-]{1,100}$")
    generated_at: datetime
    strategy_name: str = Field(min_length=1, max_length=120)
    risk_profile: Literal["conservative", "balanced", "aggressive"] = "balanced"
    portfolio: PortfolioSummary
    positions: list[Position] = Field(default_factory=list, max_length=1000)
    signals: list[Signal] = Field(default_factory=list, max_length=1000)
    market_snapshot: list[MarketQuote] = Field(default_factory=list, max_length=1000)
    equity_curve: list[EquityPoint] = Field(default_factory=list, max_length=5000)
    metrics: BacktestMetrics
    report: ResearchReport | None = None
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("generated_at")
    @classmethod
    def generated_at_must_have_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("generated_at must include a timezone")
        return value


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def initialize_database() -> None:
    with db_connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("PRAGMA synchronous = NORMAL")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS quant_runs (
                run_id TEXT PRIMARY KEY,
                idempotency_key TEXT NOT NULL UNIQUE,
                generated_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                total_value REAL NOT NULL,
                daily_pnl REAL NOT NULL,
                payload_sha256 TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS latest_state (
                singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                run_id TEXT NOT NULL REFERENCES quant_runs(run_id)
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS bot_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at TEXT NOT NULL,
                event_type TEXT NOT NULL,
                content TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_quant_runs_generated_at ON quant_runs(generated_at DESC)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_bot_events_received_at ON bot_events(received_at DESC)"
        )
        db.execute("PRAGMA optimize")


initialize_database()

app = FastAPI(
    title="ATLAS Quant API",
    version="1.0.0",
    description="Receives local quant results and serves the paper-trading dashboard.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.add_middleware(GZipMiddleware, minimum_size=500)


def require_ingest_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    if not INGEST_API_TOKEN:
        raise HTTPException(status_code=503, detail="ingest token is not configured")
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="missing bearer token")
    supplied = authorization[len(prefix) :]
    if not secrets.compare_digest(supplied, INGEST_API_TOKEN):
        raise HTTPException(status_code=403, detail="invalid bearer token")


def require_callback_token(
    x_callback_token: Annotated[str | None, Header()] = None,
    token: str | None = Query(default=None),
) -> None:
    supplied = x_callback_token or token or ""
    if not WECHAT_CALLBACK_TOKEN or not secrets.compare_digest(supplied, WECHAT_CALLBACK_TOKEN):
        raise HTTPException(status_code=403, detail="invalid callback token")


def load_latest_payload() -> dict[str, Any] | None:
    with db_connect() as db:
        row = db.execute(
            """
            SELECT r.payload_json
            FROM latest_state AS l
            JOIN quant_runs AS r ON r.run_id = l.run_id
            WHERE l.singleton_id = 1
            """
        ).fetchone()
    return json.loads(row["payload_json"]) if row else None


def send_wechat_notification(payload: dict[str, Any]) -> None:
    if not WECHAT_WEBHOOK_URL:
        return
    portfolio = payload["portfolio"]
    metrics = payload["metrics"]
    positions = payload.get("positions", [])
    changes = [
        f"{item['symbol']} {item['signal']} → {item['target_weight'] * 100:.1f}%"
        for item in positions
        if item["signal"] != "HOLD"
    ][:8]
    content = (
        f"### ATLAS 量化结果\n"
        f"> 策略：{payload['strategy_name']}\n"
        f"> 总资产：{portfolio['currency']} {portfolio['total_value']:.2f}\n"
        f"> 今日盈亏：{portfolio['daily_pnl']:+.2f} ({portfolio['daily_return']:+.2%})\n"
        f"> 夏普：{metrics['sharpe_ratio']:.2f}｜最大回撤：{metrics['max_drawdown']:.2%}\n"
    )
    if changes:
        content += "\n**调仓信号**\n" + "\n".join(f"> {line}" for line in changes)
    body = json.dumps(
        {"msgtype": "markdown", "markdown": {"content": content}}, ensure_ascii=False
    ).encode("utf-8")
    outbound = urllib.request.Request(
        WECHAT_WEBHOOK_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(outbound, timeout=8) as response:
            if response.status >= 300:
                logger.warning("wechat webhook returned status %s", response.status)
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.warning("wechat webhook delivery failed: %s", exc)


@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    with db_connect() as db:
        db.execute("SELECT 1").fetchone()
        latest = db.execute("SELECT run_id FROM latest_state WHERE singleton_id = 1").fetchone()
    return {
        "status": "ok",
        "service": "atlas-quant-api",
        "database": "ok",
        "latest_run_id": latest["run_id"] if latest else None,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.post(
    "/api/v1/quant/runs",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_ingest_token)],
)
def ingest_quant_run(
    payload: QuantRunPayload,
    background_tasks: BackgroundTasks,
    request: Request,
    x_idempotency_key: Annotated[str | None, Header(max_length=200)] = None,
) -> dict[str, Any]:
    payload_dict = payload.model_dump(mode="json")
    serialized = json.dumps(payload_dict, ensure_ascii=False, separators=(",", ":"))
    payload_bytes = serialized.encode("utf-8")
    if len(payload_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="payload is too large")
    digest = hashlib.sha256(payload_bytes).hexdigest()
    idempotency_key = x_idempotency_key or payload.run_id
    received_at = datetime.now(timezone.utc).isoformat()

    with db_connect() as db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            "SELECT run_id, payload_sha256 FROM quant_runs WHERE idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()
        if existing:
            if existing["payload_sha256"] != digest:
                db.rollback()
                raise HTTPException(status_code=409, detail="idempotency key already used")
            db.rollback()
            return {"ok": True, "duplicate": True, "run_id": existing["run_id"]}
        try:
            db.execute(
                """
                INSERT INTO quant_runs (
                    run_id, idempotency_key, generated_at, received_at,
                    strategy_name, total_value, daily_pnl, payload_sha256, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.run_id,
                    idempotency_key,
                    payload.generated_at.isoformat(),
                    received_at,
                    payload.strategy_name,
                    payload.portfolio.total_value,
                    payload.portfolio.daily_pnl,
                    digest,
                    serialized,
                ),
            )
        except sqlite3.IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="run_id already exists") from exc
        current = db.execute(
            """
            SELECT r.generated_at FROM latest_state AS l
            JOIN quant_runs AS r ON r.run_id = l.run_id
            WHERE l.singleton_id = 1
            """
        ).fetchone()
        if not current or payload.generated_at.isoformat() >= current["generated_at"]:
            db.execute(
                """
                INSERT INTO latest_state(singleton_id, run_id) VALUES (1, ?)
                ON CONFLICT(singleton_id) DO UPDATE SET run_id = excluded.run_id
                """,
                (payload.run_id,),
            )
        db.commit()

    logger.info(
        "accepted quant run %s from %s",
        payload.run_id,
        request.client.host if request.client else "unknown",
    )
    background_tasks.add_task(send_wechat_notification, payload_dict)
    return {"ok": True, "duplicate": False, "run_id": payload.run_id, "sha256": digest}


@app.get("/api/v1/dashboard/latest")
def latest_dashboard() -> dict[str, Any]:
    payload = load_latest_payload()
    return {"status": "ready" if payload else "empty", "data": payload}


@app.get("/api/v1/quant/runs")
def list_quant_runs(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    with db_connect() as db:
        rows = db.execute(
            """
            SELECT run_id, generated_at, received_at, strategy_name, total_value, daily_pnl
            FROM quant_runs ORDER BY generated_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.get("/api/v1/quant/runs/{run_id}")
def get_quant_run(run_id: str) -> dict[str, Any]:
    with db_connect() as db:
        row = db.execute(
            "SELECT payload_json FROM quant_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="run not found")
    return {"data": json.loads(row["payload_json"])}


def build_bot_reply(command: str, latest: dict[str, Any] | None) -> str:
    normalized = command.strip().lower()
    if normalized in {"help", "帮助", "菜单", "/help"}:
        return "可用指令：状态、组合、信号、帮助"
    if latest is None:
        return "尚未收到本地量化结果。"
    portfolio = latest["portfolio"]
    if normalized in {"status", "状态", "/status"}:
        return (
            f"{latest['strategy_name']}｜总资产 {portfolio['currency']} {portfolio['total_value']:.2f}｜"
            f"今日盈亏 {portfolio['daily_pnl']:+.2f} ({portfolio['daily_return']:+.2%})"
        )
    if normalized in {"portfolio", "组合", "持仓", "/portfolio"}:
        positions = sorted(
            latest.get("positions", []),
            key=lambda item: item.get("market_value", 0),
            reverse=True,
        )[:8]
        if not positions:
            return "当前组合没有持仓。"
        lines = [
            f"{item['symbol']} {item['weight']:.1%} → {item['target_weight']:.1%} {item['signal']}"
            for item in positions
        ]
        return "组合配置：\n" + "\n".join(lines)
    if normalized in {"signals", "signal", "信号", "/signals"}:
        signals = latest.get("signals", [])[:8]
        if not signals:
            return "当前没有调仓信号。"
        lines = [
            f"{item['symbol']} {item['action']}｜得分 {item['score']:+.2f}｜置信度 {item['confidence']:.0%}"
            for item in signals
        ]
        return "最新信号：\n" + "\n".join(lines)
    return "未识别的指令。发送“帮助”查看可用指令。"


@app.get(
    "/api/v1/wechat/callback",
    dependencies=[Depends(require_callback_token)],
    response_class=PlainTextResponse,
)
def verify_wechat_callback(challenge: str = Query(min_length=1, max_length=500)) -> str:
    """Generic challenge endpoint for a bot relay or WeCom gateway."""
    return challenge


@app.post(
    "/api/v1/wechat/callback",
    dependencies=[Depends(require_callback_token)],
)
async def receive_wechat_callback(
    payload: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    command_value = (
        payload.get("command")
        or payload.get("content")
        or payload.get("text")
        or payload.get("Content")
        or ""
    )
    if isinstance(command_value, dict):
        command_value = command_value.get("content", "")
    command = str(command_value).strip()
    if not command:
        raise HTTPException(status_code=422, detail="callback command is required")

    latest = load_latest_payload()
    reply = build_bot_reply(command, latest)
    received_at = datetime.now(timezone.utc).isoformat()
    event_type = str(payload.get("event_type") or payload.get("MsgType") or "command")[:100]
    with db_connect() as db:
        db.execute(
            """
            INSERT INTO bot_events(received_at, event_type, content, payload_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                received_at,
                event_type,
                command[:2000],
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            ),
        )
        db.commit()
    logger.info(
        "accepted bot callback from %s",
        request.client.host if request.client else "unknown",
    )
    return {"ok": True, "reply": reply}
