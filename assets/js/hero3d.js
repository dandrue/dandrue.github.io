// Hero: one restroom group cut from the same model, growing in install order.
import { mountModel, webglAvailable } from './model-viewer.js';

const host = document.getElementById('hero-art');
if (host && webglAvailable()) {
  mountModel(host, {
    src: host.dataset.src,
    dir: { wide: [1, 0.95, 0.85], tall: [1, 0.95, 0.85] },
    pan: false,
    zoom: false,
    fit: 0.9,
    autoRotateSpeed: 0.5,
    timeParam: 'hero-t',
    dirParam: 'hero-dir',
    hint: document.getElementById('hero-hint'),
    hintText: { fine: 'Drag to rotate the model', coarse: '' },
  }).catch((err) => console.warn('3D hero disabled:', err));
}
