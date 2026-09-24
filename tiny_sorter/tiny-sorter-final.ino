// Tiny Sorter - round sorter production firmware
//
// The browser runs Teachable Machine and sends decisions over Web Serial.
// The Arduino owns the complete mechanical cycle:
// collect -> camera -> wait for decision -> eject -> repeat.

#include <Servo.h>

const byte SERVO_PIN = 9;

// ---- Calibrated positions -------------------------------------------------
// These defaults can also be changed at runtime from the four website buttons.
int leftPos = 180;
int camPos = 105;
int collectorPos = 45;
int rightPos = 9;

// ---- Motion tuning -------------------------------------------------------
const int MOTION_STEP_DEGREES = 1;
const unsigned long TRANSPORT_STEP_DELAY_MS = 18;
const unsigned long EJECT_MOVE_STEP_DELAY_MS = 16;

const int COLLECT_APPROACH_OFFSET_DEGREES = -3;
const int COLLECT_ORIENTATION_FIRST_OFFSET_DEGREES = 5;
const int COLLECT_FROM_RIGHT_SECOND_OFFSET_DEGREES = 8;
const int COLLECT_FROM_LEFT_SECOND_OFFSET_DEGREES = 12;
const unsigned long COLLECT_ORIENTATION_HOLD_MS = 300;
const unsigned long COLLECT_FROM_RIGHT_ORIENTATION_HOLD_MS = 150;
const unsigned long COLLECT_FROM_RIGHT_STEP_DELAY_MS = 14;

// Each stage has its own start/end positions so it can be tuned separately.
// Lower angles point toward the right-hand side of the machine.
const int COLLECT_INITIAL_START_OFFSET_DEGREES = -1;
const int COLLECT_INITIAL_END_OFFSET_DEGREES = 3;
const int COLLECT_INITIAL_ATTEMPTS = 2;
const int COLLECT_INITIAL_SWEEPS = 2;

const int COLLECT_MEDIUM_START_OFFSET_DEGREES = -5;
const int COLLECT_MEDIUM_END_OFFSET_DEGREES = 7;
const int COLLECT_MEDIUM_ATTEMPTS = 3;
const int COLLECT_MEDIUM_SWEEPS = 3;

const int COLLECT_WIDE_START_OFFSET_DEGREES = -7;
const int COLLECT_WIDE_END_OFFSET_DEGREES = 12;
const int COLLECT_WIDE_ATTEMPTS = 4;
const int COLLECT_WIDE_SWEEPS = 3;

const unsigned long COLLECT_JIGGLE_PULSE_MS = 120;
const unsigned long COLLECT_ATTEMPT_FALL_MS = 800;
const unsigned long COLLECT_ATTEMPT_REST_MS = 300;
const unsigned long COLLECT_FINAL_SETTLE_MS = 1500;

const int ROUTE_ADVANCE_DEGREES = 10;
const int ROUTE_BACK_DEGREES = 5;
const unsigned long ROUTE_BACK_STEP_DELAY_MS = 18;
const unsigned long ROUTE_BACK_HOLD_MS = 40;
const unsigned long ROUTE_ADVANCE_HOLD_MS = 100;
const unsigned long CAMERA_HOLD_MS = 500;


const int ANTI_JAM_SHAKE_DEGREES = 4;
const unsigned long ANTI_JAM_SHAKE_PULSE_MS = 80;
const unsigned long ANTI_JAM_SHAKE_SETTLE_MS = 100;

const int EJECT_SHAKE_ATTEMPTS = 6;
const int LEFT_RELEASE_DEGREES = 20;
const int RIGHT_EJECT_LOW_OFFSET_DEGREES = -9;
const int RIGHT_EJECT_HIGH_OFFSET_DEGREES = 6;
const int RIGHT_EJECT_DROP_OFFSET_DEGREES = 0;
const unsigned long EJECT_RELEASE_TRAVEL_MS = 70;
const unsigned long EJECT_RELEASE_HOLD_MS = 100;
const unsigned long RIGHT_EJECT_DROP_HOLD_MS = 160;
const unsigned long EJECT_SETTLE_MS = 100;

