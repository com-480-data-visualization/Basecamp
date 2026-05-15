import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const EVEREST_GLB_SRC = "figure/mount-everest-esri-imagery-overlay/source/800054a8-0006-fc00-b63f-84710c7967bb.glb";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOBILE_QUERY = "(max-width: 700px)";

const pixelSize = 4;
const maskStagger = 0.50;

const postVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const postFragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float pixelSize;
uniform float maskStagger;
uniform float cellGap;
uniform float brightness;
uniform float contrast;
uniform float glowStrength;

varying vec2 vUv;

float ledLuma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 normalizedPixelSize = vec2(pixelSize) / resolution;
  vec2 coord = vUv / normalizedPixelSize;
  float columnStagger = mod(floor(coord.x), 2.0) * maskStagger;

  vec2 offsetUv = vUv;
  offsetUv.y += columnStagger * normalizedPixelSize.y;

  vec2 cell = floor(offsetUv / normalizedPixelSize);
  vec2 sampleUv = clamp((cell + 0.5) * normalizedPixelSize, vec2(0.0), vec2(1.0));
  vec3 color = texture2D(tDiffuse, sampleUv).rgb;
  float luma = ledLuma(color);

  vec3 cold = mix(vec3(0.015, 0.026, 0.024), vec3(0.78, 0.9, 0.94), luma);
  color = mix(cold, color, 0.42);
  color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0) * brightness;

  vec2 cellUv = fract(offsetUv / normalizedPixelSize) * 2.0 - 1.0;
  float radiusX = max(0.42, 1.0 - cellGap);
  float radiusY = max(0.38, 0.86 - cellGap * 0.5);
  float superEllipse = pow(abs(cellUv.x) / radiusX, 4.0) + pow(abs(cellUv.y) / radiusY, 4.0);
  float mask = 1.0 - smoothstep(0.76, 1.0, superEllipse);

  vec3 darkCell = vec3(0.01, 0.016, 0.014);
  vec3 lowGlow = color * glowStrength * (0.16 + luma * 0.42);
  vec3 litCell = color * mask;

  gl_FragColor = vec4(darkCell + lowGlow + litCell, 1.0);
}
`;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeModel(model, targetWidth) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = targetWidth / Math.max(size.x, size.z);
  const normalized = new THREE.Group();

  model.position.sub(center);
  model.position.y -= size.y * 0.12;
  normalized.scale.setScalar(scale);
  normalized.add(model);

  return normalized;
}

function findHighestPoint(root) {
  root.updateMatrixWorld(true);

  const point = new THREE.Vector3();
  const highest = new THREE.Vector3();
  let highestY = -Infinity;

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;

    const position = obj.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);
      if (point.y > highestY) {
        highestY = point.y;
        highest.copy(point);
      }
    }
  });

  return Number.isFinite(highestY) ? highest : new THREE.Vector3();
}

function prepareModel(model, renderer) {
  model.traverse((obj) => {
    if (!obj.isMesh) return;

    obj.frustumCulled = false;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((material) => {
      if (!material) return;
      material.side = THREE.DoubleSide;
      material.transparent = false;
      material.opacity = 1;
      material.metalness = 0;
      material.roughness = 0.92;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      material.needsUpdate = true;
    });
  });
}

function initHeroLed() {
  const container = document.getElementById("hero-led-canvas");
  const hero = document.getElementById("hero-led");
  if (!container || !hero) return;

  const source = container.dataset.modelSrc || EVEREST_GLB_SRC;
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const mobile = window.matchMedia(MOBILE_QUERY);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    container.classList.add("is-fallback");
    return;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x101311, 0);
  renderer.domElement.className = "hero-led-webgl";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101311);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.55;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.36;
  controls.addEventListener("change", requestRender);

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  scene.add(new THREE.HemisphereLight(0xd8e6ec, 0x101311, 1.8));

  const keyLight = new THREE.DirectionalLight(0xf3efe7, 2.4);
  keyLight.position.set(-4, 5, -3);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8fb9c4, 1.1);
  rimLight.position.set(4, 2.5, 5);
  scene.add(rimLight);

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace;

  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postCamera.position.z = 1;

  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: renderTarget.texture },
      resolution: { value: new THREE.Vector2(1, 1) },
      pixelSize: { value: pixelSize },
      maskStagger: { value: maskStagger },
      cellGap: { value: 0.08 },
      brightness: { value: 1.16 },
      contrast: { value: 1.24 },
      glowStrength: { value: 0.18 },
    },
    vertexShader: postVertexShader,
    fragmentShader: postFragmentShader,
    depthWrite: false,
    depthTest: false,
  });

  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

  let scrollProgress = 0;
  let frameRequested = false;
  let loaded = false;
  const orbitTargetLocal = new THREE.Vector3();
  const orbitTargetWorld = new THREE.Vector3();

  function updateScrollProgress() {
    if (reducedMotion.matches) {
      scrollProgress = 0;
      return;
    }
    scrollProgress = clamp(
      (window.scrollY - hero.offsetTop) / Math.max(1, hero.offsetHeight * 0.82),
      0,
      1,
    );
  }

  function render() {
    frameRequested = false;
    if (!loaded) return;

    applyModelTransform();
    syncOrbitTarget();
    controls.update();

    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  function applyModelTransform() {
    const yRange = mobile.matches ? 0.055 : 0.105;
    const xRange = mobile.matches ? 0.014 : 0.028;
    modelGroup.rotation.y = -0.18 + scrollProgress * yRange;
    modelGroup.rotation.x = -0.08 + scrollProgress * xRange;
    modelGroup.position.set(mobile.matches ? 0.1 : 1.15, mobile.matches ? -0.42 : -0.24, 0);
    modelGroup.scale.setScalar((mobile.matches ? 0.96 : 1.28) + scrollProgress * 0.018);
  }

  function syncOrbitTarget() {
    modelGroup.updateMatrixWorld(true);
    orbitTargetWorld.copy(orbitTargetLocal).applyMatrix4(modelGroup.matrixWorld);
    controls.target.copy(orbitTargetWorld);
  }

  function requestRender() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(render);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.15 : 1.35);
    const targetWidth = Math.max(1, Math.floor(width * pixelRatio));
    const targetHeight = Math.max(1, Math.floor(height * pixelRatio));

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderTarget.setSize(targetWidth, targetHeight);

    camera.aspect = width / height;
    applyModelTransform();
    syncOrbitTarget();
    camera.position.copy(orbitTargetWorld).add(new THREE.Vector3(
      mobile.matches ? -7.4 : -8.8,
      mobile.matches ? 4.15 : 5.45,
      mobile.matches ? -7.4 : -8.8,
    ));
    controls.update();
    camera.updateProjectionMatrix();

    postMaterial.uniforms.resolution.value.set(targetWidth, targetHeight);
    postMaterial.uniforms.pixelSize.value = mobile.matches ? pixelSize + 4 : pixelSize;
    postMaterial.uniforms.maskStagger.value = maskStagger;
    postMaterial.uniforms.cellGap.value = mobile.matches ? 0.11 : 0.07;
    postMaterial.uniforms.glowStrength.value = mobile.matches ? 0.14 : 0.18;

    updateScrollProgress();
    requestRender();
  }

  new GLTFLoader().load(
    source,
    (gltf) => {
      const model = normalizeModel(gltf.scene, mobile.matches ? 8.6 : 11.8);
      orbitTargetLocal.copy(findHighestPoint(model));
      prepareModel(model, renderer);
      modelGroup.add(model);
      container.classList.add("is-ready");
      loaded = true;
      resize();
    },
    undefined,
    (err) => {
      console.error("Failed to initialize GLB Everest hero:", err);
      container.classList.add("is-fallback");
    },
  );

  window.addEventListener("scroll", () => {
    updateScrollProgress();
    requestRender();
  }, { passive: true });
  window.addEventListener("resize", resize);
  reducedMotion.addEventListener("change", () => {
    updateScrollProgress();
    requestRender();
  });
  mobile.addEventListener("change", resize);

  container.addEventListener("pointerdown", () => {
    if (!loaded) return;
    container.classList.add("is-drag-hint-hidden");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeroLed);
} else {
  initHeroLed();
}
