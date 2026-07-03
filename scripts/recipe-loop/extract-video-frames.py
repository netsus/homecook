#!/usr/bin/env python3
"""Recipe-loop frame extractor.

Inputs a YouTube URL or local video and writes:
- frames.json
- extraction_stats.json
- frames/*.jpg

This helper intentionally does not call any model and never reads golden.json.
"""

from __future__ import annotations

import argparse
from email import policy
from email.parser import BytesParser
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


SCENE_DETAIL_PRESETS = {
    "normal": {
        "scene_threshold": 0.35,
        "min_scene_gap": 2.0,
        "scene_scan_interval": 1.0,
    },
    "dense": {
        "scene_threshold": 0.25,
        "min_scene_gap": 0.75,
        "scene_scan_interval": 0.5,
    },
    "exhaustive": {
        "scene_threshold": 0.18,
        "min_scene_gap": 0.25,
        "scene_scan_interval": 0.25,
    },
}


@dataclass
class FrameInfo:
    index: int
    timestamp_sec: float
    timestamp: str
    path: str
    reason: str
    scene_score: float | None = None


@dataclass(frozen=True)
class SceneCandidate:
    timestamp_sec: float
    timestamp: str
    reason: str
    scene_score: float | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract recipe-loop video frames.")
    parser.add_argument("source", help="YouTube URL or local video path")
    parser.add_argument("--video-id", default="unknown")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--mode", choices=["scene", "interval"], default="scene")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--scene-detail", choices=["normal", "dense", "exhaustive"], default="dense")
    parser.add_argument("--scene-threshold", type=float, default=None)
    parser.add_argument("--min-scene-gap", type=float, default=None)
    parser.add_argument("--scene-scan-interval", type=float, default=None)
    parser.add_argument("--scene-selection", choices=["balanced", "first"], default="balanced")
    parser.add_argument("--max-frames", type=int, default=80)
    parser.add_argument("--storyboard-max-frames", type=int, default=None)
    parser.add_argument("--video-format", default="mp4")
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"[FAIL] {message}", file=sys.stderr)
    raise SystemExit(1)


def load_cv2():
    try:
        import cv2  # type: ignore
    except ImportError as exc:
        fail("opencv-python이 설치되어 있지 않습니다. `python3 -m pip install -U opencv-python`을 실행하세요.")
        raise exc
    return cv2


def is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def apply_scene_preset(args: argparse.Namespace) -> argparse.Namespace:
    preset = SCENE_DETAIL_PRESETS[args.scene_detail]
    if args.scene_threshold is None:
        args.scene_threshold = preset["scene_threshold"]
    if args.min_scene_gap is None:
        args.min_scene_gap = preset["min_scene_gap"]
    if args.scene_scan_interval is None:
        args.scene_scan_interval = preset["scene_scan_interval"]
    return args