const unsigned long EMPTY_AT_CAMERA_CONFIRM_MS = 1800;

enum SortDecision {
  DECISION_UNKNOWN,
  DECISION_EMPTY,
  DECISION_LEFT,
  DECISION_RIGHT
};

enum SorterPhase {
  PHASE_STOPPED,
  PHASE_WAITING_FOR_NOTHING,
  PHASE_WAITING_FOR_CLASS
};

Servo sorterServo;

int currentAngle = 105;
int queuedManualAngle = -1;
bool runEnabled = false;
bool automaticMotionActive = false;
bool serialWasConnected = false;
SortDecision latestDecision = DECISION_UNKNOWN;
SorterPhase sorterPhase = PHASE_STOPPED;
unsigned long cameraReadyAt = 0;

char serialBuffer[64];
byte serialLength = 0;

int clampAngle(int angle) {
  return constrain(angle, 0, 180);
}

int collectApproachPos() {
  return clampAngle(collectorPos + COLLECT_APPROACH_OFFSET_DEGREES);
}

int separationPos() {
  return clampAngle(camPos - 13);
}

int leftReleasePos() {
  return clampAngle(leftPos - LEFT_RELEASE_DEGREES);
}

int rightEjectLowPos() {
  return clampAngle(rightPos + RIGHT_EJECT_LOW_OFFSET_DEGREES);
}

int rightEjectHighPos() {
  return clampAngle(rightPos + RIGHT_EJECT_HIGH_OFFSET_DEGREES);
}

int rightEjectDropPos() {
  return clampAngle(rightPos + RIGHT_EJECT_DROP_OFFSET_DEGREES);
}

void moveDirect(int angle) {
  currentAngle = clampAngle(angle);
  sorterServo.write(currentAngle);
}

bool isNumeric(const String &text) {
  if (text.length() == 0) return false;

  for (unsigned int index = 0; index < text.length(); index++) {
    if (!isDigit(text.charAt(index))) return false;
  }

  return true;
}

void reportPositions() {
  Serial.print(F("POSITIONS:left="));
  Serial.print(leftPos);
  Serial.print(F(",cam="));
  Serial.print(camPos);
  Serial.print(F(",collector="));
  Serial.print(collectorPos);
  Serial.print(F(",right="));
  Serial.println(rightPos);
}

bool calibrationIsSafe() {
  int approach = collectApproachPos();
  int separation = separationPos();

  return rightPos <= approach &&
         approach < collectorPos &&
         collectorPos < separation &&
         separation < camPos &&
         camPos < leftPos;
}

void setDecisionFromText(const String &value) {
  if (value == "left" || value == "apple" || value == "mallow") {
    latestDecision = DECISION_LEFT;
  } else if (value == "right" || value == "orange") {
    latestDecision = DECISION_RIGHT;
  } else if (value == "none" || value == "nothing" ||
             value == "background" || value == "empty") {
    latestDecision = DECISION_EMPTY;
  } else {
    latestDecision = DECISION_UNKNOWN;
  }
}

void setCalibration(const String &position, int angle) {
  if (angle < 0 || angle > 180) {
    Serial.println(F("ERROR:angle must be 0-180"));
    return;
  }

  if (position == "left") {
    leftPos = angle;
  } else if (position == "cam") {
    camPos = angle;
  } else if (position == "collector") {
    collectorPos = angle;
  } else if (position == "right") {
    rightPos = angle;
  } else {
    Serial.println(F("ERROR:unknown calibration position"));
    return;
  }

  reportPositions();
}

