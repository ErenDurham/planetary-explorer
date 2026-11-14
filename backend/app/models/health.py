from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ServiceStatus(BaseModel):
    data: Literal["ok", "error"]
    retrieval: Literal["ok", "unavailable"]
    llm: Literal["configured", "unconfigured", "error"]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    profile_version: str
    scoring_spec_version: str
    services: ServiceStatus
