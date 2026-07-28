"""Privacy Shield management and security audit endpoints."""

import asyncio
import json
import logging
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

import aiohttp
from fastapi import APIRouter, Depends

from config import AGENT_URL, DREAM_AGENT_KEY, INSTALL_DIR, SERVICES
from models import PrivacyShieldStatus, PrivacyShieldToggle, SecurityAuditCheck, SecurityAuditResult
from security import verify_api_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["privacy"])


@router.get("/api/privacy-shield/status", response_model=PrivacyShieldStatus)
async def get_privacy_shield_status(api_key: str = Depends(verify_api_key)):
    """Get Privacy Shield status and configuration."""
    _ps = SERVICES.get("privacy-shield", {})
    shield_port = int(os.environ.get("SHIELD_PORT", str(_ps.get("port", 0))))
    shield_url = f"http://{_ps.get('host', 'privacy-shield')}:{shield_port}"

    # Check health directly — no Docker socket needed
    service_healthy = False
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
            async with session.get(f"{shield_url}/health") as resp:
                service_healthy = resp.status == 200
    except (asyncio.TimeoutError, aiohttp.ClientError, OSError):
        logger.debug("Privacy-shield health check failed")

    container_running = service_healthy

    return PrivacyShieldStatus(
        enabled=container_running and service_healthy,
        container_running=container_running,
        port=shield_port,
        target_api=os.environ.get("TARGET_API_URL", f"http://{SERVICES.get('llama-server', {}).get('host', 'llama-server')}:{SERVICES.get('llama-server', {}).get('port', 0)}/v1"),
        pii_cache_enabled=os.environ.get("PII_CACHE_ENABLED", "true").lower() == "true",
        message="Privacy Shield is active" if (container_running and service_healthy) else "Privacy Shield is not running. Check: docker compose ps privacy-shield"
    )


@router.post("/api/privacy-shield/toggle")
async def toggle_privacy_shield(request: PrivacyShieldToggle, api_key: str = Depends(verify_api_key)):
    """Enable or disable Privacy Shield via host agent."""
    action = "start" if request.enable else "stop"

    def _call_agent():
        url = f"{AGENT_URL}/v1/extension/{action}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DREAM_AGENT_KEY}",
        }
        data = json.dumps({"service_id": "privacy-shield"}).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status == 200

    try:
        ok = await asyncio.to_thread(_call_agent)
        if ok:
            msg = "Privacy Shield started. PII scrubbing is now active." if request.enable else "Privacy Shield stopped."
            return {"success": True, "message": msg}
        return {"success": False, "message": f"Host agent returned failure for {action}"}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()
        except Exception:
            pass
        logger.warning("Privacy Shield toggle failed: HTTP %d: %s", e.code, body)
        return {"success": False, "message": f"Host agent returned error ({e.code}): {body or e.reason}"}
    except urllib.error.URLError:
        return {"success": False, "message": "Host agent not reachable", "note": "Ensure the dream host agent is running"}
    except asyncio.TimeoutError:
        return {"success": False, "message": "Operation timed out"}
    except OSError:
        logger.exception("Privacy Shield toggle failed")
        return {"success": False, "message": "Privacy Shield operation failed"}


@router.get("/api/privacy-shield/stats")
async def get_privacy_shield_stats(api_key: str = Depends(verify_api_key)):
    """Get Privacy Shield usage statistics."""
    _ps = SERVICES.get("privacy-shield", {})
    shield_port = int(os.environ.get("SHIELD_PORT", str(_ps.get("port", 0))))
    shield_url = f"http://{_ps.get('host', 'privacy-shield')}:{shield_port}"
    shield_api_key = os.environ.get("SHIELD_API_KEY", "")
    if not shield_api_key:
        return {"error": "SHIELD_API_KEY not configured", "enabled": False}
    headers = {"Authorization": f"Bearer {shield_api_key}"}

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get(f"{shield_url}/stats", headers=headers) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    return {"error": "Privacy Shield not responding", "status": resp.status}
    except (asyncio.TimeoutError, aiohttp.ClientError, OSError):
        logger.exception("Cannot reach Privacy Shield")
        return {"error": "Cannot reach Privacy Shield", "enabled": False}


# ---------------------------------------------------------------------------
# Security audit
# ---------------------------------------------------------------------------

