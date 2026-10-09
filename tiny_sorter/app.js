const PREDICT_INTERVAL_MS = 300;
const CONFIDENCE_THRESHOLD = 0.7;
const STABLE_DECISION_FRAMES = 3;
const DECISION_KEEPALIVE_MS = 600;

const DEFAULT_SERVO_ANGLES = {
  left: 180,
  cam: 105,
  collector: 45,
  right: 9,
};

const SERVO_POSITION_LABELS = {
  left: "Left",
  cam: "Cam",
  collector: "Collector",
  right: "Right",
};

const CLASS_DECISIONS = {
  orange: "right",
  apple: "left",
};

const EMPTY_CLASS_NAMES = new Set(["nothing", "background"]);
const DEFAULT_MODEL_URL = "";
const MODEL_STORAGE_KEY = "tm_model_url";
const SERVO_ANGLES_KEY = "tiny_sorter_servo_angles_v3";

let model = null;
let stream = null;
let predictTimer = null;
let isRunning = false;
let isPredicting = false;

let port = null;
let writer = null;
let isConnected = false;

let servoAngles = loadServoAngles();
let decisionCandidate = "unknown";
let decisionCandidateFrames = 0;
let lastDecisionSent = null;
let lastDecisionSentAt = 0;

const textEncoder = new TextEncoder();

const modelUrlInput = document.getElementById("model-url");
const loadModelBtn = document.getElementById("load-model-btn");
const modelStatus = document.getElementById("model-status");
const webcam = document.getElementById("webcam");
const placeholder = document.getElementById("camera-placeholder");
const overlay = document.getElementById("live-overlay");
const liveLabel = document.getElementById("live-label");
const liveConfidence = document.getElementById("live-confidence");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusBadge = document.getElementById("status-badge");
const connectBtn = document.getElementById("connect-btn");
const serialStatus = document.getElementById("serial-status");
const servoPositionButtons = Array.from(
  document.querySelectorAll("[data-servo-position]"),
);
const servoAngleEditors = Array.from(
  document.querySelectorAll("[data-angle-edit]"),
);

function setSerialStatus(text, type = "idle") {
  serialStatus.textContent = text;
  serialStatus.className = `serial-status status-${type}`;
}

function setModelStatus(text, type = "idle") {
  modelStatus.textContent = text;
  modelStatus.className = `model-status status-${type}`;
}

function setStatus(text, type = "idle") {
  statusBadge.textContent = text;
  statusBadge.className = `badge badge-${type}`;
}

function isValidServoAngle(angle) {
  return Number.isInteger(angle) && angle >= 0 && angle <= 180;
}

function calibrationIsSafe() {
  return servoAngles.right < servoAngles.collector &&
    servoAngles.collector < servoAngles.cam &&
    servoAngles.cam < servoAngles.left;
}

function loadServoAngles() {
  try {
    const saved = JSON.parse(localStorage.getItem(SERVO_ANGLES_KEY));
    if (!saved || typeof saved !== "object") {
      return { ...DEFAULT_SERVO_ANGLES };
    }

    return Object.fromEntries(
      Object.entries(DEFAULT_SERVO_ANGLES).map(([position, defaultAngle]) => {
        const savedAngle = Number(saved[position]);
        return [
          position,
          isValidServoAngle(savedAngle) ? savedAngle : defaultAngle,
        ];
      }),
    );
  } catch {
    return { ...DEFAULT_SERVO_ANGLES };
  }
}

function saveServoAngles() {
  localStorage.setItem(SERVO_ANGLES_KEY, JSON.stringify(servoAngles));
}

function renderServoAngles() {
  servoAngleEditors.forEach((editor) => {
    const position = editor.dataset.angleEdit;
    editor.textContent = `${servoAngles[position]}\u00B0`;
    editor.title = `Edit ${SERVO_POSITION_LABELS[position]} angle`;
  });

  servoPositionButtons.forEach((button) => {
    const position = button.dataset.servoPosition;
    button.setAttribute(
      "aria-label",
      `Move servo ${SERVO_POSITION_LABELS[position]} to ${servoAngles[position]} degrees`,
    );
  });
}

