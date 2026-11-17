#!/usr/bin/env python3
"""
Scans the ./media directory for images and videos, extracts chronological dates
(from EXIF DateTimeOriginal, filename date patterns, or file modification time),
sorts oldest-to-newest, assigns each item its plaque word in order, renames files
with `_<Word>` as a suffix, and writes ./media/manifest.json.
"""

from __future__ import annotations

import json
import re
import struct
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
MEDIA_DIR = ROOT_DIR / "media"
MANIFEST_PATH = MEDIA_DIR / "manifest.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
SUPPORTED_EXTS = IMAGE_EXTS | VIDEO_EXTS

PLAQUE_WORDS = [
    "Beautiful",
    "Gorgeous",
    "Radiant",
    "Ethereal",
    "Mesmerising",
    "Charming",
    "Elegant",
    "Adorable",
    "Angelic",
    "Alluring",
    "Captivating",
    "Stunning",
    "Graceful",
    "Dazzling",
    "Enchanting",
    "Kind",
    "Caring",
    "Compassionate",
    "Thoughtful",
    "Genuine",
    "Selfless",
    "Empathetic",
    "Gentle",
    "Patient",
    "Understanding",
    "Warmhearted",
    "Nurturing",
    "Considerate",
    "Sincere",
    "Pure-hearted",
    "Intelligent",
    "Witty",
    "Funny",
    "Spontaneous",
    "Quirky",
    "Playful",
    "Goofy",
    "Adventurous",
    "Ambitious",
    "Creative",
    "Curious",
    "Passionate",
    "Confident",
    "Independent",
    "Fearless",
    "Resilient",
    "Determined",
    "Inspiring",
    "Charismatic",
    "Magnetic",
    "Effortless",
    "Unforgettable",
    "Irreplaceable",
    "Precious",
    "Special",
    "Wonderful",
    "Extraordinary",
    "Remarkable",
    "Magical",
    "Dreamy",
    "Sweet",
    "Lovable",
    "Comforting",
    "Reassuring",
    "Supportive",
    "Affectionate",
    "Trustworthy",
    "Authentic",
    "Irresistible",
    "Incomparable",
]

WORDS_SET = {w.lower() for w in PLAQUE_WORDS}


def read_jpeg_exif_date(filepath: Path) -> str | None:
    """Minimal pure-Python JPEG EXIF DateTimeOriginal (0x9003) / DateTime (0x0132) reader."""
    try:
        with open(filepath, "rb") as f:
            data = f.read(131072)
        if not data.startswith(b"\xff\xd8"):
            return None

        idx = 2
        while idx + 4 < len(data):
            if data[idx] != 0xFF:
                break
            marker = data[idx + 1]
            if marker == 0xDA:
                break
            if marker in (0xD8, 0xD9, 0x01) or (0xD0 <= marker <= 0xD7):
                idx += 2
                continue
            seg_len = struct.unpack(">H", data[idx + 2 : idx + 4])[0]
            if marker == 0xE1 and data[idx + 4 : idx + 10] == b"Exif\x00\x00":
                tiff = data[idx + 10 : idx + 2 + seg_len]
                return _parse_tiff_date(tiff)
            idx += 2 + seg_len
    except Exception:
        return None
    return None