def _check_privacy_shield(services: dict) -> SecurityAuditCheck:
    """Return pass/warn based on whether the privacy-shield service is declared."""
    ps = services.get("privacy-shield")
    if ps:
        return SecurityAuditCheck(
            name="Privacy Shield service declared",
            status="pass",
            message="privacy-shield is registered in the service registry",
        )
    return SecurityAuditCheck(
        name="Privacy Shield service declared",
        status="warn",
        message="privacy-shield is not in the service registry — PII protection may be inactive",
    )


def _check_tailscale(services: dict) -> SecurityAuditCheck:
    """Return pass/warn based on whether the tailscale service is declared."""
    ts = services.get("tailscale")
    if ts:
        return SecurityAuditCheck(
            name="Tailscale remote access declared",
            status="pass",
            message="tailscale is registered in the service registry",
        )
    return SecurityAuditCheck(
        name="Tailscale remote access declared",
        status="warn",
        message="tailscale is not in the service registry — remote access is not configured",
    )


def _check_port_bindings(install_dir: str) -> SecurityAuditCheck:
    """Scan compose files for ports bound to 0.0.0.0 (exposes services to all interfaces)."""
    compose_files = list(Path(install_dir).glob("docker-compose*.yml")) + \
                    list(Path(install_dir).glob("docker-compose*.yaml"))

    exposed: list[str] = []
    for cf in compose_files:
        try:
            text = cf.read_text()
        except OSError:
            continue
        for line in text.splitlines():
            # Match hard-coded "0.0.0.0:<port>:<port>" patterns — not env-var references
            if re.search(r'0\.0\.0\.0:[0-9]', line):
                exposed.append(f"{cf.name}: {line.strip()}")

    if exposed:
        sample = "; ".join(exposed[:3])
        return SecurityAuditCheck(
            name="Compose port bindings",
            status="fail",
            message=(
                f"{len(exposed)} port binding(s) use 0.0.0.0 (exposes services to all network "
                f"interfaces). Use ${{BIND_ADDRESS:-127.0.0.1}} instead. Examples: {sample}"
            ),
        )
    return SecurityAuditCheck(
        name="Compose port bindings",
        status="pass",
        message="No hard-coded 0.0.0.0 port bindings found in compose files",
    )


async def _check_privacy_shield_live(services: dict) -> SecurityAuditCheck:
    """Probe the privacy-shield health endpoint to confirm it is actually reachable."""
    ps = services.get("privacy-shield", {})
    port = int(os.environ.get("SHIELD_PORT", str(ps.get("port", 0))))
    host = ps.get("host", "privacy-shield")
    if not port:
        return SecurityAuditCheck(
            name="Privacy Shield live health",
            status="warn",
            message="privacy-shield port unknown — cannot probe health endpoint",
        )
    url = f"http://{host}:{port}/health"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
            async with session.get(url) as resp:
                if resp.status == 200:
                    return SecurityAuditCheck(
                        name="Privacy Shield live health",
                        status="pass",
                        message=f"privacy-shield responded healthy at {url}",
                    )
                return SecurityAuditCheck(
                    name="Privacy Shield live health",
                    status="warn",
                    message=f"privacy-shield returned HTTP {resp.status} at {url}",
                )
    except (asyncio.TimeoutError, aiohttp.ClientError, OSError):
        return SecurityAuditCheck(
            name="Privacy Shield live health",
            status="warn",
            message=f"privacy-shield not reachable at {url} — container may be stopped",
        )


@router.get("/api/security/audit", response_model=SecurityAuditResult)
async def security_audit(api_key: str = Depends(verify_api_key)):
    """Run a security posture audit across privacy and remote-access services.

    Checks performed:
    - privacy-shield service registration
    - tailscale service registration
    - live health of the privacy-shield container
    - docker-compose port bindings (flags hard-coded 0.0.0.0 bindings)
    """
    checks: list[SecurityAuditCheck] = [
        _check_privacy_shield(SERVICES),
        _check_tailscale(SERVICES),
        await _check_privacy_shield_live(SERVICES),
        _check_port_bindings(INSTALL_DIR),
    ]

    return SecurityAuditResult(
        passed=sum(1 for c in checks if c.status == "pass"),
        warned=sum(1 for c in checks if c.status == "warn"),
        failed=sum(1 for c in checks if c.status == "fail"),
        checks=checks,
    )