function setServoButtonState() {
  servoPositionButtons.forEach((button) => {
    button.classList.toggle("is-unavailable", !isConnected);
    button.title = isConnected
      ? "Manual calibration stops the automatic sorter."
      : "Connect the Arduino first. Click a degree value to edit it.";
  });
}

function resetDecisionFilter() {
  decisionCandidate = "unknown";
  decisionCandidateFrames = 0;
  lastDecisionSent = null;
  lastDecisionSentAt = 0;
}

function resetSerialConnection(message, type = "idle") {
  if (writer) {
    try {
      writer.releaseLock();
    } catch (error) {
      console.warn("Could not release serial writer:", error);
    }
  }

  writer = null;
  port = null;
  isConnected = false;
  resetDecisionFilter();
  connectBtn.textContent = "Connect Arduino";
  connectBtn.disabled = !("serial" in navigator);
  setServoButtonState();
  setSerialStatus(message, type);
}

async function sendCommand(command) {
  if (!isConnected || !writer) return false;

  try {
    await writer.write(textEncoder.encode(`${command}\n`));
    return true;
  } catch (error) {
    console.error("Serial write failed:", error);
    resetSerialConnection(`Arduino disconnected: ${error.message}`, "error");
    return false;
  }
}

async function syncCalibration() {
  for (const position of ["left", "cam", "collector", "right"]) {
    const sent = await sendCommand(
      `cal:${position}:${servoAngles[position]}`,
    );
    if (!sent) return false;
  }

  return true;
}

async function connectArduino() {
  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    writer = port.writable.getWriter();
    isConnected = true;
    resetDecisionFilter();
    connectBtn.textContent = "Disconnect Arduino";
    connectBtn.disabled = false;
    setServoButtonState();

    await syncCalibration();
    await sendCommand(`move:${servoAngles.cam}`);

    if (isRunning) {
      await sendCommand("start");
      setSerialStatus("Camera active - waiting for nothing", "ready");
    } else {
      setSerialStatus("Arduino connected - ready for calibration", "ready");
    }
  } catch (error) {
    console.error("Could not connect to Arduino:", error);
    resetSerialConnection(`Connection failed: ${error.message}`, "error");
  }
}

async function disconnectArduino() {
  const activeWriter = writer;
  const activePort = port;

  isConnected = false;
  writer = null;
  port = null;
  connectBtn.disabled = true;
  connectBtn.textContent = "Disconnecting...";
  setServoButtonState();

  try {
    if (activeWriter) {
      await activeWriter.write(textEncoder.encode("stop\n"));
      activeWriter.releaseLock();
    }

    if (activePort) await activePort.close();
    resetSerialConnection("Arduino disconnected");
  } catch (error) {
    console.error("Could not close Arduino port cleanly:", error);
    resetSerialConnection(`Arduino disconnected: ${error.message}`, "error");
  }
}

async function toggleArduinoConnection() {
  if (isConnected) {
    await disconnectArduino();
  } else {
    await connectArduino();
  }
}

function handleSerialDisconnect() {
  resetSerialConnection("Arduino disconnected", "error");
}

function normalizeModelUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function normalizeClassName(label) {
  return String(label).normalize("NFKC").trim().toLowerCase();
}

async function fetchModelMetadata(baseUrl) {
  const response = await fetch(`${baseUrl}metadata.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load metadata.json (${response.status})`);
  }

  const metadata = await response.json();
  if (!Array.isArray(metadata.labels)) {
    throw new Error("metadata.json does not contain class labels");
  }

  return metadata;
}

