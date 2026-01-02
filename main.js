// === BASIC SCENE SETUP ===
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  20000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// === LIGHTING ===
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(200, 400, 100);
scene.add(sun);

// === GROUND ===
const groundGeo = new THREE.PlaneGeometry(100000, 100000);
const groundMat = new THREE.MeshPhongMaterial({ color: 0x3a8f3a });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// === RUNWAY ===
const runwayGeo = new THREE.PlaneGeometry(3000, 80);
const runwayMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
const runway = new THREE.Mesh(runwayGeo, runwayMat);
runway.rotation.x = -Math.PI / 2;
runway.position.set(0, 0.1, 0);
scene.add(runway);

// Runway centerline stripes
for (let i = -1400; i < 1400; i += 200) {
  const stripeGeo = new THREE.PlaneGeometry(40, 5);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(i, 0.11, 0);
  scene.add(stripe);
}

// === SIMPLE AIRPORT BUILDINGS ===
function makeBuilding(x, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const b = new THREE.Mesh(geo, mat);
  b.position.set(x, h / 2, z);
  scene.add(b);
}

makeBuilding(200, -200, 200, 60, 150); // terminal
makeBuilding(350, -200, 120, 40, 120); // hangar
makeBuilding(500, -200, 120, 40, 120); // hangar

// === SIMPLE AIRPLANE MODEL ===
function createAirplane(color = 0xff0000) {
  const group = new THREE.Group();

  // fuselage
  const fuselageGeo = new THREE.CylinderGeometry(1.2, 1.2, 12, 16);
  const fuselageMat = new THREE.MeshPhongMaterial({ color });
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.rotation.z = Math.PI / 2;
  group.add(fuselage);

  // wings
  const wingGeo = new THREE.BoxGeometry(14, 0.3, 2);
  const wing = new THREE.Mesh(wingGeo, fuselageMat);
  wing.position.set(0, 0, 0);
  group.add(wing);

  // tailplane
  const tailGeo = new THREE.BoxGeometry(5, 0.2, 1.2);
  const tail = new THREE.Mesh(tailGeo, fuselageMat);
  tail.position.set(-5, 0, 0);
  group.add(tail);

  // vertical stabilizer
  const finGeo = new THREE.BoxGeometry(0.3, 2, 1);
  const fin = new THREE.Mesh(finGeo, fuselageMat);
  fin.position.set(-5.5, 1, 0);
  group.add(fin);

  return group;
}

// === PLAYER AIRCRAFT ===
const aircraft = createAirplane(0xff0000);
aircraft.position.set(0, 20, 200);
scene.add(aircraft);

// === PARKED AIRCRAFT ===
for (let i = 0; i < 4; i++) {
  const parked = createAirplane(0x0066ff);
  parked.position.set(250 + i * 40, 5, -150);
  parked.rotation.y = Math.PI / 2;
  scene.add(parked);
}

// === FLIGHT PHYSICS ===
let velocity = new THREE.Vector3(0, 0, -1);
let speed = 50;
let throttle = 0.5;
const maxSpeed = 250;
const minSpeed = 20;

const pitchRate = THREE.MathUtils.degToRad(30);
const rollRate = THREE.MathUtils.degToRad(45);
const yawRate = THREE.MathUtils.degToRad(15);

const input = {
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
  yawLeft: false,
  yawRight: false,
  throttleUp: false,
  throttleDown: false
};

// === INPUT HANDLING ===
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") input.pitchDown = true;
  if (e.code === "KeyS") input.pitchUp = true;
  if (e.code === "KeyA") input.rollLeft = true;
  if (e.code === "KeyD") input.rollRight = true;
  if (e.code === "KeyQ") input.yawLeft = true;
  if (e.code === "KeyE") input.yawRight = true;
  if (e.code === "KeyR") input.throttleUp = true;
  if (e.code === "KeyF") input.throttleDown = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") input.pitchDown = false;
  if (e.code === "KeyS") input.pitchUp = false;
  if (e.code === "KeyA") input.rollLeft = false;
  if (e.code === "KeyD") input.rollRight = false;
  if (e.code === "KeyQ") input.yawLeft = false;
  if (e.code === "KeyE") input.yawRight = false;
  if (e.code === "KeyR") input.throttleUp = false;
  if (e.code === "KeyF") input.throttleDown = false;
});

// === RESIZE ===
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === UPDATE LOOP ===
let last = performance.now();

function update(dt) {
  // throttle
  if (input.throttleUp) throttle += dt * 0.3;
  if (input.throttleDown) throttle -= dt * 0.3;
  throttle = THREE.MathUtils.clamp(throttle, 0, 1);

  speed = minSpeed + throttle * (maxSpeed - minSpeed);

  // rotation
  let pitch = 0, roll = 0, yaw = 0;
  if (input.pitchUp) pitch += pitchRate * dt;
  if (input.pitchDown) pitch -= pitchRate * dt;
  if (input.rollLeft) roll += rollRate * dt;
  if (input.rollRight) roll -= rollRate * dt;
  if (input.yawLeft) yaw += yawRate * dt;
  if (input.yawRight) yaw -= yawRate * dt;

  aircraft.quaternion.multiply(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "XYZ"))
  );

  // forward direction
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);

  // gravity + crude lift
  const gravity = new THREE.Vector3(0, -9.81, 0);
  const lift = new THREE.Vector3(0, speed * 0.4, 0);

  velocity.addScaledVector(gravity, dt);
  velocity.addScaledVector(lift, dt);

  // arcade-style forward velocity
  velocity.lerp(forward.multiplyScalar(speed), 0.1);

  aircraft.position.addScaledVector(velocity, dt);

  // ground collision
  if (aircraft.position.y < 5) {
    aircraft.position.y = 5;
    velocity.y = 0;
  }

  // camera follow
  const camOffset = new THREE.Vector3(0, 20, 60).applyQuaternion(aircraft.quaternion);
  const camPos = aircraft.position.clone().add(camOffset);
  camera.position.lerp(camPos, 0.1);
  camera.lookAt(aircraft.position);
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;

  update(dt);
  renderer.render(scene, camera);
}

animate();

