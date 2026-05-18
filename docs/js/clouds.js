import * as THREE from "three";

function makeNoiseGrid(cells, seed) {
  let state = (seed | 0) >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const n = cells * cells * cells;
  const vals = new Float32Array(n);
  for (let i = 0; i < n; i++) vals[i] = rand();
  return vals;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoiseAt(x, y, z, cells, vals) {
  const fx = x * cells, fy = y * cells, fz = z * cells;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = smooth(fx - ix), ty = smooth(fy - iy), tz = smooth(fz - iz);
  const get = (i, j, k) => {
    const ci = ((i % cells) + cells) % cells;
    const cj = ((j % cells) + cells) % cells;
    const ck = ((k % cells) + cells) % cells;
    return vals[ck * cells * cells + cj * cells + ci];
  };
  const v000 = get(ix, iy, iz);
  const v100 = get(ix + 1, iy, iz);
  const v010 = get(ix, iy + 1, iz);
  const v110 = get(ix + 1, iy + 1, iz);
  const v001 = get(ix, iy, iz + 1);
  const v101 = get(ix + 1, iy, iz + 1);
  const v011 = get(ix, iy + 1, iz + 1);
  const v111 = get(ix + 1, iy + 1, iz + 1);
  return (
    (v000 * (1 - tx) + v100 * tx) * (1 - ty) * (1 - tz) +
    (v010 * (1 - tx) + v110 * tx) * ty       * (1 - tz) +
    (v001 * (1 - tx) + v101 * tx) * (1 - ty) * tz       +
    (v011 * (1 - tx) + v111 * tx) * ty       * tz
  );
}

function buildNoiseVolume(size, freqs, weights, seed) {
  const layers = freqs.map((f, i) => makeNoiseGrid(f, seed + i * 17));
  const data = new Uint8Array(size * size * size);
  let widx = 0;
  let wsum = 0;
  for (const w of weights) wsum += w;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, w = z / size;
        let acc = 0;
        for (let i = 0; i < freqs.length; i++) {
          acc += valueNoiseAt(u, v, w, freqs[i], layers[i]) * weights[i];
        }
        const val = acc / wsum;
        data[widx++] = Math.max(0, Math.min(255, Math.floor(val * 255)));
      }
    }
  }
  return data;
}