function tmPredictionsToResults(predictions) {
  return predictions
    .map((prediction) => ({
      label: prediction.className,
      probability: prediction.probability,
      confidence: Math.round(prediction.probability * 10000) / 100,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function rawDecisionForPrediction(prediction) {
  if (!prediction || prediction.probability < CONFIDENCE_THRESHOLD) {
    return "unknown";
  }

  const className = normalizeClassName(prediction.label);
  if (EMPTY_CLASS_NAMES.has(className)) return "none";
  return CLASS_DECISIONS[className] || "unknown";
}

function stableDecisionForPrediction(prediction) {
  const nextCandidate = rawDecisionForPrediction(prediction);

  if (nextCandidate === decisionCandidate) {
    decisionCandidateFrames += 1;
  } else {
    decisionCandidate = nextCandidate;
    decisionCandidateFrames = 1;
  }

  if (decisionCandidateFrames < STABLE_DECISION_FRAMES) return "unknown";
  return decisionCandidate;
}

async function sendDecision(decision) {
  if (!isConnected || !isRunning) return;

  const now = Date.now();
  if (
    decision === lastDecisionSent &&
    now - lastDecisionSentAt < DECISION_KEEPALIVE_MS
  ) {
    return;
  }

  if (await sendCommand(`decision:${decision}`)) {
    lastDecisionSent = decision;
    lastDecisionSentAt = now;
  }
}

async function loadTeachableMachineModel(url) {
  const baseUrl = normalizeModelUrl(url);
  if (!baseUrl.includes("teachablemachine.withgoogle.com/models/")) {
    const error = new Error("Enter a Teachable Machine model link");
    setModelStatus(error.message, "error");
    throw error;
  }

  loadModelBtn.disabled = true;
  setModelStatus("Loading model...", "loading");

  try {
    const metadata = await fetchModelMetadata(baseUrl);
    const classLabels = metadata.labels;
    const normalizedLabels = classLabels.map(normalizeClassName);
    const missingClasses = Object.keys(CLASS_DECISIONS).filter(
      (requiredClass) => !normalizedLabels.includes(requiredClass),
    );
    const hasEmptyClass = normalizedLabels.some((label) =>
      EMPTY_CLASS_NAMES.has(label)
    );

    if (missingClasses.length || !hasEmptyClass) {
      const labelsText = classLabels.join(", ") || "none";
      throw new Error(
        `Model classes must include orange, apple, and nothing (or background). Found: ${labelsText}`,
      );
    }

    model = await tmImage.load(`${baseUrl}model.json`, `${baseUrl}metadata.json`);
    localStorage.setItem(MODEL_STORAGE_KEY, baseUrl);
    modelUrlInput.value = baseUrl;

    const labelsText = classLabels.join(", ");
    setModelStatus(`Loaded - classes: ${labelsText}`, "ready");

    startBtn.disabled = false;
    return model;
  } catch (error) {
    model = null;
    startBtn.disabled = true;
    setModelStatus(`Failed to load model: ${error.message}`, "error");
    throw error;
  } finally {
    loadModelBtn.disabled = false;
  }
}

async function showLivePrediction(predictions) {
  const topPrediction = predictions[0];
  if (!topPrediction) return;

  liveLabel.textContent = topPrediction.label;
  liveConfidence.textContent = `${topPrediction.confidence}%`;
  overlay.classList.remove("hidden");

  await sendDecision(stableDecisionForPrediction(topPrediction));
}

async function predictFrame() {
  if (!model || !isRunning || isPredicting) return;
  isPredicting = true;

  try {
    // Teachable Machine trains and previews webcam images horizontally flipped.
    const rawPredictions = await model.predict(webcam, true);
    await showLivePrediction(tmPredictionsToResults(rawPredictions));
  } catch (error) {
    console.error("Prediction error:", error);
  } finally {
    isPredicting = false;
  }
}

async function startSorting() {
  if (!model) {
    setModelStatus("Load a model first", "error");
    return;
  }

  if (!calibrationIsSafe()) {
    setSerialStatus(
      "Calibration must follow Right < Collector < Cam < Left.",
      "error",
    );
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    webcam.srcObject = stream;
    await webcam.play();
    placeholder.classList.add("hidden");
    isRunning = true;
    resetDecisionFilter();
    predictTimer = setInterval(() => void predictFrame(), PREDICT_INTERVAL_MS);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("Sorting", "live");

    if (isConnected) {
      await syncCalibration();
      await sendCommand("start");
      setSerialStatus("Camera active - waiting for nothing", "ready");
    }
  } catch (error) {
    setStatus(`Camera error: ${error.message}`, "error");
    console.error("Could not start camera:", error);
  }
}

async function stopSorting() {
  isRunning = false;
  clearInterval(predictTimer);
  predictTimer = null;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  webcam.srcObject = null;
  placeholder.classList.remove("hidden");
  overlay.classList.add("hidden");
  startBtn.disabled = !model;
  stopBtn.disabled = true;
  setStatus("Idle", "idle");
  resetDecisionFilter();

  if (isConnected) {
    await sendCommand("stop");
    setSerialStatus("Sorter stopped at its current position", "ready");
  }
}

async function editServoAngle(position) {
  const label = SERVO_POSITION_LABELS[position];
  const nextValue = window.prompt(
    `${label} servo angle (0-180)`,
    String(servoAngles[position]),
  );

  if (nextValue === null) return;

  const trimmed = nextValue.trim();
  const angle = Number(trimmed);
  if (!trimmed || !isValidServoAngle(angle)) {
    setSerialStatus("Enter a whole-number angle from 0 to 180.", "error");
    return;
  }

  servoAngles = { ...servoAngles, [position]: angle };
  saveServoAngles();
  renderServoAngles();

  if (isConnected) {
    await sendCommand("stop");
    await sendCommand(`cal:${position}:${angle}`);
  }

  setSerialStatus(
    `${label} angle set to ${angle} degrees`,
    isConnected ? "ready" : "idle",
  );
}

async function moveServoToPosition(position) {
  const label = SERVO_POSITION_LABELS[position];
  if (!isConnected) {
    setSerialStatus("Connect the Arduino before moving the servo.", "error");
    return;
  }

  await sendCommand("stop");
  await sendCommand(`cal:${position}:${servoAngles[position]}`);
  await sendCommand(`move:${servoAngles[position]}`);
  setSerialStatus(
    `Manual: moving to ${label.toLowerCase()} at ${servoAngles[position]} degrees`,
    "ready",
  );
}

loadModelBtn.addEventListener("click", async () => {
  try {
    await loadTeachableMachineModel(modelUrlInput.value);
  } catch {
    // loadTeachableMachineModel displays the visible error.
  }
});

modelUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadModelBtn.click();
});

startBtn.addEventListener("click", startSorting);
stopBtn.addEventListener("click", stopSorting);
connectBtn.addEventListener("click", toggleArduinoConnection);

servoPositionButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    const angleEditor = event.target.closest("[data-angle-edit]");
    if (angleEditor) {
      void editServoAngle(angleEditor.dataset.angleEdit);
      return;
    }

    void moveServoToPosition(button.dataset.servoPosition);
  });
});

(async function init() {
  renderServoAngles();
  setServoButtonState();

  if (!("serial" in navigator)) {
    connectBtn.disabled = true;
    setSerialStatus("Web Serial requires desktop Chrome or Edge.", "error");
  } else {
    navigator.serial.addEventListener("disconnect", handleSerialDisconnect);
  }

  const initialUrl = localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL_URL;
  if (!initialUrl) return;

  modelUrlInput.value = initialUrl;
  try {
    await loadTeachableMachineModel(initialUrl);
  } catch {
    // The visible model status explains why the saved model did not load.
  }
})();
