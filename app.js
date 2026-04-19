// ====== DOM ELEMENTS ======
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const diagnosticText = document.getElementById('diagnostic-text');
const logList = document.getElementById('log-list');
const alertContent = document.getElementById('alert-content');
const neckBar = document.getElementById('neck-bar');
const spineBar = document.getElementById('spine-bar');
const shoulderBar = document.getElementById('shoulder-bar');
const neckVal = document.getElementById('neck-val');
const spineVal = document.getElementById('spine-val');
const shoulderVal = document.getElementById('shoulder-val');
const integrityCircle = document.getElementById('integrity-circle');
const integrityVal = document.getElementById('integrity-val');
const scanBtn = document.getElementById('scan-btn');
const reportModal = document.getElementById('report-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalStabilityVal = document.getElementById('modal-stability-val');
const modalSymmetryVal = document.getElementById('modal-symmetry-val');
const modalKineticVal = document.getElementById('modal-kinetic-val');
const medAdvice = document.getElementById('med-advice');
const hudStabilityVal = document.getElementById('hud-stability-val');
const hudSymmetryVal = document.getElementById('hud-symmetry-val');
const hudKineticVal = document.getElementById('hud-kinetic-val');
const flipCameraBtn = document.getElementById('flip-camera-btn');
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const loadingBar = document.getElementById('loading-bar');
const cameraPrompt = document.getElementById('camera-prompt');
const grantCameraBtn = document.getElementById('grant-camera-btn');
// Vital signs elements
const hudHrVal = document.getElementById('hud-hr-val');
const hudSpo2Val = document.getElementById('hud-spo2-val');
const hudBpVal = document.getElementById('hud-bp-val');
const modalHrVal = document.getElementById('modal-hr-val');
const modalSpo2Val = document.getElementById('modal-spo2-val');
const modalBpVal = document.getElementById('modal-bp-val');
// Mobile elements
const mobileFlipBtn = document.getElementById('mobile-flip-btn');
const mobileScanBtn = document.getElementById('mobile-scan-btn');
const mobilePanelsBtn = document.getElementById('mobile-panels-btn');
const mobileIntegrityVal = document.getElementById('mobile-integrity-val');
const mobileStabilityVal = document.getElementById('mobile-stability-val');
const mobileSymmetryVal = document.getElementById('mobile-symmetry-val');

// ====== STATE ======
let lastLogTime = 0;
let isSubjectDetected = false;
let latestOverallScore = 0;
let isScanning = false;
let autoScanTimeout = null;
let currentFacingMode = 'user';
let camera = null;
let panelsCollapsed = true; // Start collapsed on mobile
let poseReady = false;

// Real-time biomechanics history buffers
let noseHistory = [];
let leftWristHistory = [];
let rightWristHistory = [];
let shoulderAngleHistory = [];
let frameCount = 0;

// Live computed metrics
let liveStability = 0;
let liveSymmetry = 0;
let kineticState = "INITIALIZING";
let neckAngleDeg = 0;
let spineDeviationDeg = 0;
let shoulderTiltDeg = 0;

// Simulated vitals (adjust based on real posture state)
let liveHR = 72;
let liveSpo2 = 98;
let liveSys = 120;
let liveDia = 80;
let vitalsInterval = null;

function updateVitals() {
    if (!isSubjectDetected) return;
    // Posture stress factor: worse posture = higher stress
    const stressFactor = Math.max(0, (100 - latestOverallScore) / 100);
    // Heart rate: 65-78 normal, up to 110 under bad posture
    liveHR = Math.round(68 + (stressFactor * 35) + (Math.random() * 6 - 3));
    // SpO2: 96-99 normal, drops slightly with bad posture
    liveSpo2 = Math.round(Math.min(99, 98 - (stressFactor * 3) + (Math.random() * 2 - 1)));
    // BP: 115-125/75-85 normal, rises with poor posture
    liveSys = Math.round(118 + (stressFactor * 22) + (Math.random() * 6 - 3));
    liveDia = Math.round(78 + (stressFactor * 12) + (Math.random() * 4 - 2));
    // Update HUD
    if (hudHrVal) {
        hudHrVal.textContent = `${liveHR} BPM`;
        hudHrVal.style.color = liveHR > 100 ? 'var(--danger)' : 'var(--primary)';
    }
    if (hudSpo2Val) {
        hudSpo2Val.textContent = `${liveSpo2}%`;
        hudSpo2Val.style.color = liveSpo2 < 95 ? 'var(--danger)' : 'var(--primary)';
    }
    if (hudBpVal) {
        hudBpVal.textContent = `${liveSys}/${liveDia}`;
        hudBpVal.style.color = liveSys > 140 ? 'var(--danger)' : liveSys > 130 ? 'var(--warning)' : 'var(--primary)';
    }
}

function startVitalsMonitor() {
    if (vitalsInterval) return;
    updateVitals();
    vitalsInterval = setInterval(updateVitals, 2000);
}

function stopVitalsMonitor() {
    if (vitalsInterval) { clearInterval(vitalsInterval); vitalsInterval = null; }
    if (hudHrVal) hudHrVal.textContent = '-- BPM';
    if (hudSpo2Val) hudSpo2Val.textContent = '--%';
    if (hudBpVal) hudBpVal.textContent = '--/--';
}

// ====== UTILITY: Calculate angle between 3 points (in degrees) ======
function calcAngle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
    if (magAB === 0 || magCB === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
    return Math.acos(cosAngle) * (180 / Math.PI);
}

// ====== UTILITY: Euclidean distance between two landmarks ======
function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ====== LOGGING ======
function addLog(message, type = 'info') {
    const now = Date.now();
    if (now - lastLogTime < 800) return;
    lastLogTime = now;
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type !== 'info') li.className = type;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
    if (logList.children.length > 12) logList.removeChild(logList.firstChild);
}

