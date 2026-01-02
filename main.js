// === BASIC SCENE SETUP ===
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  20000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

// === LIGHTING (STILL USED FOR MESHES / SPECULAR) ===
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(200, 400, 100);
scene.add(sun);

// --------------------------------------------------------
// SHADERS
// --------------------------------------------------------

// Simple hash-based pseudo-random noise function in GLSL
const noiseChunk = `
float hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}
`;

// --- Sky shader (full-screen dome via large sphere) ---
const skyVertex = `
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const skyFragment = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 sunDirection;
uniform float time;
varying vec3 vWorldPos;

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = max(dir.y, 0.0);

  // base gradient
  vec3 sky = mix(bottomColor, topColor, pow(h, 1.2));

  // sun glow
  float sunAmount = max(dot(dir, normalize(sunDirection)), 0.0);
  float glow = pow(sunAmount, 256.0);
  vec3 sunGlow = vec3(1.0, 0.9, 0.7) * glow * 2.0;

  // subtle time-based tint shift
  float dayWave = 0.5 + 0.5 * sin(time * 0.05);
  sky *= mix(0.9, 1.1, dayWave);

  gl_FragColor = vec4(sky + sunGlow, 1.0);
}
`;

// --- Ground shader (noise + fog) ---
const groundVertex = `
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const groundFragment = `
uniform vec3 baseColor;
uniform vec3 secondaryColor;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float time;
varying vec3 vWorldPos;
varying vec2 vUv;
${noiseChunk}
void main() {
  // World position as texture coords
  vec2 coord = vWorldPos.xz * 0.0007;
  float n = noise(coord * 80.0);
  float n2 = noise(coord * 10.0 + time * 0.02);

  // Two-tone grass/dirt mix
  float mixVal = smoothstep(-0.3, 0.4, n) * 0.9 + 0.1 * n2;
  vec3 color = mix(baseColor, secondaryColor, mixVal);

  // Slight darker patches
  float shadowMask = smoothstep(0.0, 0.8, noise(coord * 8.0 + 123.4));
  color *= mix(0.8, 1.1, shadowMask);

  // Fog
  float dist = length(vWorldPos.xz);
  float fogFactor = smoothstep(fogNear, fogFar, dist);
  color = mix(color, fogColor, fogFactor);

  gl_FragColor = vec4(color, 1.0);
}
`;

// --- Runway shader (paint + centerline in shader) ---
const runwayVertex = `
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const runwayFragment = `
uniform vec3 asphaltColor;
uniform vec3 paintColor;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vWorldPos;
varying vec2 vUv;

float stripePattern(float x) {
  // repeating blocks along X
  float scale = 20.0;
  float pos = fract(x * scale);
  return step(0.45, pos) * step(pos, 0.55);
}

void main() {
  // base asphalt
  float edgeFade = smoothstep(0.0, 0.02, abs(vUv.y - 0.5));
  vec3 color = asphaltColor;

  // centerline
  float stripe = stripePattern(vUv.x);
  float center = 1.0 - smoothstep(0.48, 0.52, vUv.y);
  float centerline = stripe * center;
  color = mix(color, paintColor, centerline);

  // subtle dark edges
  color *= mix(1.0, 0.7, edgeFade);

  // Fog
  float dist = length(vWorldPos.xz);
  float fogFactor = smoothstep(fogNear, fogFar, dist);
  color = mix(color, fogColor, fogFactor);

  gl_FragColor = vec4(color, 1.0);
}
`;

// --------------------------------------------------------
// SKY DOME
// --------------------------------------------------------
const skyGeo = new THREE.SphereGeometry(10000, 32, 15);
const skyMat = new THREE.ShaderMaterial({
  vertexShader: skyVertex,
  fragmentShader: skyFragment,
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x4a86e8) },
    bottomColor: { value: new THREE.Color(0xbdd9ff) },
    sunDirection: { value: new THREE.Vector3(0.2, 0.9, 0.3) },
    time: { value: 0 }
  }
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// --------------------------------------------------------
// GROUND USING SHADER
// --------------------------------------------------------
const groundGeo = new THREE.PlaneGeometry(100000, 100000, 1, 1);
const groundMat = new THREE.ShaderMaterial({
  vertexShader: groundVertex,
  fragmentShader: groundFragment,
  uniforms: {
    baseColor: { value: new THREE.Color(0x3a8f3a) },
    secondaryColor: { value: new THREE.Color(0x567d46) },
    fogColor: { value: new THREE.Color(0xbdd9ff) },
    fogNear: { value: 2000 },
    fogFar: { value: 12000 },
    time: { value: 0 }
  }
});
groundMat.side = THREE.DoubleSide;
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --------------------------------------------------------
// RUNWAY USING SHADER
// --------------------------------------------------------
const runwayGeo = new THREE.PlaneGeometry(3000, 80, 1, 1);
const runwayMat = new THREE.ShaderMaterial({
  vertexShader: runwayVertex,
  fragmentShader: runwayFragment,
  uniforms: {
    asphaltColor: { value: new THREE.Color(0x303030) },
    paintColor: { value: new THREE.Color(0xffffff) },
    fogColor: { value: new THREE.Color(0xbdd9ff) },
    fogNear: { value: 2000 },
    fogFar: { value: 12000 }
  }
});
runwayMat.side = THREE.DoubleSide;
const runway = new THREE.Mesh(runwayGeo, runwayMat);
runway.rotation.x = -Math.PI / 2;
runway.position.set(0, 0.1, 0);
scene.add(runway);

