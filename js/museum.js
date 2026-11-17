import * as THREE from "three";

const MEDIA_BASE = "./media/";
const MANIFEST_URL = "./media/manifest.json";

const CELL = 12.0; // Width & depth of each modular gallery room/corridor cell
const WALL_HEIGHT = 5.4;
const WALL_MARGIN = 0.9;
const PLAYER_EYE_HEIGHT = 1.72;
const WALK_SPEED = 5.4;
const TURN_SPEED = 2.0;
const PROXIMITY_RADIUS = 4.5;

// DOM elements
const container = document.getElementById("museum-container");
const introOverlay = document.getElementById("intro-overlay");
const introTitle = document.getElementById("intro-title");
const introSubtitle = document.getElementById("intro-subtitle");
const enterBtn = document.getElementById("enter-btn");

const hudTop = document.getElementById("hud-top");
const hudTitle = document.getElementById("hud-title");
const viewModeBtn = document.getElementById("view-mode-btn");
const timelineCounter = document.getElementById("timeline-counter");
const timelineDate = document.getElementById("timeline-date");
const helpToggleBtn = document.getElementById("help-toggle-btn");
const helpPanel = document.getElementById("help-panel");
const touchControls = document.getElementById("touch-controls");
const minimapCanvas = document.getElementById("minimap");
const minimapCtx = minimapCanvas.getContext("2d");

const proximityPopup = document.getElementById("proximity-popup");
const proxIndex = document.getElementById("prox-index");
const proxTitle = document.getElementById("prox-title");
const proxDate = document.getElementById("prox-date");
const viewBtn = document.getElementById("view-btn");

const modal = document.getElementById("exhibit-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalImage = document.getElementById("modal-image");
const modalVideo = document.getElementById("modal-video");
const modalIndex = document.getElementById("modal-index");
const modalDate = document.getElementById("modal-date");
const modalTitle = document.getElementById("modal-title");
const modalCaption = document.getElementById("modal-caption");
const modalPrevBtn = document.getElementById("modal-prev-btn");
const modalNextBtn = document.getElementById("modal-next-btn");

// State
let exhibits = [];
let activeExhibit = null;
let modalOpen = false;
let currentModalIdx = -1;
let isThirdPerson = false;

// Grid & Collision state
const cellsMap = new Map(); // "gx,gz" -> { gx, gz, kind }
let gridBounds = { minX: -12, maxX: 12, minZ: -24, maxZ: 12 };
const benchBoxes = [];

// Smooth player movement & camera state
const playerPos = new THREE.Vector3(0, 0, 2.2);
let yaw = 0;
let pitch = 0;
let velForward = 0;
let velStrafe = 0;
let velYaw = 0;
let walkCycle = 0;
let walkBlend = 0;
const smoothCamPos = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 2.2);
const smoothLookAt = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, -2);

const keys = new Set();
let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

// Three.js core
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141118);
scene.fog = new THREE.FogExp2(0x141118, 0.015);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(0, PLAYER_EYE_HEIGHT, 2.2);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

// Procedural Textures
function createFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2b211b";
  ctx.fillRect(0, 0, 512, 512);

  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    const shade = 34 + ((y / plankH) % 3) * 5;
    ctx.fillStyle = `rgb(${shade + 12}, ${shade + 2}, ${shade - 4})`;
    ctx.fillRect(0, y, 512, plankH - 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, y + plankH - 2, 512, 2);
    const jointX = ((y / plankH) * 173) % 512;
    ctx.fillRect(jointX, y, 2, plankH);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWallTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#242029";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.025)";
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWordPlaqueTexture(word) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#17131c";
  ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = "#d9b46c";
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, 502, 102);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f5d89a";
  ctx.font = "600 44px Georgia, serif";
  ctx.fillText(word, 256, 58);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createEndWallTexture(titleText, count) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#1c1824");
  grad.addColorStop(1, "#120f17");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = "rgba(229, 193, 125, 0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, 952, 440);

  ctx.textAlign = "center";
  ctx.fillStyle = "#e5c17d";
  ctx.font = "600 28px Inter, sans-serif";
  ctx.fillText("HAPPY 10 MONTHS", 512, 175);

  ctx.fillStyle = "#f6f1e7";
  ctx.font = "600 62px Georgia, serif";
  ctx.fillText(titleText, 512, 260);

  ctx.fillStyle = "#b7afa4";
  ctx.font = "400 26px Inter, sans-serif";
  ctx.fillText(`${count} curated memories — and counting`, 512, 330);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build 3D Couple (thin 6ft guy + 5ft girl holding hands)