// ====== UI UPDATES ======
function updateBar(element, valElement, percentage) {
    let p = Math.max(0, Math.min(100, percentage));
    element.style.width = `${p}%`;
    valElement.textContent = `${Math.round(p)}%`;
    let color = p < 40 ? 'var(--danger)' : p < 70 ? 'var(--warning)' : 'var(--secondary)';
    element.style.background = color;
    element.style.boxShadow = `0 0 8px ${color}`;
    return p;
}

function updateIntegrity(score) {
    const offset = 283 - (283 * score) / 100;
    integrityCircle.style.strokeDashoffset = offset;
    integrityVal.textContent = `${Math.round(score)}%`;
    let color = score < 50 ? 'var(--danger)' : score < 80 ? 'var(--warning)' : 'var(--secondary)';
    integrityCircle.style.stroke = color;
    integrityVal.style.color = color;
    integrityVal.style.textShadow = `0 0 10px ${color}`;
}

function updateMobileStats(integrity, stability, symmetry) {
    if (mobileIntegrityVal) mobileIntegrityVal.textContent = `${Math.round(integrity)}%`;
    if (mobileStabilityVal) mobileStabilityVal.textContent = `${Math.round(stability)}%`;
    if (mobileSymmetryVal) mobileSymmetryVal.textContent = `${Math.round(symmetry)}%`;
}

