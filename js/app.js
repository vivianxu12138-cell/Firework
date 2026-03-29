import { FireworksEngine } from "./fireworks.js";

const PINCH_THRESHOLD_NORM = 0.06;
const TRIGGER_COOLDOWN_MS = 300;

/**
 * MediaPipe 模型文件 CDN：若 jsdelivr 在你所在网络失败，可改为 unpkg 行并注释上一行
 * 例：const MEDIAPIPE_HANDS_BASE = "https://unpkg.com/@mediapipe/hands/";
 */
const MEDIAPIPE_HANDS_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/";
// const MEDIAPIPE_HANDS_BASE = "https://unpkg.com/@mediapipe/hands/";

const videoEl = document.getElementById("camera");
const canvasEl = document.getElementById("fireworks-canvas");
const hintZh = document.getElementById("hint-zh");
const hintEn = document.getElementById("hint-en");

const ctx = canvasEl.getContext("2d");
const fireworks = new FireworksEngine();

let lastTriggerTime = 0;
let lastFrameTime = performance.now();

const TEXT = {
  loading: {
    zh: "正在请求摄像头与加载模型…",
    en: "Requesting camera and loading model…",
  },
  ready: {
    zh: "捏合拇指与食指，在指尖上方触发升空烟花",
    en: "Pinch thumb & index — a shell rises, then bursts at your fingertips",
  },
  error: {
    zh: "无法启动摄像头或 MediaPipe。",
    en: "Could not access camera or MediaPipe.",
  },
};

function setBilingual(zh, en) {
  hintZh.textContent = zh;
  hintEn.textContent = en;
}

function normalizedToCanvas(nx, ny, video, canvas, mirrorX) {
  const nxUse = mirrorX ? 1 - nx : nx;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!vw || !vh || !cw || !ch) return { x: nxUse * cw, y: ny * ch };

  const scale = Math.max(cw / vw, ch / vh);
  const scaledW = vw * scale;
  const scaledH = vh * scale;
  const offsetX = (cw - scaledW) / 2;
  const offsetY = (ch - scaledH) / 2;
  const px = nxUse * vw * scale + offsetX;
  const py = ny * vh * scale + offsetY;
  return { x: px, y: py };
}

function distanceNormXY(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  let w = canvasEl.clientWidth;
  let h = canvasEl.clientHeight;
  if (w < 2 || h < 2) {
    w = window.innerWidth || 300;
    h = window.innerHeight || 150;
  }
  canvasEl.width = Math.floor(w * dpr);
  canvasEl.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const RESIDUAL_FADE = 0.088;

function loop(now) {
  const dtMs = Math.min(50, now - lastFrameTime);
  lastFrameTime = now;

  if (canvasEl.width < 2 || canvasEl.height < 2) {
    resizeCanvas();
  }

  fireworks.update(dtMs);

  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;

  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0,0,0,${RESIDUAL_FADE})`;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  fireworks.draw(ctx);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  requestAnimationFrame(loop);
}

function onHandsResults(results) {
  if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) return;

  const now = performance.now();
  if (now - lastTriggerTime < TRIGGER_COOLDOWN_MS) return;

  for (const landmarks of results.multiHandLandmarks) {
    const thumb = landmarks[4];
    const index = landmarks[8];
    if (!thumb || !index) continue;

    const d = distanceNormXY(thumb, index);
    if (d >= PINCH_THRESHOLD_NORM) continue;

    const mx = (thumb.x + index.x) / 2;
    const my = (thumb.y + index.y) / 2;
    const { x, y } = normalizedToCanvas(mx, my, videoEl, canvasEl, true);

    fireworks.spawn(x, y);
    lastTriggerTime = now;
    break;
  }
}

async function main() {
  setBilingual(TEXT.loading.zh, TEXT.loading.en);

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  resizeCanvas();

  const HandsCtor = window.Hands;
  const CameraCtor = window.Camera;
  if (!HandsCtor || !CameraCtor) {
    throw new Error("MediaPipe Hands / Camera");
  }

  const hands = new HandsCtor({
    locateFile: (file) => `${MEDIAPIPE_HANDS_BASE}${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.4,
  });

  hands.onResults(onHandsResults);

  const camera = new CameraCtor(videoEl, {
    onFrame: async () => {
      await hands.send({ image: videoEl });
    },
    width: 1280,
    height: 720,
  });
  await camera.start();

  setBilingual(TEXT.ready.zh, TEXT.ready.en);
  resizeCanvas();
  requestAnimationFrame((t) => {
    lastFrameTime = t;
    loop(t);
  });
}

main().catch((err) => {
  console.error(err);
  const msg = err && err.message ? err.message : String(err);
  setBilingual(`${TEXT.error.zh} ${msg}`, `${TEXT.error.en} ${msg}`);
});
