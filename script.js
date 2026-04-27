const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const overlayVideo = document.getElementById('overlay');
const wrapper = document.querySelector('.camera-wrapper');

// Shared state for latest results from both detectors
let latestHandResults = null;
let latestFaceResults = null;
let overlayPlaying = false;

// Resize canvas to match wrapper width while keeping 4:3 aspect ratio
function resizeCanvas() {
  if (!wrapper) return;
  const w = wrapper.clientWidth;
  const h = Math.floor(w * 0.75); // 4:3 aspect ratio
  canvasElement.width = w;
  canvasElement.height = h;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Setup MediaPipe Hands
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// Setup MediaPipe FaceMesh
const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

function drawLandmark(x, y, color, radius = 5) {
  canvasCtx.beginPath();
  canvasCtx.arc(x, y, radius, 0, 2 * Math.PI);
  canvasCtx.fillStyle = color;
  canvasCtx.fill();
}

function updateOverlay(touching) {
  if (touching) {
    if (!overlayPlaying) {
      overlayVideo.currentTime = 0;
      overlayVideo.play().catch(() => {});
      overlayVideo.style.display = 'block';
      overlayPlaying = true;
    }
  } else {
    if (overlayPlaying) {
      overlayVideo.pause();
      overlayVideo.style.display = 'none';
      overlayPlaying = false;
    }
  }
}

overlayVideo.addEventListener('ended', () => {
  if (overlayPlaying) {
    overlayPlaying = false;
    overlayVideo.style.display = 'none';
  }
});

function draw() {
  canvasCtx.save();
  
  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Mirror horizontally to match Python: cv2.flip(frame, 1)
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);
  
  // Draw webcam feed onto canvas
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  
  let touching = false;

  // Face landmark: nose tip (landmark 1 in FaceMesh)
  let nx = null;
  let ny = null;
  if (latestFaceResults && latestFaceResults.multiFaceLandmarks && latestFaceResults.multiFaceLandmarks.length > 0) {
    const nose = latestFaceResults.multiFaceLandmarks[0][1];
    nx = nose.x * canvasElement.width;
    ny = nose.y * canvasElement.height;
    drawLandmark(nx, ny, 'blue', 5);
  }

  // Hand landmarks
  if (latestHandResults && latestHandResults.multiHandLandmarks) {
    for (const handLandmarks of latestHandResults.multiHandLandmarks) {
      // Draw all hand landmarks in green (lime) like Python
      for (const landmark of handLandmarks) {
        const x = landmark.x * canvasElement.width;
        const y = landmark.y * canvasElement.height;
        drawLandmark(x, y, 'lime', 4);
      }
      
      // Check distance between hand landmark 9 (middle finger MCP / palm center) and nose
      if (nx !== null && ny !== null) {
        const handPoint = handLandmarks[9];
        const hx = handPoint.x * canvasElement.width;
        const hy = handPoint.y * canvasElement.height;
        
        if (Math.abs(hx - nx) < 60 && Math.abs(hy - ny) < 60) {
          touching = true;
        }
      }
    }
  }
  
  // Update overlay video state
  updateOverlay(touching);
  
  canvasCtx.restore();
}

hands.onResults((results) => {
  latestHandResults = results;
  draw();
});

faceMesh.onResults((results) => {
  latestFaceResults = results;
  draw();
});

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
    await faceMesh.send({image: videoElement});
  },
  width: 640,
  height: 480
});
camera.start();
