// 3D version of the hero riser drawing.
// Progressive enhancement: the SVG drawing stays in the page and is only
// visually replaced once the WebGL scene has rendered its first frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SERVICES } from './services.js';

const host = document.getElementById('hero-art');
if (host && webglAvailable()) {
  try {
    init(host);
  } catch (err) {
    console.warn('3D hero disabled:', err);
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function init(host) {
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // Pipe colours come from the shared service registry (build/services.json)
  const svcColor = (id) => token('--' + id, SERVICES[id].color);
  const COLORS = {
    slab: '#E6EBEE',
    slabEdge: '#9AA9B2',
    sleeve: '#8C99A3',
    ink: token('--ink', '#16222A'),
  };

  // Drawing coordinates: x, y on plan, z up. Three.js: y up.
  const P = (x, y, z) => new THREE.Vector3(x, z, y);

  const stage = document.createElement('div');
  stage.className = 'riser3d';
  stage.setAttribute('aria-hidden', 'true');
  const labelLayer = document.createElement('div');
  labelLayer.className = 'riser3d-labels';
  stage.appendChild(labelLayer);
  host.appendChild(stage);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.insertBefore(renderer.domElement, labelLayer);

  const scene = new THREE.Scene();
  const target = P(2.1, 1.5, 2.3);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const camDir = new THREE.Vector3(1, 0.9, 1).normalize();
  camera.position.copy(target).addScaledVector(camDir, 20);
  camera.lookAt(target);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.copy(target).add(new THREE.Vector3(-3, 9, 5));
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 25;
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);

  // Slabs
  const T = 0.22;
  const slabMat = new THREE.MeshStandardMaterial({ color: COLORS.slab, roughness: 0.92, metalness: 0 });
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.slabEdge });
  for (const z of [0, 3]) {
    const g = new THREE.BoxGeometry(4.2, T, 3.0);
    const m = new THREE.Mesh(g, slabMat);
    m.position.copy(P(2.1, 1.5, z - T / 2));
    m.receiveShadow = true;
    root.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat);
    e.position.copy(m.position);
    root.add(e);
  }

  // Pipe runs: [color, radius, points, start time (s)]
  const runs = [
    ['cw', 0.06, [[0.9, 0.6, -0.9], [0.9, 0.6, 5.6]], 0.0],
    ['hw', 0.05, [[1.3, 0.6, -0.9], [1.3, 0.6, 5.2]], 0.15],
    ['san', 0.09, [[2.5, 0.6, -0.9], [2.5, 0.6, 4.6]], 0.3],
    ['vent', 0.06, [[2.5, 0.6, 0.9], [3.0, 0.6, 1.4], [3.0, 0.6, 6.0]], 0.55],
    ['cw', 0.045, [[0.9, 0.6, 0.8], [0.9, 1.9, 0.8], [1.7, 1.9, 0.8]], 0.9],
    ['hw', 0.04, [[1.3, 0.6, 0.6], [1.3, 1.6, 0.6], [1.7, 1.6, 0.6]], 1.0],
    ['san', 0.07, [[2.5, 0.6, 2.55], [2.5, 2.4, 2.55], [2.5, 2.4, 3.3]], 1.1],
    ['cw', 0.045, [[0.9, 0.6, 3.9], [0.9, 2.4, 3.9], [2.1, 2.4, 3.9], [2.1, 2.4, 3.5]], 1.3],
    ['hw', 0.04, [[1.3, 0.6, 3.65], [1.3, 2.1, 3.65], [2.1, 2.1, 3.65], [2.1, 2.1, 3.42]], 1.4],
  ];

  const mats = {};
  const pipeMat = (key) => (mats[key] ||= new THREE.MeshStandardMaterial({ color: svcColor(key), roughness: 0.38, metalness: 0.15 }));
  // Insulation: a jacket in the service colour at 80% transparency, like a Revit view override
  const INS = 0.05; // jacket thickness in drawing units
  const insulated = (key) => !!(SERVICES[key] && SERVICES[key].insulated);
  const insMats = {};
  const insMat = (key) => {
    if (insMats[key]) return insMats[key];
    const m = new THREE.MeshStandardMaterial({
      color: svcColor(key), roughness: 0.6, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false,
    });
    // Even out the shading and thicken the silhouette slightly, the way a
    // translucent sleeve reads denser at its edges, so the jacket shows as
    // a clean outline around the pipe instead of a one-sided glow.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - abs(dot(normalize(geometryNormal), geometryViewDir));
        outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.45);
        diffuseColor.a *= mix(0.8, 2.2, rim * rim);
        #include <opaque_fragment>`);
    };
    return (insMats[key] = m);
  };
  const segments = []; // { mesh, a, b, len, start, dur }
  const joints = [];   // { mesh, at }
  const jackets = [];  // { mesh, steps, perStep, len, start }
  const SPEED = 3.2;   // drawing units per second while growing

  // One continuous tube per run, with rounded corners, so the translucent
  // jacket has no overlapping pieces that would show up darker at elbows.
  function jacket(key, r, pts, start) {
    const v = pts.map((q) => P(...q));
    const path = new THREE.CurvePath();
    let from = v[0];
    let polyLen = 0;
    for (let i = 1; i < v.length; i++) polyLen += v[i].distanceTo(v[i - 1]);
    for (let i = 1; i < v.length - 1; i++) {
      const rc = Math.min(0.12, v[i].distanceTo(v[i - 1]) / 2, v[i].distanceTo(v[i + 1]) / 2);
      const p1 = v[i].clone().addScaledVector(v[i - 1].clone().sub(v[i]).normalize(), rc);
      const p2 = v[i].clone().addScaledVector(v[i + 1].clone().sub(v[i]).normalize(), rc);
      path.add(new THREE.LineCurve3(from, p1));
      path.add(new THREE.QuadraticBezierCurve3(p1, v[i].clone(), p2));
      from = p2;
    }
    path.add(new THREE.LineCurve3(from, v[v.length - 1]));
    const steps = Math.max(8, Math.ceil(path.getLength() * 24));
    const radial = 24;
    const geo = new THREE.TubeGeometry(path, steps, r + INS, radial, false);
    const mesh = new THREE.Mesh(geo, insMat(key));
    mesh.renderOrder = 1;
    root.add(mesh);
    jackets.push({ mesh, steps, perStep: radial * 6, len: polyLen, start });
  }

  for (const [key, r, pts, start] of runs) {
    if (insulated(key)) jacket(key, r, pts, start);
    let t = start;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = P(...pts[i]);
      const b = P(...pts[i + 1]);
      const len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(r, r, 1, 20, 1, false);
      geo.translate(0, 0.5, 0); // base at origin, grows along +y
      const mesh = new THREE.Mesh(geo, pipeMat(key));
      mesh.castShadow = true;
      mesh.position.copy(a);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      root.add(mesh);
      const dur = len / SPEED;
      segments.push({ mesh, len, start: t, dur });
      t += dur;
      if (i < pts.length - 2) {
        const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 16, 12), pipeMat(key));
        j.position.copy(b);
        j.castShadow = true;
        root.add(j);
        joints.push({ mesh: j, at: t });
      }
    }
  }

  // Sleeves where pipes cross a slab
  const sleeveMat = new THREE.MeshStandardMaterial({ color: COLORS.sleeve, roughness: 0.5, metalness: 0.35 });
  const sleeves = [
    ['cw', 0.9, 0.6, 0, 0.06], ['hw', 1.3, 0.6, 0, 0.05], ['san', 2.5, 0.6, 0, 0.09],
    ['cw', 0.9, 0.6, 3, 0.06], ['hw', 1.3, 0.6, 3, 0.05], ['san', 2.5, 0.6, 3, 0.09],
    ['vent', 3.0, 0.6, 3, 0.06], ['san', 2.5, 2.4, 3, 0.07],
  ];
  for (const [key, x, y, z, r] of sleeves) {
    // insulation runs through the sleeve, so the sleeve is sized over the jacket
    const sr = r + (insulated(key) ? INS + 0.025 : 0.045);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(sr, sr, T + 0.18, 24, 1, true), sleeveMat);
    s.material.side = THREE.DoubleSide;
    s.position.copy(P(x, y, z - T / 2 + 0.02));
    s.castShadow = true;
    root.add(s);
  }

  // A wall-hung basin on level 2, fed by the cold and hot water drops
  const basinMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.25, metalness: 0 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.14, 32), basinMat);
  basin.scale.set(1, 1, 0.75);
  basin.position.copy(P(2.28, 2.3, 3.36));
  basin.castShadow = true;
  basin.receiveShadow = true;
  root.add(basin);

  // Concrete columns between the slabs give the riser a building around it
  const colMat = new THREE.MeshStandardMaterial({ color: '#D9E0E4', roughness: 0.95, metalness: 0 });
  for (const [x, y] of [[0.25, 2.75], [3.95, 2.75], [3.95, 0.25]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3 - T, 0.3), colMat);
    c.position.copy(P(x, y, (3 - T) / 2));
    c.castShadow = true;
    c.receiveShadow = true;
    root.add(c);
    const ce = new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), edgeMat);
    ce.position.copy(c.position);
    root.add(ce);
  }

  // Threaded-rod hangers holding the runs that hang under the level 2 slab
  const rodMat = new THREE.MeshStandardMaterial({ color: '#7D8B95', roughness: 0.45, metalness: 0.6 });
  const hanger = (x, y, zPipe, r, key) => {
    if (insulated(key)) r += INS; // the clevis carries the pipe over its insulation
    const top = 3 - T;
    const len = top - (zPipe + r);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), rodMat);
    rod.position.copy(P(x, y, zPipe + r + len / 2));
    rod.castShadow = true;
    root.add(rod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.015, 0.012, 8, 24), rodMat);
    ring.position.copy(P(x, y, zPipe));
    ring.rotation.y = Math.abs(x - 2.5) < 0.01 ? 0 : Math.PI / 2;
    root.add(ring);
  };
  hanger(2.5, 1.2, 2.55, 0.07, 'san');
  hanger(2.5, 1.9, 2.55, 0.07, 'san');
  hanger(0.9, 1.3, 0.8, 0.045, 'cw');
  hanger(1.3, 1.1, 0.6, 0.04, 'hw');

  // A faint drawing grid under the model
  const grid = new THREE.GridHelper(9, 18, 0xD3DCE1, 0xE3E9EC);
  grid.position.copy(P(2.1, 1.5, -1.0));
  root.add(grid);

  // HTML labels anchored to 3D points
  const labels = [
    ['2" CW', 'CW', P(0.9, 0.6, 5.6)],
    ['1-1/2" HW', 'HW', P(1.3, 0.6, 5.2)],
    ['4" SAN', 'SAN', P(2.5, 0.6, 4.6)],
    ['2" V', 'V', P(3.0, 0.6, 6.0)],
    ['Level 2', 'L2', P(0, 3, 3), 'level'],
    ['Level 1', 'L1', P(0, 3, 0), 'level'],
  ].map(([full, short, pos, kind]) => {
    const el = document.createElement('span');
    el.className = 'riser3d-label' + (kind ? ' is-' + kind : '');
    el.textContent = full;
    labelLayer.appendChild(el);
    return { el, pos, full, short };
  });
  let narrow = null;
  const setLabelText = () => {
    const n = stage.clientWidth < 460;
    if (n === narrow) return;
    narrow = n;
    for (const l of labels) l.el.textContent = n ? l.short : l.full;
  };

  // Controls: drag to rotate on fine pointers; no zoom or pan
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.35;
  controls.enableRotate = !coarse;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.9;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  if (coarse) renderer.domElement.style.touchAction = 'pan-y';
  controls.update();

  // Sizing
  const VIEW = 4.0; // half-height of the visible area in drawing units
  function resize() {
    const w = stage.clientWidth || 560;
    const h = stage.clientHeight || Math.round(w * 0.93);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    const aspect = w / h;
    camera.left = -VIEW * aspect; camera.right = VIEW * aspect;
    camera.top = VIEW; camera.bottom = -VIEW;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { resize(); setLabelText(); }).observe(stage);
  resize();
  setLabelText();

  // Intro: pipes grow along their runs once, then labels appear
  const introEnd = Math.max(...segments.map((s) => s.start + s.dur)) + 0.2;
  let t0 = null;
  function applyIntro(t) {
    for (const s of segments) {
      const f = THREE.MathUtils.clamp((t - s.start) / s.dur, 0, 1);
      s.mesh.visible = f > 0;
      s.mesh.scale.set(1, Math.max(f, 0.0001) * s.len, 1);
    }
    for (const j of joints) j.mesh.visible = t >= j.at;
    for (const k of jackets) {
      const f = THREE.MathUtils.clamp(((t - k.start) * SPEED) / k.len, 0, 1);
      k.mesh.visible = f > 0;
      k.mesh.geometry.setDrawRange(0, Math.floor(f * k.steps) * k.perStep);
    }
    stage.classList.toggle('labels-on', t >= introEnd);
  }

  const v = new THREE.Vector3();
  function placeLabels() {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const l of labels) {
      v.copy(l.pos).project(camera);
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(stage);

  let shown = false;
  renderer.setAnimationLoop((ms) => {
    if (!visible || document.hidden) return;
    if (t0 === null) t0 = ms;
    const t = reduceMotion ? 1e9 : (ms - t0) / 1000;
    applyIntro(t);
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    if (!shown) {
      shown = true;
      host.classList.add('is-3d');
      const hint = document.getElementById('hero-hint');
      if (hint && !coarse) hint.hidden = false;
    }
  });
}