void handleCommand(String command) {
  command.trim();
  command.toLowerCase();
  if (command.length() == 0) return;

  if (command == "run" || command == "start") {
    if (!calibrationIsSafe()) {
      runEnabled = false;
      Serial.println(F("ERROR:positions must follow right < collector < cam < left"));
      return;
    }

    queuedManualAngle = -1;
    latestDecision = DECISION_UNKNOWN;
    runEnabled = true;
    sorterPhase = PHASE_WAITING_FOR_NOTHING;
    Serial.println(F("STATE:WAITING_FOR_NOTHING"));
    return;
  }

  if (command == "stop" || command == "hold") {
    runEnabled = false;
    sorterPhase = PHASE_STOPPED;
    Serial.println(F("STATE:STOPPED"));
    return;
  }

  if (command == "positions") {
    reportPositions();
    return;
  }

  if (command.startsWith("decision:")) {
    setDecisionFromText(command.substring(9));
    return;
  }

  if (command.startsWith("move:")) {
    String angleText = command.substring(5);
    if (!isNumeric(angleText)) {
      Serial.println(F("ERROR:invalid move angle"));
      return;
    }

    int angle = angleText.toInt();
    if (angle < 0 || angle > 180) {
      Serial.println(F("ERROR:move angle must be 0-180"));
      return;
    }

    runEnabled = false;
    sorterPhase = PHASE_STOPPED;
    queuedManualAngle = angle;
    return;
  }

  if (command.startsWith("cal:")) {
    int separator = command.indexOf(':', 4);
    if (separator < 0) {
      Serial.println(F("ERROR:use cal:position:angle"));
      return;
    }

    String position = command.substring(4, separator);
    String angleText = command.substring(separator + 1);
    if (!isNumeric(angleText)) {
      Serial.println(F("ERROR:invalid calibration angle"));
      return;
    }

    setCalibration(position, angleText.toInt());
    return;
  }

  // Compatibility with the original sorter and early website versions.
  if (command == "orange" || command == "right") {
    latestDecision = DECISION_RIGHT;
    return;
  }

  if (command == "apple" || command == "app" || command == "left") {
    latestDecision = DECISION_LEFT;
    return;
  }

  Serial.print(F("ERROR:unknown command "));
  Serial.println(command);
}

void pollSerial() {
  while (Serial.available() > 0) {
    int incoming = Serial.read();

    if (serialLength == 0 && incoming == 1) {
      latestDecision = DECISION_RIGHT;
      continue;
    }

    if (serialLength == 0 && incoming == 2) {
      latestDecision = DECISION_LEFT;
      continue;
    }

    if (incoming == '\r') continue;

    if (incoming == '\n') {
      serialBuffer[serialLength] = '\0';
      handleCommand(String(serialBuffer));
      serialLength = 0;
      continue;
    }

    if (serialLength < sizeof(serialBuffer) - 1) {
      serialBuffer[serialLength++] = char(incoming);
    } else {
      serialLength = 0;
      Serial.println(F("ERROR:command too long"));
    }
  }
}

bool responsiveDelay(unsigned long durationMs) {
  unsigned long startedAt = millis();

  while (millis() - startedAt < durationMs) {
    pollSerial();
    if (automaticMotionActive && !Serial) runEnabled = false;
    if (automaticMotionActive && !runEnabled) return false;
    delay(5);
  }

  return true;
}

bool moveControlledTo(int targetAngle, int stepDegrees,
                      unsigned long stepDelayMs, bool abortable = true) {
  targetAngle = clampAngle(targetAngle);
  stepDegrees = max(1, stepDegrees);

  while (currentAngle != targetAngle) {
    pollSerial();
    if (abortable && automaticMotionActive && !Serial) runEnabled = false;
    if (abortable && automaticMotionActive && !runEnabled) return false;

    int direction = targetAngle > currentAngle ? 1 : -1;
    int nextAngle = currentAngle + direction * stepDegrees;

    if (direction > 0 && nextAngle > targetAngle) nextAngle = targetAngle;
    if (direction < 0 && nextAngle < targetAngle) nextAngle = targetAngle;

    moveDirect(nextAngle);
    if (!responsiveDelay(stepDelayMs)) return false;
  }

  return true;
}

