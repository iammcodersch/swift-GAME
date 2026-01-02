// Basic scene setup
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 200, 100);
scene.add(dirLight);

// Simple ground
const groundGeo = new THREE.PlaneGeometry(50000, 50000, 50, 50);
const groundMat = new THREE.MeshPhongMaterial({ color: 0x228b22 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

// Simple "aircraft" (a box)
const planeGeo = new THREE.BoxGeometry(10, 2, 20);
const planeMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
const aircraft = new THREE.Mesh(planeGeo, planeMat);
aircraft.position.set(0, 100, 0);
scene.add(aircraft);

// Aircraft state
let velocity = new THREE.Vector3(0, 0, -1);   // forward direction in local Z
let speed = 50;                                // meters per second
let throttle = 0.5;                            // 0–1
const maxSpeed = 250;
const minSpeed = 20;

const pitchRate = THREE.MathUtils.degToRad(30);  // deg/sec
const rollRate  = THREE.MathUtils.degToRad(45);
const yawRate   = THREE.MathUtils.degToRad(15);

const inputState = {
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
  yawLeft: false,
  yawRight: false,
  throttleUp: false,
  throttleDown: false
};

// Input handling
window.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "KeyW": inputState.pitchDown = true; break; // nose down
    case "KeyS": inputState.pitchUp = true; break;   // nose up
    case "KeyA": inputState.rollLeft = true; break;
    case "KeyD": inputState.rollRight = true; break;
    case "KeyQ": inputState.yawLeft = true; break;
    case "KeyE": inputState.yawRight = true; break;
    case "KeyR": inputState.throttleUp = true; break;
    case "KeyF": inputState.throttleDown = true; break;
  }
});

window.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW": inputState.pitchDown = false; break;
    case "KeyS": inputState.pitchUp = false; break;
    case "KeyA": inputState.rollLeft = false; break;
    case "KeyD": inputState.rollRight = false; break;
    case "KeyQ": inputState.yawLeft = false; break;
    case "KeyE": inputState.yawRight = false; break;
    case "KeyR": inputState.throttleUp = false; break;
    case "KeyF": inputState.throttleDown = false; break;
  }
});

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Simple physics loop
let lastTime = performance.now();

function update(dt) {
  // Throttle change
  const throttleChangeRate = 0.3; // per second
  if (inputState.throttleUp) {
    throttle += throttleChangeRate * dt;
  }
  if (inputState.throttleDown) {
    throttle -= throttleChangeRate * dt;
  }
  throttle = THREE.MathUtils.clamp(throttle, 0, 1);

  // Convert throttle to speed
  speed = minSpeed + throttle * (maxSpeed - minSpeed);

  // Rotations based on input
  let pitch = 0;
  let roll = 0;
  let yaw = 0;

  if (inputState.pitchUp)   pitch += pitchRate * dt;
  if (inputState.pitchDown) pitch -= pitchRate * dt;
  if (inputState.rollLeft)  roll += rollRate * dt;
  if (inputState.rollRight) roll -= rollRate * dt;
  if (inputState.yawLeft)   yaw += yawRate * dt;
  if (inputState.yawRight)  yaw -= yawRate * dt;

  // Apply rotations in aircraft local space
  const euler = new THREE.Euler(pitch, yaw, roll, "XYZ");
  aircraft.quaternion.multiply(new THREE.Quaternion().setFromEuler(euler));

  // Forward direction in world space
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);

  // Simplified lift: reduce downward velocity if moving fast and wings have some angle
  // (This is extremely crude, just to keep the plane from instantly falling.)
  const gravity = new THREE.Vector3(0, -9.81, 0);
  const liftFactor = 0.5; // tweak this
  const lift = new THREE.Vector3(0, liftFactor * speed, 0);

  const acceleration = new THREE.Vector3()
    .copy(forward).multiplyScalar(0)  // no thrust as acceleration; thrust is in speed
    .add(gravity)
    .add(lift);

  velocity.addScaledVector(acceleration, dt);

  // Force velocity direction roughly forward (arcade-y)
  const forwardSpeed = speed;
  velocity.lerp(forward.multiplyScalar(forwardSpeed), 0.1);

  // Integrate position
  aircraft.position.addScaledVector(velocity, dt);

  // Prevent going below ground
  if (aircraft.position.y < 2) {
    aircraft.position.y = 2;
    velocity.y = Math.max(0, velocity.y);
  }

  // Camera: chase view behind and above aircraft
  const cameraOffset = new THREE.Vector3(0, 15, 40); // relative to aircraft
  const worldOffset = cameraOffset.applyQuaternion(aircraft.quaternion);
  const cameraTarget = new THREE.Vector3().copy(aircraft.position);
  const cameraPos = new THREE.Vector3().copy(aircraft.position).add(worldOffset);

  camera.position.lerp(cameraPos, 0.1);
  camera.lookAt(cameraTarget);
}

// Main render loop
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  update(dt);
  renderer.render(scene, camera);
}

animate();