function buildCoupleModel() {
  const root = new THREE.Group();
  root.visible = false;

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a787, roughness: 0.65 });
  const guyShirtMat = new THREE.MeshStandardMaterial({ color: 0x26354d, roughness: 0.72 });
  const guyPantsMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.8 });
  const guyHairMat = new THREE.MeshStandardMaterial({ color: 0x1a1514, roughness: 0.85 });
  const girlDressMat = new THREE.MeshStandardMaterial({ color: 0x8d3b52, roughness: 0.7 });
  const girlHairMat = new THREE.MeshStandardMaterial({ color: 0x241715, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x141216, roughness: 0.6 });

  // --- Guy: thin, 6 ft (1.83m) ---
  const guy = new THREE.Group();
  guy.position.set(-0.26, 0, 0);
  root.add(guy);

  const guyLeftLeg = new THREE.Group();
  guyLeftLeg.position.set(-0.075, 0.92, 0);
  const gLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.88, 12), guyPantsMat);
  gLegL.position.y = -0.44;
  const gShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), shoeMat);
  gShoeL.position.set(0, -0.89, -0.03);
  guyLeftLeg.add(gLegL, gShoeL);
  guy.add(guyLeftLeg);

  const guyRightLeg = new THREE.Group();
  guyRightLeg.position.set(0.075, 0.92, 0);
  const gLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.88, 12), guyPantsMat);
  gLegR.position.y = -0.44;
  const gShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), shoeMat);
  gShoeR.position.set(0, -0.89, -0.03);
  guyRightLeg.add(gLegR, gShoeR);
  guy.add(guyRightLeg);

  const guyUpperBody = new THREE.Group();
  guyUpperBody.position.y = 0.92;
  guy.add(guyUpperBody);

  const guyTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.115, 0.58, 14), guyShirtMat);
  guyTorso.position.y = 0.29;
  guyUpperBody.add(guyTorso);

  const guyHead = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), skinMat);
  guyHead.position.y = 0.74;
  guyUpperBody.add(guyHead);

  const guyHair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), guyHairMat);
  guyHair.position.set(0, 0.76, 0.01);
  guyUpperBody.add(guyHair);

  const guyLeftArm = new THREE.Group();
  guyLeftArm.position.set(-0.17, 0.53, 0);
  const gArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.54, 10), guyShirtMat);
  gArmL.position.y = -0.27;
  const gHandL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), skinMat);
  gHandL.position.y = -0.55;
  guyLeftArm.add(gArmL, gHandL);
  guyUpperBody.add(guyLeftArm);

  const guyRightArm = new THREE.Group();
  guyRightArm.position.set(0.15, 0.52, 0);
  guyRightArm.rotation.z = 0.2;
  const gArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.56, 10), guyShirtMat);
  gArmR.position.y = -0.28;
  guyRightArm.add(gArmR);
  guyUpperBody.add(guyRightArm);

  // --- Girl: 5 ft (1.52m) ---
  const girl = new THREE.Group();
  girl.position.set(0.25, 0, 0);
  root.add(girl);

  const girlLeftLeg = new THREE.Group();
  girlLeftLeg.position.set(-0.065, 0.75, 0);
  const fLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.72, 12), skinMat);
  fLegL.position.y = -0.36;
  const fShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.17), shoeMat);
  fShoeL.position.set(0, -0.72, -0.02);
  girlLeftLeg.add(fLegL, fShoeL);
  girl.add(girlLeftLeg);

  const girlRightLeg = new THREE.Group();
  girlRightLeg.position.set(0.065, 0.75, 0);
  const fLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.72, 12), skinMat);
  fLegR.position.y = -0.36;
  const fShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.17), shoeMat);
  fShoeR.position.set(0, -0.72, -0.02);
  girlRightLeg.add(fLegR, fShoeR);
  girl.add(girlRightLeg);

  const girlUpperBody = new THREE.Group();
  girlUpperBody.position.y = 0.75;
  girl.add(girlUpperBody);

  const girlSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 0.36, 16), girlDressMat);
  girlSkirt.position.y = 0.09;
  girlUpperBody.add(girlSkirt);

  const girlTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.105, 0.34, 14), girlDressMat);
  girlTorso.position.y = 0.38;
  girlUpperBody.add(girlTorso);

  const girlHead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 16), skinMat);
  girlHead.position.y = 0.66;
  girlUpperBody.add(girlHead);

  const girlHairTop = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), girlHairMat);
  girlHairTop.position.set(0, 0.67, 0.01);
  const girlHairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.28, 14), girlHairMat);
  girlHairBack.position.set(0, 0.54, 0.04);
  girlUpperBody.add(girlHairTop, girlHairBack);

  const girlRightArm = new THREE.Group();
  girlRightArm.position.set(0.15, 0.51, 0);
  const fArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.44, 10), skinMat);
  fArmR.position.y = -0.22;
  girlRightArm.add(fArmR);
  girlUpperBody.add(girlRightArm);

  const girlLeftArm = new THREE.Group();
  girlLeftArm.position.set(-0.13, 0.51, 0);
  girlLeftArm.rotation.z = -0.32;
  const fArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.42, 10), skinMat);
  fArmL.position.y = -0.21;
  girlLeftArm.add(fArmL);
  girlUpperBody.add(girlLeftArm);

  // Clasped hands between them
  const claspedHands = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 12), skinMat);
  claspedHands.position.set(0, 0.88, 0);
  root.add(claspedHands);

  scene.add(root);
  return {
    root,
    guyLeftLeg,
    guyRightLeg,
    guyUpperBody,
    guyLeftArm,
    girlLeftLeg,
    girlRightLeg,
    girlUpperBody,
    girlRightArm,
    claspedHands,
  };
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function cellKey(gx, gz) {
  return `${gx},${gz}`;
}

