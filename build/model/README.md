# Plumbing model pipeline

Turns a Navisworks FBX export (Output → Export Scene → FBX) into the light, anonymous
model in `assets/models/plumbing.{json,bin}` used by `assets/js/model3d.js`.
The FBX itself is not kept in this repo.

1. `python3 extract.py export.fbx` reads the binary FBX (`fbxparse.py`), bakes world
   transforms and tags every mesh with its Fabrication service, category and level
   (`meta.json`, `meshes.npz`).
2. `python3 build_scene.py 22 out` keeps the region set in `REGION`, clips straight pipes
   to it like a section box, rebuilds straight pipe and insulation as low-poly cylinders,
   simplifies fittings and fixtures, finds how the parts connect and gives each vertex
   the time it appears (the network grows from the building sewer and the water entry at
   22 ft/s). Output: quantised positions, normals, reveal times and indices per layer.
   No names, properties or project coordinates are written.
