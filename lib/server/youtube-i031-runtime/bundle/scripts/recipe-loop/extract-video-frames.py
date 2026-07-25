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

EXTRACTOR_VERSION = "extract-video-frames-v7-adaptive-screen-ocr"
SOURCE_CACHE_VERSION = "video-source-cache-v2-720p-h264-first"
SCREEN_OCR_SCAN_VERSION = "screen-ocr-region-scan-v1"
SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT = 48
SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD = 0.08
SCREEN_OCR_DEFAULT_MIN_GAP_SEC = 0.4
STORYBOARD_RETRY_DELAYS_SECONDS = (1.0, 2.0)
PERMANENT_DOWNLOAD_PHRASES = (
    ("this video is unavailable", "video_unavailable"),
    ("video is unavailable", "video_unavailable"),
    ("this video is private", "video_private"),
    ("private video", "video_private"),
    ("video has been deleted", "video_deleted"),
    ("deleted video", "video_deleted"),
    ("sign in to confirm", "login_required"),
    ("login required", "login_required"),
    ("log in to", "login_required"),
    ("cookies are required", "cookie_required"),
    ("cookie required", "cookie_required"),
    ("members-only", "members_only"),
    ("members only", "members_only"),
    ("age-restricted", "age_restricted"),
    ("age restricted", "age_restricted"),
    ("age restriction", "age_restricted"),
    ("not available in your country", "geo_restricted"),
    ("geo-restricted", "geo_restricted"),
    ("geo restricted", "geo_restricted"),
    ("geographic restriction", "geo_restricted"),
    ("unsupported url", "unsupported"),
    ("unsupported site", "unsupported"),
)


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
    parser.add_argument("--screen-ocr-scan", action="store_true")
    parser.add_argument("--screen-ocr-candidate-limit", type=int, default=SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT)
    parser.add_argument("--screen-ocr-change-threshold", type=float, default=SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD)
    parser.add_argument("--screen-ocr-min-gap", type=float, default=SCREEN_OCR_DEFAULT_MIN_GAP_SEC)
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
        "screenOcrScan": args.screen_ocr_scan,
        "screenOcrScanVersion": SCREEN_OCR_SCAN_VERSION if args.screen_ocr_scan else None,
        "screenOcrCandidateLimit": args.screen_ocr_candidate_limit if args.screen_ocr_scan else None,
        "screenOcrChangeThreshold": args.screen_ocr_change_threshold if args.screen_ocr_scan else None,
        "screenOcrMinGap": args.screen_ocr_min_gap if args.screen_ocr_scan else None,
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
                "screen_ocr_region_scan_ms": None,
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
                    "screen_ocr_region_scan_ms": None,
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
        "screen_ocr_scan": bool(getattr(args, "screen_ocr_scan", False)),
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
            "screen_ocr_region_scan_ms": stats.get("screen_ocr_region_scan_ms"),
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
    requested_format = (
        f"bv[height<=720][ext={video_format}][vcodec~='^(avc1|h264)']/"
        f"b[height<=720][ext={video_format}][vcodec~='^(avc1|h264)']/"
        f"bv[height<=720][ext={video_format}]/"
        f"b[height<=720][ext={video_format}]"
    )
    return {
        "resolvedFormatSelector": requested_format,
        "mergeOutputFormat": None,
    }