function addExhibitAt(item, index, wallX, wallZ, rotY) {
  const group = new THREE.Group();
  group.position.set(wallX, 2.35, wallZ);
  group.rotation.y = rotY;
  scene.add(group);

  const defaultW = 2.6;
  const defaultH = 1.95;

  const frameOuter = new THREE.Mesh(
    new THREE.BoxGeometry(defaultW + 0.26, defaultH + 0.26, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2f2118, roughness: 0.45, metalness: 0.2 })
  );
  frameOuter.position.z = -0.02;
  group.add(frameOuter);

  const frameGlow = new THREE.Mesh(
    new THREE.BoxGeometry(defaultW + 0.34, defaultH + 0.34, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xe5c17d, transparent: true, opacity: 0.0 })
  );
  frameGlow.position.z = -0.05;
  group.add(frameGlow);

  const artMat = new THREE.MeshBasicMaterial({ color: 0x222028 });
  const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(defaultW, defaultH), artMat);
  artMesh.position.z = 0.04;
  group.add(artMesh);

  const word = item.plaque || item.title || `Memory ${index + 1}`;
  const plaqueMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.33),
    new THREE.MeshBasicMaterial({ map: createWordPlaqueTexture(word) })
  );
  plaqueMesh.position.set(0, -1.4, 0.03);
  group.add(plaqueMesh);

  function applyExactAspectRatio(mediaW, mediaH) {
    const MAX_W = 3.2;
    const MAX_H = 2.4;
    const aspect = mediaW / Math.max(1, mediaH);
    let w = MAX_H * aspect;
    let h = MAX_H;
    if (w > MAX_W) {
      w = MAX_W;
      h = MAX_W / aspect;
    }
    artMesh.scale.set(w / defaultW, h / defaultH, 1);
    frameOuter.scale.set((w + 0.26) / (defaultW + 0.26), (h + 0.26) / (defaultH + 0.26), 1);
    frameGlow.scale.set((w + 0.34) / (defaultW + 0.34), (h + 0.34) / (defaultH + 0.34), 1);
    plaqueMesh.position.y = -h / 2 - 0.36;
  }

  const url = `${MEDIA_BASE}${encodeURIComponent(item.file)}`;
  let videoEl = null;

  if (item.type === "video") {
    videoEl = document.createElement("video");
    videoEl.src = url;
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.crossOrigin = "anonymous";
    videoEl.preload = "metadata";
    videoEl.addEventListener("loadedmetadata", () => {
      applyExactAspectRatio(videoEl.videoWidth, videoEl.videoHeight);
      videoEl.play().catch(() => {});
    });
    const vTex = new THREE.VideoTexture(videoEl);
    vTex.colorSpace = THREE.SRGBColorSpace;
    artMat.color.setHex(0xffffff);
    artMat.map = vTex;
    artMat.needsUpdate = true;
  } else {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        applyExactAspectRatio(tex.image.width, tex.image.height);
        artMat.color.setHex(0xffffff);
        artMat.map = tex;
        artMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );
  }

  const idxLabel = `#${String(index + 1).padStart(2, "0")}`;
  const dateLabel = formatDate(item.date);

  exhibits.push({
    ...item,
    index,
    word,
    idxLabel,
    dateLabel,
    url,
    group,
    frameGlow,
    worldPos: new THREE.Vector3(wallX, PLAYER_EYE_HEIGHT, wallZ),
    videoEl,
  });
}

