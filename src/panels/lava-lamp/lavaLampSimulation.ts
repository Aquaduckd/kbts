/**
 * Direct port of https://github.com/lucia-gomez/lava-lamp/blob/main/blobs.js
 * (based on https://codepen.io/TC5550/pen/WNNWoaO)
 */
import {
  hexToRgb,
  hsvToRgb,
  LAVA_LAMP_TUNGSTEN_RGB,
  resolveLavaLampLayout,
  type LavaBlob,
  type LavaLampConfig,
  type LavaLampLayout,
} from "./lavaLampConfig.js";

function compileShader(
  gl: WebGLRenderingContext,
  source: string,
  type: number,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

export class LavaLampSimulation {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private width = 1;
  private height = 1;
  private config: LavaLampConfig;
  private layout: LavaLampLayout;
  private blobs: LavaBlob[] = [];
  private frameId = 0;
  private running = false;
  private program: WebGLProgram | null = null;
  private blobsHandle: WebGLUniformLocation | null = null;
  private color1Handle: WebGLUniformLocation | null = null;
  private color2Handle: WebGLUniformLocation | null = null;
  private bgColorHandle: WebGLUniformLocation | null = null;
  private error: string | null = null;
  private hue = 0;
  private lastFrameTime = 0;
  private pointerActive = false;
  private pointerX = 0;
  private pointerY = 0;

  constructor(canvas: HTMLCanvasElement, config: LavaLampConfig) {
    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL is not available");
    }

    this.canvas = canvas;
    this.gl = gl;
    this.config = config;
    this.layout = resolveLavaLampLayout(config, 1, 1);
  }

  getError(): string | null {
    return this.error;
  }

  setPointer(x: number, y: number, active: boolean): void {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerActive = active;
  }

  clearPointer(): void {
    this.pointerActive = false;
  }

  isPointerActive(): boolean {
    return this.pointerActive;
  }

  resize(width: number, height: number): void {
    const previousLayout = { ...this.layout };

    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);

    this.layout = resolveLavaLampLayout(this.config, this.width, this.height);

    if (this.blobs.length === 0) {
      this.blobs = this.getBlobs(this.layout.blobCount);
    } else {
      this.syncBlobsToLayout(previousLayout);
    }

    this.rebuildWebGl();
  }

  setConfig(next: LavaLampConfig): void {
    const previous = this.config;
    const previousLayout = { ...this.layout };
    this.config = next;
    this.layout = resolveLavaLampLayout(this.config, this.width, this.height);

    if (this.layout.blobCount !== previousLayout.blobCount) {
      this.blobs = this.getBlobs(this.layout.blobCount);
      this.rebuildWebGl();
      return;
    }

    if (next.stickiness !== previous.stickiness || next.glowiness !== previous.glowiness) {
      this.rebuildWebGl();
    }

    if (
      next.minBlobRadius !== previous.minBlobRadius
      || next.maxBlobRadius !== previous.maxBlobRadius
    ) {
      this.rescaleBlobRadii(previousLayout);
    }

    if (next.blobSpeed !== previous.blobSpeed && previous.blobSpeed > 0) {
      const ratio = next.blobSpeed / previous.blobSpeed;
      for (const blob of this.blobs) {
        blob.vx *= ratio;
        blob.vy *= ratio;
        blob.baseVx *= ratio;
        blob.baseVy *= ratio;
      }
    }
  }

  private syncBlobsToLayout(previousLayout: LavaLampLayout): void {
    if (this.layout.blobCount !== previousLayout.blobCount) {
      this.blobs = this.getBlobs(this.layout.blobCount);
      return;
    }

    this.rescaleBlobRadii(previousLayout);
  }

  private rescaleBlobRadii(previousLayout: LavaLampLayout): void {
    const previousMid =
      (previousLayout.minBlobSize + previousLayout.maxBlobSize) / 2;
    const nextMid = (this.layout.minBlobSize + this.layout.maxBlobSize) / 2;

    if (previousMid <= 0 || Math.abs(nextMid - previousMid) < 0.001) {
      return;
    }

    const scale = nextMid / previousMid;
    for (const blob of this.blobs) {
      blob.r = Math.min(
        this.layout.maxBlobSize,
        Math.max(this.layout.minBlobSize, blob.r * scale),
      );
    }
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastFrameTime = 0;
    this.frameId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    this.lastFrameTime = 0;
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  private getBlobs(numBlobs: number): LavaBlob[] {
    if (this.blobs.length === 0) {
      return Array.from({ length: numBlobs }, () => this.getBlob());
    }

    if (numBlobs >= this.blobs.length) {
      const added = Array.from(
        { length: numBlobs - this.blobs.length },
        () => this.getBlob(),
      );
      return [...this.blobs, ...added];
    }

    return this.blobs.slice(0, numBlobs);
  }

  private getBlobRadius(): number {
    const range = this.layout.maxBlobSize - this.layout.minBlobSize;
    return Math.random() * range + this.layout.minBlobSize;
  }

  private getBlob(): LavaBlob {
    let vx = 0;
    let vy = 0;

    do {
      vx = (Math.random() - 0.5) * this.config.blobSpeed;
      vy = (Math.random() - 0.5) * this.config.blobSpeed;
    } while (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05);

    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx,
      vy,
      baseVx: vx,
      baseVy: vy,
      r: this.getBlobRadius(),
    };
  }

  private applyViscosity(blob: LavaBlob, deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      return;
    }

    const blend = 1 - Math.exp(-this.config.viscosity * deltaSeconds);
    blob.vx += (blob.baseVx - blob.vx) * blend;
    blob.vy += (blob.baseVy - blob.vy) * blend;
  }

  private applyCursorForce(blob: LavaBlob, deltaSeconds: number): void {
    if (!this.pointerActive || deltaSeconds <= 0) {
      return;
    }

    const dx = blob.x - this.pointerX;
    const dy = blob.y - this.pointerY;
    const distSq = dx * dx + dy * dy;
    const radius = this.config.cursorForceRadius;
    const radiusSq = radius * radius;

    if (distSq >= radiusSq || distSq < 1) {
      return;
    }

    const dist = Math.sqrt(distSq);
    const falloff = 1 - dist / radius;
    const acceleration = this.config.cursorForceStrength * falloff * falloff;

    blob.vx += (dx / dist) * acceleration * deltaSeconds;
    blob.vy += (dy / dist) * acceleration * deltaSeconds;
  }

  private moveBlob(blob: LavaBlob): void {
    blob.x += blob.vx;
    blob.y += blob.vy;

    if (blob.x < blob.r) {
      blob.x = blob.r;
      blob.vx = Math.abs(blob.vx);
      blob.baseVx = Math.abs(blob.baseVx);
    } else if (blob.x > this.width - blob.r) {
      blob.x = this.width - blob.r;
      blob.vx = -Math.abs(blob.vx);
      blob.baseVx = -Math.abs(blob.baseVx);
    }

    if (blob.y < blob.r) {
      blob.y = blob.r;
      blob.vy = Math.abs(blob.vy);
      blob.baseVy = Math.abs(blob.baseVy);
    } else if (blob.y > this.height - blob.r) {
      blob.y = this.height - blob.r;
      blob.vy = -Math.abs(blob.vy);
      blob.baseVy = -Math.abs(blob.baseVy);
    }
  }

  private loop = (timestamp: number): void => {
    if (!this.running || !this.program) {
      return;
    }

    const deltaSeconds =
      this.lastFrameTime === 0 ? 0 : (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    this.hue = (this.hue + this.config.hueSpeed * deltaSeconds) % 360;

    for (const blob of this.blobs) {
      this.applyCursorForce(blob, deltaSeconds);
      this.applyViscosity(blob, deltaSeconds);
      this.moveBlob(blob);
    }

    this.drawFrame(this.hue);
    this.frameId = requestAnimationFrame(this.loop);
  };

  private drawFrame(hue: number): void {
    if (!this.program) {
      return;
    }

    const blobData = this.blobs.flatMap((blob) => [blob.x, blob.y, blob.r]);
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.uniform3fv(this.blobsHandle, new Float32Array(blobData));
    gl.uniform3fv(this.color1Handle, hsvToRgb(hue, 1, 1));
    gl.uniform3fv(this.color2Handle, LAVA_LAMP_TUNGSTEN_RGB);
    gl.uniform3fv(this.bgColorHandle, hexToRgb(this.config.backgroundColor));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private rebuildWebGl(): void {
    this.error = null;

    if (this.blobs.length === 0) {
      this.blobs = this.getBlobs(this.layout.blobCount);
    }

    try {
      this.webglSetup();
      if (this.running) {
        this.drawOnce();
      }
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
      this.program = null;
    }
  }

  private drawOnce(): void {
    this.drawFrame(this.hue);
  }

  private getVertexShader(): string {
    return `
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
  }

  private getFragmentShader(): string {
    const blobCount = Math.max(1, this.blobs.length);
    const stickiness = this.config.stickiness;
    const glowiness = this.config.glowiness;

    return `
precision highp float;

const float WIDTH = ${this.width}.0;
const float HEIGHT = ${this.height}.0;
const float THRESHOLD = 2.0 - float(${stickiness});
const float GLOW = float(${glowiness});

uniform vec3 blobs[${blobCount}];
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 bgColor;

void main() {
  float x = gl_FragCoord.x;
  float y = gl_FragCoord.y;

  float sum = 0.0;
  for (int i = 0; i < ${blobCount}; i++) {
    vec3 blob = blobs[i];
    float dx = blob.x - x;
    float dy = blob.y - y;
    float radius = blob.z;
    sum += (radius * radius) / (dx * dx + dy * dy);
  }

  vec3 blobColor = mix(color2, color1, y / HEIGHT);

  float body = smoothstep(THRESHOLD - 0.12, THRESHOLD + 0.08, sum);
  float halo = smoothstep(0.04, THRESHOLD * 0.92, sum) * GLOW;
  vec3 core = blobColor * (1.0 + body * 0.45);
  vec3 color = mix(bgColor, core, body);
  color += blobColor * halo * 0.4;

  gl_FragColor = vec4(color, 1.0);
}
`;
  }

  private webglSetup(): void {
    const gl = this.gl;
    const vertexShader = compileShader(gl, this.getVertexShader(), gl.VERTEX_SHADER);
    const fragmentShader = compileShader(
      gl,
      this.getFragmentShader(),
      gl.FRAGMENT_SHADER,
    );

    const program = gl.createProgram();
    if (!program) {
      throw new Error("Unable to create WebGL program");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unknown link error";
      throw new Error(message);
    }

    gl.useProgram(program);
    this.program = program;

    const vertexData = new Float32Array([
      -1, 1,
      -1, -1,
      1, 1,
      1, -1,
    ]);
    const vertexDataBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

    const positionHandle = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionHandle);
    gl.vertexAttribPointer(positionHandle, 2, gl.FLOAT, false, 0, 0);

    this.blobsHandle = gl.getUniformLocation(program, "blobs");
    this.color1Handle = gl.getUniformLocation(program, "color1");
    this.color2Handle = gl.getUniformLocation(program, "color2");
    this.bgColorHandle = gl.getUniformLocation(program, "bgColor");

    if (
      !this.blobsHandle ||
      !this.color1Handle ||
      !this.color2Handle ||
      !this.bgColorHandle
    ) {
      throw new Error("Missing WebGL uniform location");
    }
  }
}
