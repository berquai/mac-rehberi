"""Uygulama ikonlarını (PNG) saf Python ile üretir. Bir kez çalıştırmak yeterli."""
import struct
import zlib
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
BG, FG, BALL = (15, 23, 42), (255, 255, 255), (250, 204, 21)


def pixel(x: float, y: float) -> tuple:
    # 512'lik koordinat sisteminde (icon.svg ile aynı tasarım)
    # ekran çerçevesi
    in_outer = 82 <= x <= 430 and 122 <= y <= 370
    in_inner = 110 <= x <= 402 and 150 <= y <= 342
    if in_outer and not in_inner:
        return FG
    # ayak
    if 206 <= x <= 306 and 378 <= y <= 406:
        return FG
    # top
    dx, dy = x - 256, y - 246
    if dx * dx + dy * dy <= 58 * 58:
        if abs(dx) <= 5 or abs(dy) <= 5:
            return BG
        return BALL
    return BG


def png(size: int, path: Path) -> None:
    s = 512 / size
    rows = bytearray()
    for j in range(size):
        rows.append(0)
        for i in range(size):
            rows.extend(pixel((i + 0.5) * s, (j + 0.5) * s))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)


for n in (180, 192, 512):
    png(n, DOCS / f"icon-{n}.png")
print("ikonlar yazıldı")