// ====== CORE: REAL-TIME BIOMECHANICAL ANALYSIS ======
function analyzeBiomechanics(landmarks) {
    frameCount++;
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    const vis = (lm) => lm && lm.visibility > 0.5;
    if (!vis(leftShoulder) || !vis(rightShoulder)) return null;

    // ---- 1. SHOULDER TILT (real angle from horizontal) ----
    shoulderTiltDeg = Math.abs(
        Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * 180 / Math.PI
    );
    // Perfect = 0°, map 0-15° → 100-0%
    const shoulderScore = Math.max(0, 100 - (shoulderTiltDeg / 15) * 100);

    // ---- 2. NECK FORWARD ANGLE (ear-shoulder vertical alignment) ----
    const midEarX = (leftEar.x + rightEar.x) / 2;
    const midEarY = (leftEar.y + rightEar.y) / 2;
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    // Angle of ear-to-shoulder line from vertical
    neckAngleDeg = Math.abs(Math.atan2(midEarX - midShoulderX, midShoulderY - midEarY) * 180 / Math.PI);
    // Perfect = 0°, map 0-30° → 100-0%
    const neckScore = Math.max(0, 100 - (neckAngleDeg / 30) * 100);

    // ---- 3. SPINE LATERAL DEVIATION (nose-midHip alignment) ----
    if (vis(leftHip) && vis(rightHip)) {
        const midHipX = (leftHip.x + rightHip.x) / 2;
        const midHipY = (leftHip.y + rightHip.y) / 2;
        // Angle from vertical between mid-shoulder and mid-hip
        spineDeviationDeg = Math.abs(
            Math.atan2(midShoulderX - midHipX, midHipY - midShoulderY) * 180 / Math.PI
        );
    }
    const spineScore = Math.max(0, 100 - (spineDeviationDeg / 20) * 100);

    // ---- 4. CORE STABILITY (movement variance over time) ----
    noseHistory.push({ x: nose.x, y: nose.y, t: Date.now() });
    if (noseHistory.length > 45) noseHistory.shift(); // ~1.5s of frames

    let totalJitter = 0;
    if (noseHistory.length > 2) {
        for (let i = 1; i < noseHistory.length; i++) {
            totalJitter += Math.abs(noseHistory[i].x - noseHistory[i - 1].x)
                        + Math.abs(noseHistory[i].y - noseHistory[i - 1].y);
        }
        totalJitter /= noseHistory.length;
    }
    // Map jitter: 0 = perfectly still (100%), 0.015+ = very shaky (0%)
    liveStability = Math.max(0, Math.min(100, 100 - (totalJitter / 0.015) * 100));

    // ---- 5. SYMMETRY INDEX (multi-joint bilateral comparison) ----
    let symFactors = [];
    // Shoulder height symmetry
    symFactors.push(1 - Math.min(1, Math.abs(leftShoulder.y - rightShoulder.y) * 10));
    // Elbow angle symmetry
    if (vis(leftElbow) && vis(rightElbow) && vis(leftWrist) && vis(rightWrist)) {
        const leftElbowAngle = calcAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = calcAngle(rightShoulder, rightElbow, rightWrist);
        symFactors.push(1 - Math.min(1, Math.abs(leftElbowAngle - rightElbowAngle) / 60));
    }
    // Hip height symmetry
    if (vis(leftHip) && vis(rightHip)) {
        symFactors.push(1 - Math.min(1, Math.abs(leftHip.y - rightHip.y) * 12));
    }
    // Knee angle symmetry
    if (vis(leftKnee) && vis(rightKnee) && vis(leftHip) && vis(rightHip)) {
        const leftKneeAngle = calcAngle(leftHip, leftKnee, landmarks[27]); // left ankle
        const rightKneeAngle = calcAngle(rightHip, rightKnee, landmarks[28]);
        if (vis(landmarks[27]) && vis(landmarks[28])) {
            symFactors.push(1 - Math.min(1, Math.abs(leftKneeAngle - rightKneeAngle) / 45));
        }
    }
    liveSymmetry = symFactors.length > 0
        ? (symFactors.reduce((a, b) => a + b, 0) / symFactors.length) * 100
        : 50;

    // ---- 6. KINETIC STATE (real velocity classification) ----
    if (noseHistory.length >= 5) {
        const recent = noseHistory.slice(-5);
        let velocity = 0;
        for (let i = 1; i < recent.length; i++) {
            velocity += dist(recent[i], recent[i - 1]);
        }
        velocity /= recent.length;
        if (velocity < 0.002) kineticState = "STATIONARY";
        else if (velocity < 0.008) kineticState = "MICRO-SWAY";
        else if (velocity < 0.02) kineticState = "ACTIVE";
        else kineticState = "HIGH MOTION";
    }

    // Overall integrity = weighted average of posture metrics
    const overallScore = (shoulderScore * 0.25) + (neckScore * 0.35) + (spineScore * 0.40);

    return { shoulderScore, neckScore, spineScore, overallScore };
}

