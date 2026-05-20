// used by viz-routes

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const HEIGHTMAP_URL = "figure/everest.png";
const ROUTES_3D_URL = "data/routes_3d.json";
const SRC_WIDTH_PX = 590;
const SRC_HEIGHT_PX = 457;
// square crop keeps the summit in frame
const WIDTH_PX = 457;
const HEIGHT_PX = 457;
const ELEV_MIN = 4987;
const ELEV_MAX = 8737;
const GROUND_W = 15000;
const GROUND_H = 15000;
const SUBDIVISION = 2;
const BORDER_TAPER_PIXELS = 55;

const SNOW_BAND_LOW = 5500;
const SNOW_BAND_HIGH = 6000;
const SLOPE_THRESHOLD_DEG = 52;
const ROCK_COLOR = new THREE.Color(0x56605e);
const SNOW_COLOR = new THREE.Color(0xdce4e0);

const Y_OFFSET = 60;
const SAMPLE_SPACING = 22;
const PROXIMITY_THRESHOLD = 80;
const MIN_RUN_LENGTH = 150;
const INTER_LINE_SPACING = 25;
const TRANSITION_LENGTH = 50;
const SUMMIT_CONVERGE_DIST = 500;
const LINE_WIDTH = 3;
const HOVER_LINE_WIDTH = 6.5;
const DIM_OPACITY = 0.22;
// single climbing dot, activated by selecting a route (prototype)
const DOT_CLIMB_SPEED = 0.15;       // path-lengths per second, base -> summit
const DOT_SIZE = 24.0;              // CSS px at the reference distance
const DOT_SIZE_REF_DIST = 15000;
const RAYCAST_THRESHOLD_PX = 6;
const CLICK_DRAG_PX = 4;
const HOVER_THROTTLE_MS = 33;
const DASH_SIZE = 50;
const GAP_SIZE = 30;
const MALLORY_LABEL = "1924 British (Mallory and Irvine)";
const ROUTE_DEFAULT_SATURATION = 0.52;
const ROUTE_DEFAULT_LIGHTNESS_SCALE = 0.72;
const ROUTE_DEFAULT_LIGHTNESS_OFFSET = 0.04;
const ROUTE_ACTIVE_SATURATION = 0.78;
const ROUTE_ACTIVE_LIGHTNESS_SCALE = 0.88;
const ROUTE_ACTIVE_LIGHTNESS_OFFSET = 0.08;