bool runCollectorOrientationSweep(int secondOffset,
                                  unsigned long holdMs,
                                  unsigned long stepDelayMs,
                                  const __FlashStringHelper *stateName) {
  Serial.print(F("STATE:"));
  Serial.println(stateName);

  if (!moveControlledTo(
        clampAngle(collectorPos + COLLECT_ORIENTATION_FIRST_OFFSET_DEGREES),
        MOTION_STEP_DEGREES, stepDelayMs)) return false;
  if (!responsiveDelay(holdMs)) return false;
  if (!moveControlledTo(clampAngle(collectorPos + secondOffset),
                        MOTION_STEP_DEGREES,
                        stepDelayMs)) return false;
  if (!responsiveDelay(holdMs)) return false;
  if (!moveControlledTo(collectorPos, MOTION_STEP_DEGREES,
                        stepDelayMs)) return false;
  return responsiveDelay(holdMs);
}

bool orientCollectedPieceFromRight() {
  // The pocket arrives from the 9-degree outlet. Keep this first movement
  // shorter so the newly collected piece is not tipped sideways.
  return runCollectorOrientationSweep(
    COLLECT_FROM_RIGHT_SECOND_OFFSET_DEGREES,
    COLLECT_FROM_RIGHT_ORIENTATION_HOLD_MS,
    COLLECT_FROM_RIGHT_STEP_DELAY_MS,
    F("COLLECT_ORIENTATION_FROM_RIGHT"));
}

bool orientCollectedPieceFromLeft() {
  return runCollectorOrientationSweep(
    COLLECT_FROM_LEFT_SECOND_OFFSET_DEGREES,
    COLLECT_ORIENTATION_HOLD_MS,
    TRANSPORT_STEP_DELAY_MS,
    F("COLLECT_ORIENTATION_FROM_LEFT"));
}

bool runCollectShakeStage(int startOffset,
                          int endOffset,
                          int attempts,
                          int sweeps,
                          const __FlashStringHelper *stateName) {
  Serial.print(F("STATE:"));
  Serial.println(stateName);

  const int startAngle = clampAngle(collectorPos + startOffset);
  const int endAngle = clampAngle(collectorPos + endOffset);

  for (int attempt = 0; attempt < attempts; attempt++) {
    moveDirect(startAngle);
    if (!responsiveDelay(COLLECT_ATTEMPT_FALL_MS)) return false;

    for (int sweep = 0; sweep < sweeps; sweep++) {
      moveDirect(endAngle);
      if (!responsiveDelay(COLLECT_JIGGLE_PULSE_MS)) return false;
      moveDirect(startAngle);
      if (!responsiveDelay(COLLECT_JIGGLE_PULSE_MS)) return false;
    }

    moveDirect(collectorPos);
    if (!responsiveDelay(COLLECT_ATTEMPT_REST_MS)) return false;
  }

  return true;
}

bool runInitialCollectShake() {
  return runCollectShakeStage(
    COLLECT_INITIAL_START_OFFSET_DEGREES,
    COLLECT_INITIAL_END_OFFSET_DEGREES,
    COLLECT_INITIAL_ATTEMPTS,
    COLLECT_INITIAL_SWEEPS,
    F("COLLECT_SHAKE_INITIAL"));
}

bool runMediumCollectShake() {
  return runCollectShakeStage(
    COLLECT_MEDIUM_START_OFFSET_DEGREES,
    COLLECT_MEDIUM_END_OFFSET_DEGREES,
    COLLECT_MEDIUM_ATTEMPTS,
    COLLECT_MEDIUM_SWEEPS,
    F("COLLECT_SHAKE_MEDIUM"));
}

bool runWideCollectShake() {
  return runCollectShakeStage(
    COLLECT_WIDE_START_OFFSET_DEGREES,
    COLLECT_WIDE_END_OFFSET_DEGREES,
    COLLECT_WIDE_ATTEMPTS,
    COLLECT_WIDE_SWEEPS,
    F("COLLECT_SHAKE_WIDE"));
}

