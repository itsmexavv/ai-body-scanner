const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');

// UI Elements
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

// State
let lastLogTime = 0;
let isSubjectDetected = false;
let latestOverallScore = 100;
let isScanning = false;
let autoScanTimeout = null;

// Scan UI Elements
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

// Metrics State
let noseHistory = [];
let liveStability = 100;
let liveSymmetry = 100;
let kineticState = "STATIONARY";
const flipCameraBtn = document.getElementById('flip-camera-btn');

function addLog(message, type = 'info') {
    const now = Date.now();
    if (now - lastLogTime < 1000) return; // Prevent log spam
    lastLogTime = now;

    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type !== 'info') li.className = type;
    
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;

    // Keep only last 10 logs
    if (logList.children.length > 10) {
        logList.removeChild(logList.firstChild);
    }
}

// Update UI Bars
function updateBar(element, valElement, percentage, isInverse = false) {
    // If isInverse is true, lower percentage means worse score (e.g. higher asymmetry = lower score)
    let displayPercent = Math.max(0, Math.min(100, percentage));
    
    element.style.width = `${displayPercent}%`;
    valElement.textContent = `${Math.round(displayPercent)}%`;

    let color = 'var(--primary)'; // cyan
    let score = displayPercent;

    if (score < 40) color = 'var(--danger)';
    else if (score < 70) color = 'var(--warning)';
    else color = 'var(--secondary)'; // green

    element.style.background = color;
    element.style.boxShadow = `0 0 10px ${color}`;
    
    return score; // Return normalized score out of 100
}

function updateIntegrity(score) {
    const offset = 283 - (283 * score) / 100;
    integrityCircle.style.strokeDashoffset = offset;
    integrityVal.textContent = `${Math.round(score)}%`;

    let color = 'var(--secondary)';
    if (score < 50) color = 'var(--danger)';
    else if (score < 80) color = 'var(--warning)';

    integrityCircle.style.stroke = color;
    integrityVal.style.color = color;
    integrityVal.style.textShadow = `0 0 10px ${color}`;
}

function onResults(results) {
    // Set canvas dimensions to match video to avoid stretching
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Video is now displayed natively behind the canvas, no need to draw it manually.

    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        if (!isSubjectDetected) {
            isSubjectDetected = true;
            diagnosticText.textContent = "SUBJECT ACQUIRED - ANALYZING";
            addLog("Subject identified in frame.", "info");
            
            if (!isScanning) {
                scanBtn.disabled = false;
                scanBtn.textContent = "INITIATE DEEP SCAN";
                
                // Automatically trigger the scan after 3 seconds of being in frame
                autoScanTimeout = setTimeout(() => {
                    if (isSubjectDetected && !isScanning) {
                        scanBtn.click();
                    }
                }, 3000);
            }
        }

        const landmarks = results.poseLandmarks;

        // Draw Landmarks with custom HUD styling
        drawConnectors(canvasCtx, landmarks, POSE_CONNECTIONS, {
            color: 'rgba(0, 240, 255, 0.5)', 
            lineWidth: 2
        });
        drawLandmarks(canvasCtx, landmarks, {
            color: '#00f0ff', 
            lineWidth: 1, 
            radius: 3
        });

        // --- BIOMECHANICAL ANALYSIS ---
        // MediaPipe Pose landmarks
        const nose = landmarks[0];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        // Ensure landmarks exist with high enough visibility
        if(leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5) {
            // 1. Shoulder Balance
            const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y);
            // shoulderDiff usually between 0.0 and 0.2. Normalize to a 0-100 score.
            const shoulderScore = updateBar(shoulderBar, shoulderVal, Math.max(0, 100 - (shoulderDiff * 800)), false);

            // 2. Neck Alignment (Ear vs Shoulder horizontal offset)
            const avgEarX = (leftEar.x + rightEar.x) / 2;
            const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
            const neckOffset = Math.abs(avgEarX - avgShoulderX);
            const neckScore = updateBar(neckBar, neckVal, Math.max(0, 100 - (neckOffset * 400)), false);

            // 3. Spine Alignment (Nose center vs Hip center)
            const avgHipX = (leftHip.x + rightHip.x) / 2;
            const spineOffset = Math.abs(nose.x - avgHipX);
            const spineScore = updateBar(spineBar, spineVal, Math.max(0, 100 - (spineOffset * 300)), false);

            // Calculate Overall Integrity
            const overallScore = (shoulderScore + neckScore + spineScore) / 3;
            latestOverallScore = overallScore;
            updateIntegrity(overallScore);

            // Calculate Advanced Kinematics (Accurate)
            noseHistory.push({x: nose.x, y: nose.y});
            if (noseHistory.length > 30) noseHistory.shift();
            
            let totalMovement = 0;
            for(let i=1; i<noseHistory.length; i++) {
                totalMovement += Math.abs(noseHistory[i].x - noseHistory[i-1].x) + Math.abs(noseHistory[i].y - noseHistory[i-1].y);
            }
            
            // Stability translates inversely to movement
            liveStability = Math.max(0, 100 - (totalMovement * 300));
            
            if (totalMovement < 0.05) kineticState = "STATIONARY";
            else if (totalMovement < 0.15) kineticState = "ACTIVE";
            else kineticState = "HIGH SWAY";
            
            // Calculate Symmetry Index accurately using angles
            const shoulderAngle = Math.abs(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * 180 / Math.PI);
            liveSymmetry = Math.max(0, 100 - (shoulderAngle * 4)); // 25 degree tilt = 0% symmetry

            // Update live HUD
            if (!isScanning) {
                hudStabilityVal.textContent = `${Math.round(liveStability)}%`;
                hudStabilityVal.style.color = liveStability < 50 ? 'var(--danger)' : 'var(--primary)';
                
                hudSymmetryVal.textContent = `${Math.round(liveSymmetry)}%`;
                hudSymmetryVal.style.color = liveSymmetry < 70 ? 'var(--danger)' : 'var(--primary)';
                
                hudKineticVal.textContent = kineticState;
                hudKineticVal.style.color = kineticState === "HIGH SWAY" ? 'var(--warning)' : 'var(--primary)';
            }

            // Determine Status Alert
            if (overallScore < 50) {
                alertContent.textContent = "CRITICAL POSTURE FAILURE";
                alertContent.className = "alert-content danger";
                diagnosticText.textContent = "WARNING: REALIGNMENT REQUIRED";
                diagnosticText.style.color = "var(--danger)";
                addLog("Posture metrics critically low.", "danger");
            } else if (overallScore < 80) {
                alertContent.textContent = "SUB-OPTIMAL ALIGNMENT";
                alertContent.className = "alert-content warn";
                diagnosticText.textContent = "ANALYSIS: MODERATE DEVIATION";
                diagnosticText.style.color = "var(--warning)";
                addLog("Minor postural deviations detected.", "warn");
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
            
            hudStabilityVal.textContent = "--%";
            hudSymmetryVal.textContent = "--%";
            hudKineticVal.textContent = "--";
            noseHistory = [];
            
            // Reset bars
            updateBar(neckBar, neckVal, 0);
            updateBar(spineBar, spineVal, 0);
            updateBar(shoulderBar, shoulderVal, 0);
            updateIntegrity(0);
        }
    }
    canvasCtx.restore();
}