const SOUTH_BC = { x: -6020, z: -2950, label: "South Base Camp" };
const NORTH_BC = { x:  3120, z: -5350, label: "North Base Camp" };
const LABEL_LIFT = 80;
const CAMERA_START_POLAR_ANGLE = THREE.MathUtils.degToRad(78);
const CAMERA_START_XZ_OFFSET = new THREE.Vector2(-12500, -14000);
const CAMERA_START_OFFSET = new THREE.Vector3(
  CAMERA_START_XZ_OFFSET.x,
  CAMERA_START_XZ_OFFSET.length() / Math.tan(CAMERA_START_POLAR_ANGLE),
  CAMERA_START_XZ_OFFSET.y,
);
const CAMERA_MIN_DISTANCE = 11500;
const CAMERA_MAX_DISTANCE = 24500;
// upng keeps the heightmap at 16-bit precision
async function loadElevations() {
  const buf = await fetch(HEIGHTMAP_URL).then((r) => r.arrayBuffer());
  const img = UPNG.decode(buf);
  if (img.width !== SRC_WIDTH_PX || img.height !== SRC_HEIGHT_PX) {
    throw new Error(`Unexpected PNG size ${img.width}x${img.height}`);
  }
  if (img.depth !== 16 || img.ctype !== 0) {
    throw new Error(
      `Expected 16-bit greyscale (depth=16, ctype=0), got depth=${img.depth}, ctype=${img.ctype}`
    );
  }
  const raw = new Uint8Array(img.data);
  const elev = new Float32Array(WIDTH_PX * HEIGHT_PX);
  const scale = (ELEV_MAX - ELEV_MIN) / 65535;
  for (let r = 0; r < HEIGHT_PX; r++) {
    for (let c = 0; c < WIDTH_PX; c++) {
      const srcIdx = r * SRC_WIDTH_PX + c;
      const v = (raw[2 * srcIdx] << 8) | raw[2 * srcIdx + 1];
      elev[r * WIDTH_PX + c] = v * scale + ELEV_MIN;
    }
  }
  return elev;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function routeDisplayColor(colorHex, active = false) {
  const color = new THREE.Color(colorHex);
  const hsl = {};
  color.getHSL(hsl);

  if (hsl.l < 0.05) {
    return new THREE.Color(active ? 0x2d281f : 0x4a4132);
  }

  const saturation = active ? ROUTE_ACTIVE_SATURATION : ROUTE_DEFAULT_SATURATION;
  const lightnessScale = active ? ROUTE_ACTIVE_LIGHTNESS_SCALE : ROUTE_DEFAULT_LIGHTNESS_SCALE;
  const lightnessOffset = active ? ROUTE_ACTIVE_LIGHTNESS_OFFSET : ROUTE_DEFAULT_LIGHTNESS_OFFSET;
  const maxLightness = active ? 0.66 : 0.58;

  return new THREE.Color().setHSL(
    hsl.h,
    clamp(hsl.s * saturation, 0.18, active ? 0.86 : 0.64),
    clamp(hsl.l * lightnessScale + lightnessOffset, 0.32, maxLightness),
  );
}

// black/near-black routes (e.g. 1984 Australian) map to a near-invisible dot,
// so show those as a white dot; every other route keeps its own bright colour
function dotColor(colorHex, activeColor) {
  const hsl = {};
  new THREE.Color(colorHex).getHSL(hsl);
  return hsl.l < 0.05 ? new THREE.Color(0xffffff) : activeColor.clone();
}

function paintByElevationAndSlope(geom) {
  const pos = geom.attributes.position;
  const nrm = geom.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // soften the rock and snow edge
  const slopeLow = (SLOPE_THRESHOLD_DEG - 6) * Math.PI / 180;
  const slopeHigh = (SLOPE_THRESHOLD_DEG + 6) * Math.PI / 180;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = Math.min(Math.max(nrm.getY(i), -1), 1);
    const slopeRad = Math.acos(ny);
    const elevMix = smoothstep(SNOW_BAND_LOW, SNOW_BAND_HIGH, y);
    const slopeKeep = 1 - smoothstep(slopeLow, slopeHigh, slopeRad);
    const snow = elevMix * slopeKeep;
    c.copy(ROCK_COLOR).lerp(SNOW_COLOR, snow);
    colors[3 * i]     = c.r;
    colors[3 * i + 1] = c.g;
    colors[3 * i + 2] = c.b;
  }
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function buildTerrain(elev) {
  const wSeg = (WIDTH_PX - 1) * SUBDIVISION;
  const hSeg = (HEIGHT_PX - 1) * SUBDIVISION;
  const meshW = wSeg + 1;
  const meshH = hSeg + 1;
  const geom = new THREE.PlaneGeometry(GROUND_W, GROUND_H, wSeg, hSeg);
  const pos = geom.attributes.position;
  for (let r = 0; r < meshH; r++) {
    const v = r / SUBDIVISION;
    const v0 = Math.min(Math.floor(v), HEIGHT_PX - 2);
    const fv = v - v0;
    for (let c = 0; c < meshW; c++) {
      const u = c / SUBDIVISION;
      const u0 = Math.min(Math.floor(u), WIDTH_PX - 2);
      const fu = u - u0;
      const row0 = v0 * WIDTH_PX;
      const row1 = (v0 + 1) * WIDTH_PX;
      const e00 = elev[row0 + u0];
      const e10 = elev[row0 + u0 + 1];
      const e01 = elev[row1 + u0];
      const e11 = elev[row1 + u0 + 1];
      const e = (e00 * (1 - fu) + e10 * fu) * (1 - fv)
              + (e01 * (1 - fu) + e11 * fu) * fv;
      const distEdge = Math.min(u, WIDTH_PX - 1 - u, v, HEIGHT_PX - 1 - v);
      const taper = smoothstep(0, BORDER_TAPER_PIXELS, distEdge);
      pos.setZ(r * meshW + c, ELEV_MIN + (e - ELEV_MIN) * taper);
    }
  }
  // keep the mesh transform clean
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  paintByElevationAndSlope(geom);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1.0,
    metalness: 0.0,
  });
  return new THREE.Mesh(geom, mat);
}

