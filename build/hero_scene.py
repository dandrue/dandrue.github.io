"""Hero scene: a residential water heater room, drawn as an isometric SVG and exported for the 3D version.

One definition feeds both views, so the SVG (shown before WebGL loads, and to browsers without it)
lines up with the three.js scene that fades in over it.
Units are arbitrary drawing units; z is up. The room's back walls are the planes x=0 and y=0.
"""
import json
import math

COS = math.cos(math.radians(30))
SPEED = 3.2            # drawing units per second while a pipe grows
VB_W, VB_H = 560, 520  # SVG viewBox, same box as the 3D stage

X1, Y1, H = 4.4, 3.0, 3.3   # room
WALL = 0.14
SLAB = (-0.24, 0.0)

# ----------------------------------------------------------------- runs
# id: (service, radius, points, start)  start = number (seconds) or ("run_id", point) to tee off another run
RUNS = {
    # DWV below the slab, as in the source detail: the mop sink (FD-1) and the 3" floor drain FD-5 each
    # have a P-trap under the slab; their trap arms join one line that runs to the stack at the front-left
    # corner, and the vent rises from that line downstream of both traps.
    "san_stack": ("san", 0.065, [(0.4, 2.75, -1.05), (0.4, 2.75, -0.6)], 0.0),
    "san_main": ("san", 0.065, [(0.4, 2.75, -0.6), (0.4, 2.15, -0.57), (1.99, 2.15, -0.43)], ("san_stack", (0.4, 2.75, -0.6))),
    "san_fd5": ("san", 0.065, [(1.99, 2.15, -0.43), (1.99, 2.15, -0.56), (2.15, 2.15, -0.56), (2.15, 2.15, -0.06)], ("san_main", (1.99, 2.15, -0.43))),
    "san_sink": ("san", 0.05, [(1.15, 2.15, -0.51), (1.8, 1.5, -0.46), (1.8, 0.66, -0.42), (1.8, 0.66, -0.55), (1.8, 0.5, -0.55), (1.8, 0.5, -0.24)], ("san_main", (1.15, 2.15, -0.51))),
    "san_tail": ("san", 0.04, [(1.8, 0.5, -0.24), (1.8, 0.5, 0.45)], ("san_sink", (1.8, 0.5, -0.24))),
    "vent_ug": ("vent", 0.045, [(0.4, 2.75, -0.6), (0.4, 2.75, -0.24)], ("san_fd5", (2.15, 2.15, -0.06))),
    "vent": ("vent", 0.045, [(0.4, 2.75, -0.24), (0.4, 2.75, H)], ("vent_ug", (0.4, 2.75, -0.24))),
    "cw_main": ("cw", 0.065, [(-WALL - 0.05, 0.38, 2.95), (2.25, 0.38, 2.95), (2.25, 0.38, 1.45), (4.05, 0.38, 1.45), (4.05, 0.38, H)], 1.15),
    # 1" irrigation supply drops in front of the heater, through a globe valve to the RPZ near the floor
    "cw_irr": ("cw", 0.03, [(0.22, 0.38, 2.95), (0.22, 2.35, 2.95), (0.22, 2.35, 0.7), (0.22, 1.75, 0.7), (-WALL - 0.05, 1.75, 0.7)], ("cw_main", (0.22, 0.38, 2.95))),
    "cw_heater": ("cw", 0.035, [(0.58, 0.38, 2.95), (0.58, 1.27, 2.95), (0.58, 1.27, 1.98)], ("cw_main", (0.58, 0.38, 2.95))),
    "cw_exp": ("cw", 0.025, [(0.58, 0.8, 2.95), (0.58, 0.8, 2.7)], ("cw_heater", (0.58, 0.8, 2.95))),
    "cw_tmv": ("cw", 0.025, [(0.58, 1.27, 2.38), (1.0, 1.27, 2.38), (1.0, 1.5, 2.38)], ("cw_heater", (0.58, 1.27, 2.38))),
    "hw": ("hw", 0.035, [(1.05, 1.55, 1.98), (1.05, 1.55, H)], "heater"),
    "hwr": ("hwr", 0.03, [(1.48, 1.55, H), (1.48, 1.55, 1.0), (1.3, 1.55, 1.0)], ("hw", (1.05, 1.55, 2.9))),
}
UNDER = {"san_stack", "san_main", "san_fd5", "san_sink", "vent_ug"}

