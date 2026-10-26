// 3D version of the hero drawing: a residential water heater room.
// The scene comes from build/hero_scene.py (via hero-scene.js), the same definition
// that draws the SVG, so the two line up when the 3D view fades in over it.
// Progressive enhancement: the SVG stays in the page until the first WebGL frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SERVICES } from './services.js';
import { SCENE } from './hero-scene.js';

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
  const svcColor = (id) => token('--' + id, SERVICES[id].color);
  const insulated = (id) => !!(SERVICES[id] && SERVICES[id].insulated);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const SPEED = SCENE.speed;

  // Drawing coordinates: x, y on plan, z up. Three.js: y up. The swap matches the SVG's isometric view.
  const P = (x, y, z) => new THREE.Vector3(x, z, y);
  const PA = (a) => P(a[0], a[1], a[2]);

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
  const target = PA(SCENE.view.target);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.copy(target).addScaledVector(new THREE.Vector3(1, 1, 1).normalize(), 20);
  camera.lookAt(target);

  // Lights: the key light comes from the open front corner so pipes cast shadows on the back walls
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.copy(target).add(new THREE.Vector3(3.5, 8, 5.5));
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
  const edgeMat = new THREE.LineBasicMaterial({ color: '#9AA9B2' });
  const addBox = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => {
    const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    m.receiveShadow = true;
    m.castShadow = !!opts.cast;
    if (opts.order) m.renderOrder = opts.order;
    root.add(m);
    if (opts.edges !== false) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat);
      e.position.copy(m.position);
      root.add(e);
    }
    return m;
  };

  // Room: slab (see-through, so the drains below show) and the two back walls
  const R = SCENE.room;
  addBox(-R.wall, R.x1, -R.wall, R.y1, R.slab[0], R.slab[1],
    new THREE.MeshStandardMaterial({ color: '#E1E7EB', roughness: 0.95, transparent: true, opacity: 0.62, depthWrite: false }),
    { order: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#E9EEF1', roughness: 0.95 });
  addBox(-R.wall, 0, -R.wall, R.y1, 0, R.h, wallMat);
  addBox(0, R.x1, -R.wall, 0, 0, R.h, wallMat);

  // ---- materials
  const mats = {};
  const pipeMat = (key) => (mats[key] ||= new THREE.MeshStandardMaterial({ color: svcColor(key), roughness: 0.38, metalness: 0.15 }));
  const INS = 0.045;
  const insMats = {};
  const insMat = (key) => {
    if (insMats[key]) return insMats[key];
    const m = new THREE.MeshStandardMaterial({
      color: svcColor(key), roughness: 0.6, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false,
    });
    // even shading with a denser silhouette, so the jacket reads as a clean outline around the pipe
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
  const metal = new THREE.MeshStandardMaterial({ color: '#5E6A72', roughness: 0.45, metalness: 0.55 });
  const metalLight = new THREE.MeshStandardMaterial({ color: '#AEB8BF', roughness: 0.4, metalness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#B23A2E', roughness: 0.5, metalness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: '#C9A227', roughness: 0.4, metalness: 0.45 });
  const pumpMat = new THREE.MeshStandardMaterial({ color: '#3D6E9E', roughness: 0.45, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: '#FBFCFD', roughness: 0.3, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2A343B', roughness: 0.6, metalness: 0.3 });

  // ---- pipe runs: segments grow one after another, joints appear as each segment completes
  const segments = [];
  const joints = [];
  const jackets = [];
  for (const run of SCENE.runs) {
    const pts = run.pts.map(PA);
    const r = run.r;
    let t = run.t0;
    let polyLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      polyLen += len;
      const geo = new THREE.CylinderGeometry(r, r, 1, 18, 1, false);
      geo.translate(0, 0.5, 0);
      const mesh = new THREE.Mesh(geo, pipeMat(run.svc));
      mesh.castShadow = true;
      mesh.position.copy(a);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      root.add(mesh);
      const dur = len / SPEED;
      segments.push({ mesh, len, start: t, dur });
      t += dur;
      if (i < pts.length - 2) {
        const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.2, 14, 10), pipeMat(run.svc));
        j.position.copy(b);
        j.castShadow = true;
        root.add(j);
        joints.push({ mesh: j, at: t });
      }
    }
    if (insulated(run.svc)) {
      // one continuous tube with rounded corners, revealed with drawRange as the pipe grows
      const path = new THREE.CurvePath();
      let from = pts[0];
      for (let i = 1; i < pts.length - 1; i++) {
        const rc = Math.min(0.12, pts[i].distanceTo(pts[i - 1]) / 2, pts[i].distanceTo(pts[i + 1]) / 2);
        const p1 = pts[i].clone().addScaledVector(pts[i - 1].clone().sub(pts[i]).normalize(), rc);
        const p2 = pts[i].clone().addScaledVector(pts[i + 1].clone().sub(pts[i]).normalize(), rc);
        path.add(new THREE.LineCurve3(from, p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, pts[i].clone(), p2));
        from = p2;
      }
      path.add(new THREE.LineCurve3(from, pts[pts.length - 1]));
      const steps = Math.max(8, Math.ceil(path.getLength() * 24));
      const radial = 22;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, steps, r + INS, radial, false), insMat(run.svc));
      mesh.renderOrder = 2;
      root.add(mesh);
      jackets.push({ mesh, steps, perStep: radial * 6, len: polyLen, start: run.t0 });
    }
  }

  // ---- things that pop in when the pipe reaches them
  const pops = []; // { obj, at, mode }
  const add = (obj, at, mode = 'pop') => { root.add(obj); pops.push({ obj, at, mode }); return obj; };
  const axisQuat = (axis) => {
    const v = axis === 'x' ? P(1, 0, 0) : axis === 'y' ? P(0, 1, 0) : P(0, 0, 1);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
  };
  const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

  for (const v of SCENE.valves) {
    const g = new THREE.Group();
    g.position.copy(PA(v.at));
    const r = Math.max(v.r, 0.03);
    const along = new THREE.Group();          // local +y runs along the pipe
    along.quaternion.copy(axisQuat(v.axis));
    g.add(along);
    if (v.kind === 'globe') {
      along.add(mesh(new THREE.SphereGeometry(r * 1.75, 16, 12), metal));
      for (const s of [-1, 1]) {
        const f = mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, r * 0.5, 18), metal);
        f.position.y = s * r * 1.6;
        along.add(f);
      }
      const stem = mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, r * 4, 8), metalLight);
      stem.position.y = r * 2;
      g.add(stem);
      const wheel = mesh(new THREE.TorusGeometry(r * 1.6, r * 0.25, 8, 24), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = r * 4;
      g.add(wheel);
    } else if (v.kind === 'prv') {
      along.add(mesh(new THREE.SphereGeometry(r * 1.9, 16, 12), metal));
      const bell = mesh(new THREE.CylinderGeometry(r * 1.3, r * 2.3, r * 3, 20), metalLight);
      bell.position.y = r * 2.9;
      g.add(bell);
      const cap = mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, r * 1.2, 10), metal);
      cap.position.y = r * 4.9;
      g.add(cap);
    } else if (v.kind === 'rpz') {
      const body = mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, r * 9, 16), brass);
      along.add(body);
      for (const s of [-1, 1]) {
        const vb = mesh(new THREE.SphereGeometry(r * 1.6, 12, 10), brass);
        vb.position.y = s * r * 6;
        along.add(vb);
      }
      const relief = mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.6, r * 2.6, 12), brass);
      relief.position.y = -r * 2.6;
      g.add(relief);
    } else if (v.kind === 'pump') {
      along.add(mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, r * 2.4, 18), pumpMat));
      const motor = mesh(new THREE.CylinderGeometry(r * 1.8, r * 1.8, r * 4.5, 18), pumpMat);
      motor.quaternion.copy(axisQuat('x'));
      motor.position.copy(P(r * 3.2, 0, 0));
      g.add(motor);
    } else if (v.kind === 'tmv') {
      along.add(mesh(new THREE.BoxGeometry(r * 3.4, r * 3.4, r * 3.4), metalLight));
      const dial = mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * 0.8, 16), dark);
      dial.quaternion.copy(axisQuat('y'));
      dial.position.copy(P(0, r * 2, 0));
      g.add(dial);
    } else if (v.kind === 'check') {
      along.add(mesh(new THREE.CylinderGeometry(r * 1.8, r * 1.8, r * 3, 16), metal));
    } else { // ball valve
      along.add(mesh(new THREE.SphereGeometry(r * 1.6, 14, 10), brass));
      const lever = mesh(new THREE.BoxGeometry(r * 0.5, r * 0.5, r * 5), dark);
      lever.position.copy(P(r * 2.4, 0, r * 1.2));
      g.add(lever);
    }
    add(g, v.t);
  }

  // water heater and expansion tank: rise up from the floor / bracket
  const tank = (c, rad, z0, z1, t, mode) => {
    const g = new THREE.Group();
    g.position.copy(P(c[0], c[1], z0));
    const h = z1 - z0;
    const body = mesh(new THREE.CylinderGeometry(rad, rad, h, 36), white);
    body.position.y = h / 2;
    g.add(body);
    const dome = mesh(new THREE.SphereGeometry(rad, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.scale.y = 0.35;
    dome.position.y = h;
    g.add(dome);
    const base = mesh(new THREE.CylinderGeometry(rad * 1.02, rad * 1.02, Math.min(0.12, h * 0.08), 36), metal);
    base.position.y = Math.min(0.06, h * 0.04);
    g.add(base);
    add(g, t, mode);
  };
  tank(SCENE.heater.c, SCENE.heater.r, SCENE.heater.z0, SCENE.heater.z1, SCENE.heater.t, 'rise');
  tank(SCENE.expTank.c, SCENE.expTank.r, SCENE.expTank.z0, SCENE.expTank.z1, SCENE.expTank.t, 'pop');

  // mop sink: a low white basin with a dark drain
  {
    const s = SCENE.sink;
    const g = new THREE.Group();
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    g.position.copy(P(cx, cy, s.z0));
    const w = s.x1 - s.x0, d = s.y1 - s.y0, h = s.z1 - s.z0, t = 0.07;
    const part = (x, y, z, sx, sy, sz) => {
      const m = mesh(new THREE.BoxGeometry(sx, sz, sy), white);
      m.position.copy(P(x, y, z));
      g.add(m);
    };
    part(0, 0, t / 2, w, d, t);
    part(-w / 2 + t / 2, 0, h / 2, t, d, h); part(w / 2 - t / 2, 0, h / 2, t, d, h);
    part(0, -d / 2 + t / 2, h / 2, w - 2 * t, t, h); part(0, d / 2 - t / 2, h / 2, w - 2 * t, t, h);
    const drain = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16), dark, false);
    drain.position.copy(P(0, 0, t + 0.006));
    g.add(drain);
    add(g, s.t);
  }

  // floor drains
  for (const d of SCENE.drains) {
    const g = new THREE.Group();
    g.position.copy(P(d.at[0], d.at[1], 0.004));
    const grate = mesh(new THREE.CylinderGeometry(d.r, d.r, 0.012, 28), dark, false);
    g.add(grate);
    const ring = mesh(new THREE.TorusGeometry(d.r, 0.012, 6, 28), metalLight, false);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    add(g, d.t);
  }

  // sleeves through the slab and the wall
  const sleeveMat = new THREE.MeshStandardMaterial({ color: '#8C99A3', roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  for (const s of SCENE.sleeves) {
    const sr = s.r + (insulated(s.svc) ? INS + 0.02 : 0.04);
    const len = s.axis === 'z' ? R.slab[1] - R.slab[0] + 0.16 : R.wall + 0.12;
    const m = mesh(new THREE.CylinderGeometry(sr, sr, len, 22, 1, true), sleeveMat);
    m.quaternion.copy(axisQuat(s.axis));
    m.position.copy(PA(s.at));
    if (s.axis === 'z') m.position.y = (R.slab[0] + R.slab[1]) / 2 + 0.02;
    root.add(m);
  }

  // threaded-rod hangers from the ceiling line
  const rodMat = new THREE.MeshStandardMaterial({ color: '#7D8B95', roughness: 0.45, metalness: 0.6 });
  for (const hg of SCENE.hangers) {
    const r = hg.r + (insulated(hg.svc) ? INS : 0);
    const [x, y, z] = hg.at;
    const len = R.h - (z + r);
    const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), rodMat);
    rod.position.copy(P(x, y, z + r + len / 2));
    root.add(rod);
    const ring = mesh(new THREE.TorusGeometry(r + 0.015, 0.012, 8, 24), rodMat);
    ring.position.copy(P(x, y, z));
    ring.rotation.y = Math.PI / 2;
    root.add(ring);
  }

  // faint drawing grid under the room
  const grid = new THREE.GridHelper(10, 20, 0xD3DCE1, 0xE3E9EC);
  grid.position.copy(P(2.2, 1.5, -0.95));
  root.add(grid);

  // ---- HTML labels anchored to scene points
  const labels = SCENE.labels.map((l) => {
    const el = document.createElement('span');
    el.className = 'riser3d-label' + (l.side === 'level' ? ' is-level' : l.side === 'left' ? ' is-left' : '');
    el.textContent = l.full;
    labelLayer.appendChild(el);
    return { el, pos: PA(l.at), full: l.full, short: l.short };
  });
  let narrow = null;
  const setLabelText = () => {
    const n = stage.clientWidth < 460;
    if (n === narrow) return;
    narrow = n;
    for (const l of labels) l.el.textContent = n ? l.short : l.full;
  };

  // ---- controls: drag to rotate on fine pointers; no zoom or pan
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.35;
  controls.minAzimuthAngle = -0.35;          // keep the open side of the room towards the viewer
  controls.maxAzimuthAngle = Math.PI / 2 + 0.35;
  controls.enableRotate = !coarse;
  controls.autoRotate = false;
  controls.addEventListener('start', () => { swaying = false; });
  if (coarse) renderer.domElement.style.touchAction = 'pan-y';
  controls.update();
  const homeAz = controls.getAzimuthalAngle();

  // ---- sizing: same scale as the SVG drawing underneath
  const VIEW = SCENE.view.half;
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

  // ---- intro
  const introEnd = SCENE.introEnd;
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
    for (const p of pops) {
      const d = p.mode === 'rise' ? 0.55 : 0.25;
      const f = THREE.MathUtils.clamp((t - p.at) / d, 0, 1);
      p.obj.visible = f > 0;
      const e = 1 - Math.pow(1 - f, 3);
      if (p.mode === 'rise') p.obj.scale.set(1, Math.max(e, 0.001), 1);
      else p.obj.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * e));
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

  // after the intro the room sways gently around its corner instead of spinning all the way round
  let swaying = !reduceMotion;
  let t0 = null, shown = false;
  renderer.setAnimationLoop((ms) => {
    if (!visible || document.hidden) return;
    if (t0 === null) t0 = ms;
    const t = reduceMotion ? 1e9 : (ms - t0) / 1000;
    applyIntro(t);
    if (swaying && t > introEnd + 0.6) {
      const k = t - introEnd - 0.6;
      const az = homeAz + Math.sin(k * 0.35) * 0.22 * Math.min(1, k / 2);
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta = az;
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(controls.target);
    }
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
