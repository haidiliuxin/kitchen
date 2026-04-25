import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

import imageio_ffmpeg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from faster_whisper import WhisperModel
except Exception as error:  # pragma: no cover - import-time dependency issue
    WhisperModel = None
    _IMPORT_ERROR = error
else:
    _IMPORT_ERROR = None


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_YT_DLP_PATH = (
    ROOT_DIR / "data" / "tools" / ("yt-dlp.exe" if os.name == "nt" else "yt-dlp")
)


class TranscribeRequest(BaseModel):
    url: str = Field(..., description="Video page URL")
    sourceType: str | None = Field(default=None)
    mediaUrl: str | None = Field(default=None)
    title: str | None = Field(default=None)
    description: str | None = Field(default=None)
    content: str | None = Field(default=None)


class TranscribeResponse(BaseModel):
    transcript: str
    language: str | None = None
    notes: list[str]
    title: str | None = None
    description: str | None = None
    content: str | None = None


app = FastAPI(title="Kitchen Whisper Service")
_model_cache: dict[tuple[str, str, str], Any] = {}
logger = logging.getLogger("kitchen-whisper-service")


def get_env(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def resolve_yt_dlp_binary() -> str:
    configured = os.getenv("YT_DLP_BINARY_PATH", "").strip()
    if configured and Path(configured).exists():
        return configured
    if DEFAULT_YT_DLP_PATH.exists():
        return str(DEFAULT_YT_DLP_PATH)
    return "yt-dlp"


def resolve_python_cache_dir() -> str:
    configured = os.getenv("WHISPER_CACHE_DIR", "").strip()
    if configured:
        Path(configured).mkdir(parents=True, exist_ok=True)
        return configured

    cache_dir = ROOT_DIR / "tools" / "whisper-service" / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return str(cache_dir)


def run_command(command: list[str], cwd: Path | None = None) -> str:
    completed = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        raise RuntimeError(stderr or stdout or "Subprocess failed.")
    return completed.stdout


def run_command_with_retries(command: list[str], cwd: Path | None = None, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return run_command(command, cwd=cwd)
        except Exception as error:
            last_error = error
            if attempt == attempts - 1:
                break
            time.sleep(2 + attempt)

    raise RuntimeError(str(last_error) if last_error else "Subprocess failed after retries.")


def get_whisper_model():
    if WhisperModel is None:
        raise RuntimeError(f"faster-whisper import failed: {_IMPORT_ERROR}")

    model_size = get_env("WHISPER_MODEL_SIZE", "small")
    compute_type = get_env("WHISPER_COMPUTE_TYPE", "int8")
    device = get_env("WHISPER_DEVICE", "cpu")
    cache_key = (model_size, compute_type, device)
    if cache_key not in _model_cache:
        _model_cache[cache_key] = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=resolve_python_cache_dir(),
        )
    return _model_cache[cache_key]


def fetch_video_metadata(url: str) -> dict[str, Any]:
    yt_dlp_binary = resolve_yt_dlp_binary()
    output = run_command_with_retries(
        [
            yt_dlp_binary,
            url,
            "--skip-download",
            "--no-warnings",
            "--simulate",
            "--dump-single-json",
            "--write-auto-subs",
            "--write-subs",
            "--sub-langs",
            "zh-Hans,zh-CN,zh.*,en.*",
            "--user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36",
        ]
    )
    return json.loads(output)


def pick_audio_download(metadata: dict[str, Any]) -> tuple[str, str, dict[str, str]]:
    direct_url = metadata.get("url")
    extension = str(metadata.get("ext") or "bin").strip() or "bin"
    headers = metadata.get("http_headers") if isinstance(metadata.get("http_headers"), dict) else {}

    if isinstance(direct_url, str) and direct_url.strip():
        return direct_url.strip(), extension, {
            str(key): str(value) for key, value in headers.items() if value is not None
        }

    formats = metadata.get("formats") if isinstance(metadata.get("formats"), list) else []
    for item in formats:
        if not isinstance(item, dict):
            continue
        format_url = item.get("url")
        acodec = str(item.get("acodec") or "").strip()
        vcodec = str(item.get("vcodec") or "").strip()
        format_ext = str(item.get("ext") or "bin").strip() or "bin"
        format_headers = item.get("http_headers") if isinstance(item.get("http_headers"), dict) else headers

        if isinstance(format_url, str) and format_url.strip() and acodec and acodec != "none" and (
            not vcodec or vcodec == "none"
        ):
            return format_url.strip(), format_ext, {
                str(key): str(value) for key, value in format_headers.items() if value is not None
            }

    raise RuntimeError("No downloadable audio stream was found in yt-dlp metadata.")


def download_audio_track(url: str, workdir: Path) -> Path:
    yt_dlp_binary = resolve_yt_dlp_binary()
    output = run_command_with_retries(
        [
            yt_dlp_binary,
            url,
            "--skip-download",
            "--no-playlist",
            "--no-warnings",
            "-f",
            "bestaudio/best",
            "--dump-single-json",
            "--user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36",
        ],
    )
    metadata = json.loads(output)
    stream_url, extension, headers = pick_audio_download(metadata)

    target_path = workdir / f"media.{extension}"
    request = urllib.request.Request(stream_url, headers=headers)
    with urllib.request.urlopen(request) as response, open(target_path, "wb") as file:
        shutil.copyfileobj(response, file)

    if not target_path.exists():
        raise RuntimeError("Audio stream download failed.")
    return target_path


def download_direct_media(media_url: str, workdir: Path) -> Path:
    target_path = workdir / "rendered-media.mp4"
    request = urllib.request.Request(
        media_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
        },
    )
    with urllib.request.urlopen(request) as response, open(target_path, "wb") as file:
        shutil.copyfileobj(response, file)
    return target_path


