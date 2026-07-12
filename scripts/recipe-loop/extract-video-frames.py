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
import fcntl
import hashlib
from email import policy
from email.parser import BytesParser
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
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

EXTRACTOR_VERSION = "extract-video-frames-v4-source-fingerprint"
SOURCE_CACHE_VERSION = "video-source-cache-v1"


@dataclass
class FrameInfo:
    index: int
    timestamp_sec: float
    timestamp: str
    path: str
    reason: str
    scene_score: float | None = None
    requested_timestamp_sec: float | None = None
    actual_timestamp_sec: float | None = None
    timestamp_source: str | None = None


@dataclass(frozen=True)
class SceneCandidate:
    timestamp_sec: float
    timestamp: str
    reason: str
    scene_score: float | None = None
    timestamp_source: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract recipe-loop video frames.")
    parser.add_argument("source", help="YouTube URL or local video path")
    parser.add_argument("--video-id", default="unknown")
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--cache-root", type=Path, default=None)
    parser.add_argument("--result-json", type=Path, default=None)
    parser.add_argument("--request-key", default=None)
    parser.add_argument("--mode", choices=["scene", "interval", "hybrid"], default="scene")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--hybrid-anchor-budget", type=int, default=72)
    parser.add_argument("--scene-detail", choices=["normal", "dense", "exhaustive"], default="dense")
    parser.add_argument("--scene-threshold", type=float, default=None)
    parser.add_argument("--min-scene-gap", type=float, default=None)
    parser.add_argument("--scene-scan-interval", type=float, default=None)
    parser.add_argument("--scene-selection", choices=["balanced", "first"], default="balanced")
    parser.add_argument("--max-frames", type=int, default=80)
    parser.add_argument("--storyboard-max-frames", type=int, default=None)
    parser.add_argument("--video-format", default="mp4")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"[FAIL] {message}", file=sys.stderr)
    raise SystemExit(1)


def monotonic_ms() -> float:
    return time.perf_counter() * 1000.0


def file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def acquire_cache_lock(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+", encoding="utf-8")
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    return handle


def release_cache_lock(handle) -> None:
    if handle is None:
        return
    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    handle.close()


def prepare_source(args: argparse.Namespace) -> dict:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = args.out_dir / "source-preparation.json"
    local_source = None if is_url(args.source) else Path(args.source).expanduser().resolve()
    current_local_fingerprint = file_sha256(local_source) if local_source and local_source.exists() else None

    if not args.no_cache and metadata_path.exists():
        cached = json.loads(metadata_path.read_text(encoding="utf-8"))
        cached_path = Path(cached["sourcePath"]) if cached.get("sourcePath") else None
        local_unchanged = local_source is None or cached.get("sourceFingerprint") == current_local_fingerprint
        if cached.get("source") == args.source and cached_path and cached_path.exists() and local_unchanged:
            return {
                **cached,
                "sourceVideoCacheHit": True,
                "sourcePrepareMs": None,
            }

    started = monotonic_ms()
    video_path = download_video(args.source, args.out_dir, args.video_format)
    source_prepare_ms = round(monotonic_ms() - started, 3)
    source_fingerprint = (
        file_sha256(video_path)
        if video_path is not None
        else hashlib.sha256(f"storyboard-fallback:{args.source}".encode("utf-8")).hexdigest()
    )
    payload = {
        "schemaVersion": 1,
        "source": args.source,
        "videoId": args.video_id,
        "sourcePath": str(video_path.resolve()) if video_path is not None else None,
        "sourceFingerprint": source_fingerprint,
        "sourceVideoCacheHit": False,
        "sourcePrepareMs": source_prepare_ms,
        "artifactSourcePrepareMs": source_prepare_ms,
    }
    metadata_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


def source_identity(args: argparse.Namespace) -> dict:
    if is_url(args.source):
        provider = "youtube" if "youtu" in args.source.lower() else "remote-url"
        canonical_identity = args.video_id or args.source
        local_revision = None
        format_policy = resolve_download_format_policy(args.video_format)
    else:
        local = Path(args.source).expanduser().resolve()
        provider = "local-file"
        canonical_identity = str(local)
        local_revision = file_sha256(local) if local.exists() else None
        format_policy = {
            "resolvedFormatSelector": "local-file-copy",
            "mergeOutputFormat": None,
            "ffmpegAvailable": None,
        }
    return {
        "cacheVersion": SOURCE_CACHE_VERSION,
        "provider": provider,
        "canonicalVideoIdentity": canonical_identity,
        "localRevision": local_revision,
        "videoFormatPolicy": args.video_format,
        **format_policy,
    }


def source_identity_key(identity: dict) -> str:
    encoded = json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:24]