// Initialize MediaPipe Pose
const pose = new Pose({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// Camera State
let currentFacingMode = 'user';
let camera = null;

function startCamera() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    
    if (camera && typeof camera.stop === 'function') {
        camera.stop();
    }

    camera = new Camera(videoElement, {
        onFrame: async () => {
            await pose.send({image: videoElement});
        },
        width: 1280,
        height: 720,
        facingMode: currentFacingMode
    });

    addLog(`Initializing ${currentFacingMode} camera...`, "info");
    camera.start().then(() => {
        addLog("Camera active. Models loaded.", "info");
    }).catch((err) => {
        addLog("Camera access denied.", "danger");
        console.error(err);
    });
}

// Initial start
startCamera();

flipCameraBtn.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    // Stop mirror effect if using back camera (environment)
    if (currentFacingMode === 'environment') {
        videoElement.style.transform = 'none';
        canvasElement.style.transform = 'none';
    } else {
        videoElement.style.transform = 'scaleX(-1)';
        canvasElement.style.transform = 'scaleX(-1)';
    }
    
    addLog("Switching camera module...", "warn");
    startCamera();
});

// --- SCAN LOGIC ---
scanBtn.addEventListener('click', () => {
    if (isScanning || !isSubjectDetected) return;
    isScanning = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "SCANNING VITALS...";
    diagnosticText.textContent = "DEEP SCAN IN PROGRESS...";
    diagnosticText.style.color = "var(--primary)";
    addLog("Initiating Deep Bio-Scan...", "warn");

    // Simulate 3 seconds of scanning
    setTimeout(() => {
        modalStabilityVal.textContent = `${Math.round(liveStability)}%`;
        modalStabilityVal.style.color = liveStability < 50 ? 'var(--danger)' : 'var(--primary)';

        modalSymmetryVal.textContent = `${Math.round(liveSymmetry)}%`;
        modalSymmetryVal.style.color = liveSymmetry < 70 ? 'var(--danger)' : 'var(--primary)';

        modalKineticVal.textContent = kineticState;
        modalKineticVal.style.color = kineticState === "HIGH SWAY" ? 'var(--warning)' : 'var(--primary)';

        // Determine AI Advice based on REAL Kinematics
        if (liveStability < 50 || kineticState === "HIGH SWAY") {
            medAdvice.innerHTML = "<span style='color:var(--danger)'><b>POSSIBLE CONDITION:</b> Postural Instability / High Kinetic Sway</span><br><br><b>RECOMMENDED ADVICE:</b> Ground your feet firmly. Engage core muscles to reduce unnecessary lateral movement.";
        } else if (liveSymmetry < 80 || latestOverallScore < 70) {
            medAdvice.innerHTML = "<span style='color:var(--warning)'><b>POSSIBLE CONDITION:</b> Muscular Asymmetry / Spinal Deviation</span><br><br><b>RECOMMENDED ADVICE:</b> Evenly distribute weight across both legs. Avoid leaning to one side. Consider ergonomic adjustments if seated.";
        } else {
            medAdvice.innerHTML = "<span style='color:var(--secondary)'><b>POSSIBLE CONDITION:</b> Optimal Kinematic Balance</span><br><br><b>RECOMMENDED ADVICE:</b> Perfect structural symmetry detected. Maintain current biomechanical state.";
        }

        reportModal.classList.remove('hidden');
        addLog("Deep Scan Complete. Report generated.", "info");

        // Reset button
        isScanning = false;
        if (isSubjectDetected) {
            scanBtn.disabled = false;
            scanBtn.textContent = "INITIATE DEEP SCAN";
        } else {
            scanBtn.textContent = "AWAITING SUBJECT";
        }
    }, 3000);
});

closeModalBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');
});
