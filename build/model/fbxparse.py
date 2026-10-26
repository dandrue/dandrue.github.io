"""Minimal binary FBX (7.x) reader: returns a tree of (name, props, children)."""
import struct, zlib
import numpy as np

ARR = {b'f': ('<f4', 4), b'd': ('<f8', 8), b'l': ('<i8', 8), b'i': ('<i4', 4), b'b': ('<u1', 1)}

class Node:
    __slots__ = ("name", "props", "children")
    def __init__(self, name, props, children):
        self.name, self.props, self.children = name, props, children
    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
    def findall(self, name):
        return [c for c in self.children if c.name == name]
    def __repr__(self):
        return f"Node({self.name}, {len(self.props)} props, {len(self.children)} children)"

def read(path):
    data = open(path, 'rb').read()
    assert data[:20] == b'Kaydara FBX Binary  '
    ver = struct.unpack_from('<I', data, 23)[0]
    wide = ver >= 7500
    hdr = 25 if wide else 13

    def prop(o):
        t = data[o:o+1]; o += 1
        if t == b'Y': return struct.unpack_from('<h', data, o)[0], o + 2
        if t == b'C': return data[o] != 0, o + 1
        if t == b'I': return struct.unpack_from('<i', data, o)[0], o + 4
        if t == b'F': return struct.unpack_from('<f', data, o)[0], o + 4
        if t == b'D': return struct.unpack_from('<d', data, o)[0], o + 8
        if t == b'L': return struct.unpack_from('<q', data, o)[0], o + 8
        if t in (b'S', b'R'):
            n = struct.unpack_from('<I', data, o)[0]; o += 4
            v = data[o:o+n]
            return (v.decode('utf-8', 'replace') if t == b'S' else v), o + n
        if t in ARR:
            n, enc, clen = struct.unpack_from('<III', data, o); o += 12
            raw = data[o:o+clen]; o += clen
            if enc == 1: raw = zlib.decompress(raw)
            dt, _ = ARR[t]
            return np.frombuffer(raw, dtype=dt, count=n), o
        raise ValueError(f"bad prop type {t!r} at {o}")

    def node(o):
        if wide:
            end, nprops, plen = struct.unpack_from('<QQQ', data, o); o += 24
        else:
            end, nprops, plen = struct.unpack_from('<III', data, o); o += 12
        if end == 0:
            return None, o
        nl = data[o]; o += 1
        name = data[o:o+nl].decode('ascii', 'replace'); o += nl
        props = []
        for _ in range(nprops):
            v, o = prop(o); props.append(v)
        children = []
        while o < end - hdr if end - o >= hdr else False:
            c, o = node(o)
            if c is None: break
            children.append(c)
        return Node(name, props, children), end

    o = 27; top = []
    while o < len(data) - hdr:
        n, o2 = node(o)
        if n is None: break
        top.append(n); o = o2
    return ver, Node("root", [], top)