HEATER = dict(c=(0.85, 1.55), r=0.45, z0=0.06, z1=1.95)
EXP_TANK = dict(c=(0.58, 0.8), r=0.13, z0=2.25, z1=2.7)
SINK = dict(x0=1.4, x1=2.2, y0=0.12, y1=0.9, z0=0.45, z1=0.82)  # wall-hung mop sink on the back wall, drain FD-1
SINK_RUN = "san_tail"
DRAINS = [dict(at=(2.15, 2.15), r=0.17, run="san_fd5")]           # 3" FD-5 in front of the sink

# valves: (kind, run, point, axis)
VALVES = [
    ("globe", "cw_main", (2.75, 0.38, 1.45), "x"),
    ("prv", "cw_main", (3.25, 0.38, 1.45), "x"),
    ("globe", "cw_main", (3.75, 0.38, 1.45), "x"),
    ("ball", "cw_heater", (0.58, 1.27, 2.62), "z"),
    ("globe", "cw_irr", (0.22, 2.35, 1.5), "z"),
    ("rpz", "cw_irr", (0.22, 2.05, 0.7), "y"),
    ("tmv", "hw", (1.05, 1.55, 2.38), "z"),
    ("pump", "hwr", (1.48, 1.55, 2.3), "z"),
    ("check", "hwr", (1.48, 1.55, 1.7), "z"),
]
SLEEVES = [  # through the slab (z) and the left wall (x)
    ("z", (0.4, 2.75, 0.0), 0.045, "vent"),
    ("x", (-WALL / 2, 0.38, 2.95), 0.065, "cw"), ("x", (-WALL / 2, 1.75, 0.7), 0.03, "cw"),
]
HANGERS = [((1.0, 0.38, 2.95), 0.065, "cw"), ((1.75, 0.38, 2.95), 0.065, "cw")]

LABELS = [  # full, short, point, side
    ('3" CW', "CW", (4.05, 0.38, H), "right"),
    ('3" PRV', "PRV", (3.25, 0.38, 1.62), "right"),
    ("EWH-1", "EWH", (1.2, 1.85, 1.25), "right"),
    ("HW", "HW", (1.05, 1.55, H), "left"),
    ("HWR", "HWR", (1.48, 1.55, H), "right"),
    ('2" V', "V", (0.4, 2.75, H), "left"),
    ("FD-1", "FD-1", (2.2, 0.9, 0.62), "right"),
    ('3" FD-5', "FD-5", (2.15, 2.15, 0.0), "right"),
    ("Level 2", "L2", (0.0, Y1, 0.0), "level"),
]


# ----------------------------------------------------------------- timing
def _seglen(a, b):
    return math.dist(a, b)


def _dist_along(pts, q):
    """Distance along a polyline to the point closest to q."""
    best = (1e9, 0.0)
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        L = _seglen(a, b)
        if L == 0:
            continue
        t = max(0.0, min(1.0, sum((q[i] - a[i]) * (b[i] - a[i]) for i in range(3)) / (L * L)))
        p = [a[i] + (b[i] - a[i]) * t for i in range(3)]
        d = math.dist(p, q)
        if d < best[0]:
            best = (d, acc + L * t)
        acc += L
    return best[1]


def _length(pts):
    return sum(_seglen(a, b) for a, b in zip(pts, pts[1:]))


def compute():
    start = {}
    heater_t = None

    def t_of(rid):
        nonlocal heater_t
        if rid in start:
            return start[rid]
        svc, r, pts, s = RUNS[rid]
        if isinstance(s, (int, float)):
            t = float(s)
        elif s == "heater":
            t = heater_end()
        else:
            parent, q = s
            t = t_of(parent) + _dist_along(RUNS[parent][2], q) / SPEED
        start[rid] = t
        return t

    def heater_end():
        nonlocal heater_t
        if heater_t is None:
            hr = RUNS["cw_heater"]
            heater_t = t_of("cw_heater") + _length(hr[2]) / SPEED
        return heater_t + 0.55   # the heater rises in, then hot water leaves it

    for rid in RUNS:
        t_of(rid)
    h_t = heater_t
    valves = []
    for kind, rid, q, axis in VALVES:
        valves.append(dict(kind=kind, at=q, axis=axis, r=RUNS[rid][1],
                           t=round(start[rid] + _dist_along(RUNS[rid][2], q) / SPEED, 3)))
    end_of = lambda rid: start[rid] + _length(RUNS[rid][2]) / SPEED  # noqa: E731
    drains = [dict(at=d["at"], r=d["r"], t=round(end_of(d["run"]), 3)) for d in DRAINS]
    sink_t = end_of(SINK_RUN)
    runs = [dict(id=rid, svc=svc, r=r, pts=pts, t0=round(start[rid], 3), under=rid in UNDER)
            for rid, (svc, r, pts, _) in RUNS.items()]
    end = max(r["t0"] + _length(r["pts"]) / SPEED for r in runs)
    return dict(runs=runs, valves=valves, drains=drains, heater=dict(HEATER, t=round(h_t, 3)),
                expTank=dict(EXP_TANK, t=round(start["cw_exp"] + 0.1, 3)), sink=dict(SINK, t=round(sink_t, 3)),
                introEnd=round(end + 0.25, 3))