def build_metadata_content(metadata: dict[str, Any]) -> str:
    chapters = metadata.get("chapters") or []
    tags = metadata.get("tags") or []
    categories = metadata.get("categories") or []
    uploader = metadata.get("uploader") or metadata.get("channel")
    duration = metadata.get("duration")

    lines = [
        f"标题：{metadata.get('title', '').strip()}" if metadata.get("title") else "",
        f"作者：{str(uploader).strip()}" if uploader else "",
        f"时长：{round(float(duration) / 60, 1)} 分钟" if isinstance(duration, (int, float)) else "",
        f"简介：{str(metadata.get('description', '')).strip()}" if metadata.get("description") else "",
        f"标签：{'、'.join(str(item).strip() for item in tags[:15] if str(item).strip())}" if tags else "",
        (
            "章节："
            + "；".join(
                f"{index + 1}.{str(chapter.get('title', '')).strip()}"
                for index, chapter in enumerate(chapters[:12])
                if isinstance(chapter, dict) and str(chapter.get("title", "")).strip()
            )
        )
        if chapters
        else "",
        (
            "分类：" + "、".join(str(item).strip() for item in categories[:8] if str(item).strip())
        )
        if categories
        else "",
    ]

    return "\n".join(item for item in lines if item).strip()


def transcribe_audio_file(audio_path: Path) -> tuple[str, str | None]:
    beam_size = int(get_env("WHISPER_BEAM_SIZE", "5"))
    model = get_whisper_model()

    pass_configs = [
        {"vad_filter": True, "language": None},
        {"vad_filter": False, "language": "zh"},
        {"vad_filter": False, "language": None},
    ]

    best_transcript = ""
    best_language = None

    for config in pass_configs:
        segments, info = model.transcribe(
            str(audio_path),
            beam_size=beam_size,
            vad_filter=config["vad_filter"],
            condition_on_previous_text=False,
            task="transcribe",
            language=config["language"],
        )

        transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
        transcript = " ".join(transcript.split()).strip()
        if len(transcript) > len(best_transcript):
            best_transcript = transcript
            best_language = getattr(info, "language", None)

        if transcript and not is_low_quality_transcript(transcript):
            return transcript, getattr(info, "language", None)

    return best_transcript, best_language


