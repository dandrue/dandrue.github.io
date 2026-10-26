// Shared viewer for the plumbing models rebuilt from a Navisworks export.
// Geometry is pre-simplified and quantised (build/model/); every vertex carries the
// time at which it appears, so pipes grow along the network in install order.
// Progressive enhancement: the host's poster image stays until the first WebGL frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SERVICES } from './services.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

// layer name -> what it is drawn as
const LAYERS = {
  san_bg: { svc: 'san', kind: 'pipe' },
  san_ag: { svc: 'san', kind: 'pipe' },
  vent: { svc: 'vent', kind: 'pipe' },
  sd: { svc: 'sd', kind: 'pipe' },
  cw: { svc: 'cw', kind: 'pipe' },
  hw: { svc: 'hw', kind: 'pipe' },
  ins_cw: { svc: 'cw', kind: 'insulation' },
  ins_hw: { svc: 'hw', kind: 'insulation' },
  fix: { svc: null, kind: 'fixture' },
};
// toggle buttons -> layers they control
const GROUPS = {
  san: ['san_bg', 'san_ag'],
  vent: ['vent'],
  sd: ['sd'],
  cw: ['cw', 'ins_cw'],
  hw: ['hw', 'ins_hw'],
  fix: ['fix'],
};

export async function mountModel(host, opts = {}) {
  const base = opts.src || host.dataset.src;
  const [head, bin] = await Promise.all([
    fetch(base + '.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(base + '.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]);

  const css = getComputedStyle(document.documentElement);
  const svcColor = (id) => (css.getPropertyValue('--' + id).trim() || SERVICES[id].color);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const stage = document.createElement('div');
  stage.className = 'model3d';
  stage.setAttribute('aria-hidden', 'true');
  host.appendChild(stage);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab8c2, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-40, 80, 50);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(50, 20, -40);
  scene.add(fill);

  // ---- shared reveal shader: discard fragments whose reveal time is still ahead
  const uTime = { value: 0 };
  const reveal = (rim) => (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aReveal;\nvarying float vReveal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReveal = aReveal * 0.01;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vReveal;')
      .replace('void main() {', 'void main() {\nif (vReveal > uTime) discard;');
    if (rim) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - abs(dot(normalize(geometryNormal), geometryViewDir));
        outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.45);
        diffuseColor.a *= mix(0.8, 2.2, rim * rim);
        #include <opaque_fragment>`);
    }
  };

  const material = (spec) => {
    let m;
    if (spec.kind === 'insulation') {
      m = new THREE.MeshStandardMaterial({ color: svcColor(spec.svc), roughness: 0.6, metalness: 0,
        transparent: true, opacity: 0.2, depthWrite: false });
      m.onBeforeCompile = reveal(true);
      m.customProgramCacheKey = () => 'reveal-rim';
    } else if (spec.kind === 'fixture') {
      m = new THREE.MeshStandardMaterial({ color: '#EEF1F3', roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
      m.onBeforeCompile = reveal(false);
      m.customProgramCacheKey = () => 'reveal';
    } else {
      m = new THREE.MeshStandardMaterial({ color: svcColor(spec.svc), roughness: 0.4, metalness: 0.12, side: THREE.DoubleSide });
      m.onBeforeCompile = reveal(false);
      m.customProgramCacheKey = () => 'reveal';
    }
    return m;
  };

  const root = new THREE.Group();
  scene.add(root);
  const meshes = {};
  for (const L of head.layers) {
    const spec = LAYERS[L.name];
    if (!spec) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Uint16Array(bin, L.position, L.vertices * 3), 3));
    const nb = new THREE.InterleavedBuffer(new Int8Array(bin, L.normal, L.vertices * 4), 4);
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(nb, 3, 0, true));
    g.setAttribute('aReveal', new THREE.BufferAttribute(new Uint16Array(bin, L.reveal, L.vertices), 1));
    const n = L.triangles * 3;
    g.setIndex(new THREE.BufferAttribute(L.indexType === 'u16' ? new Uint16Array(bin, L.index, n) : new Uint32Array(bin, L.index, n), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(32768, 32768, 32768), 60000);
    const mesh = new THREE.Mesh(g, material(spec));
    mesh.position.fromArray(head.offset);
    mesh.scale.fromArray(head.scale);
    mesh.renderOrder = spec.kind === 'insulation' ? 2 : 0;
    root.add(mesh);
    meshes[L.name] = mesh;
  }

  // ---- level 1 slab and a faint grid at the bottom of the trench
  const [lo, hi] = head.bbox;
  const pad = 1.5;
  const sx = hi[0] - lo[0] + pad * 2, sz = hi[2] - lo[2] + pad * 2;
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  const slabT = 0.33;
  const slabGeo = new THREE.BoxGeometry(sx, slabT, sz);
  const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({
    color: '#DCE3E7', roughness: 0.95, transparent: true, opacity: 0.55, depthWrite: false }));
  slab.position.set(cx, -slabT / 2, cz);
  slab.renderOrder = 1;
  root.add(slab);
  const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), new THREE.LineBasicMaterial({ color: '#9AA9B2' }));
  slabEdges.position.copy(slab.position);
  root.add(slabEdges);
  const grid = new THREE.GridHelper(Math.max(sx, sz), Math.round(Math.max(sx, sz) / 4), 0xD3DCE1, 0xE6ECEF);
  grid.position.set(cx, lo[1] - 0.6, cz);
  root.add(grid);

  // ---- camera: orthographic, fitted to the model from an isometric direction
  const target = new THREE.Vector3(cx, (lo[1] + hi[1]) / 2 - 1, cz);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
  // wide frames look across the long side of the core; tall (phone) frames look along it
  const qdir = new URLSearchParams(location.search).get(opts.dirParam || 'model-dir');
  const tall = (stage.clientWidth || 800) / (stage.clientHeight || 500) < 1.1;
  const dirs = opts.dir || { wide: [-1, 0.85, 0.42], tall: [-0.42, 0.95, 1] };
  const dir = qdir ? new THREE.Vector3(...qdir.split(',').map(Number))
    : new THREE.Vector3(...(tall ? dirs.tall : dirs.wide));
  camera.position.copy(target).add(dir.normalize().multiplyScalar(150));
  camera.lookAt(target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = !coarse && opts.pan !== false;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45;
  controls.enableRotate = !coarse;
  controls.autoRotateSpeed = opts.autoRotateSpeed || 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  if (coarse) renderer.domElement.style.touchAction = 'pan-y';
  controls.update();
  controls.saveState();

  // zoom: buttons, or Ctrl/Cmd + scroll (and trackpad pinch), so plain scrolling still scrolls the page
  const zoomBy = (f) => {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * f, 1, 10);
    camera.updateProjectionMatrix();
    controls.autoRotate = false; controls._userMoved = true;
  };
  if (opts.zoom !== false) renderer.domElement.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0025));
  }, { passive: false });

  const corners = [];
  for (const x of [lo[0] - pad, hi[0] + pad]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2] - pad, hi[2] + pad]) corners.push(new THREE.Vector3(x, y, z));
  const tmp = new THREE.Vector3();
  let fitHalf = 10;
  function fit() {
    // fit the model's bounding box for the starting view; keep that scale while it turns
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
      minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
    }
    const w = stage.clientWidth || 800, h = stage.clientHeight || 500;
    const aspect = w / h;
    fitHalf = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect) * (opts.fit || 1.02);
  }
  function resize() {
    const w = stage.clientWidth || 800, h = stage.clientHeight || 500;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    fit();
    const aspect = w / h;
    camera.left = -fitHalf * aspect; camera.right = fitHalf * aspect;
    camera.top = fitHalf; camera.bottom = -fitHalf;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- toggles and replay
  const bar = opts.bar || null;
  const hint = opts.hint || null;
  if (bar) {
    bar.hidden = false;
    for (const btn of bar.querySelectorAll('[data-group]')) {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        for (const name of GROUPS[btn.dataset.group] || []) if (meshes[name]) meshes[name].visible = on;
      });
    }
    const replay = bar.querySelector('[data-replay]');
    if (replay) replay.addEventListener('click', () => { t0 = null; done = false; });
    const zin = bar.querySelector('[data-zoom="in"]'), zout = bar.querySelector('[data-zoom="out"]');
    if (zin) zin.addEventListener('click', () => zoomBy(1.4));
    if (zout) zout.addEventListener('click', () => zoomBy(1 / 1.4));
    const reset = bar.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => { controls.reset(); controls._userMoved = false; });
  }

  // ---- loop
  const duration = head.duration + 0.4;
  // ?model-t=4.5 freezes the timeline (used to render the poster image and previews)
  const ft = new URLSearchParams(location.search).get(opts.timeParam || 'model-t');
  const forcedT = ft === null ? null : Number(ft);
  let t0 = null, done = false, visible = true, shown = false;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(stage);
  renderer.setAnimationLoop((ms) => {
    if (!visible || document.hidden) return;
    if (t0 === null) t0 = ms;
    const t = forcedT !== null ? forcedT : reduceMotion ? 1e6 : (ms - t0) / 1000;
    uTime.value = Math.min(t, 650);
    if (!done && t > duration) {
      done = true;
      if (!reduceMotion && controls.enableRotate !== false && !controls._userMoved) controls.autoRotate = true;
    }
    controls.update();
    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      host.classList.add('is-3d');
      if (hint && opts.hintText) {
        const text = coarse ? opts.hintText.coarse : opts.hintText.fine;
        if (text) { hint.textContent = text; hint.hidden = false; }
      }
    }
  });
  controls.addEventListener('start', () => { controls._userMoved = true; });
}