function addGalleryBench(cx, cz, rotated) {
  const benchGroup = new THREE.Group();
  benchGroup.position.set(cx, 0, cz);
  if (rotated) benchGroup.rotation.y = Math.PI / 2;

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x3b212c, roughness: 0.75 })
  );
  seat.position.y = 0.46;
  benchGroup.add(seat);

  const legMat = new THREE.MeshStandardMaterial({ color: 0xd9b46c, roughness: 0.4, metalness: 0.5 });
  for (const lx of [-0.95, 0.95]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.7), legMat);
    leg.position.set(lx, 0.21, 0);
    benchGroup.add(leg);
  }
  scene.add(benchGroup);

  const halfW = rotated ? 0.55 : 1.35;
  const halfD = rotated ? 1.35 : 0.55;
  benchBoxes.push({
    minX: cx - halfW,
    maxX: cx + halfW,
    minZ: cz - halfD,
    maxZ: cz + halfD,
  });
}

// Build a winding multi-wing serpentine museum
function buildWindingMuseum(items, museumTitle) {
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x261f29, 0.95);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffe7c7, 0.45);
  dirLight.position.set(6, 12, 8);
  scene.add(dirLight);

  // Plan winding path of cells: Entrance (0,0) -> North wings alternating with East/West wings
  const path = [{ gx: 0, gz: 0, dir: "N", kind: "entrance" }];
  let gx = 0;
  let gz = 0;
  let placed = 0;
  let leg = 0;
  const total = Math.max(1, items.length);

  // Each straight corridor cell holds 4 exhibits (2 per side wall).
  // Pattern: 2 cells North -> Corner -> 2 cells East -> Corner -> 2 cells North -> Corner -> 2 cells West -> Corner...
  while (placed < total) {
    const dir = leg % 2 === 0 ? "N" : leg % 4 === 1 ? "E" : "W";
    const steps = 2;
    for (let s = 0; s < steps; s++) {
      if (dir === "N") gz -= 1;
      else if (dir === "E") gx += 1;
      else gx -= 1;
      path.push({ gx, gz, dir, kind: "corridor" });
      placed += 4;
      if (placed >= total && s === steps - 1) break;
    }
    if (placed < total) {
      // Add a corner plaza cell continuing in the same direction to turn cleanly
      if (dir === "N") gz -= 1;
      else if (dir === "E") gx += 1;
      else gx -= 1;
      path.push({ gx, gz, dir, kind: "plaza" });
    }
    leg += 1;
  }

  // Final dedication rotunda cell
  const lastCell = path[path.length - 1];
  const endDir = lastCell.dir;
  if (endDir === "N") gz -= 1;
  else if (endDir === "E") gx += 1;
  else gx -= 1;
  path.push({ gx, gz, dir: endDir, kind: "end" });

  for (const c of path) {
    cellsMap.set(cellKey(c.gx, c.gz), c);
  }

  // Compute bounding box for minimap & particles
  let minGX = Infinity, maxGX = -Infinity, minGZ = Infinity, maxGZ = -Infinity;
  for (const c of path) {
    minGX = Math.min(minGX, c.gx);
    maxGX = Math.max(maxGX, c.gx);
    minGZ = Math.min(minGZ, c.gz);
    maxGZ = Math.max(maxGZ, c.gz);
  }
  gridBounds = {
    minX: (minGX - 0.5) * CELL,
    maxX: (maxGX + 0.5) * CELL,
    minZ: (minGZ - 0.5) * CELL,
    maxZ: (maxGZ + 0.5) * CELL,
  };

  const floorTex = createFloorTexture();
  floorTex.repeat.set(4, 4);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.08 });
  const wallTex = createWallTexture();
  wallTex.repeat.set(3, 1.5);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x16131c, roughness: 0.9 });
  const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x120f15, roughness: 0.6 });
  const runnerMat = new THREE.MeshStandardMaterial({ color: 0x3a1f2b, roughness: 0.88 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9b46c, roughness: 0.4, metalness: 0.55 });

  let itemIdx = 0;

  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    const cx = c.gx * CELL;
    const cz = c.gz * CELL;

    // Floor & ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, WALL_HEIGHT, cz);
    scene.add(ceiling);

    // Overhead warm light in every cell
    const pLight = new THREE.PointLight(0xffdfb0, 9.5, 18, 1.45);
    pLight.position.set(cx, WALL_HEIGHT - 0.55, cz);
    scene.add(pLight);

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16),
      new THREE.MeshBasicMaterial({ color: 0xffebc6 })
    );
    fixture.position.set(cx, WALL_HEIGHT - 0.05, cz);
    scene.add(fixture);

    // Carpet runner along path
    const isEW = c.dir === "E" || c.dir === "W";
    const runner = new THREE.Mesh(
      new THREE.PlaneGeometry(isEW ? CELL : 2.2, isEW ? 2.2 : CELL),
      runnerMat
    );
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(cx, 0.008, cz);
    scene.add(runner);

    // Closed walls where there is no adjacent cell
    const neighbors = [
      { key: cellKey(c.gx, c.gz - 1), wx: cx, wz: cz - CELL / 2, ry: 0, side: "N" },
      { key: cellKey(c.gx, c.gz + 1), wx: cx, wz: cz + CELL / 2, ry: Math.PI, side: "S" },
      { key: cellKey(c.gx - 1, c.gz), wx: cx - CELL / 2, wz: cz, ry: Math.PI / 2, side: "W" },
      { key: cellKey(c.gx + 1, c.gz), wx: cx + CELL / 2, wz: cz, ry: -Math.PI / 2, side: "E" },
    ];

    for (const n of neighbors) {
      if (!cellsMap.has(n.key)) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_HEIGHT), wallMat);
        wall.position.set(n.wx, WALL_HEIGHT / 2, n.wz);
        wall.rotation.y = n.ry;
        scene.add(wall);

        const base = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.24, 0.14), baseboardMat);
        base.position.set(n.wx, 0.12, n.wz);
        base.rotation.y = n.ry;
        scene.add(base);
      }
    }

    // Place exhibits inside corridor cells
    if (c.kind === "corridor" && itemIdx < items.length) {
      const offsets = [-3.0, 3.0];
      for (const off of offsets) {
        if (c.dir === "N") {
          // Left (West) then Right (East)
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx - CELL / 2 + 0.12, cz - off, Math.PI / 2);
            itemIdx++;
          }
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx + CELL / 2 - 0.12, cz - off, -Math.PI / 2);
            itemIdx++;
          }
        } else if (c.dir === "E") {
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx + off, cz - CELL / 2 + 0.12, 0);
            itemIdx++;
          }
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx + off, cz + CELL / 2 - 0.12, Math.PI);
            itemIdx++;
          }
        } else {
          // West
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx - off, cz - CELL / 2 + 0.12, 0);
            itemIdx++;
          }
          if (itemIdx < items.length) {
            addExhibitAt(items[itemIdx], itemIdx, cx - off, cz + CELL / 2 - 0.12, Math.PI);
            itemIdx++;
          }
        }
      }
    } else if (c.kind === "plaza") {
      // Gold diamond floor medallion + gallery bench
      const medallion = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 32), trimMat);
      medallion.rotation.x = -Math.PI / 2;
      medallion.position.set(cx, 0.012, cz);
      scene.add(medallion);
      addGalleryBench(cx, cz, !isEW);
    } else if (c.kind === "end") {
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 3.6),
        new THREE.MeshBasicMaterial({ map: createEndWallTexture(museumTitle, items.length) })
      );
      if (c.dir === "N") {
        banner.position.set(cx, 2.6, cz - CELL / 2 + 0.06);
      } else if (c.dir === "E") {
        banner.position.set(cx + CELL / 2 - 0.06, 2.6, cz);
        banner.rotation.y = -Math.PI / 2;
      } else {
        banner.position.set(cx - CELL / 2 + 0.06, 2.6, cz);
        banner.rotation.y = Math.PI / 2;
      }
      scene.add(banner);
    }
  }
}