def valid_source_cache(source_dir: Path, identity: dict) -> dict | None:
    metadata_path = source_dir / "source-preparation.json"
    if not (source_dir / ".complete").exists() or not metadata_path.exists():
        return None
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    source_path = Path(payload["sourcePath"]) if payload.get("sourcePath") else None
    if payload.get("sourceIdentity") != identity or source_path is None:
        return None
    if not source_path.exists() or source_path.stat().st_size <= 0:
        return None
    if file_sha256(source_path) != payload.get("sourceFingerprint"):
        return None
    return payload


def prepare_managed_source(args: argparse.Namespace, request_key: str) -> dict:
    identity = source_identity(args)
    source_key = source_identity_key(identity)
    if args.no_cache:
        source_dir = args.cache_root / "_source-runs" / request_key
        source_args = argparse.Namespace(**{**vars(args), "out_dir": source_dir, "no_cache": True})
        payload = prepare_source(source_args)
        payload["sourceIdentity"] = identity
        (source_dir / "source-preparation.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if payload.get("sourcePath"):
            (source_dir / ".complete").write_text("complete\n", encoding="utf-8")
        return payload

    source_dir = args.cache_root / "_sources" / source_key
    cached = valid_source_cache(source_dir, identity)
    if cached is not None:
        return {**cached, "sourceVideoCacheHit": True, "sourcePrepareMs": None}

    lock = acquire_cache_lock(args.cache_root / "_locks" / f"source-{source_key}.lock")
    cached = valid_source_cache(source_dir, identity)
    if cached is not None:
        release_cache_lock(lock)
        return {**cached, "sourceVideoCacheHit": True, "sourcePrepareMs": None}

    source_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = source_dir.parent / f".{source_dir.name}.tmp-{uuid.uuid4().hex}"
    source_args = argparse.Namespace(**{**vars(args), "out_dir": staging_dir, "no_cache": True})
    payload = prepare_source(source_args)
    payload["sourceIdentity"] = identity
    if not payload.get("sourcePath"):
        failure_dir = args.cache_root / "_source-failures" / request_key
        failure_dir.parent.mkdir(parents=True, exist_ok=True)
        if failure_dir.exists():
            shutil.rmtree(failure_dir)
        os.replace(staging_dir, failure_dir)
        release_cache_lock(lock)
        return payload

    staged_path = Path(payload["sourcePath"])
    final_path = source_dir / staged_path.name
    payload["sourcePath"] = str(final_path.resolve())
    (staging_dir / "source-preparation.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (staging_dir / ".complete").write_text("complete\n", encoding="utf-8")
    winner = valid_source_cache(source_dir, identity)
    if winner is not None:
        shutil.rmtree(staging_dir)
        release_cache_lock(lock)
        return {**winner, "sourceVideoCacheHit": True, "sourcePrepareMs": None}
    if source_dir.exists():
        shutil.rmtree(source_dir)
    try:
        os.replace(staging_dir, source_dir)
    except OSError:
        winner = valid_source_cache(source_dir, identity)
        if winner is None:
            raise
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        release_cache_lock(lock)
        return {**winner, "sourceVideoCacheHit": True, "sourcePrepareMs": None}
    release_cache_lock(lock)
    return payload


def managed_frame_key(args: argparse.Namespace, source_fingerprint: str) -> str:
    payload = {
        "extractorVersion": EXTRACTOR_VERSION,
        "sourceFingerprint": source_fingerprint,
        "mode": args.mode,
        "interval": args.interval,
        "hybridAnchorBudget": args.hybrid_anchor_budget,
        "sceneDetail": args.scene_detail,
        "sceneThreshold": args.scene_threshold,
        "minSceneGap": args.min_scene_gap,
        "sceneScanInterval": args.scene_scan_interval,
        "sceneSelection": args.scene_selection,
        "maxFrames": args.max_frames,
        "storyboardMaxFrames": args.storyboard_max_frames,
        "videoFormat": args.video_format,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:24]


def extract_for_args(cv2, args: argparse.Namespace, video_path: Path | None, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "frames").mkdir(parents=True, exist_ok=True)
    if video_path is None:
        storyboard_max_frames = args.storyboard_max_frames if args.storyboard_max_frames is not None else args.max_frames
        return extract_storyboard_frames(cv2, args.source, out_dir, storyboard_max_frames)
    if args.mode == "scene":
        return extract_scene_frames(cv2, video_path, out_dir, args)
    if args.mode == "interval":
        return extract_interval_frames(cv2, video_path, out_dir, args.interval, args.max_frames)
    return extract_hybrid_frames(cv2, video_path, out_dir, args)


def write_managed_result(args: argparse.Namespace, payload: dict) -> None:
    if args.result_json is None:
        fail("--cache-root 사용 시 --result-json이 필요합니다.")
    args.result_json.parent.mkdir(parents=True, exist_ok=True)
    args.result_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))


