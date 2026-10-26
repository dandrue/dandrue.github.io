"""Turn the extracted plumbing meshes into a light, anonymous web model with per-vertex reveal times."""
import json, math, collections, struct, sys
import numpy as np
from scipy.spatial import cKDTree
import heapq
from groups import meta, klass, load

REGION = dict(xmin=118.0, xmax=152.5, ymin=-80.0, ymax=6.5)
SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 22.0   # feet per second while growing
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
if len(sys.argv) > 3:   # optional region: xmin,xmax,ymin,ymax
    REGION = dict(zip(("xmin", "xmax", "ymin", "ymax"), map(float, sys.argv[3].split(","))))
NAME = sys.argv[4] if len(sys.argv) > 4 else "plumbing"

PIPE_FAMS = ("Pipe",)
def is_pipe_family(f): return f is not None and "Pipe" in f and "Coupling" not in f

def inside(c): return REGION["xmin"] <= c[0] <= REGION["xmax"] and REGION["ymin"] <= c[1] <= REGION["ymax"]

def cyl_fit(V):
    c = V.mean(0); X = V - c
    w, vec = np.linalg.eigh(X.T @ X); ax = vec[:, -1]
    u = X @ ax; rad = np.linalg.norm(X - np.outer(u, ax), axis=1)
    rmax = rad.max(); outer = rad > 0.9 * rmax
    L = u.max() - u.min()
    ok = rad[outer].min() > 0.95 * rmax and L > 0.6 * rmax
    return ok, c + ax * u.min(), c + ax * u.max(), rmax

def cylinder(p0, p1, r, n):
    a = p1 - p0; L = np.linalg.norm(a); a = a / L
    t = np.array([0, 0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0, 0])
    b1 = np.cross(a, t); b1 /= np.linalg.norm(b1); b2 = np.cross(a, b1)
    ang = np.arange(n) * 2 * np.pi / n
    ring = np.outer(np.cos(ang), b1) + np.outer(np.sin(ang), b2)
    V = np.vstack([p0 + r * ring, p1 + r * ring]); N = np.vstack([ring, ring])
    U = np.r_[np.zeros(n), np.ones(n)]
    T = []
    for i in range(n):
        j = (i + 1) % n
        T += [(i, j, n + j), (i, n + j, n + i)]
    return V, np.array(T), N, U

def cluster(V, T, h):
    q = np.floor((V - V.min(0)) / h).astype(np.int64)
    uniq, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.ravel()
    NV = np.zeros((len(uniq), 3)); np.add.at(NV, inv, V); NV /= np.bincount(inv)[:, None]
    T2 = inv[T]
    keep = (T2[:, 0] != T2[:, 1]) & (T2[:, 1] != T2[:, 2]) & (T2[:, 0] != T2[:, 2]); T2 = T2[keep]
    if len(T2):
        s = np.sort(T2, axis=1); _, idx = np.unique(s, axis=0, return_index=True); T2 = T2[np.sort(idx)]
    used = np.unique(T2); remap = -np.ones(len(NV), np.int64); remap[used] = np.arange(len(used))
    return NV[used], remap[T2]

def vnormals(V, T):
    N = np.zeros_like(V)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3): np.add.at(N, T[:, k], fn)
    l = np.linalg.norm(N, axis=1); l[l == 0] = 1
    return N / l[:, None]

# ------------------------------------------------------------------ select
SVC = {"cw": "cw", "hw": "hw", "san_bg": "san", "san_ag": "san", "vent_ag": "vent", "vent_bg": "vent", "sd": "sd"}
els = []; seen_fix = set()
for k, e in enumerate(meta):
    g = klass(e)
    if g == "other": continue
    V, T = load(k)
    c = V.mean(0)
    pipe = is_pipe_family(e["fam"]) or g == "ins"
    fit = cyl_fit(V) if (pipe and len(V) >= 8) else (False, None, None, None)
    if (g in SVC or g == "ins") and fit[0]:
        # straight pipes are clipped to the region box, like a section box
        p0, p1 = fit[1], fit[2]; d = p1 - p0; t0, t1 = 0.0, 1.0
        for ax_, lo, hi in ((0, "xmin", "xmax"), (1, "ymin", "ymax")):
            if abs(d[ax_]) < 1e-9:
                if not (REGION[lo] <= p0[ax_] <= REGION[hi]): t0, t1 = 1.0, 0.0
                continue
            a_ = (REGION[lo] - p0[ax_]) / d[ax_]; b_ = (REGION[hi] - p0[ax_]) / d[ax_]
            t0 = max(t0, min(a_, b_)); t1 = min(t1, max(a_, b_))
        if t1 - t0 <= 1e-6: continue
        clipped = t0 > 1e-6 or t1 < 1 - 1e-6
        fit = (True, p0 + d * t0, p0 + d * t1, fit[3])
        els.append(dict(k=k, g=g, e=e, fit=fit, clipped=clipped)); continue
    if not inside(c): continue
    if g == "fix":
        key = (e["fam"], tuple(np.round(c, 2)))
        if key in seen_fix: continue
        seen_fix.add(key)
    els.append(dict(k=k, g=g, e=e, fit=fit, clipped=False))