// Collision check against grid cells & benches
function canWalkTo(x, z) {
  const gx = Math.round(x / CELL);
  const gz = Math.round(z / CELL);
  if (!cellsMap.has(cellKey(gx, gz))) return false;

  const cx = gx * CELL;
  const cz = gz * CELL;
  const half = CELL / 2;

  // Check closed walls of current cell
  if (!cellsMap.has(cellKey(gx, gz - 1)) && z < cz - half + WALL_MARGIN) return false;
  if (!cellsMap.has(cellKey(gx, gz + 1)) && z > cz + half - WALL_MARGIN) return false;
  if (!cellsMap.has(cellKey(gx - 1, gz)) && x < cx - half + WALL_MARGIN) return false;
  if (!cellsMap.has(cellKey(gx + 1, gz)) && x > cx + half - WALL_MARGIN) return false;

  // Check bench obstacles
  for (const b of benchBoxes) {
    if (x > b.minX - 0.35 && x < b.maxX + 0.35 && z > b.minZ - 0.35 && z < b.maxZ + 0.35) {
      return false;
    }
  }
  return true;
}

function addAtmosphereParticles() {
  const count = 320;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = gridBounds.minX + Math.random() * (gridBounds.maxX - gridBounds.minX);
    positions[i * 3 + 1] = 0.4 + Math.random() * (WALL_HEIGHT - 0.8);
    positions[i * 3 + 2] = gridBounds.minZ + Math.random() * (gridBounds.maxZ - gridBounds.minZ);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf3d79b,
    size: 0.045,
    transparent: true,
    opacity: 0.42,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

// Mini-Map Renderer
function drawMinimap() {
  if (minimapCanvas.classList.contains("hidden")) return;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, w, h);

  const spanX = Math.max(1, gridBounds.maxX - gridBounds.minX);
  const spanZ = Math.max(1, gridBounds.maxZ - gridBounds.minZ);
  const pad = 14;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const offX = (w - spanX * scale) / 2 - gridBounds.minX * scale;
  const offY = (h - spanZ * scale) / 2 - gridBounds.minZ * scale;

  // Draw rooms
  minimapCtx.fillStyle = "rgba(229, 193, 125, 0.14)";
  minimapCtx.strokeStyle = "rgba(229, 193, 125, 0.4)";
  minimapCtx.lineWidth = 1;
  for (const c of cellsMap.values()) {
    const rx = (c.gx * CELL - CELL / 2) * scale + offX;
    const ry = (c.gz * CELL - CELL / 2) * scale + offY;
    const size = CELL * scale;
    minimapCtx.fillRect(rx, ry, size, size);
    minimapCtx.strokeRect(rx, ry, size, size);
  }

  // Draw exhibits
  for (const ex of exhibits) {
    const exX = ex.worldPos.x * scale + offX;
    const exY = ex.worldPos.z * scale + offY;
    minimapCtx.fillStyle = activeExhibit === ex ? "#ffffff" : "#e5c17d";
    minimapCtx.beginPath();
    minimapCtx.arc(exX, exY, activeExhibit === ex ? 3 : 1.7, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Draw player arrow
  const px = playerPos.x * scale + offX;
  const py = playerPos.z * scale + offY;
  minimapCtx.save();
  minimapCtx.translate(px, py);
  minimapCtx.rotate(-yaw);
  minimapCtx.fillStyle = "#f5d89a";
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -6);
  minimapCtx.lineTo(4.5, 4.5);
  minimapCtx.lineTo(-4.5, 4.5);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

// Modal Controls
function openExhibitModal(index) {
  if (index < 0 || index >= exhibits.length) return;
  const ex = exhibits[index];
  currentModalIdx = index;
  modalOpen = true;
  keys.clear();

  modalIndex.textContent = ex.idxLabel;
  modalDate.textContent = ex.dateLabel;
  modalTitle.textContent = ex.word;
  modalCaption.textContent = ex.caption || "";
  modalCaption.classList.toggle("hidden", !ex.caption);

  if (ex.type === "video") {
    modalImage.classList.add("hidden");
    modalVideo.classList.remove("hidden");
    modalVideo.src = ex.url;
    modalVideo.play().catch(() => {});
  } else {
    modalVideo.pause();
    modalVideo.removeAttribute("src");
    modalVideo.classList.add("hidden");
    modalImage.classList.remove("hidden");
    modalImage.src = ex.url;
    modalImage.alt = ex.word;
  }

  modalPrevBtn.disabled = index === 0;
  modalNextBtn.disabled = index === exhibits.length - 1;
  modal.classList.remove("hidden");
}

function closeExhibitModal() {
  modalOpen = false;
  modal.classList.add("hidden");
  modalVideo.pause();
  modalVideo.removeAttribute("src");
}

viewBtn.addEventListener("click", () => {
  if (activeExhibit) openExhibitModal(activeExhibit.index);
});
modalCloseBtn.addEventListener("click", closeExhibitModal);
modal.querySelector(".modal-backdrop").addEventListener("click", closeExhibitModal);
modalPrevBtn.addEventListener("click", () => {
  if (currentModalIdx > 0) openExhibitModal(currentModalIdx - 1);
});
modalNextBtn.addEventListener("click", () => {
  if (currentModalIdx < exhibits.length - 1) openExhibitModal(currentModalIdx + 1);
});

// Keyboard & Pointer Input
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  if (modalOpen) {
    if (e.code === "Escape") closeExhibitModal();
    else if (e.code === "ArrowLeft" && currentModalIdx > 0) openExhibitModal(currentModalIdx - 1);
    else if (e.code === "ArrowRight" && currentModalIdx < exhibits.length - 1) openExhibitModal(currentModalIdx + 1);
    return;
  }
  if (e.code === "KeyV" && introOverlay.classList.contains("hidden")) {
    toggleViewMode();
    return;
  }
  if ((e.code === "KeyE" || e.code === "Enter") && activeExhibit && introOverlay.classList.contains("hidden")) {
    openExhibitModal(activeExhibit.index);
    return;
  }
  keys.add(e.code);
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

renderer.domElement.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
});
window.addEventListener("pointerup", () => {
  isDragging = false;
});
window.addEventListener("pointermove", (e) => {
  if (!isDragging || modalOpen) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  yaw -= dx * 0.0042;
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0032, -0.55, 0.55);
});

