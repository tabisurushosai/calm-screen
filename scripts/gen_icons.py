#!/usr/bin/env python3
"""Generate calm-screen icons (16, 48, 128 px) using stdlib only.

Design: a soft rounded square with a gentle teal-to-warm gradient and a
center "calm" circle, evoking eased visual contrast.
"""
import os
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 48, 128)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def render(size: int) -> bytes:
    bg_tl = (180, 218, 214)
    bg_br = (230, 222, 200)
    fg_in = (255, 250, 240)
    fg_out = (130, 175, 170)
    ring = (90, 130, 130)

    radius_corner = size * 0.22
    cx = cy = (size - 1) / 2.0
    inner_r = size * 0.30
    ring_r = size * 0.36

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            br = int(lerp(bg_tl[0], bg_br[0], t))
            bg = int(lerp(bg_tl[1], bg_br[1], t))
            bb = int(lerp(bg_tl[2], bg_br[2], t))
            a = 255

            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            corner_a = rounded_alpha(x, y, size, radius_corner)
            a = int(a * corner_a)

            r_pix, g_pix, b_pix = br, bg, bb

            ring_edge = 1.0 - smoothstep(ring_r - 1.2, ring_r + 0.4, dist)
            inner_edge = 1.0 - smoothstep(inner_r - 1.2, inner_r + 0.4, dist)
            ring_alpha = ring_edge * (1.0 - inner_edge)
            if ring_alpha > 0:
                r_pix = int(lerp(r_pix, ring[0], ring_alpha * 0.9))
                g_pix = int(lerp(g_pix, ring[1], ring_alpha * 0.9))
                b_pix = int(lerp(b_pix, ring[2], ring_alpha * 0.9))

            if inner_edge > 0:
                tt = min(1.0, dist / max(1.0, inner_r))
                fr = int(lerp(fg_in[0], fg_out[0], tt))
                fg = int(lerp(fg_in[1], fg_out[1], tt))
                fb = int(lerp(fg_in[2], fg_out[2], tt))
                r_pix = int(lerp(r_pix, fr, inner_edge))
                g_pix = int(lerp(g_pix, fg, inner_edge))
                b_pix = int(lerp(b_pix, fb, inner_edge))

            raw.append(max(0, min(255, r_pix)))
            raw.append(max(0, min(255, g_pix)))
            raw.append(max(0, min(255, b_pix)))
            raw.append(max(0, min(255, a)))
    return bytes(raw)


def rounded_alpha(x: int, y: int, size: int, r: float) -> float:
    if r <= 0:
        return 1.0
    px = x + 0.5
    py = y + 0.5
    rx = ry = -1.0
    if px < r:
        rx = r - px
    elif px > size - r:
        rx = px - (size - r)
    if py < r:
        ry = r - py
    elif py > size - r:
        ry = py - (size - r)
    if rx < 0 or ry < 0:
        return 1.0
    d = (rx * rx + ry * ry) ** 0.5
    return 1.0 - smoothstep(r - 1.0, r + 0.2, d)


def write_png(path: Path, size: int, raw: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    path.write_bytes(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        raw = render(size)
        out = OUT_DIR / f"icon{size}.png"
        write_png(out, size, raw)
        print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
