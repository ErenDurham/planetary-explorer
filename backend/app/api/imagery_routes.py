"""Verified site imagery: the manifest and a cached, allow-listed asset proxy.

Why a proxy: the frontend never fetches an arbitrary URL. It asks for
`/imagery/{entry_id}/asset`; the backend serves the cached file written by the
build script, or - only if the cache is missing - fetches the manifest's own
`asset_url` from an allow-listed host with a size cap and an image MIME check,
caches it and serves it. Nothing user-supplied is ever fetched.
"""
from __future__ import annotations

import io
import re
import urllib.request
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config.settings import get_settings
from app.models import ApiError, ImageryManifest, SiteImagery

router = APIRouter(prefix="/api/v1")
ERR = {404: {"model": ApiError}, 502: {"model": ApiError}, 503: {"model": ApiError}}
MAX_BYTES = 6_000_000


def _img_dir() -> Path:
    return get_settings().data_dir / "imagery"


@lru_cache
def load_manifest() -> ImageryManifest:
    p = _img_dir() / "manifest.json"
    if not p.exists():
        raise HTTPException(status_code=503, detail={"code": "imagery_unavailable", "message": "imagery manifest not built; run scripts/site_imagery_ctx.py and scripts/site_imagery_nasa.py", "details": None})
    return ImageryManifest.model_validate_json(p.read_text())


def _entry(entry_id: str):
    for site in load_manifest().sites.values():
        for e in site.entries:
            if e.entry_id == entry_id:
                return e
    raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"imagery entry '{entry_id}' not found", "details": None})


@router.get("/sites/{site_id}/imagery", response_model=SiteImagery, responses=ERR)
def site_imagery(site_id: str) -> SiteImagery:
    m = load_manifest()
    if site_id not in m.sites:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"no imagery record for site '{site_id}'", "details": None})
    return m.sites[site_id]


@router.get("/imagery/{entry_id}/asset", responses=ERR)
def imagery_asset(entry_id: str):
    e = _entry(entry_id)
    if not e.local_asset or not re.fullmatch(r"[a-z0-9_]+\.(jpg|png)", e.local_asset):
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "entry has no cached asset", "details": None})
    path = _img_dir() / "assets" / e.local_asset
    if not path.exists():
        _fetch_to_cache(e.asset_url, path, load_manifest().allowlist)
    return FileResponse(path, media_type=e.mime_type or "image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


def _fetch_to_cache(url: str, dest: Path, allowlist: list[str]) -> None:
    host = re.sub(r"^https?://([^/]+).*$", r"\1", url)
    if host not in allowlist or not url.startswith("https://"):
        raise HTTPException(status_code=502, detail={"code": "asset_not_allowed", "message": "asset host is not allow-listed", "details": host})
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PlanetaryExplorer/0.1"})
        # Assets are curated. A redirect must not turn the allowlist into an
        # arbitrary network fetch; require a direct URL from the build pipeline.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=30) as r:
            ctype = r.headers.get("Content-Type", "")
            data = r.read(MAX_BYTES + 1)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail={"code": "asset_fetch_failed", "message": "could not fetch the source asset", "details": type(e).__name__}) from e
    if not ctype.startswith("image/") or len(data) > MAX_BYTES:
        raise HTTPException(status_code=502, detail={"code": "asset_rejected", "message": "source asset is not an image under the size cap", "details": {"content_type": ctype, "bytes": len(data)}})
    try:
        from PIL import Image
        Image.open(io.BytesIO(data)).load()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail={"code": "asset_rejected", "message": "source asset did not decode as an image", "details": type(e).__name__}) from e
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
