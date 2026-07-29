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
const PRELUDE_DURATION = TEST_MODE ? 1.6 : 10;
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
// This is the actual viewer dolly: it translates the spectator through the
// static tunnel. The inner rig keeps look input separate from the route.
const viewerDolly = new THREE.Group();
viewerDolly.add(rig);
scene.add(viewerDolly);

// Five very broad, low-amplitude bends. The first third is nearly straight,
// while the last two control points deliberately settle into the central axis
// before the white room.
const tunnelPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, -10),
  new THREE.Vector3(.12, .03, -31),
  new THREE.Vector3(-.55, .18, -59),
  new THREE.Vector3(.98, -.4, -92),
  new THREE.Vector3(-2.15, .72, -128),
  new THREE.Vector3(1.82, -.68, -158),
  new THREE.Vector3(.22, -.06, -185),
  new THREE.Vector3(0, 0, -208),
  new THREE.Vector3(0, 0, -234)
], false, "centripetal", .32);
const TUNNEL_SEGMENTS = 224;
const TUNNEL_RADIAL_SEGMENTS = 72;
const TUNNEL_PATH_LENGTH = tunnelPath.getLength();
// One linear route pass makes the forward flight continuously perceptible.
const TUNNEL_ROUTE_DURATION = phases[6].start;
const VIEWER_FORWARD_SPEED = TUNNEL_PATH_LENGTH / TUNNEL_ROUTE_DURATION;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PORTAL_NORMAL = new THREE.Vector3(0, 0, 1);

function createTunnelFrame() {
  return {
    center: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3()
  };
}

function sampleTunnelFrame(progress, frame) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  tunnelPath.getPointAt(clamped, frame.center);
  tunnelPath.getTangentAt(clamped, frame.tangent).normalize();
  // A world-up frame locks roll to the horizon, which is more comfortable in VR.
  frame.right.crossVectors(frame.tangent, WORLD_UP).normalize();
  frame.up.crossVectors(frame.right, frame.tangent).normalize();
  return frame;
}

function createCurvedTunnelGeometry() {
  const positions = [];
  const centers = [];
  const uvs = [];
  const indices = [];
  const frame = createTunnelFrame();

  for (let ring = 0; ring <= TUNNEL_SEGMENTS; ring += 1) {
    const progress = ring / TUNNEL_SEGMENTS;
    const radius = THREE.MathUtils.lerp(7.4, 6.3, progress);
    sampleTunnelFrame(progress, frame);
    for (let radial = 0; radial <= TUNNEL_RADIAL_SEGMENTS; radial += 1) {
      const angle = radial / TUNNEL_RADIAL_SEGMENTS * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push(
        frame.center.x + frame.right.x * cos * radius + frame.up.x * sin * radius,
        frame.center.y + frame.right.y * cos * radius + frame.up.y * sin * radius,
        frame.center.z + frame.right.z * cos * radius + frame.up.z * sin * radius
      );
      centers.push(frame.center.x, frame.center.y, frame.center.z);
      uvs.push(radial / TUNNEL_RADIAL_SEGMENTS, progress);
    }
  }

  for (let ring = 0; ring < TUNNEL_SEGMENTS; ring += 1) {
    for (let radial = 0; radial < TUNNEL_RADIAL_SEGMENTS; radial += 1) {
      const a = ring * (TUNNEL_RADIAL_SEGMENTS + 1) + radial;
      const b = a + TUNNEL_RADIAL_SEGMENTS + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aCenter", new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

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
  uniform float uRadiusScale;
  attribute vec3 aCenter;
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
    // Scale only away from the spline centre, never along the route itself.
    // The tunnel can narrow without pulling its curve away from the camera.
    vec3 transformed=aCenter+(position-aCenter)*uRadiusScale+normal*displacement;
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
    uChaos: { value: 0 }, uFlash: { value: 0 }, uRadiusScale: { value: 1 }
  },
  vertexShader, fragmentShader
});
const tunnel = new THREE.Mesh(createCurvedTunnelGeometry(), tunnelMaterial);
scene.add(tunnel);

const portalMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uOpacity: { value: .82 }, uDistress: { value: 0 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uOpacity;uniform float uDistress;varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;float e=1.-smoothstep(.54,1.,d);float c=1.-smoothstep(0.,.92,d);vec3 calm=mix(vec3(.66,.8,.77),vec3(1.,.93,.67),c);vec3 peak=mix(vec3(.18,.005,.03),vec3(1.),pow(c,5.));gl_FragColor=vec4(mix(calm,peak,uDistress),e*uOpacity);}`
});
const portal = new THREE.Mesh(new THREE.CircleGeometry(20, 72), portalMaterial);
scene.add(portal);

const particleCount = 700;
const particlePositions = new Float32Array(particleCount * 3);
const particleFrame = createTunnelFrame();
for (let i = 0; i < particleCount; i += 1) {
  sampleTunnelFrame(Math.random() * .96, particleFrame);
  const angle = Math.random() * Math.PI * 2;
  const radius = 3.4 + Math.random() * 1.15;
  const cos = Math.cos(angle) * radius;
  const sin = Math.sin(angle) * radius;
  particlePositions[i * 3] = particleFrame.center.x + particleFrame.right.x * cos + particleFrame.up.x * sin;
  particlePositions[i * 3 + 1] = particleFrame.center.y + particleFrame.right.y * cos + particleFrame.up.y * sin;
  particlePositions[i * 3 + 2] = particleFrame.center.z + particleFrame.right.z * cos + particleFrame.up.z * sin;
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ color: 0xf1cf72, size: .045, transparent: true, opacity: .48, sizeAttenuation: true, depthWrite: false });
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Textile interlude (12–29 s): broad, draped membranes are stretched between
// tunnel anchors. Their pinched waists echo a tensile textile installation,
// while the open centre remains a visual (and technical) camera corridor.
const FABRIC_START = 12;
const FABRIC_END = 29;
const FABRIC_COUNT = 24;
const FABRIC_GATEWAY_COUNT = 6;
const FABRIC_ROUTE_START = TUNNEL_PATH_LENGTH * FABRIC_START / TUNNEL_ROUTE_DURATION;
const FABRIC_ROUTE_LENGTH = TUNNEL_PATH_LENGTH * (FABRIC_END - FABRIC_START) / TUNNEL_ROUTE_DURATION;
const fabricMembranes = new THREE.Group();
fabricMembranes.visible = false;
scene.add(fabricMembranes);

const fabricMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: .5 },
    uPhase: { value: 0 },
    uTwist: { value: 0 },
    uGather: { value: 0 },
    uWaist: { value: .5 },
    uDrape: { value: 0 },
    uCalm: { value: 0 },
    uNervous: { value: 0 },
    uJolt: { value: 0 }
  },
  vertexShader: `
    uniform float uTime;
    uniform float uPhase;
    uniform float uTwist;
    uniform float uGather;
    uniform float uWaist;
    uniform float uDrape;
    uniform float uCalm;
    uniform float uNervous;
    uniform float uJolt;
    attribute float aAlong;
    attribute float aAcross;
    varying float vAlong;
    varying float vAcross;
    varying float vLight;
    void main(){
      vAlong=aAlong;
      vAcross=aAcross;
      // A Gaussian gather pulls one part of the broad sheet into a taut waist.
      float gathered=1.-uGather*exp(-pow((aAlong-uWaist)*5.6,2.));
      float breathing=sin(aAlong*6.28318+uTime*(.58+uCalm*.24)+uPhase)*(.10+.11*uCalm);
      float ripple=sin(aAlong*14.0-uTime*(.76+uNervous*1.8)+uPhase*2.7)*(.025+.15*uNervous);
      float fineWave=sin(aAlong*26.0+uTime*1.9+uPhase*4.0)*(.016+.052*uNervous);
      float jolt=sin(aAlong*25.0+uPhase*9.0+uTime*30.0)*uJolt*.23;
      float angle=(aAlong-.5)*uTwist+sin(aAlong*8.0+uTime*.7+uPhase)*uNervous*.12;
      // This shallow centre bow makes the planes read as hanging fabric, not flags.
      float hanging=sin(aAlong*3.14159)*(1.-aAcross*aAcross)*uDrape;
      float bentDepth=breathing+ripple+fineWave+jolt+hanging;
      float c=cos(angle), s=sin(angle);
      float billow=sin(aAlong*3.14159)*(1.-aAcross*aAcross)*uDrape*.24;
      vec2 twisted=mat2(c,-s,s,c)*vec2(position.x*gathered+billow,bentDepth);
      float sideways=sin(aAlong*3.14159+uPhase)*uDrape*.12;
      vec3 transformed=vec3(twisted.x+sideways,position.y+sin(aAlong*9.0+uTime*.55+uPhase)*(.025+.055*uCalm)+jolt*.12,twisted.y);
      vLight=.78+.22*sin(aAlong*5.2+uPhase)*.5+.11*abs(aAcross);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);
    }
  `,
  fragmentShader: `
    precision mediump float;
    uniform float uOpacity;
    varying float vAlong;
    varying float vAcross;
    varying float vLight;
    void main(){
      float tip=smoothstep(.0,.105,vAlong)*(1.-smoothstep(.895,1.,vAlong));
      float edge=1.-smoothstep(.62,1.,abs(vAcross));
      float weave=.97+.03*sin(vAlong*58.+vAcross*9.);
      vec3 textile=mix(vec3(.93,.95,.97),vec3(1.),clamp(vLight,0.,1.))*weave;
      gl_FragColor=vec4(textile,uOpacity*tip*(.92+.08*edge));
    }
  `
});
// Rendering transparent double-sided fabric in one pass saves work on Quest.
fabricMaterial.forceSinglePass = true;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createFabricGeometry(width) {
  // A 5 × 11 grid keeps the drape soft but is still only 72 vertices per membrane.
  const alongSegments = 11;
  const acrossSegments = 5;
  const positions = [];
  const alongValues = [];
  const acrossValues = [];
  const indices = [];
  for (let row = 0; row <= alongSegments; row += 1) {
    const along = row / alongSegments;
    // Wide shoulders and true pointed ends create long, stretched textile silhouettes.
    const taper = Math.pow(Math.sin(Math.PI * along), .46);
    for (let column = 0; column <= acrossSegments; column += 1) {
      const across = column / acrossSegments * 2 - 1;
      positions.push(across * width * taper, along - .5, 0);
      alongValues.push(along);
      acrossValues.push(across);
    }
  }
  for (let row = 0; row < alongSegments; row += 1) {
    for (let column = 0; column < acrossSegments; column += 1) {
      const a = row * (acrossSegments + 1) + column;
      const b = a + acrossSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(alongValues, 1));
  geometry.setAttribute("aAcross", new THREE.Float32BufferAttribute(acrossValues, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createFabricMembranes() {
  const random = seededRandom(29012026);
  const localUp = new THREE.Vector3(0, 1, 0);
  const frameA = createTunnelFrame();
  const frameB = createTunnelFrame();
  // The first six sheets form the recognizable room-scale installation. The
  // remaining membranes progressively fill the tunnel without sealing it shut.
  const gatewayAnchors = [
    [2.62, .28], [3.36, 5.6], [5.14, 1.02],
    [4.08, .18], [2.92, 5.84], [.92, 3.9]
  ];
  for (let index = 0; index < FABRIC_COUNT; index += 1) {
    const gateway = index < FABRIC_GATEWAY_COUNT;
    const angleA = gateway ? gatewayAnchors[index][0] : random() * Math.PI * 2;
    // Long diagonals and offset anchors produce an enveloping, but porous weave.
    const angleB = gateway ? gatewayAnchors[index][1] : angleA + (random() < .5 ? -1 : 1) * (.74 + random() * 1.34);
    const radiusA = 4.9 + random() * .55;
    const radiusB = 4.9 + random() * .55;
    // Anchor cloth to the same spline as the camera and tunnel rings. The first
    // six sheets sit close together in the textile passage; the rest fill its depth.
    const routeDistance = gateway
      ? FABRIC_ROUTE_START + 5 + index * FABRIC_ROUTE_LENGTH / 8
      : FABRIC_ROUTE_START + random() * FABRIC_ROUTE_LENGTH;
    const span = gateway ? 17 + random() * 8 : 8 + random() * 15;
    sampleTunnelFrame((routeDistance - span * .5) / TUNNEL_PATH_LENGTH, frameA);
    sampleTunnelFrame((routeDistance + span * .5) / TUNNEL_PATH_LENGTH, frameB);
    const anchorA = frameA.center.clone()
      .addScaledVector(frameA.right, Math.cos(angleA) * radiusA)
      .addScaledVector(frameA.up, Math.sin(angleA) * radiusA);
    const anchorB = frameB.center.clone()
      .addScaledVector(frameB.right, Math.cos(angleB) * radiusB)
      .addScaledVector(frameB.up, Math.sin(angleB) * radiusB);
    const direction = anchorB.clone().sub(anchorA);
    const mesh = new THREE.Mesh(createFabricGeometry(gateway ? 1.42 + random() * .48 : .86 + random() * .58), fabricMaterial);
    mesh.position.copy(anchorA).add(anchorB).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(localUp, direction.clone().normalize());
    mesh.scale.y = direction.length();
    mesh.renderOrder = 6;

    const data = {
      mesh,
      phase: random() * Math.PI * 2,
      twist: .34 + random() * .52,
      gather: gateway ? .52 + random() * .2 : .32 + random() * .36,
      waist: .32 + random() * .36,
      drape: gateway ? .62 + random() * .36 : .3 + random() * .5,
      // A compact reveal curve makes a textile cluster rather than isolated flags.
      revealAt: index / (FABRIC_COUNT - 1) * .52,
      opacity: gateway ? .84 + random() * .1 : .72 + random() * .13,
      jolt: 0,
      nextJolt: 0
    };
    mesh.userData.fabric = data;
    // Materials are shared; uniforms are set immediately before each draw.
    mesh.onBeforeRender = () => {
      fabricMaterial.uniforms.uOpacity.value = data.currentOpacity;
      fabricMaterial.uniforms.uPhase.value = data.phase;
      fabricMaterial.uniforms.uTwist.value = data.twist * (1 + data.nervous * 1.9);
      fabricMaterial.uniforms.uGather.value = data.gather;
      fabricMaterial.uniforms.uWaist.value = data.waist;
      fabricMaterial.uniforms.uDrape.value = data.drape;
      fabricMaterial.uniforms.uCalm.value = data.calm;
      fabricMaterial.uniforms.uNervous.value = data.nervous;
      fabricMaterial.uniforms.uJolt.value = data.jolt;
    };
    fabricMembranes.add(mesh);
  }
}

function updateFabricMembranes(journeyTime, elapsed, delta, tunnelScale) {
  const active = journeyTime >= FABRIC_START && journeyTime < FABRIC_END;
  fabricMembranes.visible = active;
  if (!active) return;

  const progress = THREE.MathUtils.clamp((journeyTime - FABRIC_START) / (FABRIC_END - FABRIC_START), 0, 1);
  const fadeIn = THREE.MathUtils.smoothstep(progress, 0, .06);
  const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, .9, 1);
  const nervous = THREE.MathUtils.smoothstep(progress, .34, .96);
  fabricMaterial.uniforms.uTime.value = elapsed;

  fabricMembranes.children.forEach((mesh) => {
    const data = mesh.userData.fabric;
    const reveal = THREE.MathUtils.smoothstep(progress, data.revealAt, data.revealAt + .16);
    mesh.visible = reveal > .01;
    // Narrow locally with the corridor without scaling the spline positions.
    mesh.scale.x = Math.max(.38, tunnelScale);
    data.calm = 1 - nervous;
    data.nervous = nervous;
    if (nervous > .18 && elapsed >= data.nextJolt) {
      data.jolt = (.22 + Math.random() * .64) * nervous;
      data.nextJolt = elapsed + .38 + Math.random() * 1.35;
    }
    data.jolt = Math.max(0, data.jolt - delta * 2.7);
    data.currentOpacity = data.opacity * reveal * fadeIn * fadeOut;
  });
}

createFabricMembranes();

const cameraFrame = createTunnelFrame();
const portalFrame = createTunnelFrame();
const cameraLookAhead = new THREE.Vector3();
const portalFacing = new THREE.Vector3();
const viewerLookMatrix = new THREE.Matrix4();

function moveViewerAlongTunnel(routeProgress) {
  const progress = THREE.MathUtils.clamp(routeProgress, 0, .998);
  sampleTunnelFrame(progress, cameraFrame);
  tunnelPath.getPointAt(Math.min(progress + .0035, 1), cameraLookAhead);
  viewerDolly.position.copy(cameraFrame.center);
  // Matrix4.lookAt uses the camera convention: the local -Z axis points into
  // the direction of travel. Object3D.lookAt would flip a non-camera dolly.
  viewerLookMatrix.lookAt(cameraFrame.center, cameraLookAhead, WORLD_UP);
  viewerDolly.quaternion.setFromRotationMatrix(viewerLookMatrix);

  // The portal stays ahead on the same centreline and faces back along its tangent.
  sampleTunnelFrame(Math.min(progress + .36, .998), portalFrame);
  portal.position.copy(portalFrame.center);
  portalFacing.copy(portalFrame.tangent).negate();
  portal.quaternion.setFromUnitVectors(PORTAL_NORMAL, portalFacing);
}

const whiteRoomMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
const whiteRoom = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 20), whiteRoomMaterial);
whiteRoom.position.copy(tunnelPath.getPointAt(1));
whiteRoom.visible = false;
scene.add(whiteRoom);

const paradise = new THREE.Group();
const paradiseTexture = new THREE.TextureLoader().load("./paradise-valley-360.png");
paradiseTexture.colorSpace = THREE.SRGBColorSpace;
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(90, 80, 48),
  new THREE.MeshBasicMaterial({ map: paradiseTexture, side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: false })
);
const meadow = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshLambertMaterial({ color: 0x5caf4b }));
meadow.rotation.x = -Math.PI / 2; meadow.position.y = -48; meadow.visible = false;
const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff0a8 }));
sun.position.set(-20, 17, -42);
paradise.add(sky, meadow, sun, new THREE.HemisphereLight(0xdff5ff, 0x4d8d43, 2.2));
const warmLight = new THREE.DirectionalLight(0xffe8af, 2.5); warmLight.position.set(-12, 18, 6); paradise.add(warmLight);
[[-25,-1.7,-42,15],[-7,-1.7,-47,18],[15,-1.7,-43,15],[30,-1.7,-51,19]].forEach(([x,y,z,s],i)=>{const hill=new THREE.Mesh(new THREE.ConeGeometry(s,s*.8,28),new THREE.MeshLambertMaterial({color:i%2?0x438d43:0x347c39}));hill.position.set(x,y+s*.34,z);paradise.add(hill);});
[[-15,-15,1.3],[12,-18,1.55],[22,-30,1.1],[-27,-31,1.8],[5,-34,.95]].forEach(([x,z,s])=>{const tree=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.2*s,2.2*s,8),new THREE.MeshLambertMaterial({color:0x6a4526}));trunk.position.y=-1.7+1.1*s;const crown=new THREE.Mesh(new THREE.ConeGeometry(1.15*s,3.6*s,10),new THREE.MeshLambertMaterial({color:0x28733a}));crown.position.y=-1.7+3*s;tree.add(trunk,crown);tree.position.set(x,0,z);paradise.add(tree);});
const birds = new THREE.Group(); const birdFlights = [];
function addBird(x,y,z,size,speed){const bird=new THREE.Group(),mat=new THREE.LineBasicMaterial({color:0x173f2a});bird.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-size,0,0),new THREE.Vector3(0,size*.35,0)]),mat),new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,size*.35,0),new THREE.Vector3(size,0,0)]),mat));bird.position.set(x,y,z);birds.add(bird);birdFlights.push({bird,x,y,speed,phase:Math.random()*Math.PI*2});}
addBird(-5,8,-20,.72,.9);addBird(4,10,-28,.52,1.2);addBird(13,7,-24,.44,.75);paradise.add(birds);paradise.children.forEach((child)=>{if(child!==sky)child.visible=false;});paradise.visible=true;scene.add(paradise);

const clock = new THREE.Clock();
let previousElapsed = 0;
let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
let dragging = false, pointerX = 0, pointerY = 0, firstFrameRendered = false;
let preludeRunning = false, preludeStartedAt = 0;
let journeyRunning = false, journeyFinished = false, journeyStartedAt = 0, currentPhase = -1, viewerDistance = 0;
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
  preludeRunning = false; journeyRunning = false; journeyFinished = false; currentPhase = -1; viewerDistance = 0;
  endScreen.hidden = true; startButton.hidden = false; startButton.textContent = "ENTER PARADISE";
  stageLabel.textContent = "00 / PARADISE";
  document.querySelector(".advisory").textContent = "10 SEC · SPATIAL BIRDSONG · ACCELERATION";
  document.body.classList.remove("is-running", "is-white-room");
  paradise.visible = true; tunnel.visible = false; portal.visible = false; particles.visible = false; fabricMembranes.visible = false; whiteRoom.visible = false;
  scene.background.setHex(0x91d9ff); scene.fog.color.setHex(0x91d9ff); scene.fog.density = .012; camera.position.set(0,0,11); viewerDolly.position.set(0,0,0); viewerDolly.quaternion.identity(); rig.rotation.set(0,0,0); tunnelMaterial.uniforms.uRadiusScale.value = 1; paradise.position.set(0,0,0); paradise.rotation.set(0,0,0); sky.material.opacity = 1;
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
  tunnel.visible=true;portal.visible=true;particles.visible=true;fabricMembranes.visible=false;whiteRoom.visible=false;camera.position.set(0,0,0);rig.rotation.set(0,0,0);tunnelMaterial.uniforms.uRadiusScale.value=1;portal.scale.set(1,1,1);viewerDistance=0;moveViewerAlongTunnel(0);
  journeyRunning=true;journeyFinished=false;currentPhase=-1;journeyStartedAt=elapsed;applyPhase(0,0);
}
function updateParadise(elapsed) {
  const t=elapsed-preludeStartedAt, pull=THREE.MathUtils.smootherstep(t,PRELUDE_DURATION-4,PRELUDE_DURATION), surge=pull*pull*(3-2*pull), fade=THREE.MathUtils.smootherstep(t,PRELUDE_DURATION-2.8,PRELUDE_DURATION); sky.material.opacity=1-fade;
  camera.position.z=11-surge*21;camera.position.y=Math.sin(t*.45)*.12*(1-pull);
  birdFlights.forEach(f=>{f.bird.position.x=f.x+Math.sin(t*f.speed+f.phase)*4;f.bird.position.y=f.y+Math.sin(t*f.speed*2+f.phase)*.7;f.bird.rotation.z=Math.sin(t*f.speed*2+f.phase)*.28;});
  if(pull>0){tunnel.visible=true;portal.visible=true;particles.visible=true;tunnelMaterial.uniforms.uRadiusScale.value=.035+surge*.965;portal.scale.setScalar(.025+surge*.975);sampleTunnelFrame(.36,portalFrame);portal.position.copy(portalFrame.center);portalFacing.copy(portalFrame.tangent).negate();portal.quaternion.setFromUnitVectors(PORTAL_NORMAL,portalFacing);tunnelMaterial.uniforms.uDistress.value=surge*.2;tunnelMaterial.uniforms.uChaos.value=surge*.12;tunnelMaterial.uniforms.uFlow.value=.4+surge*4.4;particles.rotation.z+=surge*.045;paradise.position.z=surge*18;paradise.rotation.y=Math.sin(t*.4)*.025*(1-pull);}
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
      // Preserve the 3.5 m → 1.5 m corridor while the centreline itself stays fixed.
      tunnelMaterial.uniforms.uRadiusScale.value = Math.max(.24, scale);
      portal.scale.setScalar(Math.max(.055, scale * scale));
      // Advance the viewer dolly itself. The tunnel remains static in world space.
      viewerDistance = Math.min(
        TUNNEL_PATH_LENGTH * .998,
        viewerDistance + delta * CLOCK_RATE * VIEWER_FORWARD_SPEED
      );
      moveViewerAlongTunnel(viewerDistance / TUNNEL_PATH_LENGTH);
      particles.rotation.z += delta * speed * (.015 + chaos * .11);
      particles.rotation.x = Math.sin(elapsed * (1 + chaos * 4)) * chaos * .16;
      particleMaterial.color.setRGB(THREE.MathUtils.lerp(.95, .95, distress), THREE.MathUtils.lerp(.81, .08, distress), THREE.MathUtils.lerp(.45, .15, distress));
      particleMaterial.size = .045 + chaos * .075;
      updateFabricMembranes(journeyTime, elapsed, delta, scale);
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
