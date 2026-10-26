// The 'Inside one of my models' section: the full restroom core with system toggles.
import { mountModel, webglAvailable } from './model-viewer.js';

const host = document.getElementById('model-stage');
if (host && webglAvailable()) {
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    mountModel(host, {
      bar: document.getElementById('model-bar'),
      hint: document.getElementById('model-hint'),
      hintText: {
        fine: 'Drag to rotate, right-drag to pan, Ctrl or ⌘ + scroll to zoom',
        coarse: 'Tap a system to show or hide it. Use + and − to zoom.',
      },
    }).catch((err) => console.warn('3D model disabled:', err));
  }, { rootMargin: '400px 0px' });
  io.observe(host);
}