print("selected", len(els), collections.Counter(x["g"] for x in els))

# ------------------------------------------------------------------ simplify
for x in els:
    V, T = load(x["k"]); g = x["g"]
    ok, p0, p1, r = x["fit"]
    if ok:
        n = 16 if g == "ins" else 12
        if g == "ins": r = r + 0.004
        x["V"], x["T"], x["N"], x["U"] = cylinder(p0, p1, r, n)
        x["p0"], x["p1"], x["r"], x["kind"] = p0, p1, r, "cyl"
        x["len"] = float(np.linalg.norm(p1 - p0))
    else:
        ext = V.max(0) - V.min(0)
        if g == "fix": h = 0.11
        else: h = max(0.012, 0.32 * float(np.sort(ext)[1]) / 2)
        NV, NT = cluster(V, T, h)
        if len(NT) == 0: NV, NT = V, T
        x["V"], x["T"] = NV, NT; x["N"] = vnormals(NV, NT); x["U"] = np.zeros(len(NV))
        x["kind"] = "mesh"; x["len"] = float(min(np.linalg.norm(ext), 1.0))
    x["c"] = x["V"].mean(0)
tot = collections.Counter(); 
for x in els: tot[x["g"]] += len(x["T"])
print("triangles after simplify", dict(tot), "total", sum(tot.values()))

# ------------------------------------------------------------------ connectivity graph (network parts only)
net = [i for i, x in enumerate(els) if x["g"] in SVC]
orig = {}
for i in net:
    x = els[i]
    if x["clipped"]:
        orig[i] = x["V"]
    else:
        orig[i] = load(x["k"])[0]
bb = {i: (orig[i].min(0) - 0.05, orig[i].max(0) + 0.05) for i in net}
trees = {i: cKDTree(orig[i]) for i in net}
cent = np.array([els[i]["c"] for i in net]); ctree = cKDTree(cent)
rad_ = np.array([np.linalg.norm(bb[i][1] - bb[i][0]) / 2 for i in net])
adj = collections.defaultdict(set)
TOL = 0.06
for a_idx, i in enumerate(net):
    cand = ctree.query_ball_point(cent[a_idx], rad_[a_idx] + rad_.max() + TOL)
    for b_idx in cand:
        j = net[b_idx]
        if j <= i: continue
        if SVC[els[i]["g"]] in ("cw", "hw") and SVC[els[j]["g"]] not in ("cw", "hw"): continue
        if SVC[els[j]["g"]] in ("cw", "hw") and SVC[els[i]["g"]] not in ("cw", "hw"): continue
        lo = np.maximum(bb[i][0], bb[j][0]); hi = np.minimum(bb[i][1], bb[j][1])
        if np.any(lo > hi): continue
        small, big = (i, j) if len(orig[i]) < len(orig[j]) else (j, i)
        d, _ = trees[big].query(orig[small], k=1, distance_upper_bound=TOL)
        if np.isfinite(d).any():
            adj[i].add(j); adj[j].add(i)
