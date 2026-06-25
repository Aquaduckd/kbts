import {
  ContentInstance,
  ContentType,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

const REF_WIDTH = 640;
const REF_HEIGHT = 480;
const BASE_PADDLE_WIDTH = 10;
const BASE_PADDLE_HEIGHT = 72;
const BASE_BALL_SIZE = 10;
const BASE_BALL_SPEED = 280;
const BASE_MARGIN_X = 24;
const PADDLE_HIT_SPEED_BOOST = 1.02;
/** Max angle added to rebound direction at paddle top/bottom (radians). */
const PADDLE_MAX_DEFLECTION_ANGLE = Math.PI / 6;
/** Min spacing between trail samples, as a fraction of ball diameter. */
const BALL_TRAIL_SPACING_FACTOR = 0.35;
/** Max trail arc length, as a multiple of ball diameter. */
const BALL_TRAIL_DISTANCE_FACTOR = 15;
const BALL_TRAIL_MAX_POINTS = 256;
/** Fixed Doppler tint strength (0 = neutral, 1 = full blue/red). */
const DOPPLER_SHIFT_STRENGTH = 0.5;
const RANDOM_SHOT_CHANCE = 0.5;
const AI_VS_AI_AUTO_CONTINUE_MS = 3000;

type AiId = "easy" | "medium" | "hard" | "expert" | "impossible" | "ludicrous";
type Player1Mode = "human" | AiId;

const AI_OPTIONS: { id: AiId; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
  { id: "impossible", label: "Impossible" },
  { id: "ludicrous", label: "Ludicrous" },
];

/** Paddle heights per second at reference panel height. */
const TRACKING_AI_SPEED = 252 / REF_HEIGHT;
const EASY_AI_SPEED_MULTIPLIER = 0.8;
const IMPOSSIBLE_AI_SPEED_MULTIPLIER = 2;
/** Fraction of half-court width past center before Hard AI starts tracking. */
const HARD_EARLY_TRACK_HALF_FRACTION = 0.5;

interface GameMetrics {
  scaleX: number;
  scaleY: number;
  scale: number;
  paddleWidth: number;
  paddleHeight: number;
  ballSize: number;
  ballSpeed: number;
  marginX: number;
  playerX: number;
  aiX: number;
}

interface PongState {
  playerY: number;
  aiY: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  playerScore: number;
  aiScore: number;
}

class PongContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scoreEl: HTMLSpanElement | null = null;
  private hintEl: HTMLDivElement | null = null;
  private state: PongState = this.createInitialState();
  private animationId = 0;
  private running = false;
  private lastFrameTime = 0;
  private pointerActive = false;
  private pointerY = 0;
  private width = 0;
  private height = 0;
  private gameInitialized = false;
  private paused = false;
  private pauseMessage: string | null = null;
  private nextServeDirection: 1 | -1 = 1;
  private player1Mode: Player1Mode = "human";
  private player2Ai: AiId = "easy";
  private player1StoppedAfterHit = false;
  private player1ReturningToCenter = false;
  private player2StoppedAfterHit = false;
  private player2ReturningToCenter = false;
  private ballTrail: { x: number; y: number }[] = [];
  private lastTrailSampleX = 0;
  private lastTrailSampleY = 0;
  private trailSampleReady = false;
  private autoContinueTimeout: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly abort = new AbortController();

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "flex h-full w-full min-h-0 flex-col bg-slate-950 text-slate-100";

    const header = document.createElement("div");
    header.className =
      "flex shrink-0 flex-col gap-1 border-b border-slate-800 px-3 py-2";

    const scoreHintRow = document.createElement("div");
    scoreHintRow.className = "flex items-center justify-between gap-2";

    this.scoreEl = document.createElement("span");
    this.scoreEl.className = "shrink-0 font-mono text-xs text-slate-400";
    this.updateScoreDisplay();

    const hint = document.createElement("div");
    hint.className = "min-w-0 text-right text-xs text-slate-500";
    this.hintEl = hint;
    this.updateHint();

    scoreHintRow.append(this.scoreEl, hint);

    const controlsRow = document.createElement("div");
    controlsRow.className = "flex items-center justify-end gap-2";

    const controls = document.createElement("div");
    controls.className = "flex shrink-0 flex-wrap items-center justify-end gap-2";

    controls.append(
      this.createPlayer1Field(),
      this.createPlayer2Field(),
      this.createResetButton(),
    );

    controlsRow.append(controls);
    header.append(scoreHintRow, controlsRow);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "block min-h-0 w-full flex-1 cursor-crosshair";
    this.ctx = this.canvas.getContext("2d");

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this.canvas);

    this.canvas.addEventListener(
      "mousemove",
      (event) => {
        if (this.paused || this.player1Mode !== "human") {
          return;
        }

        this.pointerActive = true;
        this.pointerY = this.canvasYFromEvent(event);
      },
      { signal: this.abort.signal },
    );
    this.canvas.addEventListener(
      "mouseleave",
      () => {
        this.pointerActive = false;
      },
      { signal: this.abort.signal },
    );
    this.canvas.addEventListener(
      "click",
      () => {
        if (this.paused && !this.isAiVsAi()) {
          this.continuePlay();
        }
      },
      { signal: this.abort.signal },
    );

    this.root.append(header, this.canvas);
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.resizeCanvas();
    this.startLoop();
  }

  deactivate(): void {
    this.stopLoop();
    this.clearAutoContinue();
    this.root?.remove();
  }

  destroy(): void {
    this.stopLoop();
    this.clearAutoContinue();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.abort.abort();
    this.deactivate();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.scoreEl = null;
    this.hintEl = null;
  }

  onResize(_width: number, _height: number): void {
    this.resizeCanvas();
  }

  onBlur(): void {
    super.onBlur();
    this.pointerActive = false;
  }

  private resetPaddleAiState(): void {
    this.player1StoppedAfterHit = false;
    this.player1ReturningToCenter = false;
    this.player2StoppedAfterHit = false;
    this.player2ReturningToCenter = false;
  }

  private clearBallTrail(): void {
    this.ballTrail = [];
    this.trailSampleReady = false;
  }

  private pushTrailPoint(x: number, y: number): void {
    this.ballTrail.push({ x, y });

    const metrics = this.getMetrics();
    const maxDistance = metrics.ballSize * BALL_TRAIL_DISTANCE_FACTOR;
    let length = 0;
    for (let i = this.ballTrail.length - 1; i >= 1; i--) {
      const current = this.ballTrail[i];
      const previous = this.ballTrail[i - 1];
      length += Math.hypot(current.x - previous.x, current.y - previous.y);
      if (length > maxDistance) {
        this.ballTrail.splice(0, i);
        break;
      }
    }

    if (this.ballTrail.length > BALL_TRAIL_MAX_POINTS) {
      this.ballTrail.splice(0, this.ballTrail.length - BALL_TRAIL_MAX_POINTS);
    }
  }

  private recordBallTrailPosition(): void {
    const { ballX, ballY } = this.state;
    const metrics = this.getMetrics();
    const spacing = Math.max(1.5, metrics.ballSize * BALL_TRAIL_SPACING_FACTOR);

    if (!this.trailSampleReady) {
      this.pushTrailPoint(ballX, ballY);
      this.lastTrailSampleX = ballX;
      this.lastTrailSampleY = ballY;
      this.trailSampleReady = true;
      return;
    }

    const dx = ballX - this.lastTrailSampleX;
    const dy = ballY - this.lastTrailSampleY;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.01) {
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.pushTrailPoint(
        this.lastTrailSampleX + dx * t,
        this.lastTrailSampleY + dy * t,
      );
    }

    this.lastTrailSampleX = ballX;
    this.lastTrailSampleY = ballY;
  }

  private updateHint(): void {
    if (!this.hintEl) {
      return;
    }

    this.hintEl.textContent =
      this.player1Mode === "human" ? "Move paddle with mouse" : "";
  }

  private createPlayer1Field(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "flex items-center gap-1.5";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "P1";

    const select = document.createElement("select");
    select.className =
      "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500";
    select.value = this.player1Mode;

    const humanOption = document.createElement("option");
    humanOption.value = "human";
    humanOption.textContent = "Human";
    select.append(humanOption);

    for (const option of AI_OPTIONS) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      select.append(el);
    }

    select.addEventListener(
      "change",
      () => {
        this.player1Mode = select.value as Player1Mode;
        this.pointerActive = false;
        this.resetPaddleAiState();
        this.updateHint();
        if (this.paused) {
          this.clearAutoContinue();
          this.scheduleAutoContinue();
        }
        if (this.canvas) {
          this.canvas.className =
            this.player1Mode === "human"
              ? "block min-h-0 w-full flex-1 cursor-crosshair"
              : "block min-h-0 w-full flex-1";
        }
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createPlayer2Field(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "flex items-center gap-1.5";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "P2";

    const select = document.createElement("select");
    select.className =
      "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500";
    select.value = this.player2Ai;

    for (const option of AI_OPTIONS) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      select.append(el);
    }

    select.addEventListener(
      "change",
      () => {
        this.player2Ai = select.value as AiId;
        this.resetPaddleAiState();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createResetButton(): HTMLButtonElement {
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.className =
      "cursor-pointer rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    resetButton.addEventListener(
      "click",
      () => {
        this.resetMatch();
      },
      { signal: this.abort.signal },
    );
    return resetButton;
  }

  private createInitialState(): PongState {
    return {
      playerY: 0,
      aiY: 0,
      ballX: 0,
      ballY: 0,
      ballVX: 0,
      ballVY: 0,
      playerScore: 0,
      aiScore: 0,
    };
  }

  private getMetrics(): GameMetrics {
    const scaleX = this.width / REF_WIDTH;
    const scaleY = this.height / REF_HEIGHT;
    const scale = Math.sqrt(scaleX * scaleY);
    const paddleWidth = BASE_PADDLE_WIDTH * scaleX;
    const marginX = BASE_MARGIN_X * scaleX;

    return {
      scaleX,
      scaleY,
      scale,
      paddleWidth,
      paddleHeight: BASE_PADDLE_HEIGHT * scaleY,
      ballSize: BASE_BALL_SIZE * scale,
      ballSpeed: BASE_BALL_SPEED * scale,
      marginX,
      playerX: marginX,
      aiX: this.width - marginX - paddleWidth,
    };
  }

  private isAiVsAi(): boolean {
    return this.player1Mode !== "human";
  }

  private clearAutoContinue(): void {
    if (this.autoContinueTimeout !== null) {
      clearTimeout(this.autoContinueTimeout);
      this.autoContinueTimeout = null;
    }
  }

  private scheduleAutoContinue(): void {
    this.clearAutoContinue();
    if (!this.isAiVsAi()) {
      return;
    }

    this.autoContinueTimeout = setTimeout(() => {
      this.autoContinueTimeout = null;
      this.continuePlay();
    }, AI_VS_AI_AUTO_CONTINUE_MS);
  }

  private resetMatch(): void {
    this.clearAutoContinue();
    this.paused = false;
    this.pauseMessage = null;
    this.resetPaddleAiState();
    this.state = this.createInitialState();
    this.gameInitialized = false;
    this.centerPaddles();
    this.serveBall(Math.random() < 0.5 ? 1 : -1);
    this.gameInitialized = true;
    this.updateScoreDisplay();
  }

  private pauseForPoint(message: string, serveDirection: 1 | -1): void {
    this.paused = true;
    this.pauseMessage = message;
    this.nextServeDirection = serveDirection;
    this.clearBallTrail();
    this.scheduleAutoContinue();
  }

  private continuePlay(): void {
    if (!this.paused) {
      return;
    }

    this.clearAutoContinue();
    this.paused = false;
    this.pauseMessage = null;
    this.serveBall(this.nextServeDirection);
  }

  private centerPaddles(): void {
    const center = this.height / 2;
    this.state.playerY = center;
    this.state.aiY = center;
  }

  private serveBall(direction: 1 | -1): void {
    const { ballSpeed } = this.getMetrics();
    this.resetPaddleAiState();
    this.clearBallTrail();
    this.state.ballX = this.width / 2;
    this.state.ballY = this.height / 2;
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
    this.state.ballVX = Math.cos(angle) * ballSpeed * direction;
    this.state.ballVY = Math.sin(angle) * ballSpeed;
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.root) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width));
    const nextHeight = Math.max(1, Math.floor(rect.height));
    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = nextWidth;
    this.height = nextHeight;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this.gameInitialized) {
      this.centerPaddles();
      this.serveBall(1);
      this.gameInitialized = true;
      return;
    }

    if (previousWidth <= 0 || previousHeight <= 0) {
      return;
    }

    const widthScale = this.width / previousWidth;
    const heightScale = this.height / previousHeight;
    const previousScale = Math.sqrt(
      (previousWidth / REF_WIDTH) * (previousHeight / REF_HEIGHT),
    );
    const nextScale = Math.sqrt(
      (this.width / REF_WIDTH) * (this.height / REF_HEIGHT),
    );
    const velocityScale =
      previousScale > 0 ? nextScale / previousScale : 1;

    this.state.playerY = this.clampPaddleY(this.state.playerY * heightScale);
    this.state.aiY = this.clampPaddleY(this.state.aiY * heightScale);
    this.state.ballX = this.clampBallX(this.state.ballX * widthScale);
    this.state.ballY = this.clampBallY(this.state.ballY * heightScale);
    this.state.ballVX *= velocityScale;
    this.state.ballVY *= velocityScale;
    this.ballTrail = this.ballTrail.map((point) => ({
      x: point.x * widthScale,
      y: point.y * heightScale,
    }));
    if (this.trailSampleReady) {
      this.lastTrailSampleX *= widthScale;
      this.lastTrailSampleY *= heightScale;
    }
  }

  private canvasYFromEvent(event: MouseEvent): number {
    if (!this.canvas) {
      return 0;
    }

    const rect = this.canvas.getBoundingClientRect();
    return event.clientY - rect.top;
  }

  private startLoop(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastFrameTime = performance.now();
    this.animationId = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  private tick = (time: number): void => {
    if (!this.running) {
      return;
    }

    const dt = Math.min(0.032, (time - this.lastFrameTime) / 1000);
    this.lastFrameTime = time;
    this.step(dt);
    this.draw();
    this.animationId = requestAnimationFrame(this.tick);
  };

  private step(dt: number): void {
    if (this.width <= 0 || this.height <= 0 || this.paused) {
      return;
    }

    this.updatePlayer1(dt);
    this.updatePlayer2(dt);
    this.updateBall(dt);
    this.recordBallTrailPosition();
  }

  private updatePlayer1(dt: number): void {
    if (this.player1Mode === "human") {
      if (!this.pointerActive) {
        return;
      }

      this.state.playerY = this.clampPaddleY(this.pointerY);
      return;
    }

    this.updatePlayer1Ai(dt, this.player1Mode);
  }

  private updatePlayer2(dt: number): void {
    this.updatePlayer2Ai(dt, this.player2Ai);
  }

  private updatePlayer1Ai(dt: number, ai: AiId): void {
    switch (ai) {
      case "easy":
        this.updatePlayer1TrackingAi(dt, "easy", () => this.state.ballY);
        break;
      case "medium":
        this.updatePlayer1TrackingAi(dt, "medium", () =>
          this.getPredictedBallYAtPlayerPaddle(),
        );
        break;
      case "hard":
        this.updatePlayer1TrackingAi(dt, "hard", () =>
          this.getPredictedBallYAtPlayerPaddle(),
        );
        break;
      case "expert":
      case "impossible":
      case "ludicrous":
        this.updatePlayer1AnticipateAi(dt, ai);
        break;
    }
  }

  private updatePlayer2Ai(dt: number, ai: AiId): void {
    switch (ai) {
      case "easy":
        this.updatePlayer2TrackingAi(dt, "easy", () => this.state.ballY);
        break;
      case "medium":
        this.updatePlayer2TrackingAi(dt, "medium", () =>
          this.getPredictedBallYAtPlayer2Paddle(),
        );
        break;
      case "hard":
        this.updatePlayer2TrackingAi(dt, "hard", () =>
          this.getPredictedBallYAtPlayer2Paddle(),
        );
        break;
      case "expert":
      case "impossible":
      case "ludicrous":
        this.updatePlayer2AnticipateAi(dt, ai);
        break;
    }
  }

  private aiUsesDirectedShots(ai: AiId): boolean {
    return (
      ai === "easy" ||
      ai === "medium" ||
      ai === "hard" ||
      ai === "expert" ||
      ai === "impossible" ||
      ai === "ludicrous"
    );
  }

  private aiUsesRandomShotsOnly(ai: AiId): boolean {
    return ai === "easy" || ai === "medium" || ai === "ludicrous";
  }

  private aiReturnsToCenter(ai: AiId): boolean {
    return ai === "expert" || ai === "impossible";
  }

  private trackingSpeedFor(ai: AiId): number {
    if (ai === "easy") {
      return TRACKING_AI_SPEED * EASY_AI_SPEED_MULTIPLIER;
    }

    if (ai === "impossible") {
      return TRACKING_AI_SPEED * IMPOSSIBLE_AI_SPEED_MULTIPLIER;
    }

    return TRACKING_AI_SPEED;
  }

  private aiStopsOnHit(_ai: AiId): boolean {
    return true;
  }

  private isBallOnPlayer1Side(): boolean {
    return this.state.ballX <= this.width / 2;
  }

  private isBallOnPlayer2Side(): boolean {
    return this.state.ballX >= this.width / 2;
  }

  private isBallInPlayer1TrackingZone(ai: AiId): boolean {
    const center = this.width / 2;
    if (ai === "hard" && this.state.ballVX < 0) {
      const earlyMargin = center * HARD_EARLY_TRACK_HALF_FRACTION;
      return this.state.ballX <= center + earlyMargin;
    }

    return this.state.ballX <= center;
  }

  private isBallInPlayer2TrackingZone(ai: AiId): boolean {
    const center = this.width / 2;
    if (ai === "hard" && this.state.ballVX > 0) {
      const earlyMargin = center * HARD_EARLY_TRACK_HALF_FRACTION;
      return this.state.ballX >= center - earlyMargin;
    }

    return this.state.ballX >= center;
  }

  private updatePlayer1TrackingAi(
    dt: number,
    ai: AiId,
    targetY: () => number,
  ): void {
    if (!this.isBallInPlayer1TrackingZone(ai)) {
      this.player1StoppedAfterHit = false;
      return;
    }

    this.movePlayer1Toward(targetY(), dt, this.trackingSpeedFor(ai));
  }

  private updatePlayer2TrackingAi(
    dt: number,
    ai: AiId,
    targetY: () => number,
  ): void {
    if (!this.isBallInPlayer2TrackingZone(ai)) {
      this.player2StoppedAfterHit = false;
      return;
    }

    this.movePlayer2Toward(targetY(), dt, this.trackingSpeedFor(ai));
  }

  private updatePlayer1AnticipateAi(dt: number, ai: AiId): void {
    const speedPerHeight = this.trackingSpeedFor(ai);

    if (!this.isBallOnPlayer1Side()) {
      this.player1StoppedAfterHit = false;
      this.player1ReturningToCenter = false;
    }

    if (this.player1ReturningToCenter) {
      const center = this.height / 2;
      const diff = center - this.state.playerY;
      const maxMove = speedPerHeight * this.height * dt;
      if (Math.abs(diff) <= maxMove) {
        this.state.playerY = this.clampPaddleY(center);
        this.player1ReturningToCenter = false;
      } else {
        this.movePlayer1Toward(center, dt, speedPerHeight, true);
      }
      return;
    }

    if (this.state.ballVX >= 0) {
      return;
    }

    if (ai === "ludicrous") {
      this.movePlayer1TowardBallIntercept(dt);
      return;
    }

    this.movePlayer1Toward(
      this.getPredictedBallYAtPlayerPaddle(),
      dt,
      speedPerHeight,
    );
  }

  private updatePlayer2AnticipateAi(dt: number, ai: AiId): void {
    const speedPerHeight = this.trackingSpeedFor(ai);

    if (!this.isBallOnPlayer2Side()) {
      this.player2StoppedAfterHit = false;
      this.player2ReturningToCenter = false;
    }

    if (this.player2ReturningToCenter) {
      const center = this.height / 2;
      const diff = center - this.state.aiY;
      const maxMove = speedPerHeight * this.height * dt;
      if (Math.abs(diff) <= maxMove) {
        this.state.aiY = this.clampPaddleY(center);
        this.player2ReturningToCenter = false;
      } else {
        this.movePlayer2Toward(center, dt, speedPerHeight, true);
      }
      return;
    }

    if (this.state.ballVX <= 0) {
      return;
    }

    if (ai === "ludicrous") {
      this.movePlayer2TowardBallIntercept(dt);
      return;
    }

    this.movePlayer2Toward(
      this.getPredictedBallYAtPlayer2Paddle(),
      dt,
      speedPerHeight,
    );
  }

  private movePlayer1Toward(
    targetY: number,
    dt: number,
    speedPerHeight = TRACKING_AI_SPEED,
    force = false,
  ): void {
    if (!force && this.player1StoppedAfterHit) {
      return;
    }

    const diff = targetY - this.state.playerY;
    const maxMove = speedPerHeight * this.height * dt;
    const move = Math.max(-maxMove, Math.min(maxMove, diff));
    this.state.playerY = this.clampPaddleY(this.state.playerY + move);
  }

  private movePlayer2Toward(
    targetY: number,
    dt: number,
    speedPerHeight = TRACKING_AI_SPEED,
    force = false,
  ): void {
    if (!force && this.player2StoppedAfterHit) {
      return;
    }

    const diff = targetY - this.state.aiY;
    const maxMove = speedPerHeight * this.height * dt;
    const move = Math.max(-maxMove, Math.min(maxMove, diff));
    this.state.aiY = this.clampPaddleY(this.state.aiY + move);
  }

  private getPlayer1InterceptTime(metrics: GameMetrics): number | null {
    const { ballX, ballVX } = this.state;
    const half = metrics.ballSize / 2;
    const interceptX = metrics.playerX + metrics.paddleWidth + half;

    if (ballVX >= 0) {
      return null;
    }

    const timeToIntercept = (interceptX - ballX) / ballVX;
    return timeToIntercept > 0 ? timeToIntercept : null;
  }

  private getPlayer2InterceptTime(metrics: GameMetrics): number | null {
    const { ballX, ballVX } = this.state;
    const half = metrics.ballSize / 2;
    const interceptX = metrics.aiX - half;

    if (ballVX <= 0) {
      return null;
    }

    const timeToIntercept = (interceptX - ballX) / ballVX;
    return timeToIntercept > 0 ? timeToIntercept : null;
  }

  private moveTowardByDeadline(
    currentY: number,
    targetY: number,
    dt: number,
    timeRemaining: number,
  ): number {
    const diff = targetY - currentY;
    if (diff === 0 || timeRemaining <= 0) {
      return this.clampPaddleY(currentY);
    }

    const maxMove = (Math.abs(diff) / timeRemaining) * dt;
    const move = Math.max(-maxMove, Math.min(maxMove, diff));
    return this.clampPaddleY(currentY + move);
  }

  private movePlayer1TowardBallIntercept(dt: number): void {
    const metrics = this.getMetrics();
    const timeToIntercept = this.getPlayer1InterceptTime(metrics);
    if (timeToIntercept === null) {
      return;
    }

    const targetY = this.getPredictedBallYAtPlayerPaddle();
    this.state.playerY = this.moveTowardByDeadline(
      this.state.playerY,
      targetY,
      dt,
      timeToIntercept,
    );
  }

  private movePlayer2TowardBallIntercept(dt: number): void {
    const metrics = this.getMetrics();
    const timeToIntercept = this.getPlayer2InterceptTime(metrics);
    if (timeToIntercept === null) {
      return;
    }

    const targetY = this.getPredictedBallYAtPlayer2Paddle();
    this.state.aiY = this.moveTowardByDeadline(
      this.state.aiY,
      targetY,
      dt,
      timeToIntercept,
    );
  }

  private getPredictedBallYAtPlayerPaddle(): number {
    const metrics = this.getMetrics();
    const { ballX, ballY, ballVX, ballVY } = this.state;
    const half = metrics.ballSize / 2;
    const interceptX = metrics.playerX + metrics.paddleWidth + half;

    if (ballVX >= 0) {
      return ballY;
    }

    const timeToIntercept = (interceptX - ballX) / ballVX;
    if (timeToIntercept <= 0) {
      return ballY;
    }

    return this.predictBallYAfterTime(ballY, ballVY, timeToIntercept, half);
  }

  private getPredictedBallYAtPlayer2Paddle(): number {
    const metrics = this.getMetrics();
    const { ballX, ballY, ballVX, ballVY } = this.state;
    const half = metrics.ballSize / 2;
    const interceptX = metrics.aiX - half;

    if (ballVX <= 0) {
      return ballY;
    }

    const timeToIntercept = (interceptX - ballX) / ballVX;
    if (timeToIntercept <= 0) {
      return ballY;
    }

    return this.predictBallYAfterTime(ballY, ballVY, timeToIntercept, half);
  }

  private predictBallYAfterTime(
    startY: number,
    vy: number,
    time: number,
    ballHalf: number,
  ): number {
    const floor = ballHalf;
    const ceiling = this.height - ballHalf;
    let y = startY;
    let vel = vy;
    let remaining = time;

    while (remaining > 0 && vel !== 0) {
      if (vel > 0) {
        const distToWall = ceiling - y;
        const timeToWall = distToWall / vel;
        if (timeToWall >= remaining) {
          return y + vel * remaining;
        }

        remaining -= timeToWall;
        y = ceiling;
        vel = -vel;
        continue;
      }

      const distToWall = y - floor;
      const timeToWall = distToWall / -vel;
      if (timeToWall >= remaining) {
        return y + vel * remaining;
      }

      remaining -= timeToWall;
      y = floor;
      vel = -vel;
    }

    return y;
  }

  private getAiHitSpeed(metrics: GameMetrics): number {
    return (
      Math.hypot(this.state.ballVX, this.state.ballVY) * PADDLE_HIT_SPEED_BOOST ||
      metrics.ballSpeed
    );
  }

  private applyPaddleDeflectionHit(
    paddleY: number,
    toward: "left" | "right",
    metrics: GameMetrics,
  ): void {
    const { state } = this;
    const paddleHalf = metrics.paddleHeight / 2;
    const offset = (state.ballY - paddleY) / paddleHalf;
    const t = Math.max(-1, Math.min(1, offset));

    const reboundVX =
      toward === "right"
        ? Math.abs(state.ballVX) * PADDLE_HIT_SPEED_BOOST
        : -Math.abs(state.ballVX) * PADDLE_HIT_SPEED_BOOST;
    const reboundVY = state.ballVY;
    let speed = Math.hypot(reboundVX, reboundVY);
    if (speed <= 0) {
      speed = this.getAiHitSpeed(metrics);
    }

    const angle =
      Math.atan2(reboundVY, reboundVX) + t * PADDLE_MAX_DEFLECTION_ANGLE;

    state.ballVX = Math.cos(angle) * speed;
    state.ballVY = Math.sin(angle) * speed;
    this.clampBallVelocity(metrics);
  }

  private getOppositeTargetY(
    opponentY: number,
    metrics: GameMetrics,
  ): number {
    const inset = metrics.ballSize / 2 + metrics.paddleHeight * 0.35;

    if (opponentY <= this.height / 2) {
      return this.height - inset;
    }

    return inset;
  }

  private getPlayerOppositeTargetY(metrics: GameMetrics): number {
    return this.getOppositeTargetY(this.state.playerY, metrics);
  }

  private getPlayer2OppositeTargetY(metrics: GameMetrics): number {
    return this.getOppositeTargetY(this.state.aiY, metrics);
  }

  private applyAiShotAwayFromPlayer(metrics: GameMetrics): void {
    const { state } = this;
    const targetY = this.getPlayerOppositeTargetY(metrics);
    const targetX = metrics.playerX;
    const dx = targetX - state.ballX;
    const dy = targetY - state.ballY;
    const angle = Math.atan2(dy, dx);
    const speed = this.getAiHitSpeed(metrics);

    state.ballVX = Math.cos(angle) * speed;
    state.ballVY = Math.sin(angle) * speed;
    this.clampBallVelocity(metrics);
  }

  private applyAiShotAwayFromPlayer2(metrics: GameMetrics): void {
    const { state } = this;
    const targetY = this.getPlayer2OppositeTargetY(metrics);
    const targetX = metrics.aiX;
    const dx = targetX - state.ballX;
    const dy = targetY - state.ballY;
    const angle = Math.atan2(dy, dx);
    const speed = this.getAiHitSpeed(metrics);

    state.ballVX = Math.cos(angle) * speed;
    state.ballVY = Math.sin(angle) * speed;
    this.clampBallVelocity(metrics);
  }

  private randomPointOnHalf(
    towardLeft: boolean,
    metrics: GameMetrics,
  ): { x: number; y: number } {
    const half = metrics.ballSize / 2;
    const minY = half;
    const maxY = this.height - half;
    const y = minY + Math.random() * (maxY - minY);

    if (towardLeft) {
      const minX = half;
      const maxX = this.width / 2 - half;
      return { x: minX + Math.random() * (maxX - minX), y };
    }

    const minX = this.width / 2 + half;
    const maxX = this.width - half;
    return { x: minX + Math.random() * (maxX - minX), y };
  }

  private applyAiRandomShot(
    metrics: GameMetrics,
    toward: "left" | "right",
  ): void {
    const { state } = this;
    const { x: targetX, y: targetY } = this.randomPointOnHalf(
      toward === "left",
      metrics,
    );
    const dx = targetX - state.ballX;
    const dy = targetY - state.ballY;
    const angle = Math.atan2(dy, dx);
    const speed = this.getAiHitSpeed(metrics);

    state.ballVX = Math.cos(angle) * speed;
    state.ballVY = Math.sin(angle) * speed;
    this.clampBallVelocity(metrics);
  }

  private applyAiDirectedHitAtPlayer(metrics: GameMetrics, ai: AiId): void {
    if (this.aiUsesRandomShotsOnly(ai) || Math.random() < RANDOM_SHOT_CHANCE) {
      this.applyAiRandomShot(metrics, "left");
      return;
    }

    this.applyAiShotAwayFromPlayer(metrics);
  }

  private applyAiDirectedHitAtPlayer2(metrics: GameMetrics, ai: AiId): void {
    if (this.aiUsesRandomShotsOnly(ai) || Math.random() < RANDOM_SHOT_CHANCE) {
      this.applyAiRandomShot(metrics, "right");
      return;
    }

    this.applyAiShotAwayFromPlayer2(metrics);
  }

  private updateBall(dt: number): void {
    const metrics = this.getMetrics();
    const { state } = this;
    state.ballX += state.ballVX * dt;
    state.ballY += state.ballVY * dt;

    const half = metrics.ballSize / 2;
    if (state.ballY - half <= 0) {
      state.ballY = half;
      state.ballVY = Math.abs(state.ballVY);
    } else if (state.ballY + half >= this.height) {
      state.ballY = this.height - half;
      state.ballVY = -Math.abs(state.ballVY);
    }

    const { playerX, aiX, paddleWidth } = metrics;

    if (
      state.ballVX < 0 &&
      this.intersectsPaddle(
        state.ballX,
        state.ballY,
        playerX,
        state.playerY,
        metrics,
      )
    ) {
      state.ballX = playerX + paddleWidth + half;
      if (this.player1Mode !== "human" && this.aiUsesDirectedShots(this.player1Mode)) {
        this.applyAiDirectedHitAtPlayer2(metrics, this.player1Mode);
      } else {
        this.applyPaddleDeflectionHit(state.playerY, "right", metrics);
      }
      if (this.player1Mode !== "human" && this.aiReturnsToCenter(this.player1Mode)) {
        this.player1ReturningToCenter = true;
      } else if (this.player1Mode !== "human" && this.aiStopsOnHit(this.player1Mode)) {
        this.player1StoppedAfterHit = true;
      }
    } else if (
      state.ballVX > 0 &&
      this.intersectsPaddle(state.ballX, state.ballY, aiX, state.aiY, metrics)
    ) {
      state.ballX = aiX - half;
      if (this.aiUsesDirectedShots(this.player2Ai)) {
        this.applyAiDirectedHitAtPlayer(metrics, this.player2Ai);
      } else {
        this.applyPaddleDeflectionHit(state.aiY, "left", metrics);
      }
      if (this.aiReturnsToCenter(this.player2Ai)) {
        this.player2ReturningToCenter = true;
      } else if (this.aiStopsOnHit(this.player2Ai)) {
        this.player2StoppedAfterHit = true;
      }
    }

    if (state.ballX < 0) {
      state.aiScore += 1;
      this.updateScoreDisplay();
      this.pauseForPoint("P2 scores", 1);
    } else if (state.ballX > this.width) {
      state.playerScore += 1;
      this.updateScoreDisplay();
      this.pauseForPoint("P1 scores", -1);
    }
  }

  private clampBallVelocity(metrics: GameMetrics): void {
    const { state } = this;
    const { ballSpeed } = metrics;
    const speed = Math.hypot(state.ballVX, state.ballVY);
    if (speed <= 0 || speed >= ballSpeed) {
      return;
    }

    const scale = ballSpeed / speed;
    state.ballVX *= scale;
    state.ballVY *= scale;
  }

  private intersectsPaddle(
    ballX: number,
    ballY: number,
    paddleX: number,
    paddleY: number,
    metrics: GameMetrics,
  ): boolean {
    const half = metrics.ballSize / 2;
    const paddleHalf = metrics.paddleHeight / 2;
    return (
      ballX + half >= paddleX &&
      ballX - half <= paddleX + metrics.paddleWidth &&
      ballY + half >= paddleY - paddleHalf &&
      ballY - half <= paddleY + paddleHalf
    );
  }

  private clampPaddleY(y: number): number {
    const half = this.getMetrics().paddleHeight / 2;
    return Math.max(half, Math.min(this.height - half, y));
  }

  private clampBallX(x: number): number {
    const half = this.getMetrics().ballSize / 2;
    return Math.max(half, Math.min(this.width - half, x));
  }

  private clampBallY(y: number): number {
    const half = this.getMetrics().ballSize / 2;
    return Math.max(half, Math.min(this.height - half, y));
  }

  private updateScoreDisplay(): void {
    if (!this.scoreEl) {
      return;
    }

    this.scoreEl.textContent = `P1 ${this.state.playerScore} · ${this.state.aiScore} P2`;
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) {
      return;
    }

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.width / 2, 0);
    ctx.lineTo(this.width / 2, this.height);
    ctx.stroke();
    ctx.setLineDash([]);

    const metrics = this.getMetrics();

    this.drawPaddle(ctx, metrics.playerX, this.state.playerY, "#38bdf8", metrics);
    this.drawPaddle(
      ctx,
      metrics.aiX,
      this.state.aiY,
      "#ef4444",
      metrics,
    );

    if (!this.paused) {
      const ballColor = this.getBallDopplerColor();
      this.drawBallTrail(ctx, metrics, ballColor);
      ctx.fillStyle = this.formatRgb(ballColor);
      ctx.beginPath();
      ctx.arc(
        this.state.ballX,
        this.state.ballY,
        metrics.ballSize / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    if (this.paused && this.pauseMessage) {
      this.drawPauseOverlay(ctx);
    }
  }

  private getBallDopplerColor(): { r: number; g: number; b: number } {
    const neutral = { r: 226, g: 232, b: 240 };
    const blueShift = { r: 56, g: 189, b: 248 };
    const redShift = { r: 248, g: 113, b: 113 };

    const target =
      this.state.ballVX < 0
        ? redShift
        : this.state.ballVX > 0
          ? blueShift
          : neutral;

    const shift = this.state.ballVX === 0 ? 0 : DOPPLER_SHIFT_STRENGTH;

    return {
      r: Math.round(neutral.r + (target.r - neutral.r) * shift),
      g: Math.round(neutral.g + (target.g - neutral.g) * shift),
      b: Math.round(neutral.b + (target.b - neutral.b) * shift),
    };
  }

  private formatRgb(
    color: { r: number; g: number; b: number },
    alpha?: number,
  ): string {
    if (alpha === undefined) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }

    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  private drawBallTrail(
    ctx: CanvasRenderingContext2D,
    metrics: GameMetrics,
    ballColor: { r: number; g: number; b: number },
  ): void {
    if (this.ballTrail.length < 2) {
      return;
    }

    const ballRadius = metrics.ballSize / 2;
    ctx.lineCap = "round";

    for (let i = 1; i < this.ballTrail.length; i++) {
      const fade = i / this.ballTrail.length;
      ctx.strokeStyle = this.formatRgb(ballColor, fade * 0.2);
      ctx.lineWidth = ballRadius * 2 * (0.3 + fade * 0.7);
      ctx.beginPath();
      ctx.moveTo(this.ballTrail[i - 1].x, this.ballTrail[i - 1].y);
      ctx.lineTo(this.ballTrail[i].x, this.ballTrail[i].y);
      ctx.stroke();
    }
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(2, 6, 23, 0.75)";
    ctx.fillRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(this.pauseMessage ?? "", centerX, centerY - 22);

    ctx.font = "500 22px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText(
      `P1 ${this.state.playerScore} · ${this.state.aiScore} P2`,
      centerX,
      centerY + 8,
    );

    if (!this.isAiVsAi()) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "400 13px system-ui, sans-serif";
      ctx.fillText("Click to continue", centerX, centerY + 38);
    }

    ctx.textAlign = "start";
  }

  private drawPaddle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    metrics: GameMetrics,
  ): void {
    ctx.fillStyle = color;
    ctx.fillRect(
      x,
      y - metrics.paddleHeight / 2,
      metrics.paddleWidth,
      metrics.paddleHeight,
    );
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }
}

export class PongContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new PongContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Pong";
  }
}