// use the same height sampling as the mesh
function sampleHeight(elev, x, z) {
  const u = ((x + GROUND_W / 2) / GROUND_W) * (WIDTH_PX - 1);
  const v = ((z + GROUND_H / 2) / GROUND_H) * (HEIGHT_PX - 1);
  const uClamped = Math.max(0, Math.min(WIDTH_PX - 1.0001, u));
  const vClamped = Math.max(0, Math.min(HEIGHT_PX - 1.0001, v));
  const u0 = Math.floor(uClamped);
  const v0 = Math.floor(vClamped);
  const fu = uClamped - u0;
  const fv = vClamped - v0;
  const e00 = elev[v0 * WIDTH_PX + u0];
  const e10 = elev[v0 * WIDTH_PX + u0 + 1];
  const e01 = elev[(v0 + 1) * WIDTH_PX + u0];
  const e11 = elev[(v0 + 1) * WIDTH_PX + u0 + 1];
  return (e00 * (1 - fu) + e10 * fu) * (1 - fv)
       + (e01 * (1 - fu) + e11 * fu) * fv;
}

function findHighestTerrainPoint(elev) {
  let bestIdx = 0;
  let bestElev = -Infinity;
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] > bestElev) {
      bestElev = elev[i];
      bestIdx = i;
    }
  }
  const row = Math.floor(bestIdx / WIDTH_PX);
  const col = bestIdx % WIDTH_PX;
  const x = (col / (WIDTH_PX - 1)) * GROUND_W - GROUND_W / 2;
  const z = (row / (HEIGHT_PX - 1)) * GROUND_H - GROUND_H / 2;
  return new THREE.Vector3(x, bestElev, z);
}

// smooth the route in xz and drape it on terrain
function densifyAndDrape(rawPts, elev) {
  if (rawPts.length === 0) return [];
  if (rawPts.length === 1) {
    const [x, , z] = rawPts[0];
    return [new THREE.Vector3(x, sampleHeight(elev, x, z), z)];
  }
  const ctrl = rawPts.map(([x, , z]) => new THREE.Vector3(x, 0, z));
  const curve = ctrl.length === 2
    ? new THREE.LineCurve3(ctrl[0], ctrl[1])
    : new THREE.CatmullRomCurve3(ctrl, false, "centripetal", 0.5);
  const length = curve.getLength();
  const n = Math.max(2, Math.round(length / SAMPLE_SPACING));
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    out[i] = new THREE.Vector3(p.x, sampleHeight(elev, p.x, p.z), p.z);
  }
  return out;
}

function arcLengthsXZ(points) {
  const n = points.length;
  const arc = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].z - points[i - 1].z,
    );
  }
  return arc;
}

function computeTangentsXZ(points) {
  const n = points.length;
  const tangents = new Array(n);
  for (let i = 0; i < n; i++) {
    let dx, dz;
    if (n === 1) { dx = 1; dz = 0; }
    else if (i === 0) { dx = points[1].x - points[0].x; dz = points[1].z - points[0].z; }
    else if (i === n - 1) { dx = points[i].x - points[i - 1].x; dz = points[i].z - points[i - 1].z; }
    else { dx = points[i + 1].x - points[i - 1].x; dz = points[i + 1].z - points[i - 1].z; }
    const len = Math.hypot(dx, dz) || 1;
    tangents[i] = { x: dx / len, z: dz / len };
  }
  return tangents;
}

// group nearby routes at each sample
function computeBundleMembership(densified, yearByLabel) {
  const labels = Object.keys(densified);
  const thresh2 = PROXIMITY_THRESHOLD * PROXIMITY_THRESHOLD;
  const membership = {};
  for (const labelR of labels) {
    const ptsR = densified[labelR];
    const memR = new Array(ptsR.length);
    for (let i = 0; i < ptsR.length; i++) {
      const px = ptsR[i].x;
      const pz = ptsR[i].z;
      const near = [labelR];
      for (const labelS of labels) {
        if (labelS === labelR) continue;
        const ptsS = densified[labelS];
        for (let j = 0; j < ptsS.length; j++) {
          const dx = ptsS[j].x - px;
          const dz = ptsS[j].z - pz;
          if (dx * dx + dz * dz <= thresh2) { near.push(labelS); break; }
        }
      }
      near.sort((a, b) => {
        const ya = yearByLabel[a], yb = yearByLabel[b];
        if (ya !== yb) return ya - yb;
        return a < b ? -1 : 1;
      });
      memR[i] = near;
    }
    membership[labelR] = memR;
  }
  return membership;
}