def download_video(source: str, out_dir: Path, video_format: str) -> Path | None:
    if not is_url(source):
        local = Path(source).expanduser().resolve()
        if not local.exists():
            fail(f"로컬 영상 파일이 없습니다: {local}")
        target = out_dir / f"source{local.suffix or '.mp4'}"
        if local != target:
            shutil.copy2(local, target)
        return target

    has_ffmpeg = shutil.which("ffmpeg") is not None
    requested_format = (
        f"bv*[ext={video_format}]+ba/b[ext={video_format}]/b"
        if has_ffmpeg
        else f"b[ext={video_format}]/best[ext={video_format}]/best"
    )
    output_template = str(out_dir / "source.%(ext)s")
    yt_dlp_cli = shutil.which("yt-dlp")
    if yt_dlp_cli:
        command = [
            yt_dlp_cli,
            "--no-playlist",
            "--force-overwrites",
            "-f",
            requested_format,
            "--merge-output-format",
            video_format,
            "-o",
            output_template,
            source,
        ]
        (out_dir / "yt-dlp-command.json").write_text(
            json.dumps({"command": command, "driver": "cli"}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        result = subprocess.run(command, cwd=out_dir, text=True, capture_output=True, check=False)
        (out_dir / "yt-dlp.log").write_text(
            f"exit_code={result.returncode}\n\n[stdout]\n{result.stdout}\n\n[stderr]\n{result.stderr}\n",
            encoding="utf-8",
        )
        if result.returncode != 0:
            (out_dir / "video_download_failure.json").write_text(
                json.dumps(
                    {
                        "message": result.stderr[-4000:] or result.stdout[-4000:],
                        "source": source,
                        "fallback": "storyboard",
                        "driver": "cli",
                    },
                    ensure_ascii=False,
                    indent=2,
                ) + "\n",
                encoding="utf-8",
            )
            return None
        videos = [
            path
            for path in sorted(out_dir.glob("source.*"))
            if path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".avi"}
        ]
        if not videos:
            fail("yt-dlp CLI 다운로드 결과 영상 파일을 찾지 못했습니다.")
        return videos[0]

    try:
        import yt_dlp  # type: ignore
    except ImportError as exc:
        fail("yt-dlp가 설치되어 있지 않습니다. `python3 -m pip install -U yt-dlp`를 실행하세요.")
        raise exc

    options = {
        "format": requested_format,
        "outtmpl": output_template,
        "merge_output_format": video_format,
        "quiet": False,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(source, download=True)
            metadata = {
                "id": info.get("id"),
                "title": info.get("title"),
                "duration": info.get("duration"),
                "webpage_url": info.get("webpage_url"),
                "uploader": info.get("uploader"),
            }
            (out_dir / "metadata.json").write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    except Exception as exc:
        (out_dir / "video_download_failure.json").write_text(
            json.dumps(
                {
                    "message": str(exc),
                    "source": source,
                    "fallback": "storyboard",
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        return None

    videos = [
        path
        for path in sorted(out_dir.glob("source.*"))
        if path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".avi"}
    ]
    if not videos:
        fail("yt-dlp 다운로드 결과 영상 파일을 찾지 못했습니다.")
    return videos[0]


def download_storyboard(source: str, out_dir: Path) -> Path:
    try:
        import yt_dlp  # type: ignore
    except ImportError as exc:
        fail("yt-dlp가 설치되어 있지 않습니다. `python3 -m pip install -U yt-dlp`를 실행하세요.")
        raise exc

    output_template = str(out_dir / "storyboard.%(ext)s")
    options = {
        "format": "sb0",
        "outtmpl": output_template,
        "quiet": False,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.extract_info(source, download=True)

    candidates = sorted(out_dir.glob("storyboard*.mhtml"))
    if not candidates:
        fail("storyboard fallback 다운로드 결과 mhtml 파일을 찾지 못했습니다.")
    return candidates[0]


def format_timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours >= 1:
        return f"{int(hours):02d}:{int(minutes):02d}:{sec:05.2f}"
    return f"{int(minutes):02d}:{sec:05.2f}"


def parse_hhmmss_millis(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    if len(parts) != 3:
        return 0.0
    hours, minutes, seconds = parts
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def save_frame(cv2, frame, frames_dir: Path, index: int, timestamp_sec: float, reason: str, scene_score: float | None) -> FrameInfo:
    path = frames_dir / f"frame_{index:04d}_{timestamp_sec:09.3f}.jpg"
    height, width = frame.shape[:2]
    if reason.startswith("storyboard") and width < 960:
        scale = math.ceil(960 / max(width, 1))
        frame = cv2.resize(frame, (width * scale, height * scale), interpolation=cv2.INTER_CUBIC)
    ok = cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        fail(f"프레임 저장 실패: {path}")
    return FrameInfo(
        index=index,
        timestamp_sec=round(timestamp_sec, 3),
        timestamp=format_timestamp(timestamp_sec),
        path=str(path.resolve()),
        reason=reason,
        scene_score=round(scene_score, 4) if scene_score is not None else None,
    )


def make_scene_candidate(timestamp_sec: float, reason: str, scene_score: float | None) -> SceneCandidate:
    return SceneCandidate(
        timestamp_sec=round(timestamp_sec, 3),
        timestamp=format_timestamp(timestamp_sec),
        reason=reason,
        scene_score=round(scene_score, 4) if scene_score is not None else None,
    )


def scene_score(cv2, prev_gray, gray) -> float:
    diff = cv2.absdiff(prev_gray, gray)
    return float(diff.mean() / 255.0)


def collect_scene_candidates(cv2, video_path: Path, scene_threshold: float, min_scene_gap: float, scene_scan_interval: float):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        fail(f"OpenCV가 영상을 열지 못했습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration = frame_count / fps if frame_count > 0 else 0
    stride = max(1, int(round(fps * scene_scan_interval)))
    candidates: list[SceneCandidate] = []
    prev_gray = None
    last_kept_sec = -math.inf
    raw_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        raw_index += 1
        if raw_index % stride != 1:
            continue

        timestamp_sec = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        if prev_gray is None:
            candidates.append(make_scene_candidate(timestamp_sec, "scene:first", None))
            last_kept_sec = timestamp_sec
            prev_gray = gray
            continue

        score = scene_score(cv2, prev_gray, gray)
        enough_gap = timestamp_sec - last_kept_sec >= min_scene_gap
        if score >= scene_threshold and enough_gap:
            candidates.append(make_scene_candidate(timestamp_sec, "scene", score))
            last_kept_sec = timestamp_sec
        prev_gray = gray

    cap.release()
    stats = {
        "fps": round(float(fps), 3),
        "frame_count": int(frame_count),
        "duration_sec": round(float(duration), 3),
        "scene_scan_stride_frames": stride,
    }
    return candidates, stats


def nearest_unused_index(timestamps: list[float], target: float, used: set[int]) -> int:
    best_index = None
    best_distance = math.inf
    for index, timestamp in enumerate(timestamps):
        if index in used:
            continue
        distance = abs(timestamp - target)
        if distance < best_distance:
            best_index = index
            best_distance = distance
    if best_index is None:
        fail("장면 후보 균등 선택에 실패했습니다.")
    return best_index


def select_scene_candidates(candidates: list[SceneCandidate], max_frames: int, selection: str) -> list[SceneCandidate]:
    if max_frames == 0 or len(candidates) <= max_frames:
        return candidates
    if selection == "first":
        return candidates[:max_frames]
    if max_frames == 1:
        return [candidates[0]]

    timestamps = [candidate.timestamp_sec for candidate in candidates]
    start = timestamps[0]
    end = timestamps[-1]
    used: set[int] = set()
    for index in range(max_frames):
        target = start + (end - start) * index / (max_frames - 1)
        used.add(nearest_unused_index(timestamps, target, used))
    return [candidates[index] for index in sorted(used)]


def save_scene_frames(cv2, video_path: Path, out_dir: Path, candidates: list[SceneCandidate], downselected: bool) -> list[FrameInfo]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        fail(f"OpenCV가 영상을 열지 못했습니다: {video_path}")

    frames: list[FrameInfo] = []
    for candidate in candidates:
        cap.set(cv2.CAP_PROP_POS_MSEC, candidate.timestamp_sec * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        reason = candidate.reason
        if downselected and "balanced" not in reason:
            reason = f"{reason}:balanced"
        frames.append(save_frame(cv2, frame, out_dir / "frames", len(frames) + 1, candidate.timestamp_sec, reason, candidate.scene_score))
    cap.release()
    return frames


def extract_scene_frames(cv2, video_path: Path, out_dir: Path, args: argparse.Namespace):
    candidates, stats = collect_scene_candidates(
        cv2,
        video_path,
        args.scene_threshold,
        args.min_scene_gap,
        args.scene_scan_interval,
    )
    selected = select_scene_candidates(candidates, args.max_frames, args.scene_selection)
    downselected = args.max_frames > 0 and len(candidates) > len(selected)
    frames = save_scene_frames(cv2, video_path, out_dir, selected, downselected)
    stats.update(
        {
            "scene_candidates": len(candidates),
            "scene_selected": len(frames),
            "scene_selection": args.scene_selection,
            "scene_downselected": downselected,
        }
    )
    return frames, stats


def extract_interval_frames(cv2, video_path: Path, out_dir: Path, interval: float, max_frames: int):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        fail(f"OpenCV가 영상을 열지 못했습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration = frame_count / fps if frame_count > 0 else 0
    timestamp_count = int(math.floor(duration / interval)) + 1 if max_frames == 0 else max_frames
    timestamps = [i * interval for i in range(timestamp_count)]
    if duration > 0:
        timestamps = [timestamp for timestamp in timestamps if timestamp <= duration]

    frames: list[FrameInfo] = []
    for timestamp_sec in timestamps:
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_sec * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        frames.append(save_frame(cv2, frame, out_dir / "frames", len(frames) + 1, timestamp_sec, "interval", None))
        if max_frames > 0 and len(frames) >= max_frames:
            break
    cap.release()
    return frames, {
        "fps": round(float(fps), 3),
        "frame_count": int(frame_count),
        "duration_sec": round(float(duration), 3),
        "scene_candidates": "n/a",
        "scene_selected": len(frames),
        "scene_selection": "n/a",
        "scene_downselected": False,
    }


def select_balanced(items: list[tuple], max_items: int) -> list[tuple]:
    if max_items == 0 or len(items) <= max_items:
        return items
    if max_items == 1:
        return [items[0]]
    selected = []
    used: set[int] = set()
    for index in range(max_items):
        target = round((len(items) - 1) * index / (max_items - 1))
        best = None
        best_distance = math.inf
        for candidate_index in range(len(items)):
            if candidate_index in used:
                continue
            distance = abs(candidate_index - target)
            if distance < best_distance:
                best = candidate_index
                best_distance = distance
        if best is not None:
            used.add(best)
            selected.append(items[best])
    return selected


def extract_storyboard_frames(cv2, source: str, out_dir: Path, max_frames: int):
    storyboard_path = download_storyboard(source, out_dir)
    message = BytesParser(policy=policy.default).parsebytes(storyboard_path.read_bytes())
    html_part = next((part for part in message.walk() if part.get_content_type() == "text/html"), None)
    html = html_part.get_content() if html_part is not None else ""
    slide_matches = re.findall(
        r"Slide #(\d+): ([0-9:,]+) .+?duration: ([0-9.]+)",
        html,
    )
    image_parts = [part for part in message.walk() if part.get_content_type().startswith("image/")]
    if not image_parts:
        fail("storyboard fallback mhtml 안에서 이미지를 찾지 못했습니다.")

    tiles: list[tuple] = []
    for slide_index, part in enumerate(image_parts):
        data = part.get_payload(decode=True)
        if not data:
            continue
        import numpy as np  # type: ignore

        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            continue
        height, width = image.shape[:2]
        tile_width = 320 if width >= 320 else width
        tile_height = 180 if height >= 180 else height
        cols = max(1, width // tile_width)
        rows = max(1, height // tile_height)
        slide_start = 0.0
        slide_duration = 1.0
        if slide_index < len(slide_matches):
            slide_start = parse_hhmmss_millis(slide_matches[slide_index][1])
            slide_duration = float(slide_matches[slide_index][2])
        tile_count = rows * cols
        for row in range(rows):
            for col in range(cols):
                y0 = row * tile_height
                x0 = col * tile_width
                tile = image[y0:y0 + tile_height, x0:x0 + tile_width]
                tile_index = row * cols + col
                timestamp_sec = slide_start + slide_duration * tile_index / max(tile_count, 1)
                tiles.append((timestamp_sec, tile))

    selected = select_balanced(tiles, max_frames)
    frames = [
        save_frame(cv2, tile, out_dir / "frames", index + 1, timestamp_sec, "storyboard:fallback", None)
        for index, (timestamp_sec, tile) in enumerate(selected)
    ]
    return frames, {
        "extractor_fallback": "storyboard",
        "storyboard_path": str(storyboard_path.resolve()),
        "storyboard_tiles": len(tiles),
        "scene_candidates": "n/a",
        "scene_selected": len(frames),
        "scene_selection": "balanced",
        "scene_downselected": max_frames > 0 and len(tiles) > len(frames),
    }


def main() -> None:
    args = apply_scene_preset(parse_args())
    if args.interval <= 0:
        fail("--interval은 0보다 커야 합니다.")
    if args.max_frames < 0:
        fail("--max-frames는 0 이상이어야 합니다.")
    if args.storyboard_max_frames is not None and args.storyboard_max_frames < 0:
        fail("--storyboard-max-frames는 0 이상이어야 합니다.")
    if args.scene_threshold <= 0:
        fail("--scene-threshold는 0보다 커야 합니다.")
    if args.min_scene_gap < 0:
        fail("--min-scene-gap은 0 이상이어야 합니다.")
    if args.scene_scan_interval <= 0:
        fail("--scene-scan-interval은 0보다 커야 합니다.")

    cv2 = load_cv2()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "frames").mkdir(parents=True, exist_ok=True)
    video_path = download_video(args.source, args.out_dir, args.video_format)

    if video_path is None:
        storyboard_max_frames = args.storyboard_max_frames if args.storyboard_max_frames is not None else args.max_frames
        frames, stats = extract_storyboard_frames(cv2, args.source, args.out_dir, storyboard_max_frames)
    elif args.mode == "scene":
        frames, stats = extract_scene_frames(cv2, video_path, args.out_dir, args)
    else:
        frames, stats = extract_interval_frames(cv2, video_path, args.out_dir, args.interval, args.max_frames)

    if not frames:
        fail("추출된 프레임이 없습니다.")

    stats.update(
        {
            "extractor_version": "extract-video-frames-v2",
            "video_id": args.video_id,
            "mode": args.mode,
            "scene_detail": args.scene_detail,
            "scene_threshold": args.scene_threshold,
            "min_scene_gap": args.min_scene_gap,
            "scene_scan_interval": args.scene_scan_interval,
            "max_frames": args.max_frames,
            "storyboard_max_frames": args.storyboard_max_frames,
        }
    )
    (args.out_dir / "frames.json").write_text(
        json.dumps([asdict(frame) for frame in frames], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.out_dir / "extraction_stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "frames": len(frames), "out_dir": str(args.out_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
