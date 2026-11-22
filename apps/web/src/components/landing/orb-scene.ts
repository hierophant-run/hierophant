import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

export type OrbScene = {
  setProgress: (progress: number) => void;
  setActive: (active: boolean) => void;
  resize: () => void;
  dispose: () => void;
};

const ATLAS_GRID = 8;
const GLYPHS = "{}[]()<>/\\=+*;:$#&|!?%~_.,0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

const particleVertex = /* glsl */ `
  attribute vec3 aStar;
  attribute vec2 aSeed;
  attribute float aRisk;
  uniform float uTime, uBurst, uRadius, uPixelRatio, uScanY, uScanPower, uGlyphSize;
  uniform vec2 uCenter, uView;
  varying float vGlyph, vLight, vScan, vRisk, vStar;

  void main() {
    float angle = uTime * 0.07;
    float c = cos(angle);
    float s = sin(angle);
    vec3 orb = vec3(position.x * c + position.z * s, position.y, -position.x * s + position.z * c);

    float delay = aSeed.x * 0.45;
    float burst = smoothstep(delay, delay + 0.55, uBurst);
    vec2 drift = vec2(sin(uTime * 0.12 + aSeed.x * 30.0), cos(uTime * 0.1 + aSeed.x * 17.0)) * 0.012;
    vec2 xy = mix(uCenter + orb.xy * uRadius, aStar.xy * uView + drift, burst);
    gl_Position = vec4(xy / uView, 0.0, 1.0);

    float front = orb.z * 0.5 + 0.5;
    float rim = pow(1.0 - abs(orb.z), 2.2);
    vScan = smoothstep(0.13, 0.0, abs(orb.y - uScanY)) * uScanPower * (1.0 - burst);
    vRisk = aRisk * (1.0 - burst);
    vStar = burst;
    vGlyph = aSeed.y;
    vLight = mix((0.12 + front * 0.36 + rim * 0.95) * mix(0.34, 1.0, front), 0.28 + aStar.z * 0.5, burst);

    float glyph = uGlyphSize * (0.72 + front * 0.56) * (1.0 + vScan * 0.55);
    gl_PointSize = mix(glyph, 1.3 + aStar.z * 1.7, burst) * uPixelRatio;
  }
`;

const particleFragment = /* glsl */ `
  precision mediump float;
  uniform sampler2D uAtlas;
  uniform float uFade, uRiskReveal;
  varying float vGlyph, vLight, vScan, vRisk, vStar;

  void main() {
    float grid = ${ATLAS_GRID}.0;
    vec2 cell = vec2(mod(vGlyph, grid), floor(vGlyph / grid));
    float glyph = texture2D(uAtlas, (gl_PointCoord + cell) / grid).a;
    float dot = smoothstep(0.5, 0.18, length(gl_PointCoord - 0.5));
    float shape = mix(glyph, dot, smoothstep(0.55, 0.95, vStar));
    if (shape < 0.02) discard;

    vec3 color = mix(vec3(0.5, 0.78, 0.71), vec3(0.96, 0.85, 0.55), vScan);
    float risk = vRisk * max(uRiskReveal, vScan);
    color = mix(color, vec3(1.0, 0.42, 0.24), risk);
    float light = vLight + vScan * 0.9 + risk * 0.8;
    gl_FragColor = vec4(color, shape * clamp(light, 0.0, 1.0) * uFade);
  }
`;

const curtainVertex = /* glsl */ `
  attribute float aSide;
  attribute float aKind;
  attribute float aSeed;
  uniform float uTime, uRadius, uPixelRatio, uOpen, uDotSize;
  uniform vec2 uCenter, uView;
  varying float vKind, vTwinkle;

  void main() {
    vec2 point = position.xy;
    point.x += aSide * uOpen * (0.16 + 0.34 * (0.5 - point.y * 0.5));
    gl_Position = vec4((uCenter + point * uRadius) / uView, 0.0, 1.0);
    vKind = aKind;
    vTwinkle = 0.72 + 0.28 * sin(uTime * 1.6 + aSeed * 40.0);
    gl_PointSize = (aKind > 0.5 ? uDotSize : 1.5 + aSeed * 0.9) * uPixelRatio;
  }
`;

