from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageFilter


def is_background(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return min(pixel) >= 226 and max(pixel) - min(pixel) <= 12


def extract(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = image.size
    pixels = rgb.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        offset = y * width + x
        if visited[offset] or not is_background(pixels[x, y]):
            continue
        visited[offset] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    foreground = Image.new("L", (width, height), 255)
    foreground_pixels = foreground.load()
    for y in range(height):
        for x in range(width):
            if visited[y * width + x]:
                foreground_pixels[x, y] = 0

    softened = foreground.filter(ImageFilter.GaussianBlur(0.65))
    image.putalpha(softened)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_checker_transparency.py SOURCE DESTINATION")
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