function computeRawOffsets(densified, membership) {
  const offsets = {};
  for (const label of Object.keys(densified)) {
    const mem = membership[label];
    const n = mem.length;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const bundle = mem[i];
      const k = bundle.length;
      if (k < 2) { raw[i] = 0; continue; }
      const idx = bundle.indexOf(label);
      const slot = idx - (k - 1) / 2;
      raw[i] = slot * INTER_LINE_SPACING;
    }
    offsets[label] = raw;
  }
  return offsets;
}

function filterShortRuns(densified, offsets) {
  for (const label of Object.keys(densified)) {
    const pts = densified[label];
    const off = offsets[label];
    const arc = arcLengthsXZ(pts);
    const n = pts.length;
    let i = 0;
    while (i < n) {
      if (off[i] === 0) { i++; continue; }
      let j = i;
      while (j < n && off[j] !== 0) j++;
      if (arc[j - 1] - arc[i] < MIN_RUN_LENGTH) {
        for (let k = i; k < j; k++) off[k] = 0;
      }
      i = j;
    }
  }
}

function smoothOffsets(densified, offsets) {
  const smoothed = {};
  for (const label of Object.keys(densified)) {
    const pts = densified[label];
    const off = offsets[label];
    const arc = arcLengthsXZ(pts);
    const n = pts.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let wsum = 0, vsum = 0;
      for (let j = i; j < n; j++) {
        const d = arc[j] - arc[i];
        if (d > TRANSITION_LENGTH) break;
        const w = 1 - d / TRANSITION_LENGTH;
        wsum += w; vsum += w * off[j];
      }
      for (let j = i - 1; j >= 0; j--) {
        const d = arc[i] - arc[j];
        if (d > TRANSITION_LENGTH) break;
        const w = 1 - d / TRANSITION_LENGTH;
        wsum += w; vsum += w * off[j];
      }
      out[i] = wsum > 0 ? vsum / wsum : 0;
    }
    smoothed[label] = out;
  }
  return smoothed;
}

function applyOffsetsAndDrape(densified, offsets, membership, elev) {
  const tangents = {};
  for (const label of Object.keys(densified)) {
    tangents[label] = computeTangentsXZ(densified[label]);
  }
  const final = {};
  for (const label of Object.keys(densified)) {
    const pts = densified[label];
    const off = offsets[label];
    const mem = membership[label];
    const ownTan = tangents[label];
    const n = pts.length;
    const arc = arcLengthsXZ(pts);

    const cx = new Float32Array(n);
    const cz = new Float32Array(n);
    const tx = new Float32Array(n);
    const tz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sx = pts[i].x, sz = pts[i].z;
      let stx = ownTan[i].x, stz = ownTan[i].z;
      let count = 1;
      for (const m of mem[i]) {
        if (m === label) continue;
        const mPts = densified[m];
        const mTan = tangents[m];
        let bestJ = 0, bestD2 = Infinity;
        for (let j = 0; j < mPts.length; j++) {
          const dx = mPts[j].x - pts[i].x;
          const dz = mPts[j].z - pts[i].z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; bestJ = j; }
        }
        sx += mPts[bestJ].x; sz += mPts[bestJ].z;
        stx += mTan[bestJ].x; stz += mTan[bestJ].z;
        count++;
      }
      cx[i] = sx / count;
      cz[i] = sz / count;
      const tl = Math.hypot(stx, stz) || 1;
      tx[i] = stx / tl;
      tz[i] = stz / tl;
    }

    const cxs = new Float32Array(n);
    const czs = new Float32Array(n);
    const txs = new Float32Array(n);
    const tzs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let wsum = 0, vx = 0, vz = 0, vtx = 0, vtz = 0;
      for (let j = i; j < n; j++) {
        const d = arc[j] - arc[i];
        if (d > TRANSITION_LENGTH) break;
        const w = 1 - d / TRANSITION_LENGTH;
        wsum += w; vx += w * cx[j]; vz += w * cz[j];
        vtx += w * tx[j]; vtz += w * tz[j];
      }
      for (let j = i - 1; j >= 0; j--) {
        const d = arc[i] - arc[j];
        if (d > TRANSITION_LENGTH) break;
        const w = 1 - d / TRANSITION_LENGTH;
        wsum += w; vx += w * cx[j]; vz += w * cz[j];
        vtx += w * tx[j]; vtz += w * tz[j];
      }
      cxs[i] = wsum > 0 ? vx / wsum : cx[i];
      czs[i] = wsum > 0 ? vz / wsum : cz[i];
      const tl = Math.hypot(vtx, vtz) || 1;
      txs[i] = vtx / tl;
      tzs[i] = vtz / tl;
    }

    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const perpX = -tzs[i];
      const perpZ = txs[i];
      const x = cxs[i] + off[i] * perpX;
      const z = czs[i] + off[i] * perpZ;
      out[i] = new THREE.Vector3(x, sampleHeight(elev, x, z) + Y_OFFSET, z);
    }
    final[label] = out;
  }
  return final;
}