def download_video(
    source: str,
    out_dir: Path,
    video_format: str,
    retry_delays=STORYBOARD_RETRY_DELAYS_SECONDS,
    sleeper=time.sleep,
) -> Path | None:
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
    output_template = str(out_dir / "source.%(format_id)s.%(ext)s")
    yt_dlp_cli = shutil.which("yt-dlp")
    if yt_dlp_cli:
        command = [
            yt_dlp_cli,
            "--no-playlist",
            "--continue",
            "--retries",
            "0",
            "--fragment-retries",
            "0",
            "-f",
            requested_format,
            "-o",
            output_template,
            source,
        ]
        (out_dir / "yt-dlp-command.json").write_text(
            json.dumps({"command": command, "driver": "cli"}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        def run_cli_attempt(attempt: int) -> dict:
            result = subprocess.run(command, cwd=out_dir, text=True, capture_output=True, check=False)
            log_text = (
                f"attempt={attempt}\nexit_code={result.returncode}\n\n"
                f"[stdout]\n{result.stdout}\n\n[stderr]\n{result.stderr}\n"
            )
            (out_dir / f"yt-dlp-attempt-{attempt}.log").write_text(log_text, encoding="utf-8")
            return {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "message": result.stderr[-4000:] or result.stdout[-4000:],
                "value": None,
            }

        outcome, _, error = run_bounded_video_download(
            run_cli_attempt,
            out_dir,
            driver="cli",
            retry_delays=retry_delays,
            sleeper=sleeper,
        )
        attempt_logs = [
            path.read_text(encoding="utf-8")
            for path in sorted(out_dir.glob("yt-dlp-attempt-*.log"))
        ]
        (out_dir / "yt-dlp.log").write_text("\n".join(attempt_logs), encoding="utf-8")
        if error is not None or outcome is None:
            (out_dir / "video_download_failure.json").write_text(
                json.dumps(
                    {
                        "message": str(error),
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
        cleanup_successful_video_download(out_dir)
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
        "quiet": False,
        "noplaylist": True,
        "continuedl": True,
        "overwrites": False,
        "retries": 0,
        "fragment_retries": 0,
    }

    def run_api_attempt(attempt: int) -> dict:
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(source, download=True)
            return {"success": True, "exit_code": 0, "message": "", "value": info}
        except Exception as exc:
            return {"success": False, "exit_code": None, "message": str(exc), "value": None}

    outcome, _, error = run_bounded_video_download(
        run_api_attempt,
        out_dir,
        driver="python-api",
        retry_delays=retry_delays,
        sleeper=sleeper,
    )
    if error is not None or outcome is None:
        (out_dir / "video_download_failure.json").write_text(
            json.dumps(
                {
                    "message": str(error),
                    "source": source,
                    "fallback": "storyboard",
                    "driver": "python-api",
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        return None
    cleanup_successful_video_download(out_dir)
    info = outcome["value"]
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

    videos = [
        path
        for path in sorted(out_dir.glob("source.*"))
        if path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".avi"}
    ]
    if not videos:
        fail("yt-dlp 다운로드 결과 영상 파일을 찾지 못했습니다.")
    return videos[0]


def iter_exception_chain(exc: Exception):
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def classify_download_error(exc: Exception) -> dict:
    chain = list(iter_exception_chain(exc))
    if any(isinstance(item, RetryableMediaTransferError) for item in chain):
        return {"disposition": "transient", "category": "media_transfer_http_403"}
    messages = [str(item) for item in chain]
    combined = "\n".join(messages).lower()
    statuses = [
        int(match)
        for message in messages
        for match in re.findall(r"\bhttp(?:\s+error)?\s+(\d{3})\b", message, flags=re.IGNORECASE)
    ]
    for status in statuses:
        if status in {400, 401, 403, 404}:
            return {"disposition": "permanent", "category": f"http_{status}"}
    for status in statuses:
        if status in {408, 429} or 500 <= status <= 599:
            return {"disposition": "transient", "category": f"http_{status}"}
    if statuses:
        return {"disposition": "unknown", "category": f"http_{statuses[0]}"}

    for phrase, category in PERMANENT_DOWNLOAD_PHRASES:
        if phrase in combined:
            return {"disposition": "permanent", "category": category}

    if any(isinstance(item, TimeoutError) for item in chain):
        return {"disposition": "transient", "category": "timeout"}
    if any(isinstance(item, ConnectionResetError) for item in chain):
        return {"disposition": "transient", "category": "connection_reset"}
    if "the page needs to be reloaded" in combined:
        return {"disposition": "transient", "category": "reload_required"}
    if "timed out" in combined or "timeout" in combined:
        return {"disposition": "transient", "category": "timeout"}
    if "connection reset" in combined:
        return {"disposition": "transient", "category": "connection_reset"}
    return {"disposition": "unknown", "category": None}


def run_with_transient_download_retry(
    operation,
    retry_delays=STORYBOARD_RETRY_DELAYS_SECONDS,
    sleeper=time.sleep,
    operation_label="storyboard 다운로드",
    retry_predicate=None,
):
    applied_delays: list[float] = []
    last_transient_category = None
    for attempt in range(1, len(retry_delays) + 2):
        try:
            result = operation(attempt)
            return result, {
                "attempt_count": attempt,
                "retry_count": attempt - 1,
                "last_transient_category": last_transient_category,
                "retry_sleep_seconds": round(sum(applied_delays), 3),
                "retry_sleep_delays_seconds": applied_delays,
            }
        except Exception as exc:
            if retry_predicate is not None and not retry_predicate(exc):
                raise
            classification = classify_download_error(exc)
            if classification["disposition"] != "transient" or attempt > len(retry_delays):
                raise
            delay = float(retry_delays[attempt - 1])
            last_transient_category = classification["category"]
            applied_delays.append(delay)
            print(
                f"[WARN] {operation_label} 일시 오류({last_transient_category}), "
                f"{delay:g}초 후 재시도 {attempt + 1}/{len(retry_delays) + 1}",
                file=sys.stderr,
            )
            sleeper(delay)
    raise AssertionError("unreachable retry state")


class RetryableMediaTransferError(RuntimeError):
    pass


def is_retryable_media_transfer_exception(exc: Exception) -> bool:
    return any(isinstance(item, RetryableMediaTransferError) for item in iter_exception_chain(exc))


def snapshot_partial_downloads(out_dir: Path) -> dict:
    files = []
    try:
        paths = sorted(out_dir.glob("source.*.part"))
        for path in paths:
            files.append({"path": path.name, "size": path.stat().st_size})
    except OSError as exc:
        return {"files": files, "error": str(exc)}
    return {"files": files, "error": None}


def is_retryable_media_transfer_403(message: str, parts: dict) -> bool:
    return (
        "unable to download video data: http error 403" in message.lower()
        and parts.get("error") is None
        and not has_permanent_download_signal(message)
    )


def has_permanent_download_signal(message: str) -> bool:
    lowered = message.lower()
    return any(phrase in lowered for phrase, _ in PERMANENT_DOWNLOAD_PHRASES)


def media_transfer_retry_mode(parts: dict) -> str | None:
    if parts.get("error") is not None:
        return None
    if any(int(item.get("size", 0)) > 0 for item in parts.get("files", [])):
        return "resume"
    return "restart"


def run_bounded_video_download(
    attempt_runner,
    out_dir: Path,
    driver: str,
    retry_delays=STORYBOARD_RETRY_DELAYS_SECONDS,
    sleeper=time.sleep,
):
    attempts = []

    def operation(attempt: int):
        parts_before = snapshot_partial_downloads(out_dir)
        outcome = attempt_runner(attempt)
        parts_after = snapshot_partial_downloads(out_dir)
        message = str(outcome.get("message") or "")
        if outcome.get("success"):
            classification = {"disposition": "success", "category": None}
        elif is_retryable_media_transfer_403(message, parts_after):
            classification = {"disposition": "transient", "category": "media_transfer_http_403"}
        else:
            classification = classify_download_error(RuntimeError(message))
        transfer_retry_mode = (
            media_transfer_retry_mode(parts_after)
            if classification["category"] == "media_transfer_http_403"
            else None
        )
        will_retry = classification["disposition"] == "transient" and attempt <= len(retry_delays)
        attempts.append({
            "attempt": attempt,
            "driver": driver,
            "exit_code": outcome.get("exit_code"),
            "message": message[-4000:],
            "disposition": classification["disposition"],
            "category": classification["category"],
            "transfer_retry_mode": transfer_retry_mode,
            "parts_before": parts_before,
            "parts_after": parts_after,
            "sleep_seconds": float(retry_delays[attempt - 1]) if will_retry else 0,
        })
        if outcome.get("success"):
            return outcome
        if classification["category"] == "media_transfer_http_403":
            raise RetryableMediaTransferError(message)
        raise RuntimeError(message)

    outcome = None
    error = None
    retry_meta = None
    try:
        outcome, retry_meta = run_with_transient_download_retry(
            operation,
            retry_delays=retry_delays,
            sleeper=sleeper,
            operation_label="원본 영상 다운로드",
            retry_predicate=is_retryable_media_transfer_exception,
        )
    except Exception as exc:
        error = exc
    retry_delays_applied = [item["sleep_seconds"] for item in attempts if item["sleep_seconds"] > 0]
    last_transient_category = next(
        (item["category"] for item in reversed(attempts) if item["disposition"] == "transient"),
        None,
    )
    status = "fallback" if error is not None else ("recovered" if len(attempts) > 1 else "success")
    artifact = {
        "schemaVersion": 1,
        "driver": driver,
        "status": status,
        "attempt_count": len(attempts),
        "retry_count": max(0, len(attempts) - 1),
        "last_transient_category": (
            retry_meta.get("last_transient_category") if retry_meta is not None else last_transient_category
        ),
        "retry_sleep_seconds": round(sum(retry_delays_applied), 3),
        "retry_sleep_delays_seconds": retry_delays_applied,
        "attempts": attempts,
    }
    (out_dir / "video-download-attempts.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return outcome, artifact, error


def cleanup_successful_video_download(out_dir: Path) -> None:
    (out_dir / "video_download_failure.json").unlink(missing_ok=True)
    for path in sorted(out_dir.glob("source.*.part")):
        path.unlink()


def download_storyboard(
    source: str,
    out_dir: Path,
    retry_delays=STORYBOARD_RETRY_DELAYS_SECONDS,
    sleeper=time.sleep,
) -> tuple[Path, dict]:
    try:
        import yt_dlp  # type: ignore
    except ImportError as exc:
        fail("yt-dlp가 설치되어 있지 않습니다. `python3 -m pip install -U yt-dlp`를 실행하세요.")
        raise exc

    out_dir.mkdir(parents=True, exist_ok=True)
    canonical_path = out_dir / "storyboard.mhtml"

    def attempt_download(attempt: int) -> Path:
        attempt_dir = out_dir / f".storyboard-attempt-{attempt}-{uuid.uuid4().hex}"
        attempt_dir.mkdir(parents=True, exist_ok=False)
        output_template = str(attempt_dir / "storyboard.%(ext)s")
        options = {
            "format": "sb0",
            "outtmpl": output_template,
            "quiet": False,
            "noplaylist": True,
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.extract_info(source, download=True)
            candidates = sorted(attempt_dir.glob("storyboard*.mhtml"))
            if not candidates:
                raise RuntimeError("storyboard fallback 다운로드 결과 mhtml 파일을 찾지 못했습니다.")
            canonical_path.unlink(missing_ok=True)
            os.replace(candidates[0], canonical_path)
            return canonical_path
        finally:
            shutil.rmtree(attempt_dir, ignore_errors=True)

    return run_with_transient_download_retry(
        attempt_download,
        retry_delays=retry_delays,
        sleeper=sleeper,
    )


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


def detect_screen_ocr_change_candidates(
    pts_values,
    samples,
    min_gap_sec: float = SCREEN_OCR_DEFAULT_MIN_GAP_SEC,
    change_threshold: float = SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD,
    candidate_limit: int = SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT,
):
    """Find likely caption-change timestamps in the same 160x90 scan used for scenes.

    The low-resolution samples only decide *when* to inspect. OCR always receives the
    normal saved frame, never this thumbnail.
    """
    if len(pts_values) != len(samples):
        raise ValueError("screen OCR sample/PTS pairing mismatch")
    if len(samples) < 2:
        return [], {
            "screen_ocr_scan_version": SCREEN_OCR_SCAN_VERSION,
            "screen_ocr_scan_sample_count": len(samples),
            "screen_ocr_candidate_count": 0,
        }

    height = int(samples.shape[1])
    regions = (
        ("top", 0, max(1, int(round(height * 0.34))), 1.0),
        ("bottom", min(height - 1, int(round(height * 0.62))), height, 1.0),
        ("center", max(0, int(round(height * 0.28))), min(height, int(round(height * 0.72))), 1.5),
    )
    last_kept_by_region = {name: -math.inf for name, *_ in regions}
    raw_candidates: list[SceneCandidate] = []
    previous = samples[0]
    for timestamp_sec, gray in zip(pts_values[1:], samples[1:]):
        scored_regions = []
        for name, y0, y1, multiplier in regions:
            previous_roi = previous[y0:y1, :]
            current_roi = gray[y0:y1, :]
            if previous_roi.size == 0:
                continue
            score = float(abs(current_roi.astype("int16") - previous_roi.astype("int16")).mean() / 255.0)
            if score >= change_threshold * multiplier and timestamp_sec - last_kept_by_region[name] >= min_gap_sec:
                scored_regions.append((score, name))
        if scored_regions:
            score, region = max(scored_regions, key=lambda item: (item[0], item[1] == "bottom", item[1] == "top"))
            raw_candidates.append(make_scene_candidate(
                timestamp_sec,
                f"screen-ocr:{region}",
                score,
                "ffmpeg_showinfo_pts",
            ))
            last_kept_by_region[region] = timestamp_sec
        previous = gray

    if candidate_limit > 0 and len(raw_candidates) > candidate_limit:
        candidates = select_scene_candidates(raw_candidates, candidate_limit, "balanced")
    else:
        candidates = raw_candidates
    return candidates, {
        "screen_ocr_scan_version": SCREEN_OCR_SCAN_VERSION,
        "screen_ocr_scan_sample_count": len(samples),
        "screen_ocr_raw_candidate_count": len(raw_candidates),
        "screen_ocr_candidate_count": len(candidates),
        "screen_ocr_change_threshold": change_threshold,
        "screen_ocr_min_gap_sec": min_gap_sec,
        "screen_ocr_candidate_limit": candidate_limit,
    }


def collect_scene_candidates_ffmpeg(
    cv2,
    video_path: Path,
    scene_threshold: float,
    min_scene_gap: float,
    scene_scan_interval: float,
    screen_ocr_enabled: bool = False,
    screen_ocr_change_threshold: float = SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD,
    screen_ocr_min_gap_sec: float = SCREEN_OCR_DEFAULT_MIN_GAP_SEC,
    screen_ocr_candidate_limit: int = SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT,
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

    screen_ocr_candidates = []
    screen_ocr_stats = {
        "screen_ocr_scan_version": SCREEN_OCR_SCAN_VERSION,
        "screen_ocr_scan_sample_count": 0,
        "screen_ocr_candidate_count": 0,
    }
    if screen_ocr_enabled:
        screen_ocr_started = monotonic_ms()
        screen_ocr_candidates, screen_ocr_stats = detect_screen_ocr_change_candidates(
            pts_values,
            samples,
            min_gap_sec=screen_ocr_min_gap_sec,
            change_threshold=screen_ocr_change_threshold,
            candidate_limit=screen_ocr_candidate_limit,
        )
        screen_ocr_stats["screen_ocr_region_scan_ms"] = round(monotonic_ms() - screen_ocr_started, 3)

    return candidates, {
        "duration_sec": round(probe_duration_seconds(video_path), 3),
        "scene_scanner": "ffmpeg-pts",
        "scene_scan_sample_count": frame_count,
        "scene_scan_interval_sec": scene_scan_interval,
        "timestamp_source": "showinfo_pts_time",
        "_screen_ocr_candidates": screen_ocr_candidates,
        **screen_ocr_stats,
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


def collect_scene_candidates(
    cv2,
    video_path: Path,
    scene_threshold: float,
    min_scene_gap: float,
    scene_scan_interval: float,
    screen_ocr_enabled: bool = False,
    screen_ocr_change_threshold: float = SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD,
    screen_ocr_min_gap_sec: float = SCREEN_OCR_DEFAULT_MIN_GAP_SEC,
    screen_ocr_candidate_limit: int = SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT,
):
    try:
        return collect_scene_candidates_ffmpeg(
            cv2,
            video_path,
            scene_threshold,
            min_scene_gap,
            scene_scan_interval,
            screen_ocr_enabled=screen_ocr_enabled,
            screen_ocr_change_threshold=screen_ocr_change_threshold,
            screen_ocr_min_gap_sec=screen_ocr_min_gap_sec,
            screen_ocr_candidate_limit=screen_ocr_candidate_limit,
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
            "screen_ocr_scan_version": SCREEN_OCR_SCAN_VERSION,
            "screen_ocr_scan_sample_count": 0,
            "screen_ocr_candidate_count": 0,
            "screen_ocr_fallback_reason": "ffmpeg-scan-unavailable",
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
        screen_ocr_enabled=getattr(args, "screen_ocr_scan", False),
        screen_ocr_change_threshold=getattr(args, "screen_ocr_change_threshold", SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD),
        screen_ocr_min_gap_sec=getattr(args, "screen_ocr_min_gap", SCREEN_OCR_DEFAULT_MIN_GAP_SEC),
        screen_ocr_candidate_limit=getattr(args, "screen_ocr_candidate_limit", SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT),
    )
    screen_ocr_candidates = stats.pop("_screen_ocr_candidates", [])
    if screen_ocr_candidates:
        candidates = sorted(screen_ocr_candidates + candidates, key=lambda item: item.timestamp_sec)
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
    screen_ocr_candidates: list[SceneCandidate] | None = None,
):
    anchors = interval_anchor_candidates(duration, anchor_budget)
    if max_frames > 0 and len(anchors) > max_frames:
        anchors = select_scene_candidates(anchors, max_frames, "balanced")

    selected = list(anchors)
    screen_ocr_candidates = list(screen_ocr_candidates or [])
    screen_ocr_selected_count = 0
    for candidate in sorted(screen_ocr_candidates, key=lambda item: item.timestamp_sec):
        existing_index = next((
            index
            for index, existing in enumerate(selected)
            if abs(existing.timestamp_sec - candidate.timestamp_sec) <= dedupe_tolerance
        ), None)
        if existing_index is not None:
            selected[existing_index] = candidate
            screen_ocr_selected_count += 1
            continue
        if max_frames > 0 and len(selected) >= max_frames:
            break
        selected.append(candidate)
        screen_ocr_selected_count += 1
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
        "screen_ocr_candidate_count": len(screen_ocr_candidates),
        "screen_ocr_selected_count": screen_ocr_selected_count,
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
        screen_ocr_enabled=getattr(args, "screen_ocr_scan", False),
        screen_ocr_change_threshold=getattr(args, "screen_ocr_change_threshold", SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD),
        screen_ocr_min_gap_sec=getattr(args, "screen_ocr_min_gap", SCREEN_OCR_DEFAULT_MIN_GAP_SEC),
        screen_ocr_candidate_limit=getattr(args, "screen_ocr_candidate_limit", SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT),
    )
    screen_ocr_candidates = stats.pop("_screen_ocr_candidates", [])
    scene_scan_ms = round(monotonic_ms() - scene_scan_started, 3)
    selected, hybrid_stats = select_hybrid_candidates(
        scene_candidates,
        duration=float(stats.get("duration_sec") or 0),
        anchor_budget=args.hybrid_anchor_budget,
        max_frames=args.max_frames,
        screen_ocr_candidates=screen_ocr_candidates,
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
    storyboard_path, download_stats = download_storyboard(source, out_dir)
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
        "storyboard_download_attempt_count": download_stats["attempt_count"],
        "storyboard_download_retry_count": download_stats["retry_count"],
        "storyboard_download_last_transient_category": download_stats["last_transient_category"],
        "storyboard_download_retry_sleep_seconds": download_stats["retry_sleep_seconds"],
        "storyboard_download_retry_sleep_delays_seconds": download_stats["retry_sleep_delays_seconds"],
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
    if getattr(args, "screen_ocr_candidate_limit", SCREEN_OCR_DEFAULT_CANDIDATE_LIMIT) < 0:
        fail("--screen-ocr-candidate-limit은 0 이상이어야 합니다.")
    if getattr(args, "screen_ocr_change_threshold", SCREEN_OCR_DEFAULT_CHANGE_THRESHOLD) <= 0:
        fail("--screen-ocr-change-threshold는 0보다 커야 합니다.")
    if getattr(args, "screen_ocr_min_gap", SCREEN_OCR_DEFAULT_MIN_GAP_SEC) < 0:
        fail("--screen-ocr-min-gap은 0 이상이어야 합니다.")

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
            "screen_ocr_scan": bool(getattr(args, "screen_ocr_scan", False)),
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