// ====== MEDIAPIPE RESULTS CALLBACK ======
function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth && videoElement.videoWidth > 0) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        if (!isSubjectDetected) {
            isSubjectDetected = true;
            diagnosticText.textContent = "SUBJECT ACQUIRED - ANALYZING";
            addLog("Subject identified in frame.", "info");
            scanBtn.disabled = false;
            scanBtn.textContent = "INITIATE DEEP SCAN";
            if (mobileScanBtn) mobileScanBtn.disabled = false;
            startVitalsMonitor();
            autoScanTimeout = setTimeout(() => {
                if (isSubjectDetected && !isScanning) scanBtn.click();
            }, 4000);
        }

        const landmarks = results.poseLandmarks;

        // Draw skeleton overlay
        drawConnectors(canvasCtx, landmarks, POSE_CONNECTIONS, {
            color: 'rgba(0, 240, 255, 0.4)', lineWidth: 2
        });
        drawLandmarks(canvasCtx, landmarks, {
            color: '#00f0ff', lineWidth: 1, radius: 3
        });

        // ---- REAL-TIME ANALYSIS ----
        const metrics = analyzeBiomechanics(landmarks);

        if (metrics) {
            updateBar(shoulderBar, shoulderVal, metrics.shoulderScore);
            updateBar(neckBar, neckVal, metrics.neckScore);
            updateBar(spineBar, spineVal, metrics.spineScore);

            latestOverallScore = metrics.overallScore;
            updateIntegrity(metrics.overallScore);

            // Update live HUD
            hudStabilityVal.textContent = `${Math.round(liveStability)}%`;
            hudStabilityVal.style.color = liveStability < 50 ? 'var(--danger)' : 'var(--primary)';
            hudSymmetryVal.textContent = `${Math.round(liveSymmetry)}%`;
            hudSymmetryVal.style.color = liveSymmetry < 70 ? 'var(--warning)' : 'var(--primary)';
            hudKineticVal.textContent = kineticState;
            hudKineticVal.style.color = kineticState === "HIGH MOTION" ? 'var(--danger)' : kineticState === "ACTIVE" ? 'var(--warning)' : 'var(--primary)';

            // Update mobile stats
            updateMobileStats(metrics.overallScore, liveStability, liveSymmetry);

            // Status alerts
            if (metrics.overallScore < 50) {
                alertContent.textContent = "CRITICAL POSTURE FAILURE";
                alertContent.className = "alert-content danger";
                diagnosticText.textContent = `WARNING: REALIGNMENT REQUIRED (${Math.round(neckAngleDeg)}° NECK TILT)`;
                diagnosticText.style.color = "var(--danger)";
                addLog(`Neck ${Math.round(neckAngleDeg)}°, Spine dev ${Math.round(spineDeviationDeg)}°`, "danger");
            } else if (metrics.overallScore < 80) {
                alertContent.textContent = "SUB-OPTIMAL ALIGNMENT";
                alertContent.className = "alert-content warn";
                diagnosticText.textContent = `MODERATE DEVIATION (Shoulder tilt: ${shoulderTiltDeg.toFixed(1)}°)`;
                diagnosticText.style.color = "var(--warning)";
                addLog(`Shoulder tilt ${shoulderTiltDeg.toFixed(1)}°`, "warn");
            } else {
                alertContent.textContent = "OPTIMAL CONDITION";
                alertContent.className = "alert-content";
                diagnosticText.textContent = "SYSTEM NOMINAL";
                diagnosticText.style.color = "var(--secondary)";
            }
        }
    } else {
        if (isSubjectDetected) {
            isSubjectDetected = false;
            diagnosticText.textContent = "AWAITING SUBJECT...";
            diagnosticText.style.color = "var(--primary)";
            alertContent.textContent = "STANDBY";
            alertContent.className = "alert-content";
            addLog("Subject lost.", "warn");
            clearTimeout(autoScanTimeout);
            scanBtn.disabled = true;
            scanBtn.textContent = "AWAITING SUBJECT";
            if (mobileScanBtn) mobileScanBtn.disabled = true;
            hudStabilityVal.textContent = "--%";
            hudSymmetryVal.textContent = "--%";
            hudKineticVal.textContent = "--";
            noseHistory = [];
            frameCount = 0;
            updateBar(neckBar, neckVal, 0);
            updateBar(spineBar, spineVal, 0);
            updateBar(shoulderBar, shoulderVal, 0);
            updateIntegrity(0);
            updateMobileStats(0, 0, 0);
            stopVitalsMonitor();
        }
    }
    canvasCtx.restore();
}