# ----------------------------------------------------------------- projection shared with three.js
def view():
    """Fit the scene into the viewBox and return the SVG projection plus the matching 3D camera."""
    pts = [(x, y, z) for x in (-WALL, X1) for y in (-WALL, Y1) for z in (-1.1, H)]
    xs = [(x - y) * COS for x, y, z in pts]
    ys = [(x + y) * 0.5 - z for x, y, z in pts]
    left, right, top, bottom = 74, 30, 48, 26          # room for labels
    s = min((VB_W - left - right) / (max(xs) - min(xs)), (VB_H - top - bottom) / (max(ys) - min(ys)))
    ox = left - min(xs) * s + ((VB_W - left - right) - (max(xs) - min(xs)) * s) / 2
    oy = top - min(ys) * s + ((VB_H - top - bottom) - (max(ys) - min(ys)) * s) / 2
    # 3D target: the scene point that projects to the viewBox centre (picked at z = 1.2)
    tz = 1.2
    d = (VB_W / 2 - ox) / (COS * s)              # x - y
    sm = ((VB_H / 2 - oy) / s + tz) * 2           # x + y
    target = ((sm + d) / 2, (sm - d) / 2, tz)
    half = (VB_H / 2) * math.sqrt(2 / 3) / s      # half-height of the orthographic view, in scene units
    return s, ox, oy, target, half


def scene_js():
    data = compute()
    s, ox, oy, target, half = view()
    data.update(dict(room=dict(x1=X1, y1=Y1, h=H, wall=WALL, slab=SLAB), speed=SPEED,
                     sleeves=[dict(axis=a, at=p, r=r, svc=k) for a, p, r, k in SLEEVES],
                     hangers=[dict(at=p, r=r, svc=k) for p, r, k in HANGERS],
                     labels=[dict(full=f, short=sh, at=p, side=sd) for f, sh, p, sd in LABELS],
                     view=dict(target=[round(v, 4) for v in target], half=round(half, 4))))
    return ("// Generated by build/gen.py from build/hero_scene.py. Edit that file, not this one.\n"
            "export const SCENE = " + json.dumps(data, separators=(",", ":")) + ";\n")


