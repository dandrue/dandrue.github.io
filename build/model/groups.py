import json, numpy as np, collections, re
meta = json.load(open("meta.json")); M = np.load("meshes.npz")
def klass(e):
    s = e["service"] or ""; c = e["cat"] or ""
    if c == "Insulation": return "ins"
    if c in ("Plumbing Fixtures", "Mechanical Equipment", "Plumbing Equipment", "Pipe Fittings") and not s.startswith("Plumbing:"):
        return "fix"
    m = {"Domestic Cold Water": "cw", "Domestic Hot Water": "hw", "Sanitary Waste - BG": "san_bg", "Sanitary Waste - AG": "san_ag",
         "Sanitary Vent - AG": "vent_ag", "Sanitary Vent - BG": "vent_bg", "Storm Drain - BG": "sd"}
    for k, v in m.items():
        if k in s: return v
    return "other"
def load(k): return M[f"v{k}"], M[f"t{k}"]