def extract_audio_for_whisper(media_path: Path, workdir: Path) -> Path:
    ffmpeg_binary = imageio_ffmpeg.get_ffmpeg_exe()
    target_path = workdir / "whisper-input.wav"
    run_command(
        [
            ffmpeg_binary,
            "-y",
            "-i",
            str(media_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            str(target_path),
        ]
    )
    return target_path


def build_transcript_fallback_text(request: TranscribeRequest) -> str:
    chunks = [request.title or "", request.description or "", request.content or ""]
    text = " ".join(chunk.strip() for chunk in chunks if chunk and chunk.strip())
    return " ".join(text.split()).strip()


def contains_cjk(text: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def is_low_quality_transcript(
    transcript: str,
    language: str | None = None,
    fallback_hint: str = "",
) -> bool:
    cleaned = transcript.strip()
    if not cleaned:
        return True

    tokens = [token for token in cleaned.replace("，", " ").replace("。", " ").split() if token]
    if len(cleaned) < 24 or len(tokens) <= 3:
        return True

    unique_ratio = len(set(tokens)) / max(len(tokens), 1)
    repeated_short_tokens = sum(1 for token in tokens if len(token) <= 2)

    if unique_ratio < 0.3:
        return True

    if repeated_short_tokens / max(len(tokens), 1) > 0.75:
        return True

    suspicious_chars = sum(1 for char in cleaned if ord(char) > 127 and char not in "，。！？：；、“”‘’（）()[]【】%#@&+-/ ")
    if suspicious_chars / max(len(cleaned), 1) > 0.4:
        return True

    ascii_like_chars = sum(1 for char in cleaned if ord(char) < 128)
    if ascii_like_chars / max(len(cleaned), 1) > 0.7 and contains_cjk(fallback_hint):
        return True

    digit_chars = sum(1 for char in cleaned if char.isdigit())
    if digit_chars / max(len(cleaned), 1) > 0.2 and contains_cjk(fallback_hint):
        return True

    if language and language.lower() not in {"zh", "zh-cn", "zh-tw", "zh-hans", "zh-hant"} and contains_cjk(fallback_hint):
        return True

    return False


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ytDlpBinary": resolve_yt_dlp_binary(),
        "ffmpegBinary": imageio_ffmpeg.get_ffmpeg_exe(),
        "model": get_env("WHISPER_MODEL_SIZE", "small"),
    }


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(request: TranscribeRequest):
    if not request.url.strip():
        raise HTTPException(status_code=400, detail="url is required")

    try:
        metadata = fetch_video_metadata(request.url.strip()) if not request.mediaUrl else {}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"metadata fetch failed: {error}") from error

    temp_root = Path(tempfile.mkdtemp(prefix="kitchen-whisper-"))
    notes = ["已通过本地 Whisper 服务抓取视频音频并进行 ASR 转写。"]

    try:
        media_path = (
            download_direct_media(request.mediaUrl.strip(), temp_root)
            if request.mediaUrl and request.mediaUrl.strip()
            else download_audio_track(request.url.strip(), temp_root)
        )
        audio_path = extract_audio_for_whisper(media_path, temp_root)
        transcript, language = transcribe_audio_file(audio_path)
        fallback_text = build_transcript_fallback_text(request)
        if not transcript or is_low_quality_transcript(transcript, language, fallback_text):
            if fallback_text:
                transcript = fallback_text
                language = language or "zh"
                notes.append("音频转写结果为空或质量较差，已回退到页面标题/文案兜底。")

        if not transcript:
            raise HTTPException(status_code=500, detail="Whisper returned an empty transcript.")

        notes.append("已优先使用音频 ASR，而不是只依赖平台字幕。")
        if request.mediaUrl and request.mediaUrl.strip():
            notes.append("已使用浏览器渲染得到的视频直链作为转写输入。")
        return TranscribeResponse(
            transcript=transcript[:16000],
            language=language,
            notes=notes,
            title=request.title or str(metadata.get("title", "")).strip() or None,
            description=request.description or str(metadata.get("description", "")).strip()[:500] or None,
            content=request.content or build_metadata_content(metadata)[:12000] or None,
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Whisper transcription failed for %s", request.url)
        raise HTTPException(status_code=500, detail=f"transcription failed: {error}") from error
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