function convergeAtSummit(final, summit, elev) {
  for (const label of Object.keys(final)) {
    const pts = final[label];
    const n = pts.length;
    if (n === 0) continue;
    const arcFromEnd = new Float32Array(n);
    for (let i = n - 2; i >= 0; i--) {
      arcFromEnd[i] = arcFromEnd[i + 1] + Math.hypot(
        pts[i + 1].x - pts[i].x,
        pts[i + 1].z - pts[i].z,
      );
    }
    for (let i = 0; i < n; i++) {
      if (arcFromEnd[i] >= SUMMIT_CONVERGE_DIST) continue;
      const ease = 1 - smoothstep(0, 1, arcFromEnd[i] / SUMMIT_CONVERGE_DIST);
      const x = pts[i].x * (1 - ease) + summit.x * ease;
      const z = pts[i].z * (1 - ease) + summit.z * ease;
      pts[i].x = x;
      pts[i].z = z;
      pts[i].y = sampleHeight(elev, x, z) + Y_OFFSET;
    }
  }
}

function buildLineMesh(points, color, dashed) {
  if (points.length < 2) return null;
  const positions = new Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    positions[3 * i]     = points[i].x;
    positions[3 * i + 1] = points[i].y;
    positions[3 * i + 2] = points[i].z;
  }
  const geom = new LineGeometry();
  geom.setPositions(positions);
  const mat = new LineMaterial({
    color: new THREE.Color(color),
    linewidth: LINE_WIDTH,
    worldUnits: false,
    transparent: true,
    opacity: 1.0,
    dashed: !!dashed,
    dashSize: DASH_SIZE,
    gapSize: GAP_SIZE,
    depthTest: true,
    depthWrite: false,
  });
  mat.resolution.set(1, 1);
  const line = new Line2(geom, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

// cumulative 3D arc length so particles move at an even speed along a route
function buildArcTable(points) {
  const n = points.length;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + points[i].distanceTo(points[i - 1]);
  }
  return { cum, total: n ? cum[n - 1] : 0 };
}

const DOT_VERT = `
attribute float aT;
attribute float aSize;
uniform float uSize;
uniform float uPixelRatio;
uniform float uRefDist;
varying float vT;
void main() {
  vT = aT;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * aSize * uPixelRatio * (uRefDist / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const DOT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vT;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float core = 1.0 - smoothstep(0.15, 0.5, r);                                // solid bright centre, soft edge
  float ends = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.94, 1.0, vT)); // dissolve at the very ends of each climb
  // dim hues (blue, red, purple) read as dull in an additive blend, so give
  // them a white-hot centre; bright hues (green, cyan, gold) are left as-is
  float lum = dot(uColor, vec3(0.2126, 0.7152, 0.0722));
  float boost = 1.0 - smoothstep(0.30, 0.65, lum);
  float hot = (1.0 - smoothstep(0.0, 0.32, r)) * boost;
  vec3 col = mix(uColor, vec3(1.0), hot * 0.9);
  gl_FragColor = vec4(col, core * ends * uOpacity);
}
`;

function makeDotMaterial(color, pixelRatio) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1.0 },
      uSize: { value: DOT_SIZE },
      uPixelRatio: { value: pixelRatio },
      uRefDist: { value: DOT_SIZE_REF_DIST },
    },
    vertexShader: DOT_VERT,
    fragmentShader: DOT_FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

