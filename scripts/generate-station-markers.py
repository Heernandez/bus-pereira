#!/usr/bin/env python3
"""Generates the station marker icons in assets/markers (1x, 2x, 3x).

Pure Python (no Pillow). Shapes are painted in order with 4x4 supersampling.
Run from the project root: python3 scripts/generate-station-markers.py
"""
import os
import struct
import zlib

BLUE = (31, 111, 235, 255)
WHITE = (255, 255, 255, 255)
YELLOW = (250, 204, 21, 255)
DARK = (41, 41, 35, 255)
SHADOW = (15, 23, 42, 46)
SAMPLES = 4


def circle(cx, cy, r):
    return lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def rounded_rect(cx, cy, w, h, r):
    def inside(x, y):
        dx = max(abs(x - cx) - (w / 2 - r), 0)
        dy = max(abs(y - cy) - (h / 2 - r), 0)
        return abs(x - cx) <= w / 2 and abs(y - cy) <= h / 2 and dx * dx + dy * dy <= r * r
    return inside


def bus(scale, body, cutout):
    """Front view of a bus, centered on the origin; about 10 x 12.4 dp at scale 1."""
    s = scale
    return [
        (rounded_rect(-3 * s, 5.2 * s, 2 * s, 2 * s, 0.6 * s), body),  # wheels
        (rounded_rect(3 * s, 5.2 * s, 2 * s, 2 * s, 0.6 * s), body),
        (rounded_rect(0, -0.7 * s, 10 * s, 11 * s, 2.2 * s), body),  # body
        (rounded_rect(0, -2.7 * s, 7.6 * s, 4.4 * s, 1 * s), cutout),  # windshield
        (circle(-2.8 * s, 1.9 * s, 0.9 * s), cutout),  # headlights
        (circle(2.8 * s, 1.9 * s, 0.9 * s), cutout),
    ]


def badge(radius, fill, glyph, glyph_scale):
    return [
        (circle(0, 0, radius + 0.75), SHADOW),
        (circle(0, 0, radius), WHITE),
        (circle(0, 0, radius - 1.5), fill),
        *bus(glyph_scale, glyph, fill),
    ]


# name: (canvas size in dp, shapes painted in order, coordinates in dp from the center)
MARKERS = {
    # City view: the smallest badge that still shows the bus.
    'station-far': (16, badge(7, BLUE, WHITE, 0.48)),
    # Neighborhood zoom: bus stop badge.
    'station-mid': (20, badge(9, BLUE, WHITE, 0.6)),
    # Street zoom: larger badge.
    'station-near': (28, badge(13, BLUE, WHITE, 0.9)),
    # Selected station, matching the route stop highlight.
    'station-selected': (34, badge(16, YELLOW, DARK, 1.1)),
}


def render(size_dp, shapes, scale):
    size = size_dp * scale
    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter type: none
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    px = (x + (sx + 0.5) / SAMPLES) / scale - size_dp / 2
                    py = (y + (sy + 0.5) / SAMPLES) / scale - size_dp / 2
                    # Painter's algorithm with "over" compositing, in premultiplied alpha.
                    sr = sg = sb = sa = 0.0
                    for inside, color in shapes:
                        if inside(px, py):
                            alpha = color[3] / 255
                            sr = color[0] * alpha + sr * (1 - alpha)
                            sg = color[1] * alpha + sg * (1 - alpha)
                            sb = color[2] * alpha + sb * (1 - alpha)
                            sa = alpha + sa * (1 - alpha)
                    r += sr; g += sg; b += sb; a += sa
            if a:
                row += bytes([round(r / a), round(g / a), round(b / a), round(a / SAMPLES ** 2 * 255)])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return size, b''.join(rows)


def png(size, raw):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'markers')
    os.makedirs(out, exist_ok=True)
    for name, (size_dp, shapes) in MARKERS.items():
        for scale in (1, 2, 3):
            suffix = '' if scale == 1 else f'@{scale}x'
            size, raw = render(size_dp, shapes, scale)
            with open(os.path.join(out, f'{name}{suffix}.png'), 'wb') as file:
                file.write(png(size, raw))
    print(f'Iconos generados en {os.path.normpath(out)}')


if __name__ == '__main__':
    main()