// --------------------------------------------------------
// SIMPLE AIRPORT BUILDINGS (PHONG MATERIAL)
// --------------------------------------------------------
function makeBuilding(x, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x999999,
    shininess: 40,
    specular: 0x444444
  });
  const b = new THREE.Mesh(geo, mat);
  b.castShadow = true;
  b.receiveShadow = true;
  b.position.set(x, h / 2, z);
  scene.add(b);
}

makeBuilding(200, -200, 200, 60, 150);
makeBuilding(350, -200, 120, 40, 120);
makeBuilding(500, -200, 120, 40, 120);

// --------------------------------------------------------
// SIMPLE AIRPLANE MODEL
// --------------------------------------------------------
function createAirplane(color = 0xff0000) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({
    color,
    shininess: 80,
    specular: 0xcccccc
  });

  // fuselage
  const fuselageGeo = new THREE.CylinderGeometry(1.2, 1.2, 12, 24);
  const fuselage = new THREE.Mesh(fuselageGeo, mat);
  fuselage.rotation.z = Math.PI / 2;
  group.add(fuselage);

  // nose (cone)
  const noseGeo = new THREE.ConeGeometry(1.2, 2.5, 24);
  const nose = new THREE.Mesh(noseGeo, mat);
  nose.position.set(7, 0, 0);
  nose.rotation.z = -Math.PI / 2;
  group.add(nose);

  // wings
  const wingGeo = new THREE.BoxGeometry(14, 0.3, 2.5);
  const wing = new THREE.Mesh(wingGeo, mat);
  group.add(wing);

  // tailplane
  const tailGeo = new THREE.BoxGeometry(5, 0.2, 1.4);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(-5, 0, 0);
  group.add(tail);

  // vertical stabilizer
  const finGeo = new THREE.BoxGeometry(0.3, 2.2, 1);
  const fin = new THREE.Mesh(finGeo, mat);
  fin.position.set(-5.5, 1.2, 0);
  group.add(fin);

  // simple cockpit glass
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0x88aaff,
    transparent: true,
    opacity: 0.7,
    shininess: 120,
    specular: 0xffffff
  });
  const glassGeo = new THREE.SphereGeometry(1.1, 16, 16);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.scale.set(1.3, 0.7, 1.2);
  glass.position.set(2, 0.8, 0);
  group.add(glass);

  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return group;
}

// Player aircraft
const aircraft = createAirplane(0xff0000);
aircraft.position.set(0, 20, 200);
scene.add(aircraft);

// Parked aircraft
for (let i = 0; i < 4; i++) {
  const parked = createAirplane(0x0066ff);
  parked.position.set(250 + i * 45, 5, -150);
  parked.rotation.y = Math.PI / 2;
  scene.add(parked);
}

// --------------------------------------------------------
// FLIGHT PHYSICS
// --------------------------------------------------------
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

// Input
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

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --------------------------------------------------------
// UPDATE LOOP
// --------------------------------------------------------
let last = performance.now();
let globalTime = 0;

function update(dt) {
  globalTime += dt;

  // Update shader time uniforms
  skyMat.uniforms.time.value = globalTime;
  groundMat.uniforms.time.value = globalTime;

  // Throttle
  if (input.throttleUp) throttle += dt * 0.3;
  if (input.throttleDown) throttle -= dt * 0.3;
  throttle = THREE.MathUtils.clamp(throttle, 0, 1);
  speed = minSpeed + throttle * (maxSpeed - minSpeed);

  // Rotation
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

  // Forward direction
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);

  // Gravity + crude lift
  const gravity = new THREE.Vector3(0, -9.81, 0);
  const lift = new THREE.Vector3(0, speed * 0.4, 0);

  velocity.addScaledVector(gravity, dt);
  velocity.addScaledVector(lift, dt);

  // Arcade-style forward speed
  velocity.lerp(forward.multiplyScalar(speed), 0.12);

  aircraft.position.addScaledVector(velocity, dt);

  // Ground collision
  if (aircraft.position.y < 5) {
    aircraft.position.y = 5;
    velocity.y = 0;
  }

  // Camera follow
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