function makeNoise3DTexture(data, size) {
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapR = THREE.RepeatWrapping;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const BASE_NOISE_SIZE = 32;
const DETAIL_NOISE_SIZE = 32;

const CLOUD_QUAD_VERT = `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const CLOUD_RAYMARCH_FRAG = `
  precision highp float;
  precision highp sampler3D;

  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D uSceneDepth;
  uniform sampler3D uBaseNoise;
  uniform sampler3D uDetailNoise;
  uniform vec3 uCameraPos;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform mat4 uInvProj;
  uniform mat4 uInvView;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbientColor;
  uniform vec3 uCloudColor;
  uniform float uCloudBaseY;
  uniform float uCloudTopY;
  uniform float uCoverage;
  uniform float uDensityMul;
  uniform float uExtinction;
  uniform float uWindX;
  uniform float uWindZ;
  uniform float uRadiusInner;
  uniform float uRadiusOuter;
  uniform float uCloudAlphaScale;

  const int STEPS = 20;
  const int LIGHT_STEPS = 6;
  const float LIGHT_STEP_LEN = 140.0;
  const float PI = 3.14159265358979;

  const vec3 CONE_OFFSETS[6] = vec3[6](
    vec3( 0.38051305,  0.92453449, -0.02111345),
    vec3(-0.50625799, -0.03590792, -0.86163418),
    vec3(-0.32509218, -0.94557439,  0.01428793),
    vec3( 0.09026238, -0.27376545,  0.95755165),
    vec3( 0.28128598,  0.42443639, -0.86065785),
    vec3(-0.16852403,  0.14748697,  0.97460106)
  );

  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.zyx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float remap(float v, float lo1, float hi1, float lo2, float hi2) {
    return lo2 + (v - lo1) * (hi2 - lo2) / (hi1 - lo1);
  }

  float heightProfile(float h) {
    return pow(4.0 * h * (1.0 - h), 0.7);
  }

  float cloudDensity(vec3 p) {
    float slab = uCloudTopY - uCloudBaseY;
    float h = (p.y - uCloudBaseY) / slab;
    if (h < 0.0 || h > 1.0) return 0.0;

    float r = length(p.xz);
    float radial = 1.0 - smoothstep(uRadiusInner, uRadiusOuter, r);
    if (radial <= 0.001) return 0.0;

    vec3 wind = vec3(uWindX, 0.0, uWindZ) * uTime;
    float baseShape = texture(uBaseNoise, (p + wind) * vec3(0.000075, 0.00025, 0.000075)).r;
    float vert = heightProfile(h);

    float base = baseShape * vert - uCoverage;
    if (base <= 0.0) return 0.0;

    float detail = texture(uDetailNoise, (p + wind * 0.3) * vec3(0.00045, 0.0009, 0.00045)).r;
    return max(0.0, base - detail * 0.13) * uDensityMul * radial * uCloudAlphaScale;
  }

  float cloudShape(vec3 p) {
    float slab = uCloudTopY - uCloudBaseY;
    float h = (p.y - uCloudBaseY) / slab;
    if (h < 0.0 || h > 1.0) return 0.0;

    float r = length(p.xz);
    float radial = 1.0 - smoothstep(uRadiusInner, uRadiusOuter, r);
    if (radial <= 0.001) return 0.0;

    vec3 wind = vec3(uWindX, 0.0, uWindZ) * uTime;
    float baseShape = texture(uBaseNoise, (p + wind) * vec3(0.000075, 0.00025, 0.000075)).r;
    float vert = heightProfile(h);
    return max(0.0, baseShape * vert - uCoverage) * uDensityMul * radial * uCloudAlphaScale;
  }

  vec3 worldPosFromDepth(vec2 uv, float depth) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uInvProj * ndc;
    view /= view.w;
    vec4 world = uInvView * view;
    return world.xyz;
  }

  float hg(float cosT, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
  }

  float sampleLightOpticalDepth(vec3 p) {
    float optical = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      float t = (float(j) + 0.5) * LIGHT_STEP_LEN;
      vec3 dir = normalize(uSunDir + CONE_OFFSETS[j] * 0.18 * float(j + 1));
      vec3 sp = p + dir * t;
      optical += cloudShape(sp) * LIGHT_STEP_LEN;
    }
    return optical;
  }

  void main() {
    float sceneDepth = texture(uSceneDepth, vUv).r;

    vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec4 viewSpace = uInvProj * ndc;
    viewSpace /= viewSpace.w;
    vec3 rayDir = normalize((uInvView * vec4(viewSpace.xyz, 0.0)).xyz);
    vec3 rayOrigin = uCameraPos;

    float sceneDist;
    if (sceneDepth >= 0.99999) {
      sceneDist = 1.0e6;
    } else {
      vec3 wp = worldPosFromDepth(vUv, sceneDepth);
      sceneDist = distance(wp, rayOrigin);
    }

    float tEnter = 0.0;
    float tExit = sceneDist;
    if (abs(rayDir.y) > 0.0001) {
      float t1 = (uCloudBaseY - rayOrigin.y) / rayDir.y;
      float t2 = (uCloudTopY - rayOrigin.y) / rayDir.y;
      tEnter = max(min(t1, t2), 0.0);
      tExit = min(max(t1, t2), sceneDist);
    } else if (rayOrigin.y < uCloudBaseY || rayOrigin.y > uCloudTopY) {
      fragColor = vec4(0.0);
      return;
    }
    if (tEnter >= tExit) {
      fragColor = vec4(0.0);
      return;
    }

    float jitter = hash(vec3(gl_FragCoord.xy, 0.0));
    float stepSize = (tExit - tEnter) / float(STEPS);
    float t = tEnter + jitter * stepSize;

    float cosTheta = dot(rayDir, uSunDir);
    float phase = mix(hg(cosTheta, 0.78), hg(cosTheta, -0.22), 0.4);
    phase = phase * 4.0 + 0.06;

    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);

    for (int i = 0; i < STEPS; i++) {
      if (transmittance < 0.01) break;
      vec3 sp = rayOrigin + rayDir * t;
      float density = cloudDensity(sp);
      if (density > 0.001) {
        float lightOptical = sampleLightOpticalDepth(sp);
        float lightTrans = exp(-lightOptical * uExtinction);

        float beer = lightTrans;
        float powder = 1.0 - exp(-density * stepSize * uExtinction * 2.0);
        float beerPowder = 2.0 * beer * powder;

        vec3 directLight = uSunColor * mix(beer, beerPowder, 0.5) * phase;
        vec3 ambient = uAmbientColor * (0.4 + 0.6 * (sp.y - uCloudBaseY) / (uCloudTopY - uCloudBaseY));
        vec3 inscatter = (directLight + ambient) * uCloudColor;

        float stepTrans = exp(-density * stepSize * uExtinction);
        scattered += transmittance * (1.0 - stepTrans) * inscatter;
        transmittance *= stepTrans;
      }
      t += stepSize;
      if (t >= tExit) break;
    }

    fragColor = vec4(scattered, 1.0 - transmittance);
  }