async function create(container, { routes }) {
  const [elev, routes3D] = await Promise.all([
    loadElevations(),
    fetch(ROUTES_3D_URL).then((r) => r.json()),
  ]);

  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x2d424e, 23000, 52000);

  let width = Math.max(1, container.clientWidth);
  let height = Math.max(1, container.clientHeight);
  const summitTarget = findHighestTerrainPoint(elev);

  // after terrain rotation x is east and z is north
  const camera = new THREE.PerspectiveCamera(32, width / height, 1, 100000);
  camera.position.copy(summitTarget).add(CAMERA_START_OFFSET);
  camera.lookAt(summitTarget);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.setSize(width, height);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.width = "100%";
  labelRenderer.domElement.style.height = "100%";
  labelRenderer.domElement.style.zIndex = "3";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  const sun = new THREE.DirectionalLight(0xf3efe7, 2.45);
  sun.position.set(16000, 5500, 8000);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xd8e6ec, 0x17202a, 0.88));

  const terrain = buildTerrain(elev);
  scene.add(terrain);

  const volClouds = window.Clouds.setupVolumetricClouds(renderer, camera, sun.position);

  // routes live in a separate scene so they overlay on top of the cloud composite
  const routesGroup = new THREE.Group();
  const routesScene = new THREE.Scene();
  routesScene.add(routesGroup);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line2 = { threshold: RAYCAST_THRESHOLD_PX };

  const controls = new OrbitControls(camera, container);
  controls.target.copy(summitTarget);
  controls.enableDamping = true;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.maxPolarAngle = CAMERA_START_POLAR_ANGLE;
  controls.minDistance = CAMERA_MIN_DISTANCE;
  controls.maxDistance = CAMERA_MAX_DISTANCE;
  controls.update();

  const yearByLabel = Object.fromEntries(routes.map((r) => [r.label, r.year]));
  const defaultColorByLabel = Object.fromEntries(
    routes.map((r) => [r.label, routeDisplayColor(r.color_hex, false)]),
  );
  const activeColorByLabel = Object.fromEntries(
    routes.map((r) => [r.label, routeDisplayColor(r.color_hex, true)]),
  );
  const dotColorByLabel = Object.fromEntries(
    routes.map((r) => [r.label, dotColor(r.color_hex, activeColorByLabel[r.label])]),
  );
  const routeByLabel = Object.fromEntries(routes.map((r) => [r.label, r]));

  // bundle mallory as one path
  const densified = {};
  const malloryBreak = {};
  for (const r of routes) {
    const raw = routes3D[r.label];
    if (!raw) continue;
    if (r.label === MALLORY_LABEL) {
      const solidPts = densifyAndDrape(raw.solid || [], elev);
      const dashedPts = densifyAndDrape(raw.dashed || [], elev);
      densified[r.label] = solidPts.concat(dashedPts);
      malloryBreak[r.label] = solidPts.length;
    } else {
      densified[r.label] = densifyAndDrape(raw, elev);
    }
  }

  const membership = computeBundleMembership(densified, yearByLabel);
  const rawOffsets = computeRawOffsets(densified, membership);
  filterShortRuns(densified, rawOffsets);
  const smoothed = smoothOffsets(densified, rawOffsets);
  const final = applyOffsetsAndDrape(densified, smoothed, membership, elev);

  // make all routes end at the summit
  let sx = 0, sz = 0, cnt = 0;
  for (const r of routes) {
    const raw = routes3D[r.label];
    if (!raw) continue;
    let last = null;
    if (r.label === MALLORY_LABEL) {
      const d = raw.dashed || [];
      const s = raw.solid || [];
      last = d.length ? d[d.length - 1] : (s.length ? s[s.length - 1] : null);
    } else if (Array.isArray(raw) && raw.length) {
      last = raw[raw.length - 1];
    }
    if (last) { sx += last[0]; sz += last[2]; cnt++; }
  }
  if (cnt > 0) convergeAtSummit(final, { x: sx / cnt, z: sz / cnt }, elev);

  // year controls route paint order
  const meshesByLabel = {};
  const sortedByYear = [...routes].sort((a, b) => a.year - b.year);
  const orderByLabel = Object.fromEntries(sortedByYear.map((r, i) => [r.label, i]));
  for (const r of routes) {
    const pts = final[r.label];
    if (!pts || pts.length === 0) continue;
    const meshes = [];
    const routeRef = { label: r.label, route: routeByLabel[r.label] };
    const order = orderByLabel[r.label];
    if (r.label === MALLORY_LABEL) {
      const cut = malloryBreak[r.label];
      const solidPts = pts.slice(0, cut);
      const dashedPts = pts.slice(Math.max(0, cut - 1));
      const solidMesh = buildLineMesh(solidPts, defaultColorByLabel[r.label], false);
      const dashedMesh = buildLineMesh(dashedPts, defaultColorByLabel[r.label], true);
      for (const m of [solidMesh, dashedMesh]) {
        if (!m) continue;
        m.userData = { routeRef };
        m.renderOrder = order;
        routesGroup.add(m);
        meshes.push(m);
      }
    } else {
      const mesh = buildLineMesh(pts, defaultColorByLabel[r.label], false);
      if (!mesh) continue;
      mesh.userData = { routeRef };
      mesh.renderOrder = order;
      routesGroup.add(mesh);
      meshes.push(mesh);
    }
    if (meshes.length) meshesByLabel[r.label] = meshes;
  }

  // a single dot that climbs the selected route, base -> summit (prototype)
  const arcByLabel = {};
  for (const r of routes) {
    const pts = final[r.label];
    if (!pts || pts.length < 2) continue;
    const { cum, total } = buildArcTable(pts);
    if (total > 0) arcByLabel[r.label] = { pts, cum, total };
  }

  const dotPos = new Float32Array(3);
  const dotAT = new Float32Array(1);
  const dotGeom = new THREE.BufferGeometry();
  dotGeom.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeom.setAttribute("aT", new THREE.BufferAttribute(dotAT, 1));
  dotGeom.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array([1]), 1));
  const dotMat = makeDotMaterial(0xffffff, renderer.getPixelRatio());
  const dot = new THREE.Points(dotGeom, dotMat);
  dot.renderOrder = 2000;
  dot.frustumCulled = false;   // its position moves every frame; the bounding sphere is stale
  dot.visible = false;         // hidden until a route is selected
  routesGroup.add(dot);

  let dotStartMs = 0;          // when the current climb began (reset on each new selection)

  function updateDot() {
    const arc = selectedLabel ? arcByLabel[selectedLabel] : null;
    if (!arc) { if (dot.visible) dot.visible = false; return; }
    const { pts, cum, total } = arc;
    const n = pts.length;
    let t = ((performance.now() - dotStartMs) * 0.001) * DOT_CLIMB_SPEED;
    t -= Math.floor(t);        // loop the climb while the route stays selected
    const s = t * total;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const f = (s - cum[lo]) / seg;
    const a = pts[lo], b = pts[hi];
    dotPos[0] = a.x + (b.x - a.x) * f;
    dotPos[1] = a.y + (b.y - a.y) * f;
    dotPos[2] = a.z + (b.z - a.z) * f;
    dotAT[0] = t;
    dotGeom.attributes.position.needsUpdate = true;
    dotGeom.attributes.aT.needsUpdate = true;
    if (!dot.visible) dot.visible = true;
  }

  for (const bc of [SOUTH_BC, NORTH_BC]) {
    const y = sampleHeight(elev, bc.x, bc.z) + LABEL_LIFT;
    const wrap = document.createElement("div");
    wrap.className = "basecamp-marker";
    const dot = document.createElement("div");
    dot.className = "basecamp-dot";
    const text = document.createElement("div");
    text.className = "basecamp-text";
    text.textContent = bc.label;
    wrap.appendChild(dot);
    wrap.appendChild(text);
    const obj = new CSS2DObject(wrap);
    obj.position.set(bc.x, y, bc.z);
    scene.add(obj);
  }

  let selectedLabel = null;
  let hoveredLabel = null;
  let cloudVisibility = 1;
  let cloudVisibilityTarget = 1;

  const HOME_CAMERA_POS = summitTarget.clone().add(CAMERA_START_OFFSET);
  const HOME_TARGET = summitTarget.clone();
  const RESET_DURATION_MS = 700;
  let resetAnim = null;

  function applyHighlights() {
    const any = selectedLabel !== null || hoveredLabel !== null;
    cloudVisibilityTarget = any ? 0 : 1;
    for (const [label, meshes] of Object.entries(meshesByLabel)) {
      const emphasized = label === selectedLabel || label === hoveredLabel;
      const lw = emphasized ? HOVER_LINE_WIDTH : LINE_WIDTH;
      const op = emphasized ? 1.0 : (any ? DIM_OPACITY : 0.72);
      const color = emphasized ? activeColorByLabel[label] : defaultColorByLabel[label];
      for (const m of meshes) {
        m.material.linewidth = lw;
        m.material.opacity = op;
        m.material.color.copy(color);
      }
    }
  }

  function setHover(label) {
    if (label === hoveredLabel) return;
    hoveredLabel = label;
    applyHighlights();
  }

  function setSelected(label) {
    if (label === selectedLabel) return;
    selectedLabel = label;
    if (label && arcByLabel[label]) {
      dotStartMs = performance.now();                       // start the climb from the base
      dotMat.uniforms.uColor.value.copy(dotColorByLabel[label]);
    }
    applyHighlights();
  }

  function pickRoute(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(routesGroup.children, false);
    return hits.length ? hits[0].object.userData.routeRef || null : null;
  }

  const canvas = renderer.domElement;
  let down = null;
  container.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, button: e.button };
  });
  container.addEventListener("pointerup", (e) => {
    const pd = down; down = null;
    if (!pd || pd.button !== 0) return;
    if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > CLICK_DRAG_PX) return;
    const ref = pickRoute(e.clientX, e.clientY);
    if (ref) {
      setSelected(ref.label);
      container.dispatchEvent(new CustomEvent("route-selected", {
        detail: { label: ref.label, route: ref.route },
        bubbles: true,
      }));
    } else {
      setSelected(null);
      container.dispatchEvent(new CustomEvent("route-deselected", { bubbles: true }));
    }
  });

  let lastMoveAt = 0;
  container.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const now = performance.now();
    if (now - lastMoveAt < HOVER_THROTTLE_MS) return;
    lastMoveAt = now;
    const ref = pickRoute(e.clientX, e.clientY);
    setHover(ref ? ref.label : null);
  });
  container.addEventListener("pointerleave", () => setHover(null));

  // rotate the dial so n points north
  const compass = document.createElement("div");
  compass.className = "ev3-compass";
  compass.innerHTML = '<div class="ev3-compass-arrow"></div><div class="ev3-compass-n">N</div>';
  compass.style.cursor = "pointer";
  compass.addEventListener("pointerdown", (e) => e.stopPropagation());
  compass.addEventListener("click", (e) => {
    e.stopPropagation();
    if (camera.position.distanceTo(HOME_CAMERA_POS) < 1 &&
        controls.target.distanceTo(HOME_TARGET) < 1) return;
    resetAnim = {
      start: performance.now(),
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
    };
  });
  container.appendChild(compass);

  const hint = document.createElement("div");
  hint.className = "ev3-hint";
  hint.innerHTML = "<span>Drag to rotate.</span><span>Click routes to explore.</span><span>Click compass to recenter.</span>";
  container.appendChild(hint);
  let hintDismissed = false;
  function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    hint.classList.add("ev3-hint-hidden");
  }
  container.addEventListener("pointerdown", dismissHint, { once: true });

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w; height = h;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    volClouds.resize(buf.x, buf.y);
    for (const meshes of Object.values(meshesByLabel)) {
      for (const m of meshes) m.material.resolution.set(w, h);
    }
  }
  resize();

  // sticky layout can resize without a window event
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  let running = false;
  let rafId = null;
  function tick() {
    if (resetAnim) {
      const t = Math.min(1, (performance.now() - resetAnim.start) / RESET_DURATION_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(resetAnim.fromPos, HOME_CAMERA_POS, e);
      controls.target.lerpVectors(resetAnim.fromTarget, HOME_TARGET, e);
      if (t >= 1) resetAnim = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    compass.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;

    const u = volClouds.cloudMaterial.uniforms;
    u.uTime.value = performance.now() * 0.001;
    u.uCameraPos.value.copy(camera.position);
    u.uCameraNear.value = camera.near;
    u.uCameraFar.value = camera.far;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uInvView.value.copy(camera.matrixWorld);
    cloudVisibility += (cloudVisibilityTarget - cloudVisibility) * 0.12;
    u.uCloudAlphaScale.value = cloudVisibility;

    updateDot();

    renderer.setRenderTarget(volClouds.sceneRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(volClouds.cloudRT);
    renderer.render(volClouds.cloudScene, volClouds.cloudCamera);
    renderer.setRenderTarget(null);
    renderer.render(volClouds.compositeScene, volClouds.compositeCamera);

    // routes drawn on top of the cloud composite so clouds don't mute them
    renderer.autoClear = false;
    renderer.render(routesScene, camera);
    renderer.autoClear = true;

    labelRenderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function dispose() {
    stop();
    ro.disconnect();
    dotGeom.dispose();
    dotMat.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (labelRenderer.domElement.parentNode) {
      labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    }
    renderer.dispose();
  }

  return { canvas, setSelected, resize, start, stop, dispose };
}

window.Everest3D = { create };
