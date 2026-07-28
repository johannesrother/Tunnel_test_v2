import * as THREE from "./vendor/three.module.js";

const stage = document.querySelector("#stage");
const vrButton = document.querySelector("#vr-button");
const status = document.querySelector("#status");
const bootMessage = document.querySelector("#boot-message");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const stageLabel = document.querySelector("#stage-label");
const flashLayer = document.querySelector("#flash-layer");
const endScreen = document.querySelector("#end-screen");

const TEST_MODE = new URLSearchParams(window.location.search).has("test");
const CLOCK_RATE = TEST_MODE ? 10 : 1;
const JOURNEY_DURATION = 60;
const PRELUDE_DURATION = TEST_MODE ? 2.2 : 15;
const phases = [
  { start: 0, label: "01 / CALM", distress: 0, chaos: 0, scale: 1, speed: 0.36 },
  { start: 8, label: "02 / UNEASE", distress: 0.28, chaos: 0.24, scale: 0.84, speed: 0.65 },
  { start: 18, label: "03 / COMPRESSION", distress: 0.5, chaos: 0.48, scale: 0.66, speed: 1.15 },
  { start: 29, label: "04 / ACCELERATION", distress: 0.7, chaos: 0.72, scale: 0.48, speed: 1.9 },
  { start: 40, label: "05 / PEAK", distress: 1, chaos: 1, scale: 0.3, speed: 3 },
  { start: 50, label: "06 / CRAWL", distress: 0.92, chaos: 0.82, scale: 0.18, speed: 3.7 },
  { start: 55, label: "07 / WHITE ROOM", distress: 0, chaos: 0, scale: 1, speed: 0 }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172119);
scene.fog = new THREE.FogExp2(0x172119, 0.018);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 150);
camera.position.set(0, 0, 11);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default", failIfMajorPerformanceCaveat: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
stage.appendChild(renderer.domElement);

renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  bootMessage.hidden = false;
  bootMessage.classList.add("is-error");
  bootMessage.textContent = "WebGL-Verbindung verloren. Seite neu laden.";
});

const vertexShader = `
  uniform float uTime;
  uniform float uChaos;
  varying vec2 vUv;
  varying float vRidge;
  varying float vDepth;
  float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  void main(){
    vUv=uv;
    float breathing=sin(uTime*.52+uv.y*15.)*.5+.5;
    float folded=sin(uv.y*(82.+uChaos*68.)+sin(uv.x*(13.+uChaos*21.))*2.2+uTime*(.22+uChaos*2.4));
    float organic=noise(vec3(position.x*.28+uTime*uChaos*.08,position.y*.09-uTime*(.025+uChaos*.18),position.z*.28));
    float abrupt=sin(uv.y*34.-uTime*7.)*sin(uv.x*31.+uTime*4.3);
    float displacement=folded*(.055+uChaos*.22)+(organic-.5)*(.58+uChaos*.7)+breathing*.045+abrupt*uChaos*.15;
    vec3 transformed=position+normal*displacement;
    transformed.xz+=vec2(sin(position.y*.18+uTime*2.1),cos(position.y*.13-uTime*1.7))*uChaos*.22;
    vRidge=folded*.5+.5;vDepth=transformed.y;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform float uFlow;
  uniform float uDistress;
  uniform float uChaos;
  uniform float uFlash;
  varying vec2 vUv;varying float vRidge;varying float vDepth;
  float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=noise2(p)*a;p=p*2.03+11.7;a*=.5;}return v;}
  float vein(vec2 p,float s,float sp){float w=sin(p.y*s*.23-uTime*sp)*.12+sin(p.y*s*.41)*.23+sin(p.y*1.7+p.x*.8)*.11;return 1.-smoothstep(0.,.055,abs(sin((p.x+w)*s)));}
  void main(){
    vec2 p=vec2(vUv.x*6.28318,vUv.y*2.);
    float tissue=fbm(vec2(vUv.x*(13.+uChaos*15.),vUv.y*(28.+uChaos*34.)-uTime*.05*uFlow));
    float fine=vein(p+vec2(tissue*.34,0),7.3+uChaos*7.,.33*uFlow);
    float branches=vein(p.yx+vec2(.7+tissue*.2,0),4.1+uChaos*5.,-.2*uFlow);
    float rings=pow(vRidge,11.);
    float travel=sin(vUv.y*(96.+uChaos*110.)-uTime*.72*uFlow)*.5+.5;
    vec3 calm=mix(vec3(.07,.13,.08),vec3(.42,.52,.38),.32+tissue*.48);
    calm=mix(calm,vec3(.62,.78,.78),smoothstep(.42,.92,tissue)*.48);
    calm+=vec3(.88,.73,.38)*fine*(.075+tissue*.085)+vec3(.96,.93,.8)*branches*fine*.13+vec3(.96,.93,.8)*rings*(.08+travel*.14);
    vec3 dark=mix(vec3(.012,.008,.025),vec3(.16,.035,.09),tissue*.7+travel*.22);
    dark+=vec3(.42,.035,.06)*fine*(.12+uChaos*.28)+vec3(.75,.68,.62)*rings*uChaos*.18;
    float cut=step(.82,sin(vUv.y*210.-uTime*(7.+uChaos*18.))*.5+.5)*uChaos;
    vec3 color=mix(calm,dark,uDistress);
    color+=vec3(.42,.35,.39)*cut*uDistress*.28;
    color*=.82+smoothstep(-58.,38.,vDepth)*.28;
    color=mix(color,vec3(1.),clamp(uFlash,0.,1.));
    gl_FragColor=vec4(color,1.);
  }
`;

const tunnelMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    uTime: { value: 0 }, uFlow: { value: phases[0].speed }, uDistress: { value: 0 },
    uChaos: { value: 0 }, uFlash: { value: 0 }
  },
  vertexShader, fragmentShader
});
const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 13, 120, 112, 320, true), tunnelMaterial);
tunnel.rotation.x = Math.PI / 2;
tunnel.position.z = -38;
scene.add(tunnel);

const portalMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uOpacity: { value: .82 }, uDistress: { value: 0 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uOpacity;uniform float uDistress;varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;float e=1.-smoothstep(.54,1.,d);float c=1.-smoothstep(0.,.92,d);vec3 calm=mix(vec3(.66,.8,.77),vec3(1.,.93,.67),c);vec3 peak=mix(vec3(.18,.005,.03),vec3(1.),pow(c,5.));gl_FragColor=vec4(mix(calm,peak,uDistress),e*uOpacity);}`
});
const portal = new THREE.Mesh(new THREE.CircleGeometry(20, 72), portalMaterial);
portal.position.z = -95;
scene.add(portal);

const particleCount = 700;
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i += 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 3.4 + Math.random() * 1.15;
  particlePositions[i * 3] = Math.cos(angle) * radius;
  particlePositions[i * 3 + 1] = Math.sin(angle) * radius;
  particlePositions[i * 3 + 2] = 12 - Math.random() * 118;
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ color: 0xf1cf72, size: .045, transparent: true, opacity: .48, sizeAttenuation: true, depthWrite: false });
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

const whiteRoomMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
const whiteRoom = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 20), whiteRoomMaterial);
whiteRoom.visible = false;
scene.add(whiteRoom);

const paradise = new THREE.Group();
const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), new THREE.MeshBasicMaterial({ color: 0x91d9ff, side: THREE.BackSide }));
const meadow = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshLambertMaterial({ color: 0x5caf4b }));
meadow.rotation.x = -Math.PI / 2; meadow.position.y = -1.7;
const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0a8 }));
sun.position.set(-20, 17, -42);
paradise.add(sky, meadow, sun, new THREE.HemisphereLight(0xdff5ff, 0x4d8d43, 2.2));
const warmLight = new THREE.DirectionalLight(0xffe8af, 2.5); warmLight.position.set(-12, 18, 6); paradise.add(warmLight);
[[-25,-1.7,-42,15],[-7,-1.7,-47,18],[15,-1.7,-43,15],[30,-1.7,-51,19]].forEach(([x,y,z,s],i)=>{const hill=new THREE.Mesh(new THREE.ConeGeometry(s,s*.8,28),new THREE.MeshLambertMaterial({color:i%2?0x438d43:0x347c39}));hill.position.set(x,y+s*.34,z);paradise.add(hill);});
[[-15,-15,1.3],[12,-18,1.55],[22,-30,1.1],[-27,-31,1.8],[5,-34,.95]].forEach(([x,z,s])=>{const tree=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.2*s,2.2*s,8),new THREE.MeshLambertMaterial({color:0x6a4526}));trunk.position.y=-1.7+1.1*s;const crown=new THREE.Mesh(new THREE.ConeGeometry(1.15*s,3.6*s,10),new THREE.MeshLambertMaterial({color:0x28733a}));crown.position.y=-1.7+3*s;tree.add(trunk,crown);tree.position.set(x,0,z);paradise.add(tree);});
const birds = new THREE.Group(); const birdFlights = [];
function addBird(x,y,z,size,speed){const bird=new THREE.Group(),mat=new THREE.LineBasicMaterial({color:0x173f2a});bird.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-size,0,0),new THREE.Vector3(0,size*.35,0)]),mat),new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,size*.35,0),new THREE.Vector3(size,0,0)]),mat));bird.position.set(x,y,z);birds.add(bird);birdFlights.push({bird,x,y,speed,phase:Math.random()*Math.PI*2});}
addBird(-5,8,-20,.72,.9);addBird(4,10,-28,.52,1.2);addBird(13,7,-24,.44,.75);paradise.add(birds);paradise.visible=true;scene.add(paradise);

const clock = new THREE.Clock();
let previousElapsed = 0;
let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
let dragging = false, pointerX = 0, pointerY = 0, firstFrameRendered = false;
let preludeRunning = false, preludeStartedAt = 0;
let journeyRunning = false, journeyFinished = false, journeyStartedAt = 0, currentPhase = -1, drift = 0;
let flashStartedAt = -99;
let audioContext, masterGain, calmGain, distressGain, flatlineGain;
let soundscapeCreated = false, birdTimer, playTimer;

function createNoiseBuffer(context, seconds = 3) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < data.length; i += 1) {
    previous = previous * .97 + (Math.random() * 2 - 1) * .03;
    data[i] = previous * 2.2;
  }
  return buffer;
}

function createTone(destination, frequency, type = "sine", volume = .02) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  return { oscillator, gain };
}

function playBirdPhrase() {
  if (!audioContext || !(preludeRunning || (journeyRunning && currentPhase === 0))) return;
  const now = audioContext.currentTime + .04;
  const pan = audioContext.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - .7;
  pan.connect(calmGain);
  for (let i = 0; i < 2 + (Math.random() > .55 ? 1 : 0); i += 1) {
    const start = now + i * (.16 + Math.random() * .08);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const base = 1850 + Math.random() * 850;
    oscillator.frequency.setValueAtTime(base, start);
    oscillator.frequency.exponentialRampToValueAtTime(base * 1.48, start + .07);
    oscillator.frequency.exponentialRampToValueAtTime(base * .92, start + .2);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.035, start + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .22);
    oscillator.connect(gain).connect(pan);
    oscillator.start(start); oscillator.stop(start + .24);
  }
  birdTimer = window.setTimeout(playBirdPhrase, 2500 + Math.random() * 3000);
}

function playDistantTone() {
  if (!audioContext || !(preludeRunning || (journeyRunning && currentPhase === 0))) return;
  const now = audioContext.currentTime + .04;
  [523.25, 659.25, 783.99].forEach((frequency, i) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + i * .43;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.012, start + .08);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .9);
    oscillator.connect(gain).connect(calmGain);
    oscillator.start(start); oscillator.stop(start + 1);
  });
  playTimer = window.setTimeout(playDistantTone, 5200);
}

function createSoundscape() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioContext.createGain();
  calmGain = audioContext.createGain();
  distressGain = audioContext.createGain();
  flatlineGain = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  masterGain.gain.value = .0001;
  calmGain.gain.value = 1;
  distressGain.gain.value = .0001;
  flatlineGain.gain.value = .0001;
  calmGain.connect(masterGain); distressGain.connect(masterGain); flatlineGain.connect(masterGain);
  masterGain.connect(compressor).connect(audioContext.destination);
  const padFilter = audioContext.createBiquadFilter();
  padFilter.type = "lowpass"; padFilter.frequency.value = 720; padFilter.connect(calmGain);
  createTone(padFilter, 130.81, "sine", .026);
  createTone(padFilter, 196, "sine", .022);
  createTone(padFilter, 261.63, "sine", .016);
  const noise = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();
  noise.buffer = createNoiseBuffer(audioContext); noise.loop = true;
  noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 190; noiseFilter.Q.value = .7;
  noiseGain.gain.value = .08;
  noise.connect(noiseFilter).connect(noiseGain).connect(distressGain); noise.start();
  createTone(distressGain, 43, "sawtooth", .045);
  createTone(distressGain, 57, "sine", .04);
  createTone(flatlineGain, 920, "sine", .08);
  soundscapeCreated = true;
}

function playImpact(intensity) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = intensity > .7 ? "sawtooth" : "sine";
  oscillator.frequency.setValueAtTime(950 + intensity * 650, now);
  oscillator.frequency.exponentialRampToValueAtTime(70, now + .32);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.08 + intensity * .12, now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .38);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(now); oscillator.stop(now + .4);
}

function setAudioPhase(index) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  calmGain.gain.cancelScheduledValues(now);
  distressGain.gain.cancelScheduledValues(now);
  flatlineGain.gain.cancelScheduledValues(now);
  calmGain.gain.setValueAtTime(Math.max(calmGain.gain.value, .0001), now);
  distressGain.gain.setValueAtTime(Math.max(distressGain.gain.value, .0001), now);
  flatlineGain.gain.setValueAtTime(Math.max(flatlineGain.gain.value, .0001), now);
  if (index === 6) {
    calmGain.gain.exponentialRampToValueAtTime(.0001, now + .18);
    distressGain.gain.exponentialRampToValueAtTime(.0001, now + .18);
    flatlineGain.gain.exponentialRampToValueAtTime(1, now + .12);
  } else {
    const level = index / 5;
    calmGain.gain.exponentialRampToValueAtTime(Math.max(.0001, 1 - level * .98), now + .8);
    distressGain.gain.exponentialRampToValueAtTime(Math.max(.0001, level), now + .8);
    flatlineGain.gain.exponentialRampToValueAtTime(.0001, now + .12);
  }
}

async function prepareAudio() {
  if (!soundscapeCreated) createSoundscape();
  await audioContext.resume();
  const now = audioContext.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, .0001), now);
  masterGain.gain.exponentialRampToValueAtTime(.18, now + .8);
}

function applyPhase(index, journeyTime) {
  const phase = phases[index];
  stageLabel.textContent = phase.label;
  flashStartedAt = journeyTime;
  if (index > 0) playImpact(index / 6);
  setAudioPhase(index);
  currentPhase = index;
  if (index === 0) {
    window.clearTimeout(birdTimer); window.clearTimeout(playTimer);
    birdTimer = window.setTimeout(playBirdPhrase, 450);
    playTimer = window.setTimeout(playDistantTone, 1800);
  }
  paradise.visible = false;
  const white = index === 6;
  tunnel.visible = !white; portal.visible = !white; particles.visible = !white; whiteRoom.visible = white;
  document.body.classList.toggle("is-white-room", white);
  scene.background.setHex(white ? 0xffffff : 0x172119);
  scene.fog.color.setHex(white ? 0xffffff : 0x172119);
}

function resetExperience() {
  preludeRunning = false; journeyRunning = false; journeyFinished = false; currentPhase = -1; drift = 0;
  endScreen.hidden = true; startButton.hidden = false; startButton.textContent = "ENTER PARADISE";
  stageLabel.textContent = "00 / PARADISE";
  document.querySelector(".advisory").textContent = "15 SEC · SPATIAL BIRDSONG · THEN THE TUNNEL";
  document.body.classList.remove("is-running", "is-white-room");
  paradise.visible = true; tunnel.visible = false; portal.visible = false; particles.visible = false; whiteRoom.visible = false;
  scene.background.setHex(0x91d9ff); scene.fog.color.setHex(0x91d9ff); scene.fog.density = .012; camera.position.set(0,0,11);
  if (audioContext) { const now=audioContext.currentTime; masterGain.gain.cancelScheduledValues(now); masterGain.gain.exponentialRampToValueAtTime(.0001,now+.25); }
}
async function startJourney() {
  if (preludeRunning || journeyRunning) return;
  try { await prepareAudio(); } catch { status.textContent = "Sound could not start"; }
  startButton.hidden = true; document.body.classList.add("is-running"); preludeRunning=true; preludeStartedAt=clock.getElapsedTime(); currentPhase=0; setAudioPhase(0);
  window.clearTimeout(birdTimer); window.clearTimeout(playTimer); birdTimer=window.setTimeout(playBirdPhrase,160); playTimer=window.setTimeout(playDistantTone,1000);
}
function beginTunnel(elapsed) {
  preludeRunning=false; paradise.visible=false; scene.background.setHex(0x172119);scene.fog.color.setHex(0x172119);scene.fog.density=.018;
  tunnel.visible=true;portal.visible=true;particles.visible=true;whiteRoom.visible=false;tunnel.position.z=-38;tunnel.scale.set(1,1,1);portal.scale.set(1,1,1);
  journeyRunning=true;journeyFinished=false;currentPhase=-1;drift=0;journeyStartedAt=elapsed;applyPhase(0,0);
}
function updateParadise(elapsed) {
  const t=elapsed-preludeStartedAt, pull=THREE.MathUtils.smoothstep(t,PRELUDE_DURATION-3.2,PRELUDE_DURATION);
  camera.position.z=11-pull*8.5;camera.position.y=Math.sin(t*.45)*.12;
  birdFlights.forEach(f=>{f.bird.position.x=f.x+Math.sin(t*f.speed+f.phase)*4;f.bird.position.y=f.y+Math.sin(t*f.speed*2+f.phase)*.7;f.bird.rotation.z=Math.sin(t*f.speed*2+f.phase)*.28;});
  if(pull>0){tunnel.visible=true;portal.visible=true;particles.visible=true;tunnel.scale.setScalar(.12+pull*.88);tunnel.position.z=-64+pull*26;portal.scale.setScalar(.08+pull*.92);portal.position.z=tunnel.position.z-57;tunnelMaterial.uniforms.uDistress.value=pull*.16;tunnelMaterial.uniforms.uChaos.value=pull*.08;tunnelMaterial.uniforms.uFlow.value=.45+pull*1.3;}
  if(t>=PRELUDE_DURATION) beginTunnel(elapsed);
}

function finishJourney() {
  journeyRunning = false; journeyFinished = true;
  endScreen.hidden = false;
  if (audioContext) {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, .0001), now);
    masterGain.gain.exponentialRampToValueAtTime(.0001, now + .18);
  }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

startButton.addEventListener("click", startJourney);
restartButton.addEventListener("click", () => { resetExperience(); startJourney(); });
renderer.domElement.addEventListener("pointerdown", (event) => {
  dragging = true; pointerX = event.clientX; pointerY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!dragging || renderer.xr.isPresenting) return;
  targetYaw -= (event.clientX - pointerX) * .003;
  targetPitch = THREE.MathUtils.clamp(targetPitch - (event.clientY - pointerY) * .003, -.7, .7);
  pointerX = event.clientX; pointerY = event.clientY;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  dragging = false;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
});
window.addEventListener("resize", resize);

async function configureVR() {
  if (!navigator.xr || !(await navigator.xr.isSessionSupported("immersive-vr"))) {
    vrButton.textContent = "VR UNAVAILABLE"; vrButton.disabled = true; return;
  }
  vrButton.addEventListener("click", async () => {
    if (renderer.xr.isPresenting) { await renderer.xr.getSession().end(); return; }
    try {
      const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });
      await renderer.xr.setSession(session);
      vrButton.textContent = "EXIT VR";
      if (!journeyRunning) await startJourney();
      session.addEventListener("end", () => { vrButton.textContent = "ENTER VR"; }, { once: true });
    } catch { status.textContent = "VR session could not start"; }
  });
}

resize();
configureVR().catch(() => { vrButton.textContent = "VR UNAVAILABLE"; vrButton.disabled = true; });
resetExperience();

renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime();
  const delta = Math.min(Math.max(elapsed - previousElapsed, 0), .05);
  previousElapsed = elapsed;
  yaw = THREE.MathUtils.lerp(yaw, targetYaw, .08);
  pitch = THREE.MathUtils.lerp(pitch, targetPitch, .08);
  if (!renderer.xr.isPresenting) rig.rotation.set(pitch, yaw, 0, "YXZ");

  let journeyTime = 0;
  let phase = phases[0];
  if (preludeRunning) updateParadise(elapsed);
  if (journeyRunning) {
    journeyTime = (elapsed - journeyStartedAt) * CLOCK_RATE;
    if (journeyTime >= JOURNEY_DURATION) finishJourney();
    else {
      let nextIndex = phases.length - 1;
      while (nextIndex > 0 && journeyTime < phases[nextIndex].start) nextIndex -= 1;
      if (nextIndex !== currentPhase) applyPhase(nextIndex, journeyTime);
      phase = phases[nextIndex];
      const next = phases[Math.min(nextIndex + 1, phases.length - 1)];
      const transition = nextIndex === phases.length - 1 ? 0 : THREE.MathUtils.smoothstep(journeyTime, next.start - 1.15, next.start);
      const distress = THREE.MathUtils.lerp(phase.distress, next.distress, transition);
      const chaos = THREE.MathUtils.lerp(phase.chaos, next.chaos, transition);
      const scale = THREE.MathUtils.lerp(phase.scale, next.scale, transition);
      const speed = THREE.MathUtils.lerp(phase.speed, next.speed, transition);
      tunnelMaterial.uniforms.uDistress.value = distress;
      tunnelMaterial.uniforms.uChaos.value = chaos;
      tunnelMaterial.uniforms.uFlow.value = speed;
      portalMaterial.uniforms.uDistress.value = distress;
      tunnel.scale.x = scale; tunnel.scale.y = 1; tunnel.scale.z = scale;
      portal.scale.setScalar(Math.max(.055, scale * scale));
      drift += delta * CLOCK_RATE * speed * 1.55;
      tunnel.position.z = -38 + (drift % 14);
      particles.position.z = drift % 12;
      particles.rotation.z += delta * speed * (.015 + chaos * .11);
      particles.rotation.x = Math.sin(elapsed * (1 + chaos * 4)) * chaos * .16;
      particleMaterial.color.setRGB(THREE.MathUtils.lerp(.95, .95, distress), THREE.MathUtils.lerp(.81, .08, distress), THREE.MathUtils.lerp(.45, .15, distress));
      particleMaterial.size = .045 + chaos * .075;
    }
  }

  const flashAge = journeyTime - flashStartedAt;
  const flash = journeyRunning && currentPhase > 0 && currentPhase < 6 && flashAge >= 0 && flashAge < .65
    ? Math.max(0, 1 - flashAge / .65) * (currentPhase < 3 ? .88 : 1) : 0;
  tunnelMaterial.uniforms.uFlash.value = flash;
  flashLayer.style.opacity = renderer.xr.isPresenting ? "0" : String(flash);
  tunnelMaterial.uniforms.uTime.value = elapsed + journeyTime * .08;
  portalMaterial.uniforms.uOpacity.value = .78 + Math.sin(elapsed * .38) * .05;
  renderer.render(scene, camera);
  if (!firstFrameRendered) { firstFrameRendered = true; bootMessage.hidden = true; }
});