bool collectPiece() {
  Serial.println(F("STATE:COLLECTING"));

  const bool arrivingFromRight = currentAngle < collectorPos;
  const bool arrivingFromLeft = currentAngle > collectorPos;

  // Approaching from Right must not cross the inlet before the orientation
  // sweep. From Left, the small approach offset removes pressure at the lip.
  if (arrivingFromLeft) {
    if (!moveControlledTo(collectApproachPos(), MOTION_STEP_DEGREES,
                          TRANSPORT_STEP_DELAY_MS)) return false;
  }
  if (!moveControlledTo(collectorPos, MOTION_STEP_DEGREES,
                        TRANSPORT_STEP_DELAY_MS)) return false;

  if (arrivingFromRight) {
    if (!orientCollectedPieceFromRight()) return false;
  } else {
    // Starting directly at Collector uses the wider path.
    if (!orientCollectedPieceFromLeft()) return false;
  }

  if (!runInitialCollectShake()) return false;
  if (!runMediumCollectShake()) return false;
  if (!runWideCollectShake()) return false;

  moveDirect(collectorPos);
  return responsiveDelay(COLLECT_FINAL_SETTLE_MS);
}

bool shortAntiJamShake(int centerAngle, const __FlashStringHelper *stateName) {
  Serial.print(F("STATE:"));
  Serial.println(stateName);

  // Move toward Right first, cross once toward Left, then settle at center.
  moveDirect(centerAngle - ANTI_JAM_SHAKE_DEGREES);
  if (!responsiveDelay(ANTI_JAM_SHAKE_PULSE_MS)) return false;
  moveDirect(centerAngle + ANTI_JAM_SHAKE_DEGREES);
  if (!responsiveDelay(ANTI_JAM_SHAKE_PULSE_MS)) return false;
  moveDirect(centerAngle);
  return responsiveDelay(ANTI_JAM_SHAKE_SETTLE_MS);
}

bool moveRouteWithStepBack(int targetAngle,
                           const __FlashStringHelper *stateName) {
  targetAngle = clampAngle(targetAngle);
  if (targetAngle == currentAngle) return true;

  Serial.print(F("STATE:"));
  Serial.println(stateName);

  const int direction = targetAngle > currentAngle ? 1 : -1;

  while (currentAngle != targetAngle) {
    // Always create clearance before applying force in the travel direction.
    const int backTarget = clampAngle(
      currentAngle - direction * ROUTE_BACK_DEGREES);
    if (!moveControlledTo(backTarget, MOTION_STEP_DEGREES,
                          ROUTE_BACK_STEP_DELAY_MS)) return false;
    if (!responsiveDelay(ROUTE_BACK_HOLD_MS)) return false;

    int forwardTarget = currentAngle + direction * ROUTE_ADVANCE_DEGREES;

    if (direction > 0) {
      forwardTarget = min(forwardTarget, targetAngle);
    } else {
      forwardTarget = max(forwardTarget, targetAngle);
    }

    moveDirect(forwardTarget);
    if (!responsiveDelay(ROUTE_ADVANCE_HOLD_MS)) return false;
  }

  return true;
}

bool movePieceToCamera() {
  if (!moveRouteWithStepBack(camPos,
                             F("MOVING_COLLECTOR_TO_CAMERA"))) {
    return false;
  }

  return responsiveDelay(CAMERA_HOLD_MS);
}

bool ejectLeft() {
  Serial.println(F("STATE:EJECTING_LEFT"));

  if (!moveControlledTo(leftPos, MOTION_STEP_DEGREES,
                        EJECT_MOVE_STEP_DELAY_MS)) return false;

  // Release the piece with repeated 20-degree outward snaps.
  for (int attempt = 0; attempt < EJECT_SHAKE_ATTEMPTS; attempt++) {
    moveDirect(leftReleasePos());
    if (!responsiveDelay(EJECT_RELEASE_TRAVEL_MS)) return false;
    moveDirect(leftPos);
    if (!responsiveDelay(EJECT_RELEASE_HOLD_MS)) return false;
  }

  moveDirect(leftPos);
  return responsiveDelay(EJECT_SETTLE_MS);
}

