# dandrue.github.io

Portfolio site for Diego Rueda, plumbing and mechanical piping BIM specialist.

- `index.html` is the published page. It is generated; edit `build/template.html` for text and `build/gen.py` for the drawings, then run `python3 build/gen.py .` from the repo root.
- Drawings are schematics, so no client data is published. To swap one for a real screenshot or GIF, look for the `<!-- Replace with: ... -->` comments in `index.html`.
- Font: Archivo (SIL Open Font License, see `assets/fonts/OFL.txt`), self-hosted.
- 3D hero: `assets/js/hero3d.js`, built on three.js r170 (MIT, self-hosted in `assets/js/`). It fades in over the SVG riser once WebGL renders; without WebGL the SVG stays.
- Service colours: `build/services.json` is the single list of piping services (abbreviation, name, colour, insulated). `gen.py` turns it into the CSS colour tokens, the colour key on the page and `assets/js/services.js`, which the 3D scenes read. Insulated services get a translucent jacket (80% transparent) in both the drawings and the 3D model.