`;

const CLOUD_COMPOSITE_FRAG = `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D uCloudTex;
  uniform sampler2D uSceneColor;

  vec3 linearToSrgb(vec3 c) {
    vec3 cutoff = step(vec3(0.0031308), c);
    vec3 higher = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    vec3 lower = c * 12.92;
    return mix(lower, higher, cutoff);
  }

  void main() {
    vec4 cloud = texture(uCloudTex, vUv);
    vec4 scene = texture(uSceneColor, vUv);
    vec3 finalColor = cloud.rgb + scene.rgb * (1.0 - cloud.a);
    float finalAlpha = cloud.a + scene.a * (1.0 - cloud.a);
    fragColor = vec4(linearToSrgb(finalColor), finalAlpha);
  }
`;

const CLOUD_RT_SCALE = 0.5;

function makeSceneRenderTarget(width, height) {
  const rt = new THREE.WebGLRenderTarget(width, height);
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
  rt.depthBuffer = true;
  rt.stencilBuffer = false;
  const dt = new THREE.DepthTexture(width, height);
  dt.format = THREE.DepthFormat;
  dt.type = THREE.UnsignedIntType;
  dt.minFilter = THREE.NearestFilter;
  dt.magFilter = THREE.NearestFilter;
  rt.depthTexture = dt;
  return rt;
}

function makeCloudRenderTarget(width, height) {
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
  rt.depthBuffer = false;
  rt.stencilBuffer = false;
  return rt;
}

function setupVolumetricClouds(renderer, camera, sunPosition) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sceneRT = makeSceneRenderTarget(size.x, size.y);
  const cloudW = Math.max(1, Math.floor(size.x * CLOUD_RT_SCALE));
  const cloudH = Math.max(1, Math.floor(size.y * CLOUD_RT_SCALE));
  const cloudRT = makeCloudRenderTarget(cloudW, cloudH);

  const t0 = performance.now();
  const baseData = buildNoiseVolume(BASE_NOISE_SIZE, [2, 4, 8], [0.57, 0.29, 0.14], 12345);
  const detailData = buildNoiseVolume(DETAIL_NOISE_SIZE, [4, 8], [0.67, 0.33], 67890);
  const baseNoiseTex = makeNoise3DTexture(baseData, BASE_NOISE_SIZE);
  const detailNoiseTex = makeNoise3DTexture(detailData, DETAIL_NOISE_SIZE);
  console.log(`[clouds] noise volumes generated in ${(performance.now() - t0).toFixed(0)}ms`);

  const cloudScene = new THREE.Scene();
  const cloudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const sunDir = new THREE.Vector3().copy(sunPosition).normalize();
  const cloudMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uSceneDepth: { value: sceneRT.depthTexture },
      uBaseNoise: { value: baseNoiseTex },
      uDetailNoise: { value: detailNoiseTex },
      uCameraPos: { value: new THREE.Vector3() },
      uCameraNear: { value: camera.near },
      uCameraFar: { value: camera.far },
      uInvProj: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uSunDir: { value: sunDir },
      uSunColor: { value: new THREE.Color(0xfff2dd) },
      uAmbientColor: { value: new THREE.Color(0x5d6e82) },
      uCloudColor: { value: new THREE.Color(0xf2f4f7) },
      uCloudBaseY: { value: 6300 },
      uCloudTopY: { value: 8000 },
      uCoverage: { value: 0.40 },
      uDensityMul: { value: 3.4 },
      uExtinction: { value: 0.022 },
      uWindX: { value: 0.0 },
      uWindZ: { value: 0.0 },
      uRadiusInner: { value: 4500 },
      uRadiusOuter: { value: 8500 },
      uCloudAlphaScale: { value: 1.0 },
    },
    vertexShader: CLOUD_QUAD_VERT,
    fragmentShader: CLOUD_RAYMARCH_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });

  const cloudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cloudMaterial);
  cloudQuad.frustumCulled = false;
  cloudScene.add(cloudQuad);

  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uCloudTex: { value: cloudRT.texture },
      uSceneColor: { value: sceneRT.texture },
    },
    vertexShader: CLOUD_QUAD_VERT,
    fragmentShader: CLOUD_COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
  const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
  compositeQuad.frustumCulled = false;
  compositeScene.add(compositeQuad);

  function resize(width, height) {
    sceneRT.setSize(width, height);
    sceneRT.depthTexture.image.width = width;
    sceneRT.depthTexture.image.height = height;
    sceneRT.depthTexture.needsUpdate = true;
    cloudRT.setSize(
      Math.max(1, Math.floor(width * CLOUD_RT_SCALE)),
      Math.max(1, Math.floor(height * CLOUD_RT_SCALE)),
    );
  }

  return { sceneRT, cloudRT, cloudScene, cloudCamera, cloudMaterial, compositeScene, compositeCamera, resize };
}

window.Clouds = { setupVolumetricClouds };