# ----------------------------------------------------------------- SVG
def hero_svg(C, pipe, text, poly, fmt):
    data = compute()
    s, ox, oy, target, half = view()

    def p(x, y, z):
        return (ox + (x - y) * COS * s, oy + (x + y) * 0.5 * s - z * s)

    def width(r):
        return max(2.2, 2 * r * s / math.sqrt(2 / 3) * 0.85)

    col = {k: C[k] for k in ("san", "vent", "cw", "hw", "hwr")}
    out = []
    # 1. below the slab
    for r in data["runs"]:
        if r["under"]:
            out.append(pipe([p(*q) for q in r["pts"]], col[r["svc"]], width(r["r"]), cls="pipe under",
                            delay=r["t0"]))
    # 2. slab and walls
    x0, y0 = -WALL, -WALL
    z0, z1 = SLAB
    top = [p(x0, y0, z1), p(X1, y0, z1), p(X1, Y1, z1), p(x0, Y1, z1)]
    out.append(poly([p(x0, Y1, z1), p(X1, Y1, z1), p(X1, Y1, z0), p(x0, Y1, z0)], "slab-front"))
    out.append(poly([p(X1, y0, z1), p(X1, Y1, z1), p(X1, Y1, z0), p(X1, y0, z0)], "slab-side"))
    out.append(poly(top, "slab-top slab-see"))
    # the stack below the slab is drawn again where it shows under the slab's front edge
    out.append(pipe([p(0.4, 2.75, -1.05), p(0.4, 2.75, -0.37)], col["san"], width(0.065), delay=0))
    out.append(poly([p(0, 0, 0), p(0, Y1, 0), p(0, Y1, H), p(0, 0, H)], "wall-face"))
    out.append(poly([p(0, 0, 0), p(X1, 0, 0), p(X1, 0, H), p(0, 0, H)], "wall-face wall-back"))
    out.append(poly([p(-WALL, -WALL, H), p(0, -WALL, H), p(0, Y1, H), p(-WALL, Y1, H)], "wall-top"))
    out.append(poly([p(-WALL, -WALL, H), p(X1, -WALL, H), p(X1, 0, H), p(0, 0, H)], "wall-top"))
    out.append(poly([p(-WALL, Y1, 0), p(0, Y1, 0), p(0, Y1, H), p(-WALL, Y1, H)], "wall-end"))
    out.append(poly([p(X1, -WALL, 0), p(X1, 0, 0), p(X1, 0, H), p(X1, -WALL, H)], "wall-end"))

    # 3. room contents, back to front (depth = x + y)
    items = []
    for d in data["drains"]:
        (x, y), r = d["at"], d["r"]
        c = p(x, y, 0.005)
        items.append((x + y - 0.5, f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="{r * s * 1.2247:.1f}" '
                                   f'ry="{r * s * 0.7071:.1f}" class="drain pop" style="--d:{d["t"]}s"/>'))
    for r in data["runs"]:
        if r["under"]:
            continue
        pts = r["pts"]
        # split long runs so the painter's order works segment by segment
        for a, b in zip(pts, pts[1:]):
            mid = [(a[i] + b[i]) / 2 for i in range(3)]
            items.append((mid[0] + mid[1], pipe([p(*a), p(*b)], col[r["svc"]], width(r["r"]), delay=r["t0"])))
    # sink
    sk = data["sink"]
    sink_svg = ('<g class="pop" style="--d:%ss">' % sk["t"]
                + poly([p(sk["x0"], sk["y1"], sk["z1"]), p(sk["x1"], sk["y1"], sk["z1"]), p(sk["x1"], sk["y1"], sk["z0"]), p(sk["x0"], sk["y1"], sk["z0"])], "fx fx-front")
                + poly([p(sk["x1"], sk["y0"], sk["z1"]), p(sk["x1"], sk["y1"], sk["z1"]), p(sk["x1"], sk["y1"], sk["z0"]), p(sk["x1"], sk["y0"], sk["z0"])], "fx fx-side")
                + poly([p(sk["x0"], sk["y0"], sk["z1"]), p(sk["x1"], sk["y0"], sk["z1"]), p(sk["x1"], sk["y1"], sk["z1"]), p(sk["x0"], sk["y1"], sk["z1"])], "fx")
                + poly([p(sk["x0"] + .1, sk["y0"] + .1, sk["z1"]), p(sk["x1"] - .1, sk["y0"] + .1, sk["z1"]), p(sk["x1"] - .1, sk["y1"] - .1, sk["z1"]), p(sk["x0"] + .1, sk["y1"] - .1, sk["z1"])], "fx-basin")
                + "</g>")
    items.append(((sk["x0"] + sk["x1"]) / 2 + (sk["y0"] + sk["y1"]) / 2, sink_svg))

    def cyl(c, r, za, zb, cls, t, dome=False):
        cx, cy = c
        rx, ry = r * s * 1.2247, r * s * 0.7071
        a, b = p(cx, cy, zb), p(cx, cy, za)
        g = (f'<g class="pop" style="--d:{t}s">'
             f'<path d="M{a[0]-rx:.1f},{a[1]:.1f} L{b[0]-rx:.1f},{b[1]:.1f} A{rx:.1f},{ry:.1f} 0 0 0 {b[0]+rx:.1f},{b[1]:.1f} '
             f'L{a[0]+rx:.1f},{a[1]:.1f}" class="{cls}"/>')
        if dome:
            g += f'<path d="M{a[0]-rx:.1f},{a[1]:.1f} A{rx:.1f},{rx*0.62:.1f} 0 0 1 {a[0]+rx:.1f},{a[1]:.1f} A{rx:.1f},{ry:.1f} 0 0 1 {a[0]-rx:.1f},{a[1]:.1f}" class="{cls}"/>'
        else:
            g += f'<ellipse cx="{a[0]:.1f}" cy="{a[1]:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" class="{cls}"/>'
        return g + "</g>"

    hz = data["heater"]
    items.append((hz["c"][0] + hz["c"][1] - 0.1, cyl(hz["c"], hz["r"], hz["z0"], hz["z1"], "fx tank", hz["t"], dome=True)))
    et = data["expTank"]
    items.append((et["c"][0] + et["c"][1], cyl(et["c"], et["r"], et["z0"], et["z1"], "fx tank", et["t"], dome=True)))
    for v in data["valves"]:
        x, y, z = v["at"]
        c = p(x, y, z)
        rr = max(3.2, width(v["r"]) * 0.95)
        k = v["kind"]
        if k == "rpz":
            g = f'<rect x="{c[0]-rr*2.4:.1f}" y="{c[1]-rr*1.1:.1f}" width="{rr*4.8:.1f}" height="{rr*2.2:.1f}" rx="{rr:.1f}" class="vlv vlv-rpz" transform="rotate(-30 {c[0]:.1f} {c[1]:.1f})"/>'
        elif k == "prv":
            g = (f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{rr*1.4:.1f}" class="vlv"/>'
                 f'<path d="M{c[0]-rr:.1f},{c[1]-rr*1.2:.1f} L{c[0]-rr*1.6:.1f},{c[1]-rr*3.6:.1f} H{c[0]+rr*1.6:.1f} L{c[0]+rr:.1f},{c[1]-rr*1.2:.1f} Z" class="vlv vlv-bell"/>')
        elif k == "pump":
            g = (f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{rr*1.5:.1f}" class="vlv vlv-pump"/>'
                 f'<rect x="{c[0]+rr*0.6:.1f}" y="{c[1]-rr*0.9:.1f}" width="{rr*3:.1f}" height="{rr*1.8:.1f}" rx="2" class="vlv vlv-pump"/>')
        elif k == "tmv":
            g = f'<rect x="{c[0]-rr*1.3:.1f}" y="{c[1]-rr*1.3:.1f}" width="{rr*2.6:.1f}" height="{rr*2.6:.1f}" rx="2" class="vlv vlv-tmv"/>'
        elif k == "globe":
            g = (f'<line x1="{c[0]:.1f}" y1="{c[1]:.1f}" x2="{c[0]:.1f}" y2="{c[1]-rr*3.2:.1f}" class="vlv-stem"/>'
                 f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{rr*1.25:.1f}" class="vlv"/>'
                 f'<ellipse cx="{c[0]:.1f}" cy="{c[1]-rr*3.2:.1f}" rx="{rr*1.8:.1f}" ry="{rr*0.8:.1f}" class="vlv-wheel"/>')
        else:  # ball, check
            g = f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{rr:.1f}" class="vlv"/>'
        items.append((x + y + 0.05, f'<g class="pop" style="--d:{v["t"]}s">{g}</g>'))
    for ax, q, r, k in SLEEVES:
        a, b = ((q[0], q[1], -0.06), (q[0], q[1], 0.1)) if ax == "z" else ((-WALL - 0.03, q[1], q[2]), (0.06, q[1], q[2]))
        items.append((q[0] + q[1] - 0.02, f'<path d="M{fmt(p(*a))} L{fmt(p(*b))}" class="sleeve" style="stroke-width:{width(r) + 4:.1f}"/>'))
    items.sort(key=lambda it: it[0])
    out += [svg for _, svg in items]

    # 4. labels
    for full, short, q, side in LABELS:
        a = p(*q)
        if side == "level":
            out.append(f'<path d="M{a[0]-8:.1f},{a[1]:.1f} H18" class="level-line"/>')
            out.append(text(18, a[1] - 7, full, "lbl lbl-level"))
        elif side == "left":
            out.append(f'<path d="M{fmt(a)} l-10,-8 h-6" class="leader"/>')
            out.append(text(a[0] - 19, a[1] - 4, full, "lbl lbl-pipe", "end"))
        else:
            out.append(f'<path d="M{fmt(a)} l10,-8 h6" class="leader"/>')
            out.append(text(a[0] + 19, a[1] - 4, full, "lbl lbl-pipe"))

    body = "\n".join(out)
    return (
        f'<svg class="riser" viewBox="0 0 {VB_W} {VB_H}" role="img" aria-labelledby="riser-t riser-d" '
        'xmlns="http://www.w3.org/2000/svg">'
        '<title id="riser-t">Isometric view of a water heater room</title>'
        '<desc id="riser-d">A residential water heater room: a 3 inch cold water main enters through the wall and '
        'drops to a pressure reducing valve station, a 1 inch branch feeds the electric water heater, hot water '
        'leaves through a mixing valve with a recirculating return and pump, an irrigation line runs through a '
        'backflow preventer, and a mop sink and two floor drains connect to sanitary piping below the slab.</desc>'
        f"{body}</svg>"
    )