print("edges", sum(len(v) for v in adj.values()) // 2)

# components
comp = {}; comps = []
for i in net:
    if i in comp: continue
    stack = [i]; comp[i] = len(comps); members = []
    while stack:
        u = stack.pop(); members.append(u)
        for v in adj[u]:
            if v not in comp: comp[v] = len(comps); stack.append(v)
    comps.append(members)
print("components", len(comps), sorted((len(c), collections.Counter(SVC[els[m]["g"]] for m in c).most_common(2)) for c in comps)[-8:])

def endpoint_toward(x, pt):
    if x["kind"] != "cyl": return None
    return 0 if np.linalg.norm(x["p0"] - pt) <= np.linalg.norm(x["p1"] - pt) else 1

time = {}; flip = {}
def dijkstra(root, t0):
    pq = [(t0, root, None)]
    while pq:
        t, u, frm = heapq.heappop(pq)
        if u in time: continue
        time[u] = t; x = els[u]
        if x["kind"] == "cyl" and frm is not None:
            flip[u] = endpoint_toward(x, els[frm]["c"]) == 1
        dur = x["len"] / SPEED
        for v in adj[u]:
            if v not in time: heapq.heappush(pq, (t + dur, v, u))

def pick_root(members, svc):
    m = [i for i in members if SVC[els[i]["g"]] == svc] or members
    if svc == "san":   # the building sewer: lowest point of the below-grade sanitary
        return min(m, key=lambda i: els[i]["V"][:, 2].min())
    if svc == "cw":    # where the water service enters: a clipped pipe at the region edge, else the lowest
        cl = [i for i in m if els[i]["clipped"]]
        return min(cl or m, key=lambda i: els[i]["V"][:, 2].min())
    return min(m, key=lambda i: els[i]["V"][:, 2].min())

dwv = [c for c in comps if any(SVC[els[i]["g"]] in ("san", "vent", "sd") for i in c)]
wat = [c for c in comps if any(SVC[els[i]["g"]] in ("cw", "hw") for i in c)]
dwv.sort(key=len, reverse=True); wat.sort(key=len, reverse=True)
dijkstra(pick_root(dwv[0], "san"), 0.0)
def attach_rest(groups, svc):
    for c in groups:
        if c[0] in time: continue
        water = svc in ("cw", "hw")
        done = [i for i in time if (SVC[els[i]["g"]] in ("cw", "hw")) == water] or list(time)
        dc = np.array([els[i]["c"] for i in done]); tr = cKDTree(dc)
        best = min(c, key=lambda i: tr.query(els[i]["c"])[0])
        dd, j = tr.query(els[best]["c"])
        dijkstra(best, time[done[j]] + dd / SPEED)
attach_rest(dwv[1:], "san")
t_dwv = max(time[i] + els[i]["len"] / SPEED for i in time)
cw_main = max(wat, key=lambda c: sum(SVC[els[i]["g"]] == "cw" for i in c))
WATER_START = 0.62 * t_dwv
dijkstra(pick_root(cw_main, "cw"), WATER_START)
attach_rest([c for c in wat if c is not cw_main], "cw")
t_net = max(time[i] + els[i]["len"] / SPEED for i in time)
print("dwv done %.1fs, network done %.1fs" % (t_dwv, t_net))

# reveal samples along the network for insulation and fixtures
S_pts, S_t, S_svc = [], [], []
for i in time:
    x = els[i]; svc = SVC[x["g"]]
    if x["kind"] == "cyl":
        a, b = (x["p1"], x["p0"]) if flip.get(i) else (x["p0"], x["p1"])
        n = max(2, int(x["len"] / 0.1) + 1)
        for s in np.linspace(0, 1, n):
            S_pts.append(a + (b - a) * s); S_t.append(time[i] + s * x["len"] / SPEED); S_svc.append(svc)
    else:
        for p in x["V"][:: max(1, len(x["V"]) // 8)]:
            S_pts.append(p); S_t.append(time[i]); S_svc.append(svc)
S_pts = np.array(S_pts); S_t = np.array(S_t); S_svc = np.array(S_svc)
water_idx = np.where(np.isin(S_svc, ["cw", "hw"]))[0]; dwv_idx = np.where(~np.isin(S_svc, ["cw", "hw"]))[0]
tw = cKDTree(S_pts[water_idx]); td = cKDTree(S_pts[dwv_idx])

# per-vertex reveal times
for i, x in enumerate(els):
    if i in time:
        u = x["U"]
        if flip.get(i): u = 1 - u
        x["R"] = time[i] + u * x["len"] / SPEED
        x["svc"] = SVC[x["g"]]
    elif x["g"] == "ins":
        d, j = tw.query(x["V"])
        x["R"] = S_t[water_idx][j]
        x["svc"] = collections.Counter(S_svc[water_idx][j]).most_common(1)[0][0]
    elif x["g"] == "fix":
        dd, jd = td.query(x["c"]); dw, jw = tw.query(x["c"])
        t = S_t[dwv_idx][jd]
        if dw < 4.0: t = max(t, S_t[water_idx][jw])
        z = x["V"][:, 2]; zr = (z - z.min()) / max(1e-6, z.max() - z.min())
        x["R"] = t + 0.15 + zr * 0.45
        x["svc"] = "fix"
    else:
        # disconnected network bits: appear with their nearest neighbour
        d, j = (tw if SVC[x["g"]] in ("cw", "hw") else td).query(x["c"])
        x["R"] = np.full(len(x["V"]), (S_t[water_idx] if SVC[x["g"]] in ("cw", "hw") else S_t[dwv_idx])[j])
        x["svc"] = SVC[x["g"]]
t_end = max(float(x["R"].max()) for x in els)
print("all done %.1fs" % t_end)

# ------------------------------------------------------------------ pack
LAYERS = [("san_bg", "san"), ("san_ag", "san"), ("vent", "vent"), ("sd", "sd"), ("cw", "cw"), ("hw", "hw"),
          ("ins_cw", "cw"), ("ins_hw", "hw"), ("fix", "fix")]
def layer_of(x):
    g = x["g"]
    if g == "ins": return "ins_" + ("hw" if x["svc"] == "hw" else "cw")
    if g in ("vent_ag", "vent_bg"): return "vent"
    return g
allV = np.vstack([x["V"] for x in els])
lo = allV.min(0); hi = allV.max(0)
center = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0.0])
def to3(V):  # drawing x,y,z (z up) -> three.js x, y(up), z ; proper rotation
    W = V - center
    return np.c_[W[:, 0], W[:, 2], -W[:, 1]]
A3 = to3(allV); qlo = A3.min(0); qhi = A3.max(0); qs = (qhi - qlo) / 65535.0
blobs = []; header = dict(layers=[], scale=qs.tolist(), offset=qlo.tolist(), duration=t_end, waterStart=WATER_START,
                          units="ft", bbox=[qlo.tolist(), qhi.tolist()],
                          region=to3(np.array([[REGION["xmin"], REGION["ymin"], 0], [REGION["xmax"], REGION["ymax"], 0]])).tolist())
off = 0
def push(arr):
    global off
    b = arr.tobytes(); pad = (-len(b)) % 4; blobs.append(b + b"\0" * pad)
    o = off; off += len(b) + pad; return o, len(b)
for name, svc in LAYERS:
    xs = [x for x in els if layer_of(x) == name]
    if not xs: continue
    Vs, Ns, Rs, Ts = [], [], [], []; base = 0
    for x in xs:
        Vs.append(to3(x["V"])); N = x["N"]; Ns.append(np.c_[N[:, 0], N[:, 2], -N[:, 1]]); Rs.append(x["R"]); Ts.append(x["T"] + base); base += len(x["V"])
    V = np.vstack(Vs); N = np.vstack(Ns); R = np.concatenate(Rs); T = np.vstack(Ts)
    qv = np.round((V - qlo) / qs).clip(0, 65535).astype(np.uint16)
    N = N * qs; N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    qn = np.round(N * 127).clip(-127, 127).astype(np.int8); qn = np.c_[qn, np.zeros(len(qn), np.int8)]
    qr = np.round(R * 100).clip(0, 65535).astype(np.uint16)
    idx = T.astype(np.uint16 if len(V) < 65536 else np.uint32)
    L = dict(name=name, service=svc, vertices=len(V), triangles=len(T), indexType="u16" if idx.dtype == np.uint16 else "u32")
    L["position"], _ = push(qv); L["normal"], _ = push(qn); L["reveal"], _ = push(qr); L["index"], _ = push(idx.ravel())
    header["layers"].append(L)
import os
os.makedirs(OUT, exist_ok=True)
open(f"{OUT}/{NAME}.bin", "wb").write(b"".join(blobs))
json.dump(header, open(f"{OUT}/{NAME}.json", "w"), indent=1)
print("bin bytes", off, "layers", [(l["name"], l["vertices"], l["triangles"]) for l in header["layers"]])
