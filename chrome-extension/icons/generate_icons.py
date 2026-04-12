"""Generate graduation cap icons with indigo/violet gradient for the Chrome extension."""
import struct, zlib, math

def make_png(size: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    rows = []
    cx, cy = size / 2, size / 2
    r = size / 2

    for y in range(size):
        row = bytearray([0])  # filter type
        for x in range(size):
            nx = (x - cx) / r
            ny = (y - cy) / r

            # Gradient: indigo (#6366f1) top-left → violet (#8b5cf6) bottom-right
            t = (nx + ny + 2) / 4  # 0..1
            ri = int(0x63 + t * (0x8b - 0x63))
            gi = int(0x66 + t * (0x5c - 0x66))
            bi = int(0xf1 + t * (0xf6 - 0xf1))

            # Circular mask with soft edge
            dist = math.sqrt(nx*nx + ny*ny)
            if dist > 1.0:
                alpha = 0
            elif dist > 0.85:
                alpha = int(255 * (1.0 - dist) / 0.15)
            else:
                alpha = 255

            # Draw graduation cap shape
            in_shape = False
            px, py = x / size, y / size  # normalized 0..1

            # Board (flat top): rect from 0.15 to 0.85 wide, 0.30 to 0.50 tall
            if 0.12 <= px <= 0.88 and 0.28 <= py <= 0.48:
                in_shape = True

            # Cap body (trapezoid): wider at top
            cap_w_top = 0.72
            cap_w_bot = 0.40
            cap_top = 0.48
            cap_bot = 0.70
            if cap_top <= py <= cap_bot:
                progress = (py - cap_top) / (cap_bot - cap_top)
                half_w = (cap_w_top + (cap_w_bot - cap_w_top) * progress) / 2
                if 0.5 - half_w <= px <= 0.5 + half_w:
                    in_shape = True

            # Tassel string: thin vertical line on right
            if 0.72 <= px <= 0.76 and 0.38 <= py <= 0.72:
                in_shape = True
            # Tassel ball
            tx, ty = 0.74, 0.76
            if math.sqrt((px - tx)**2 + (py - ty)**2) < 0.06:
                in_shape = True

            if not in_shape:
                # Background: very dark with slight gradient
                row += bytearray([0x0f, 0x11, 0x17, alpha])
            else:
                row += bytearray([ri, gi, bi, alpha])

        rows.append(bytes(row))

    raw = b''.join(rows)
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr_data)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )

for size in [16, 48, 128]:
    data = make_png(size)
    with open(f'icon{size}.png', 'wb') as f:
        f.write(data)
    print(f'Generated icon{size}.png ({len(data)} bytes)')

print('Done!')