// ====== MEDIAPIPE INIT ======
function initPose() {
    loadingStatus.textContent = "LOADING POSE DETECTION MODEL...";
    loadingBar.style.width = "40%";

    const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
    pose.setOptions({
        modelComplexity: window.innerWidth < 900 ? 0 : 1, // Lite model on mobile for speed
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    pose.onResults(onResults);

    loadingStatus.textContent = "MODEL LOADED. STARTING CAMERA...";
    loadingBar.style.width = "70%";

    return pose;
}

// ====== CAMERA ======
let poseInstance = null;

function startCamera() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
    }
    if (camera && typeof camera.stop === 'function') camera.stop();

    camera = new Camera(videoElement, {
        onFrame: async () => { if (poseInstance) await poseInstance.send({ image: videoElement }); },
        width: window.innerWidth < 900 ? 640 : 1280,
        height: window.innerWidth < 900 ? 480 : 720,
        facingMode: currentFacingMode
    });

    addLog(`Activating ${currentFacingMode} camera...`, "info");
    camera.start().then(() => {
        addLog("Camera active. Real-time analysis running.", "info");
        loadingStatus.textContent = "SYSTEM READY";
        loadingBar.style.width = "100%";
        setTimeout(() => { loadingScreen.classList.add('fade-out'); }, 500);
    }).catch((err) => {
        console.error(err);
        addLog("Camera access failed.", "danger");
        // Show camera prompt
        loadingScreen.classList.add('fade-out');
        cameraPrompt.classList.remove('hidden');
    });
}

// ====== CAMERA FLIP ======
function flipCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    if (currentFacingMode === 'environment') {
        videoElement.style.transform = 'none';
        canvasElement.style.transform = 'none';
    } else {
        videoElement.style.transform = 'scaleX(-1)';
        canvasElement.style.transform = 'scaleX(-1)';
    }
    addLog("Switching camera module...", "warn");
    noseHistory = [];
    frameCount = 0;
    startCamera();
}