const curtainFragment = /* glsl */ `
  precision mediump float;
  uniform float uFade;
  varying float vKind, vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (vKind > 0.5) {
      float core = smoothstep(0.13, 0.095, d);
      float halo = pow(max(0.0, 1.0 - d * 2.0), 3.0) * 0.5;
      vec3 color = mix(vec3(0.96, 0.78, 0.42), vec3(1.0, 0.96, 0.84), core);
      gl_FragColor = vec4(color, (core + halo) * uFade);
      return;
    }
    float alpha = smoothstep(0.5, 0.12, d) * vTwinkle * 0.92;
    gl_FragColor = vec4(0.95, 0.94, 0.88, alpha * uFade);
  }
`;

function smoothRange(value: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function createAtlas(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");

  const cell = size / ATLAS_GRID;
  context.fillStyle = "#fff";
  context.font = `600 ${Math.floor(cell * 0.78)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let i = 0; i < ATLAS_GRID * ATLAS_GRID; i++) {
    const glyph = GLYPHS[i % GLYPHS.length]!;
    const x = (i % ATLAS_GRID) * cell + cell / 2;
    const y = Math.floor(i / ATLAS_GRID) * cell + cell / 2;
    context.fillText(glyph, x, y);
  }

  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

function createParticleGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const stars = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  const risks = new Float32Array(count);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const shell = 0.985 + Math.random() * 0.03;
    positions[i * 3] = Math.cos(theta) * ring * shell;
    positions[i * 3 + 1] = y * shell;
    positions[i * 3 + 2] = Math.sin(theta) * ring * shell;

    stars[i * 3] = Math.random() * 2 - 1;
    stars[i * 3 + 1] = Math.random() * 2 - 1;
    stars[i * 3 + 2] = Math.random() ** 2;

    seeds[i * 2] = Math.random();
    seeds[i * 2 + 1] = Math.floor(Math.random() * ATLAS_GRID * ATLAS_GRID);
    risks[i] = Math.random() < 0.014 ? 1 : 0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aStar", new BufferAttribute(stars, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 2));
  geometry.setAttribute("aRisk", new BufferAttribute(risks, 1));
  return geometry;
}

type Point = readonly [number, number];

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}

/** Samples the two logo blades. They stop well inside the sphere, away from its rim. */
function createCurtainGeometry(count: number): BufferGeometry {
  const total = count + 1;
  const positions = new Float32Array(total * 3);
  const sides = new Float32Array(total);
  const kinds = new Float32Array(total);
  const seeds = new Float32Array(total);
  const scale = 0.66 / 48;

  for (let i = 0; i < count; i++) {
    const t = Math.random() ** 0.82;
    const outer = cubic([43.4, 13], [41.5, 42], [26, 68], [4.6, 79.5], t);
    const inner = cubic([44.8, 13], [46, 58], [31, 84], [5, 81], t);
    const blend = Math.random();
    const side = i % 2 === 0 ? -1 : 1;
    const x = outer[0] + (inner[0] - outer[0]) * blend;
    const y = outer[1] + (inner[1] - outer[1]) * blend;

    positions[i * 3] = side === -1 ? (x - 48) * scale : (48 - x) * scale;
    positions[i * 3 + 1] = (48 - y) * scale;
    sides[i] = side;
    seeds[i] = Math.random();
  }

  positions[count * 3 + 1] = (48 - 59) * scale;
  kinds[count] = 1;
  seeds[count] = 0.5;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSide", new BufferAttribute(sides, 1));
  geometry.setAttribute("aKind", new BufferAttribute(kinds, 1));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  return geometry;
}

export async function createOrbScene(canvas: HTMLCanvasElement): Promise<OrbScene> {
  const isCompact = window.innerWidth < 1024;
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, isCompact ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const atlas = createAtlas();

  const shared = {
    uTime: { value: 0 },
    uRadius: { value: 0.7 },
    uPixelRatio: { value: pixelRatio },
    uCenter: { value: new Vector2() },
    uView: { value: new Vector2(1, 1) },
  };

  const particleMaterial = new ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      ...shared,
      uAtlas: { value: atlas },
      uBurst: { value: 0 },
      uScanY: { value: 1 },
      uScanPower: { value: 0.65 },
      uRiskReveal: { value: 0 },
      uFade: { value: 1 },
      uGlyphSize: { value: isCompact ? 5.6 : 7.2 },
    },
  });
  const curtainMaterial = new ShaderMaterial({
    vertexShader: curtainVertex,
    fragmentShader: curtainFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      ...shared,
      uOpen: { value: 0 },
      uFade: { value: 1 },
      uDotSize: { value: 60 },
    },
  });

  const particleGeometry = createParticleGeometry(isCompact ? 2600 : 8200);
  const curtainGeometry = createCurtainGeometry(isCompact ? 1100 : 2600);
  const particles = new Points(particleGeometry, particleMaterial);
  const curtain = new Points(curtainGeometry, curtainMaterial);
  particles.frustumCulled = false;
  curtain.frustumCulled = false;
  scene.add(particles, curtain);

  const home = new Vector2();
  let homeRadius = 0.7;
  let aspect = 1;
  let target = 0;
  let current = 0;
  let active = true;
  let frame = 0;
  let last = performance.now();
  let elapsed = 0;

  const applyProgress = (value: number) => {
    const u = particleMaterial.uniforms;
    const c = curtainMaterial.uniforms;
    const toCenter = smoothRange(value, 0.2, 0.42);
    const burst = smoothRange(value, 0.36, 0.76);
    const sweep = smoothRange(value, 0.03, 0.32);

    shared.uCenter.value.set(home.x * (1 - toCenter), home.y * (1 - toCenter));
    const grown = Math.min(aspect, 1) * 0.86;
    shared.uRadius.value = homeRadius + (Math.max(homeRadius, grown) - homeRadius) * toCenter;
    u.uBurst!.value = burst;
    u.uRiskReveal!.value = smoothRange(value, 0.12, 0.3);
    u.uFade!.value = 1 - smoothRange(value, 0.86, 1) * 0.55;
    c.uOpen!.value = smoothRange(value, 0.16, 0.36);
    c.uFade!.value = 1 - smoothRange(value, 0.34, 0.52);
    c.uDotSize!.value = (renderer.domElement.clientHeight || 800) * homeRadius * 0.19;

    if (value > 0.02) {
      u.uScanY!.value = 1.15 - sweep * 2.3;
      u.uScanPower!.value = 1 - smoothRange(value, 0.3, 0.38);
    } else {
      u.uScanY!.value = Math.cos(elapsed * 0.42) * 1.05;
      u.uScanPower!.value = 0.65;
    }
  };

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    aspect = width / height;
    shared.uView.value.set(aspect, 1);

    const isDesktop = width >= 1024;
    const radiusPx = isDesktop
      ? Math.min(height * 0.72, width * 0.42) / 2
      : Math.min(width * 0.8, height * 0.46) / 2;
    const centerX = isDesktop ? width * 0.74 : width / 2;
    const centerY = isDesktop ? height / 2 : 72 + radiusPx;
    home.set((centerX / width) * 2 * aspect - aspect, 1 - (centerY / height) * 2);
    homeRadius = radiusPx / (height / 2);
    applyProgress(current);
  };

  const render = (now: number) => {
    frame = 0;
    if (!active) return;
    elapsed += Math.min(0.05, (now - last) / 1000);
    last = now;
    current += (target - current) * 0.14;
    if (Math.abs(target - current) < 0.0005) current = target;
    shared.uTime.value = elapsed;
    applyProgress(current);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const start = () => {
    if (frame || !active || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(render);
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const onVisibility = () => (document.hidden ? stop() : start());

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", resize);
  resize();
  // Compiling in the background keeps the page responsive while shaders are prepared.
  await Promise.race([
    renderer.compileAsync(scene, camera),
    new Promise((done) => window.setTimeout(done, 3000)),
  ]);
  renderer.render(scene, camera);
  start();

  return {
    setProgress(progress) {
      target = progress;
    },
    setActive(next) {
      active = next;
      if (next) start();
      else stop();
    },
    resize,
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      particleGeometry.dispose();
      curtainGeometry.dispose();
      particleMaterial.dispose();
      curtainMaterial.dispose();
      atlas.dispose();
      renderer.dispose();
    },
  };
}
