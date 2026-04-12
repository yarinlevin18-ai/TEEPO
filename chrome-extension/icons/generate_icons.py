"""Run this once to generate placeholder icons."""
import struct, zlib, base64

def make_png(size, color=(99, 102, 241)):
    """Generate a solid-color PNG."""
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    raw = b''
    for _ in range(size):
        row = b'\x00' + bytes(color) * size
        raw += row
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend

for size in [16, 48, 128]:
    with open(f'icon{size}.png', 'wb') as f:
        f.write(make_png(size))
    print(f'Created icon{size}.png')
