"""Rasterize Tabler SVG path data into an antialiased library line-art PNG."""
from __future__ import annotations

import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

ICON_DIR = Path(r"C:/Users/HOANGDV/tools/lineart-lib/tabler/package/icons/outline")
SCALE = 3
TOKEN = re.compile(r"[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")


def path_lines(data: str) -> list[list[tuple[float, float]]]:
    tokens = TOKEN.findall(data)
    lines: list[list[tuple[float, float]]] = []
    line: list[tuple[float, float]] = []
    i, command = 0, ""
    x = y = sx = sy = 0.0
    last_c = last_q = None

    def number() -> float:
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    def pair(relative: bool) -> tuple[float, float]:
        px, py = number(), number()
        return (x + px, y + py) if relative else (px, py)

    def append(px: float, py: float) -> None:
        nonlocal x, y
        x, y = px, py
        if not line or abs(line[-1][0] - x) + abs(line[-1][1] - y) > 1e-7:
            line.append((x, y))

    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
        if not command:
            break
        relative = command.islower()
        op = command.upper()
        if op == "Z":
            if line:
                append(sx, sy)
                lines.append(line)
                line = []
            x, y = sx, sy
            last_c = last_q = None
            command = ""
            continue
        if op == "M":
            if line:
                lines.append(line)
            px, py = pair(relative)
            x, y = sx, sy = px, py
            line = [(x, y)]
            command = "l" if relative else "L"
            last_c = last_q = None
        elif op == "L":
            append(*pair(relative))
            last_c = last_q = None
        elif op == "H":
            v = number()
            append(x + v if relative else v, y)
            last_c = last_q = None
        elif op == "V":
            v = number()
            append(x, y + v if relative else v)
            last_c = last_q = None
        elif op in ("C", "S"):
            if op == "C":
                p1, p2, p3 = pair(relative), pair(relative), pair(relative)
            else:
                p1 = (2 * x - last_c[0], 2 * y - last_c[1]) if last_c else (x, y)
                p2, p3 = pair(relative), pair(relative)
            x0, y0 = x, y
            for step in range(1, 13):
                t = step / 12
                u = 1 - t
                append(u**3*x0 + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0], u**3*y0 + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])
            last_c, last_q = p2, None
        elif op in ("Q", "T"):
            if op == "Q":
                p1, p2 = pair(relative), pair(relative)
            else:
                p1 = (2 * x - last_q[0], 2 * y - last_q[1]) if last_q else (x, y)
                p2 = pair(relative)
            x0, y0 = x, y
            for step in range(1, 11):
                t = step / 10
                u = 1 - t
                append(u*u*x0 + 2*u*t*p1[0] + t*t*p2[0], u*u*y0 + 2*u*t*p1[1] + t*t*p2[1])
            last_q, last_c = p1, None
        elif op == "A":
            rx, ry, rotation, large, sweep = number(), number(), number(), number(), number()
            ex, ey = pair(relative)
            x0, y0 = x, y
            # Smoothly approximate the elliptical arc. The arc-to-center form
            # also handles radii that SVG requires to be expanded.
            rx, ry = abs(rx), abs(ry)
            if rx < 1e-7 or ry < 1e-7 or (x0 == ex and y0 == ey):
                append(ex, ey)
            else:
                phi = math.radians(rotation % 360)
                cp, sp = math.cos(phi), math.sin(phi)
                dx, dy = (x0-ex)/2, (y0-ey)/2
                xp, yp = cp*dx + sp*dy, -sp*dx + cp*dy
                lam = xp*xp/(rx*rx) + yp*yp/(ry*ry)
                if lam > 1:
                    factor = math.sqrt(lam)
                    rx, ry = rx*factor, ry*factor
                num = max(0.0, rx*rx*ry*ry - rx*rx*yp*yp - ry*ry*xp*xp)
                den = max(1e-12, rx*rx*yp*yp + ry*ry*xp*xp)
                sign = -1 if bool(large) == bool(sweep) else 1
                factor = sign * math.sqrt(num / den)
                cxp, cyp = factor*rx*yp/ry, factor*-ry*xp/rx
                cx, cy = cp*cxp - sp*cyp + (x0+ex)/2, sp*cxp + cp*cyp + (y0+ey)/2
                a0 = math.atan2((yp-cyp)/ry, (xp-cxp)/rx)
                da = math.atan2((-yp-cyp)/ry, (-xp-cxp)/rx) - a0
                if not sweep and da > 0:
                    da -= 2*math.pi
                if sweep and da < 0:
                    da += 2*math.pi
                count = max(5, math.ceil(abs(da)*max(rx, ry)/1.5))
                for step in range(1, count+1):
                    theta = a0 + da*step/count
                    append(cx + cp*rx*math.cos(theta) - sp*ry*math.sin(theta), cy + sp*rx*math.cos(theta) + cp*ry*math.sin(theta))
            last_c = last_q = None
        else:
            break
    if line:
        lines.append(line)
    return lines


def draw_icon(draw: ImageDraw.ImageDraw, name: str, x: int, y: int, size: int) -> None:
    root = ET.parse(ICON_DIR / f"{name}.svg").getroot()
    scale = size / 24 * SCALE
    origin_x, origin_y = x * SCALE, y * SCALE
    width = max(2, round(1.6 * scale))
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] != "path":
            continue
        if element.attrib.get("stroke") == "none":
            continue
        for points in path_lines(element.attrib.get("d", "")):
            if sum(math.dist(a, b) for a, b in zip(points, points[1:])) < 0.1:
                continue
            mapped = [(origin_x + round(px*scale), origin_y + round(py*scale)) for px, py in points]
            if len(mapped) >= 2:
                draw.line(mapped, fill="#2B2B33", width=width, joint="curve")
                radius = width // 2
                for px, py in (mapped[0], mapped[-1]):
                    draw.ellipse((px-radius, py-radius, px+radius, py+radius), fill="#2B2B33")


def main() -> None:
    request = json.load(sys.stdin)
    image = Image.new("RGB", (1080*SCALE, 1920*SCALE), "#F5EBD7")
    draw = ImageDraw.Draw(image)
    for icon in request["icons"]:
        draw_icon(draw, icon["name"], icon["x"], icon["y"], icon["size"])
    image.resize((1080, 1920), Image.Resampling.LANCZOS).save(request["output"], format="PNG")


if __name__ == "__main__":
    main()
