"""Extract world-space triangle meshes per element with service/category tags -> elements.npz + meta.json"""
import sys, collections, json, math
import numpy as np
from fbxparse import read

ver, root = read(sys.argv[1])
objs = root.find("Objects")
byid = {c.props[0]: c for c in objs.children}
parent = {}; attached = collections.defaultdict(list)
for c in root.find("Connections").children:
    if c.props[0] != "OO": continue
    ch, pa = c.props[1], c.props[2]
    a, b = byid.get(ch), byid.get(pa)
    if a is not None and a.name == "Model" and (pa == 0 or (b is not None and b.name == "Model")):
        parent[ch] = pa
    else:
        attached[pa].append(ch)

def p70(c):
    d = {}
    q = c.find("Properties70")
    if q is not None:
        for p in q.children:
            d[p.props[0]] = p.props[4:] if len(p.props) > 5 else (p.props[4] if len(p.props) > 4 else None)
    return d
P = {i: p70(n) for i, n in byid.items() if n.name == "Model"}

def euler(r):  # FBX eEulerXYZ -> Rz*Ry*Rx
    x, y, z = [math.radians(a) for a in r]
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Rx = np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]]); Ry = np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]]); Rz = np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
    return Rz @ Ry @ Rx
def trs(t, r, s):
    M = np.eye(4); M[:3,:3] = euler(r) @ np.diag(s); M[:3,3] = t; return M
def vec(d, k, dflt):
    v = d.get(k); return tuple(v) if isinstance(v, (list, tuple)) and len(v) == 3 else dflt
for i, d in P.items():
    for k in ("PreRotation", "PostRotation", "RotationPivot", "ScalingPivot", "RotationOffset", "ScalingOffset"):
        v = vec(d, k, (0,0,0))
        assert max(abs(x) for x in v) < 1e-9, (k, v)
W = {}
def world(i):
    if i == 0: return np.eye(4)
    if i in W: return W[i]
    d = P[i]
    L = trs(vec(d, "Lcl Translation", (0,0,0)), vec(d, "Lcl Rotation", (0,0,0)), vec(d, "Lcl Scaling", (1,1,1)))
    W[i] = world(parent.get(i, 0)) @ L
    return W[i]

def nm(i): return byid[i].props[1].split("\x00")[0]
def ancestors(i):
    while i in parent and i != 0:
        yield i; i = parent[i]

elements = []  # dicts
tris_all = []
for i, n in byid.items():
    if n.name != "Model" or n.props[2] != "Mesh": continue
    geo = next((byid[g] for g in attached[i] if g in byid and byid[g].name == "Geometry"), None)
    if geo is None: continue
    V = geo.find("Vertices").props[0].reshape(-1, 3)
    I = geo.find("PolygonVertexIndex").props[0].astype(np.int64)
    # triangulate (fan)
    tris = []; poly = []
    ends = np.where(I < 0)[0]
    start = 0
    Ifix = I.copy(); Ifix[ends] = ~I[ends]
    for e in ends:
        pv = Ifix[start:e+1]
        for k in range(1, len(pv) - 1):
            tris.append((pv[0], pv[k], pv[k+1]))
        start = e + 1
    tris = np.array(tris, dtype=np.int64)
    d = P[i]
    G = trs(vec(d, "GeometricTranslation", (0,0,0)), vec(d, "GeometricRotation", (0,0,0)), vec(d, "GeometricScaling", (1,1,1)))
    M = world(i) @ G
    Vw = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
    if np.linalg.det(M[:3,:3]) < 0: tris = tris[:, ::-1]
    # tags from ancestors
    service = cat = level = fam = size = None; elem = None; nwc = None
    for a in ancestors(i):
        da = P[a]
        if service is None and "Element - Fabrication Service" in da:
            service = da["Element - Fabrication Service"]; elem = a
            size = da.get("Element - Size")
        if cat is None and "Category - Name" in da: cat = da["Category - Name"]
        if service is None and "Element - System Classification" in da:
            service = "Revit: " + str(da.get("Element - System Classification")); elem = elem or a
    path = [nm(a) for a in ancestors(i)][::-1]
    nwc = path[0] if path else None
    level = path[1] if len(path) > 1 else None
    fam = path[3] if len(path) > 3 else None
    # element id = the node directly holding the fabrication props, else 4th-level instance
    if elem is None:
        anc = list(ancestors(i))[::-1]
        elem = anc[min(len(anc)-1, 4)]
    mat = [byid[m] for m in attached[i] if m in byid and byid[m].name == "Material"]
    col = None
    if mat:
        for pp in mat[0].find("Properties70").children:
            if pp.props[0] == "DiffuseColor": col = [round(x, 3) for x in pp.props[4:7]]
    elements.append(dict(mesh=i, elem=elem, nwc=nwc, level=level, cat=cat, fam=fam, service=service, size=size, color=col,
                         nv=len(Vw), nt=len(tris)))
    tris_all.append((Vw.astype(np.float64), tris))
np.savez_compressed("meshes.npz", **{f"v{k}": t[0] for k, t in enumerate(tris_all)}, **{f"t{k}": t[1] for k, t in enumerate(tris_all)})
json.dump(elements, open("meta.json", "w"))
allv = np.vstack([t[0] for t in tris_all])
print("meshes", len(elements), "verts", len(allv), "tris", sum(len(t[1]) for t in tris_all))
print("bbox min", allv.min(0).round(2), "max", allv.max(0).round(2))
c = collections.Counter(); tc = collections.Counter()
for e in elements:
    k = (e["nwc"][:4], e["cat"], e["service"]); c[k] += 1; tc[k] += e["nt"]
for k in sorted(c, key=lambda k: -tc[k]): print(c[k], tc[k], k)