bool ejectRight() {
  Serial.println(F("STATE:EJECTING_RIGHT"));

  // Use the 10-forward/5-back ratchet for the complete route. A direct pass
  // across the Collector can catch the next waiting piece.
  if (!moveRouteWithStepBack(rightPos,
                             F("MOVING_CAMERA_TO_RIGHT_RATCHET"))) {
    return false;
  }

  // Calibrated right release range: 0-15 degrees around the 9-degree outlet.
  // Pause at the 9-degree outlet on every pass so the piece can fall.
  for (int attempt = 0; attempt < EJECT_SHAKE_ATTEMPTS; attempt++) {
    moveDirect(rightEjectHighPos());
    if (!responsiveDelay(EJECT_RELEASE_TRAVEL_MS)) return false;
    moveDirect(rightEjectDropPos());
    if (!responsiveDelay(RIGHT_EJECT_DROP_HOLD_MS)) return false;
    moveDirect(rightEjectLowPos());
    if (!responsiveDelay(EJECT_RELEASE_HOLD_MS)) return false;
  }

  moveDirect(rightEjectLowPos());
  return responsiveDelay(EJECT_SETTLE_MS);
}

void setup() {
  Serial.begin(9600);

  sorterServo.attach(SERVO_PIN);
  currentAngle = camPos;
  moveDirect(camPos);
  delay(500);

  Serial.println(F("Tiny Sorter round firmware ready"));
  Serial.println(F("STATE:STOPPED"));
  reportPositions();
}

void loop() {
  if (!Serial) {
    if (serialWasConnected) {
      runEnabled = false;
      sorterPhase = PHASE_STOPPED;
      serialWasConnected = false;
    }
    return;
  }

  serialWasConnected = true;
  pollSerial();

  if (queuedManualAngle >= 0 && !automaticMotionActive) {
    int target = queuedManualAngle;
    queuedManualAngle = -1;
    moveControlledTo(target, MOTION_STEP_DEGREES,
                     TRANSPORT_STEP_DELAY_MS, false);
    Serial.print(F("STATE:MANUAL_AT:"));
    Serial.println(currentAngle);
    return;
  }

  if (!runEnabled) return;

  if (sorterPhase == PHASE_WAITING_FOR_NOTHING) {
    if (latestDecision != DECISION_EMPTY) return;

    // A stable "nothing" image is the only trigger for a new collect cycle.
    latestDecision = DECISION_UNKNOWN;
    automaticMotionActive = true;
    bool completed = collectPiece() && movePieceToCamera();
    automaticMotionActive = false;

    if (!completed || !runEnabled) return;

    latestDecision = DECISION_UNKNOWN;
    cameraReadyAt = millis();
    sorterPhase = PHASE_WAITING_FOR_CLASS;
    Serial.println(F("STATE:CAMERA_READY"));
    return;
  }

  if (sorterPhase != PHASE_WAITING_FOR_CLASS) return;

  if (latestDecision == DECISION_EMPTY) {
    // If collection failed, confirmed "nothing" starts another collect pass.
    // The delay prevents stale pre-camera frames from causing an early retry.
    if (millis() - cameraReadyAt >= EMPTY_AT_CAMERA_CONFIRM_MS) {
      sorterPhase = PHASE_WAITING_FOR_NOTHING;
      Serial.println(F("STATE:EMPTY_AT_CAMERA"));
    }
    return;
  }

  if (latestDecision != DECISION_LEFT &&
      latestDecision != DECISION_RIGHT) return;

  SortDecision ejectDecision = latestDecision;
  latestDecision = DECISION_UNKNOWN;
  automaticMotionActive = true;

  if (!shortAntiJamShake(camPos, F("CAMERA_ANTI_JAM"))) {
    automaticMotionActive = false;
    return;
  }

  bool ejected = ejectDecision == DECISION_LEFT
    ? ejectLeft()
    : ejectRight();

  automaticMotionActive = false;
  if (!ejected || !runEnabled) return;

  sorterPhase = PHASE_WAITING_FOR_NOTHING;
  Serial.println(F("STATE:WAITING_FOR_NOTHING"));
}