def _parse_tiff_date(tiff: bytes) -> str | None:
    if len(tiff) < 8:
        return None
    endian = "<" if tiff[:2] == b"II" else ">" if tiff[:2] == b"MM" else None
    if not endian:
        return None
    ifd_offset = struct.unpack(endian + "I", tiff[4:8])[0]

    def read_ifd(offset: int):
        if offset + 2 > len(tiff):
            return {}
        count = struct.unpack(endian + "H", tiff[offset : offset + 2])[0]
        tags = {}
        for i in range(count):
            entry = offset + 2 + i * 12
            if entry + 12 > len(tiff):
                break
            tag, typ, cnt, val_off = struct.unpack(endian + "HHII", tiff[entry : entry + 12])
            tags[tag] = (typ, cnt, val_off, entry + 8)
        return tags

    def read_ascii(entry_tuple) -> str | None:
        typ, cnt, val_off, inline_off = entry_tuple
        if typ != 2 or cnt == 0:
            return None
        start = inline_off if cnt <= 4 else val_off
        if start + cnt > len(tiff):
            return None
        raw = tiff[start : start + cnt].split(b"\x00", 1)[0].decode("ascii", errors="ignore").strip()
        return raw or None

    ifd0 = read_ifd(ifd_offset)
    exif_date = None
    if 0x8769 in ifd0:
        exif_ifd = read_ifd(ifd0[0x8769][2])
        if 0x9003 in exif_ifd:
            exif_date = read_ascii(exif_ifd[0x9003])
        elif 0x9004 in exif_ifd:
            exif_date = read_ascii(exif_ifd[0x9004])
    if not exif_date and 0x0132 in ifd0:
        exif_date = read_ascii(ifd0[0x0132])

    if exif_date:
        m = re.match(r"(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?", exif_date)
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3)
            hh, mm, ss = m.group(4) or "00", m.group(5) or "00", m.group(6) or "00"
            return f"{y}-{mo}-{d}T{hh}:{mm}:{ss}"
    return None


def parse_date_from_filename(name: str) -> str | None:
    m = re.search(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})(?:[-_T]?(\d{2})(\d{2})(\d{2}))?", name)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            hh = m.group(4) or "12"
            mm = m.group(5) or "00"
            ss = m.group(6) or "00"
            return f"{y:04d}-{mo:02d}-{d:02d}T{hh}:{mm}:{ss}"
    return None


def strip_word_suffix(stem: str) -> str:
    if "_" in stem:
        base, maybe_word = stem.rsplit("_", 1)
        if maybe_word.lower() in WORDS_SET:
            return base
    return stem


def main():
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    existing = {}
    if MANIFEST_PATH.exists():
        try:
            old_data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            for item in old_data.get("items", []):
                if "file" in item:
                    existing[item["file"]] = item
        except Exception:
            pass

    raw_entries = []
    for entry in sorted(MEDIA_DIR.iterdir()):
        if not entry.is_file():
            continue
        ext = entry.suffix.lower()
        if ext not in SUPPORTED_EXTS:
            continue

        rel_file = entry.name
        prev = existing.get(rel_file, {})
        media_type = "video" if ext in VIDEO_EXTS else "image"

        detected_date = None
        if ext in {".jpg", ".jpeg"}:
            detected_date = read_jpeg_exif_date(entry)
        if not detected_date:
            detected_date = parse_date_from_filename(rel_file)
        if not detected_date:
            mtime = datetime.fromtimestamp(entry.stat().st_mtime)
            detected_date = mtime.strftime("%Y-%m-%dT%H:%M:%S")

        iso_date = prev.get("date") or detected_date
        raw_entries.append((iso_date, rel_file, entry, media_type, prev))

    # Sort chronologically oldest-to-newest
    raw_entries.sort(key=lambda x: (x[0], x[1]))

    items = []
    for idx, (iso_date, rel_file, entry, media_type, prev) in enumerate(raw_entries):
        plaque = PLAQUE_WORDS[idx % len(PLAQUE_WORDS)]
        base_stem = strip_word_suffix(entry.stem)
        target_name = f"{base_stem}_{plaque}{entry.suffix}"
        target_path = MEDIA_DIR / target_name

        if entry.name != target_name:
            if not target_path.exists():
                entry.rename(target_path)
            else:
                target_name = entry.name

        items.append(
            {
                "file": target_name,
                "type": media_type,
                "date": iso_date,
                "plaque": plaque,
                "title": plaque,
                "caption": prev.get("caption", ""),
            }
        )

    manifest = {
        "museumTitle": "Our 10-Month Museum",
        "subtitle": "Ten months of moments, memories & milestones",
        "generatedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "items": items,
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {MANIFEST_PATH} with {len(items)} item(s).")


if __name__ == "__main__":
    main()