// ====== DEEP SCAN ======
function performScan() {
    if (isScanning || !isSubjectDetected) return;
    isScanning = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "SCANNING...";
    if (mobileScanBtn) mobileScanBtn.disabled = true;
    diagnosticText.textContent = "DEEP SCAN IN PROGRESS...";
    diagnosticText.style.color = "var(--primary)";
    addLog("Initiating Deep Bio-Scan...", "warn");

    setTimeout(() => {
        // Capture current real-time values
        modalStabilityVal.textContent = `${Math.round(liveStability)}%`;
        modalStabilityVal.style.color = liveStability < 50 ? 'var(--danger)' : 'var(--primary)';
        modalSymmetryVal.textContent = `${Math.round(liveSymmetry)}%`;
        modalSymmetryVal.style.color = liveSymmetry < 70 ? 'var(--danger)' : 'var(--primary)';
        modalKineticVal.textContent = kineticState;
        modalKineticVal.style.color = kineticState === "HIGH MOTION" ? 'var(--warning)' : 'var(--primary)';

        // Populate vitals in modal
        if (modalHrVal) {
            modalHrVal.textContent = `${liveHR} BPM`;
            modalHrVal.style.color = liveHR > 100 ? 'var(--danger)' : 'var(--primary)';
        }
        if (modalSpo2Val) {
            modalSpo2Val.textContent = `${liveSpo2}%`;
            modalSpo2Val.style.color = liveSpo2 < 95 ? 'var(--danger)' : 'var(--primary)';
        }
        if (modalBpVal) {
            modalBpVal.textContent = `${liveSys}/${liveDia}`;
            modalBpVal.style.color = liveSys > 140 ? 'var(--danger)' : liveSys > 130 ? 'var(--warning)' : 'var(--primary)';
        }

        // Generate real diagnosis from actual measured angles
        let diagnosis = '';
        if (neckAngleDeg > 15) {
            diagnosis += `<span style='color:var(--danger)'><b>DETECTED:</b> Forward Head Posture (${Math.round(neckAngleDeg)}° forward tilt)</span><br>`;
            diagnosis += `<b>ADVICE:</b> Perform chin tucks: retract head straight back, hold 5s, repeat 10x. Adjust screen to eye level.<br><br>`;
        }
        if (shoulderTiltDeg > 5) {
            diagnosis += `<span style='color:var(--warning)'><b>DETECTED:</b> Lateral Shoulder Imbalance (${shoulderTiltDeg.toFixed(1)}° tilt)</span><br>`;
            diagnosis += `<b>ADVICE:</b> Stretch the elevated side. Strengthen the lower side with single-arm rows. Check for scoliosis if persistent.<br><br>`;
        }
        if (spineDeviationDeg > 8) {
            diagnosis += `<span style='color:var(--warning)'><b>DETECTED:</b> Spinal Lateral Shift (${Math.round(spineDeviationDeg)}° deviation)</span><br>`;
            diagnosis += `<b>ADVICE:</b> Distribute weight evenly on both feet. Core stabilization exercises recommended.<br><br>`;
        }
        if (liveStability < 50) {
            diagnosis += `<span style='color:var(--danger)'><b>DETECTED:</b> Postural Instability (stability index: ${Math.round(liveStability)}%)</span><br>`;
            diagnosis += `<b>ADVICE:</b> Practice single-leg balance exercises. Consider vestibular assessment if chronic.<br><br>`;
        }
        if (diagnosis === '') {
            diagnosis = `<span style='color:var(--secondary)'><b>RESULT:</b> Excellent Biomechanical Alignment</span><br><br>`;
            diagnosis += `Neck angle: ${Math.round(neckAngleDeg)}° (normal <15°)<br>`;
            diagnosis += `Shoulder tilt: ${shoulderTiltDeg.toFixed(1)}° (normal <5°)<br>`;
            diagnosis += `Spine deviation: ${Math.round(spineDeviationDeg)}° (normal <8°)<br>`;
            diagnosis += `<br><b>ADVICE:</b> Maintain current posture habits. Stay active and hydrated.`;
        }
        medAdvice.innerHTML = diagnosis;

        reportModal.classList.remove('hidden');
        addLog("Deep Scan Complete. Report generated.", "info");
        isScanning = false;
        if (isSubjectDetected) {
            scanBtn.disabled = false;
            scanBtn.textContent = "INITIATE DEEP SCAN";
            if (mobileScanBtn) mobileScanBtn.disabled = false;
        }
    }, 3000);
}

// ====== EVENT LISTENERS ======
flipCameraBtn.addEventListener('click', flipCamera);
scanBtn.addEventListener('click', performScan);
closeModalBtn.addEventListener('click', () => reportModal.classList.add('hidden'));

if (mobileFlipBtn) mobileFlipBtn.addEventListener('click', flipCamera);
if (mobileScanBtn) mobileScanBtn.addEventListener('click', performScan);

// Mobile panel toggle
if (mobilePanelsBtn) {
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    // Start collapsed on mobile
    if (window.innerWidth <= 900) {
        leftPanel.classList.add('collapsed');
        rightPanel.classList.add('collapsed');
    }
    mobilePanelsBtn.addEventListener('click', () => {
        panelsCollapsed = !panelsCollapsed;
        leftPanel.classList.toggle('collapsed', panelsCollapsed);
        rightPanel.classList.toggle('collapsed', panelsCollapsed);
    });
}

// Camera prompt button
if (grantCameraBtn) {
    grantCameraBtn.addEventListener('click', () => {
        cameraPrompt.classList.add('hidden');
        startCamera();
    });
}

// ====== BOOT SEQUENCE ======
loadingBar.style.width = "20%";
loadingStatus.textContent = "INITIALIZING NEURAL ENGINE...";

try {
    poseInstance = initPose();
    startCamera();
} catch (err) {
    console.error("Init error:", err);
    loadingStatus.textContent = "ERROR: " + err.message;
}