for (const btn of document.querySelectorAll(".touch-btn")) {
  const code = btn.dataset.key;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    keys.add(code);
  });
  btn.addEventListener("pointerup", () => keys.delete(code));
  btn.addEventListener("pointerleave", () => keys.delete(code));
}

function toggleViewMode() {
  isThirdPerson = !isThirdPerson;
  viewModeBtn.textContent = isThirdPerson ? "1st Person" : "3rd Person";
  couple.root.visible = isThirdPerson;
}

viewModeBtn.addEventListener("click", toggleViewMode);
helpToggleBtn.addEventListener("click", () => {
  helpPanel.classList.toggle("hidden");
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Proximity Detection
function updateProximity() {
  if (modalOpen || !introOverlay.classList.contains("hidden")) {
    proximityPopup.classList.add("hidden");
    return;
  }

  const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
  let best = null;
  let bestScore = Infinity;

  for (const ex of exhibits) {
    ex.frameGlow.material.opacity = 0;
    const dx = ex.worldPos.x - playerPos.x;
    const dz = ex.worldPos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > PROXIMITY_RADIUS) continue;

    const toEx = new THREE.Vector3(dx, 0, dz).normalize();
    const facing = forward.dot(toEx);
    if (facing < 0.1 && dist > 3.0) continue;

    const score = dist - facing * 1.2;
    if (score < bestScore) {
      bestScore = score;
      best = ex;
    }
  }

  activeExhibit = best;
  if (best) {
    best.frameGlow.material.opacity = 0.34;
    proxIndex.textContent = best.idxLabel;
    proxTitle.textContent = best.word;
    proxDate.textContent = best.dateLabel;
    proximityPopup.classList.remove("hidden");
    timelineCounter.textContent = `${best.index + 1} / ${exhibits.length}`;
    timelineDate.textContent = best.word;
  } else {
    proximityPopup.classList.add("hidden");
  }
}

// Couple & Smooth Main Loop
const couple = buildCoupleModel();
const clock = new THREE.Clock();
let dustPoints = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const active = !modalOpen && introOverlay.classList.contains("hidden");

  const targetTurn = active ? (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0) : 0;
  const targetForward = active
    ? (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0) - (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0)
    : 0;
  const targetStrafe = active ? (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) : 0;

  // Smooth velocity damping
  const damp = 1 - Math.exp(-11 * dt);
  velYaw += (targetTurn * TURN_SPEED - velYaw) * damp;
  velForward += (targetForward * WALK_SPEED - velForward) * damp;
  velStrafe += (targetStrafe * WALK_SPEED - velStrafe) * damp;

  yaw += velYaw * dt;

  const moveLen = Math.hypot(velForward, velStrafe);
  if (moveLen > 0.02) {
    const forwardVec = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const rightVec = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const dx = (forwardVec.x * velForward + rightVec.x * velStrafe) * dt;
    const dz = (forwardVec.z * velForward + rightVec.z * velStrafe) * dt;

    if (canWalkTo(playerPos.x + dx, playerPos.z)) playerPos.x += dx;
    if (canWalkTo(playerPos.x, playerPos.z + dz)) playerPos.z += dz;
  }

  // Smooth walking blend & couple animation
  const speedRatio = THREE.MathUtils.clamp(moveLen / WALK_SPEED, 0, 1);
  walkBlend += (speedRatio - walkBlend) * (1 - Math.exp(-10 * dt));
  walkCycle += dt * (4.5 + 4.5 * speedRatio);

  const swing = Math.sin(walkCycle) * 0.42 * walkBlend;
  const bob = Math.abs(Math.sin(walkCycle)) * 0.028 * walkBlend;
  const sway = Math.cos(walkCycle) * 0.03 * walkBlend;

  couple.root.position.set(playerPos.x, bob, playerPos.z);
  couple.root.rotation.y = yaw;
  couple.guyLeftLeg.rotation.x = swing;
  couple.guyRightLeg.rotation.x = -swing;
  couple.guyLeftArm.rotation.x = -swing * 0.65;
  couple.guyUpperBody.rotation.z = sway;

  couple.girlLeftLeg.rotation.x = -swing;
  couple.girlRightLeg.rotation.x = swing;
  couple.girlRightArm.rotation.x = swing * 0.65;
  couple.girlUpperBody.rotation.z = -sway;

  // Smooth camera follow
  if (isThirdPerson) {
    const camDist = 3.5;
    let targetCamX = playerPos.x + Math.sin(yaw) * camDist;
    let targetCamZ = playerPos.z + Math.cos(yaw) * camDist;
    if (!canWalkTo(targetCamX, targetCamZ)) {
      targetCamX = playerPos.x + Math.sin(yaw) * 1.4;
      targetCamZ = playerPos.z + Math.cos(yaw) * 1.4;
    }
    const targetCamY = THREE.MathUtils.clamp(2.25 - pitch * 1.2, 1.25, WALL_HEIGHT - 0.6);
    const camLerp = 1 - Math.exp(-9 * dt);
    smoothCamPos.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), camLerp);
    smoothLookAt.lerp(
      new THREE.Vector3(playerPos.x - Math.sin(yaw) * 1.3, 1.35 + pitch * 0.8, playerPos.z - Math.cos(yaw) * 1.3),
      camLerp
    );
    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);
  } else {
    const headBob = Math.abs(Math.sin(walkCycle)) * 0.022 * walkBlend;
    camera.position.set(playerPos.x, PLAYER_EYE_HEIGHT + headBob, playerPos.z);
    smoothCamPos.copy(camera.position);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  if (dustPoints) {
    dustPoints.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.012;
  }

  updateProximity();
  drawMinimap();
  renderer.render(scene, camera);
}