def run_managed(args: argparse.Namespace) -> None:
    if args.cache_root is None:
        fail("managed frame extraction에는 --cache-root가 필요합니다.")
    request_key = args.request_key or uuid.uuid4().hex
    source_result = prepare_managed_source(args, request_key)
    source_fingerprint = source_result["sourceFingerprint"]
    frame_key = managed_frame_key(args, source_fingerprint)
    frame_dir = (
        args.cache_root / "_frame-runs" / request_key
        if args.no_cache
        else args.cache_root / "_frames" / frame_key
    )
    frames_path = frame_dir / "frames.json"
    stats_path = frame_dir / "extraction_stats.json"
    complete_path = frame_dir / ".complete"
    if not args.no_cache and frames_path.exists() and stats_path.exists() and complete_path.exists():
        write_managed_result(args, {
            "frameDir": str(frame_dir.resolve()),
            "sourceFingerprint": source_fingerprint,
            "sourceVideoCacheHit": bool(source_result.get("sourceVideoCacheHit")),
            "frameCacheHit": True,
            "runTimings": {
                "source_prepare_ms": source_result.get("sourcePrepareMs"),
                "scene_scan_ms": None,
                "frame_write_ms": None,
            },
        })
        return

    frame_lock = None
    if not args.no_cache:
        frame_lock = acquire_cache_lock(args.cache_root / "_locks" / f"frame-{frame_key}.lock")
        if frames_path.exists() and stats_path.exists() and complete_path.exists():
            release_cache_lock(frame_lock)
            write_managed_result(args, {
                "frameDir": str(frame_dir.resolve()),
                "sourceFingerprint": source_fingerprint,
                "sourceVideoCacheHit": bool(source_result.get("sourceVideoCacheHit")),
                "frameCacheHit": True,
                "runTimings": {
                    "source_prepare_ms": source_result.get("sourcePrepareMs"),
                    "scene_scan_ms": None,
                    "frame_write_ms": None,
                },
            })
            return

    staging_dir = frame_dir.parent / f".{frame_dir.name}.tmp-{uuid.uuid4().hex}"
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    cv2 = load_cv2()
    video_path = Path(source_result["sourcePath"]) if source_result.get("sourcePath") else None
    storyboard_started = monotonic_ms() if video_path is None else None
    frames, stats = extract_for_args(cv2, args, video_path, staging_dir)
    if not frames:
        fail("추출된 프레임이 없습니다.")
    source_prepare_ms = source_result.get("sourcePrepareMs")
    if storyboard_started is not None:
        storyboard_ms = round(monotonic_ms() - storyboard_started, 3)
        source_prepare_ms = round(float(source_prepare_ms or 0) + storyboard_ms, 3)

    for frame in frames:
        relative_path = Path(frame.path).resolve().relative_to(staging_dir.resolve())
        frame.path = str((frame_dir / relative_path).resolve())
    stats.update({
        "extractor_version": EXTRACTOR_VERSION,
        "video_id": args.video_id,
        "mode": args.mode,
        "scene_detail": args.scene_detail,
        "scene_threshold": args.scene_threshold,
        "min_scene_gap": args.min_scene_gap,
        "scene_scan_interval": args.scene_scan_interval,
        "max_frames": args.max_frames,
        "storyboard_max_frames": args.storyboard_max_frames,
        "hybrid_anchor_budget": args.hybrid_anchor_budget,
        "source_fingerprint": source_fingerprint,
        "source_prepare_ms": source_prepare_ms,
    })
    (staging_dir / "frames.json").write_text(
        json.dumps([asdict(frame) for frame in frames], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (staging_dir / "extraction_stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (staging_dir / ".complete").write_text("complete\n", encoding="utf-8")
    frame_dir.parent.mkdir(parents=True, exist_ok=True)
    if frame_dir.exists():
        if complete_path.exists() and not args.no_cache:
            shutil.rmtree(staging_dir)
        else:
            shutil.rmtree(frame_dir)
            os.replace(staging_dir, frame_dir)
    else:
        os.replace(staging_dir, frame_dir)

    payload = {
        "frameDir": str(frame_dir.resolve()),
        "sourceFingerprint": source_fingerprint,
        "sourceVideoCacheHit": bool(source_result.get("sourceVideoCacheHit")),
        "frameCacheHit": False,
        "runTimings": {
            "source_prepare_ms": source_prepare_ms,
            "scene_scan_ms": stats.get("scene_scan_ms"),
            "frame_write_ms": stats.get("frame_write_ms"),
        },
    }
    release_cache_lock(frame_lock)
    write_managed_result(args, payload)


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


def resolve_download_format_policy(video_format: str) -> dict:
    has_ffmpeg = shutil.which("ffmpeg") is not None
    requested_format = (
        f"bv*[ext={video_format}]+ba/b[ext={video_format}]/b"
        if has_ffmpeg
        else f"b[ext={video_format}]/best[ext={video_format}]/best"
    )
    return {
        "resolvedFormatSelector": requested_format,
        "mergeOutputFormat": video_format,
        "ffmpegAvailable": has_ffmpeg,
    }


def download_video(source: str, out_dir: Path, video_format: str) -> Path | None:
    if not is_url(source):
        local = Path(source).expanduser().resolve()
        if not local.exists():
            fail(f"로컬 영상 파일이 없습니다: {local}")
        target = out_dir / f"source{local.suffix or '.mp4'}"
        if local != target:
            shutil.copy2(local, target)
        return target

    format_policy = resolve_download_format_policy(video_format)
    requested_format = format_policy["resolvedFormatSelector"]
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


def save_frame(
    cv2,
    frame,
    frames_dir: Path,
    index: int,
    timestamp_sec: float,
    reason: str,
    scene_score: float | None,
    actual_timestamp_sec: float | None = None,
    timestamp_source: str | None = None,
) -> FrameInfo:
    canonical_timestamp = (
        float(actual_timestamp_sec)
        if actual_timestamp_sec is not None and math.isfinite(float(actual_timestamp_sec))
        else float(timestamp_sec)
    )
    path = frames_dir / f"frame_{index:04d}_{canonical_timestamp:09.3f}.jpg"
    height, width = frame.shape[:2]
    if reason.startswith("storyboard") and width < 960:
        scale = math.ceil(960 / max(width, 1))
        frame = cv2.resize(frame, (width * scale, height * scale), interpolation=cv2.INTER_CUBIC)
    ok = cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        fail(f"프레임 저장 실패: {path}")
    return FrameInfo(
        index=index,
        timestamp_sec=round(canonical_timestamp, 3),
        timestamp=format_timestamp(canonical_timestamp),
        path=str(path.resolve()),
        reason=reason,
        scene_score=round(scene_score, 4) if scene_score is not None else None,
        requested_timestamp_sec=round(float(timestamp_sec), 3),
        actual_timestamp_sec=round(canonical_timestamp, 3),
        timestamp_source=timestamp_source,
    )


def make_scene_candidate(
    timestamp_sec: float,
    reason: str,
    scene_score: float | None,
    timestamp_source: str | None = None,
) -> SceneCandidate:
    return SceneCandidate(
        timestamp_sec=round(timestamp_sec, 3),
        timestamp=format_timestamp(timestamp_sec),
        reason=reason,
        scene_score=round(scene_score, 4) if scene_score is not None else None,
        timestamp_source=timestamp_source,
    )


def scene_score(cv2, prev_gray, gray) -> float:
    diff = cv2.absdiff(prev_gray, gray)
    return float(diff.mean() / 255.0)


def probe_duration_seconds(video_path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe unavailable")
    result = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            str(video_path),
        ],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("ffprobe duration failed")
    payload = json.loads(result.stdout.decode("utf-8"))
    duration = float(payload.get("format", {}).get("duration", 0) or 0)
    if not math.isfinite(duration) or duration < 0:
        raise RuntimeError("invalid ffprobe duration")
    return duration


def collect_scene_candidates_ffmpeg(
    cv2,
    video_path: Path,
    scene_threshold: float,
    min_scene_gap: float,
    scene_scan_interval: float,
):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg unavailable")
    width, height = 160, 90
    frame_size = width * height
    select_expr = f"select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{scene_scan_interval})'"
    result = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "info",
            "-i", str(video_path),
            "-an", "-sn", "-dn",
            "-vf", f"{select_expr},scale={width}:{height}:flags=area,format=gray,showinfo",
            "-vsync", "0",
            "-f", "rawvideo",
            "-pix_fmt", "gray",
            "pipe:1",
        ],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("ffmpeg scene sampling failed")
    pts_values = [
        float(value)
        for value in re.findall(rb"pts_time:([0-9eE+.-]+)", result.stderr)
    ]
    if len(result.stdout) % frame_size != 0:
        raise RuntimeError("ffmpeg raw frame payload is truncated")
    frame_count = len(result.stdout) // frame_size
    if frame_count == 0 or len(pts_values) != frame_count:
        raise RuntimeError("ffmpeg sample/PTS pairing mismatch")

    import numpy as np  # type: ignore

    samples = np.frombuffer(result.stdout, dtype=np.uint8).reshape((frame_count, height, width))
    candidates: list[SceneCandidate] = []
    previous = None
    last_kept_sec = -math.inf
    for timestamp_sec, gray in zip(pts_values, samples):
        if previous is None:
            candidates.append(make_scene_candidate(timestamp_sec, "scene:first", None, "ffmpeg_showinfo_pts"))
            last_kept_sec = timestamp_sec
            previous = gray
            continue
        score = scene_score(cv2, previous, gray)
        if score >= scene_threshold and timestamp_sec - last_kept_sec >= min_scene_gap:
            candidates.append(make_scene_candidate(timestamp_sec, "scene", score, "ffmpeg_showinfo_pts"))
            last_kept_sec = timestamp_sec
        previous = gray

    return candidates, {
        "duration_sec": round(probe_duration_seconds(video_path), 3),
        "scene_scanner": "ffmpeg-pts",
        "scene_scan_sample_count": frame_count,
        "scene_scan_interval_sec": scene_scan_interval,
        "timestamp_source": "showinfo_pts_time",
    }


def collect_scene_candidates_opencv(cv2, video_path: Path, scene_threshold: float, min_scene_gap: float, scene_scan_interval: float):
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


def collect_scene_candidates(cv2, video_path: Path, scene_threshold: float, min_scene_gap: float, scene_scan_interval: float):
    try:
        return collect_scene_candidates_ffmpeg(
            cv2,
            video_path,
            scene_threshold,
            min_scene_gap,
            scene_scan_interval,
        )
    except Exception as error:
        candidates, stats = collect_scene_candidates_opencv(
            cv2,
            video_path,
            scene_threshold,
            min_scene_gap,
            scene_scan_interval,
        )
        stats.update({
            "scene_scanner": "opencv-fallback",
            "scene_scanner_fallback_reason": str(error),
            "timestamp_source": "opencv_pos_msec",
        })
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
        actual_timestamp_sec = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        frames.append(save_frame(
            cv2,
            frame,
            out_dir / "frames",
            len(frames) + 1,
            candidate.timestamp_sec,
            reason,
            candidate.scene_score,
            actual_timestamp_sec=actual_timestamp_sec,
            timestamp_source="opencv_seek_pos_msec",
        ))
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


def interval_anchor_candidates(duration: float, anchor_budget: int) -> list[SceneCandidate]:
    if anchor_budget <= 0:
        return []
    if duration <= 0 or anchor_budget == 1:
        return [make_scene_candidate(0.0, "hybrid:interval", None)]

    tail = max(0.0, duration - min(0.1, duration * 0.001))
    return [
        make_scene_candidate(tail * index / (anchor_budget - 1), "hybrid:interval", None)
        for index in range(anchor_budget)
    ]


def select_hybrid_candidates(
    scene_candidates: list[SceneCandidate],
    duration: float,
    anchor_budget: int,
    max_frames: int,
    dedupe_tolerance: float = 0.25,
):
    anchors = interval_anchor_candidates(duration, anchor_budget)
    if max_frames > 0 and len(anchors) > max_frames:
        anchors = select_scene_candidates(anchors, max_frames, "balanced")

    selected = list(anchors)
    for candidate in sorted(
        scene_candidates,
        key=lambda item: (-(item.scene_score or 0.0), item.timestamp_sec),
    ):
        if any(abs(existing.timestamp_sec - candidate.timestamp_sec) <= dedupe_tolerance for existing in selected):
            continue
        selected.append(candidate)
        if max_frames > 0 and len(selected) >= max_frames:
            break

    selected.sort(key=lambda item: item.timestamp_sec)
    last_timestamp = selected[-1].timestamp_sec if selected else 0.0
    coverage_ratio = min(1.0, last_timestamp / duration) if duration > 0 else 1.0
    stats = {
        "scene_candidate_count": len(scene_candidates),
        "interval_anchor_count": len(anchors),
        "hybrid_deduped_count": len(scene_candidates) + len(anchors) - len(selected),
        "hybrid_selected_count": len(selected),
        "timeline_coverage_ratio": round(coverage_ratio, 4),
        "last_frame_sec": round(last_timestamp, 3),
    }
    return selected, stats


def extract_hybrid_frames(cv2, video_path: Path, out_dir: Path, args: argparse.Namespace):
    scene_scan_started = monotonic_ms()
    scene_candidates, stats = collect_scene_candidates(
        cv2,
        video_path,
        args.scene_threshold,
        args.min_scene_gap,
        args.scene_scan_interval,
    )
    scene_scan_ms = round(monotonic_ms() - scene_scan_started, 3)
    selected, hybrid_stats = select_hybrid_candidates(
        scene_candidates,
        duration=float(stats.get("duration_sec") or 0),
        anchor_budget=args.hybrid_anchor_budget,
        max_frames=args.max_frames,
    )
    frame_write_started = monotonic_ms()
    frames = save_scene_frames(cv2, video_path, out_dir, selected, downselected=False)
    frame_write_ms = round(monotonic_ms() - frame_write_started, 3)
    stats.update(hybrid_stats)
    stats.update(
        {
            "scene_candidates": len(scene_candidates),
            "scene_selected": sum(1 for item in selected if item.reason.startswith("scene")),
            "scene_selection": "hybrid",
            "scene_downselected": len(scene_candidates) + hybrid_stats["interval_anchor_count"] > len(selected),
            "hybrid_anchor_budget": args.hybrid_anchor_budget,
            "scene_scan_ms": scene_scan_ms,
            "frame_write_ms": frame_write_ms,
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
        actual_timestamp_sec = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        frames.append(save_frame(
            cv2,
            frame,
            out_dir / "frames",
            len(frames) + 1,
            timestamp_sec,
            "interval",
            None,
            actual_timestamp_sec=actual_timestamp_sec,
            timestamp_source="opencv_seek_pos_msec",
        ))
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
    if args.hybrid_anchor_budget < 1:
        fail("--hybrid-anchor-budget은 1 이상이어야 합니다.")
    if args.storyboard_max_frames is not None and args.storyboard_max_frames < 0:
        fail("--storyboard-max-frames는 0 이상이어야 합니다.")
    if args.scene_threshold <= 0:
        fail("--scene-threshold는 0보다 커야 합니다.")
    if args.min_scene_gap < 0:
        fail("--min-scene-gap은 0 이상이어야 합니다.")
    if args.scene_scan_interval <= 0:
        fail("--scene-scan-interval은 0보다 커야 합니다.")

    if getattr(args, "cache_root", None) is not None:
        run_managed(args)
        return
    if args.out_dir is None:
        fail("--out-dir 또는 --cache-root가 필요합니다.")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    if getattr(args, "prepare_only", False):
        print(json.dumps(prepare_source(args), ensure_ascii=False))
        return

    cv2 = load_cv2()
    (args.out_dir / "frames").mkdir(parents=True, exist_ok=True)
    source_prepare_started = monotonic_ms()
    video_path = download_video(args.source, args.out_dir, args.video_format)
    source_prepare_ms = round(monotonic_ms() - source_prepare_started, 3)

    if video_path is None:
        storyboard_max_frames = args.storyboard_max_frames if args.storyboard_max_frames is not None else args.max_frames
        frames, stats = extract_storyboard_frames(cv2, args.source, args.out_dir, storyboard_max_frames)
    elif args.mode == "scene":
        frames, stats = extract_scene_frames(cv2, video_path, args.out_dir, args)
    elif args.mode == "interval":
        frames, stats = extract_interval_frames(cv2, video_path, args.out_dir, args.interval, args.max_frames)
    else:
        frames, stats = extract_hybrid_frames(cv2, video_path, args.out_dir, args)

    if not frames:
        fail("추출된 프레임이 없습니다.")

    stats.update(
        {
            "extractor_version": EXTRACTOR_VERSION,
            "video_id": args.video_id,
            "mode": args.mode,
            "scene_detail": args.scene_detail,
            "scene_threshold": args.scene_threshold,
            "min_scene_gap": args.min_scene_gap,
            "scene_scan_interval": args.scene_scan_interval,
            "max_frames": args.max_frames,
            "storyboard_max_frames": args.storyboard_max_frames,
            "hybrid_anchor_budget": args.hybrid_anchor_budget,
            "source_prepare_ms": source_prepare_ms,
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
