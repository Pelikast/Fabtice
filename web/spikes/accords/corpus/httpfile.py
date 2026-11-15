"""A read-only file over HTTP range requests, so that pyarrow can read a few
columns of a remote Parquet file without downloading all of it."""

import io
import time
import urllib.request


class HttpFile(io.RawIOBase):
    def __init__(self, url, size=None, block=1 << 20):
        self.url = url
        self.pos = 0
        self.block = block
        self.cache = {}
        self.fetched = 0
        if size is None:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req) as r:
                size = int(r.headers["Content-Length"])
        self.size = size

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        if whence == 0:
            self.pos = off
        elif whence == 1:
            self.pos += off
        else:
            self.pos = self.size + off
        return self.pos

    def _range(self, a, b):
        for attempt in range(5):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={a}-{b - 1}"})
                with urllib.request.urlopen(req) as r:
                    data = r.read()
                if len(data) != b - a:
                    raise IOError("short read")
                self.fetched += len(data)
                return data
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        if n == 0:
            return b""
        a, b = self.pos, self.pos + n
        if n > 4 * self.block:
            data = self._range(a, b)
        else:
            parts = []
            for blk in range(a // self.block, (b - 1) // self.block + 1):
                if blk not in self.cache:
                    s = blk * self.block
                    self.cache[blk] = self._range(s, min(self.size, s + self.block))
                    if len(self.cache) > 64:
                        self.cache.pop(next(iter(self.cache)))
                parts.append(self.cache[blk])
            buf = b"".join(parts)
            off = a - (a // self.block) * self.block
            data = buf[off:off + n]
        self.pos = b
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)