// Boot
async function init() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${MANIFEST_URL}`);
    const manifest = await res.json();

    const title = manifest.museumTitle || "Our 10-Month Museum";
    const subtitle = manifest.subtitle || "Walk through our memories in chronological order.";
    introTitle.textContent = title;
    introSubtitle.textContent = subtitle;
    hudTitle.textContent = title;
    document.title = title;

    const items = Array.isArray(manifest.items) ? manifest.items : [];
    buildWindingMuseum(items, title);
    dustPoints = addAtmosphereParticles();

    timelineCounter.textContent = items.length ? `0 / ${items.length}` : "Empty";
    timelineDate.textContent = items.length ? `${items.length} Memories` : "Add media";

    enterBtn.disabled = false;
    enterBtn.textContent = `Enter Museum (${items.length} ${items.length === 1 ? "Memory" : "Memories"})`;
  } catch (err) {
    introSubtitle.textContent = "Could not load media/manifest.json. Make sure to serve this site over HTTP or GitHub Pages.";
    enterBtn.textContent = "Manifest Error";
    console.error(err);
  }
}

enterBtn.addEventListener("click", () => {
  introOverlay.classList.add("hidden");
  hudTop.classList.remove("hidden");
  minimapCanvas.classList.remove("hidden");
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
    touchControls.classList.remove("hidden");
  }
});

init();
animate();
