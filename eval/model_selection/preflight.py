"""Read-only hardware/model inventory. Never loads a model or claims a measured peak.

Run on the evaluation host before starting Ollama inference. Existing swap makes the
host ineligible; missing telemetry is BLOCKED, never an implicit zero or a pass.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import subprocess
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

GIB = 1024**3
TAGS = ("7b", "7b-q4_K_M", "3b", "3b-q4_K_M")


def command(*args: str) -> str:
    return subprocess.run(
        args, capture_output=True, text=True, check=True, timeout=15
    ).stdout.strip()


def request_json(url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def host_inventory() -> dict:
    result: dict = {
        "os": platform.system(),
        "os_version": platform.release(),
        "architecture": platform.machine(),
        "errors": [],
    }
    try:
        if result["os"] == "Darwin":
            result["cpu"] = command("sysctl", "-n", "machdep.cpu.brand_string")
            result["system_ram_bytes"] = int(command("sysctl", "-n", "hw.memsize"))
            result["memory_architecture"] = (
                "unified" if result["cpu"].startswith("Apple") else "unknown"
            )
            raw = command("sysctl", "-n", "vm.swapusage")
            result["swap_source"] = raw
            match = re.search(r"used\s*=\s*([0-9.]+)M", raw)
            if not match:
                raise ValueError("unrecognized sysctl swap units")
            result["swap_used_bytes"] = int(float(match[1]) * 1024**2)
            result["vm_stat_raw"] = command("vm_stat")
            result["dedicated_vram_bytes"] = None
        elif result["os"] == "Linux":
            raw = Path("/proc/meminfo").read_text()
            values = {
                name: int(value) * 1024
                for name, value in re.findall(r"^(\w+):\s+(\d+) kB", raw, re.M)
            }
            result["meminfo_raw"] = raw
            result["system_ram_bytes"] = values["MemTotal"]
            result["swap_used_bytes"] = values["SwapTotal"] - values["SwapFree"]
            result["memory_architecture"] = "unknown"
            result["dedicated_vram_bytes"] = None
            # This inventory is not evidence that inference is using or avoiding a GPU.
            try:
                result["nvidia_smi_raw"] = command(
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,memory.used",
                    "--format=csv,noheader,nounits",
                )
            except (OSError, subprocess.SubprocessError) as exc:
                result["errors"].append(f"nvidia_smi:{type(exc).__name__}")
        else:
            result["errors"].append("unsupported_os")
    except (OSError, subprocess.SubprocessError, KeyError, ValueError) as exc:
        result["errors"].append(f"host_inventory:{type(exc).__name__}")
    return result


def assess_host(host: dict, envelope: dict) -> dict:
    """A preflight can refuse a run, but it can never certify workload memory fit."""
    outcomes = {}
    for target, limits in envelope["targets"].items():
        failures, blockers = [], []
        if host.get("swap_used_bytes") is None:
            blockers.append("SWAP_TELEMETRY_UNAVAILABLE")
        elif host["swap_used_bytes"] > 0:
            failures.append("PREEXISTING_SWAP")
        if host.get("system_ram_bytes") is None:
            blockers.append("RAM_TELEMETRY_UNAVAILABLE")
        if target == "A" and host.get("memory_architecture") == "unified":
            blockers.append("NO_SEPARATE_VRAM_ENVELOPE")
        elif target == "A" and not host.get("nvidia_smi_raw"):
            blockers.append("GPU_TELEMETRY_UNAVAILABLE")
        # Independent blockers stay visible even when a definite failure takes precedence.
        outcomes[target] = {
            "status": "FAIL"
            if failures
            else "BLOCKED"
            if blockers
            else "READY_FOR_GATE",
            "failures": failures,
            "blockers": blockers,
            "limits": limits,
            "model_fit": "NOT_MEASURED",
            "physical_limit_enforced": False,
            "gpu_inference_disabled_verified": False,
        }
    return outcomes


def collect(repo: Path, envelope: dict, registry: bool) -> dict:
    result = {
        "schema": "aegis-model-selection-preflight/1",
        "recorded_at_utc": datetime.now(UTC).isoformat(),
        "repo_commit": command("git", "-C", str(repo), "rev-parse", "HEAD"),
        "envelope": envelope,
        "host": host_inventory(),
        "inference_started": False,
        "peak_ram_bytes": None,
        "peak_vram_bytes": None,
        "ollama": {},
        "registry": {},
    }
    result["targets"] = assess_host(result["host"], envelope)
    for name in ("version", "tags", "ps"):
        try:
            result["ollama"][name] = request_json(f"http://127.0.0.1:11434/api/{name}")
        except (OSError, ValueError) as exc:
            result["ollama"][name] = {"error": type(exc).__name__}
    installed = result["ollama"].get("tags", {}).get("models", [])
    result["ollama"]["candidate_details"] = {}
    for model in installed:
        if model["name"] not in {f"qwen2.5vl:{tag}" for tag in TAGS}:
            continue
        try:
            data = request_json(
                "http://127.0.0.1:11434/api/show", {"model": model["name"]}
            )
            result["ollama"]["candidate_details"][model["name"]] = {
                "details": data.get("details"),
                "model_info": data.get("model_info"),
                "capabilities": data.get("capabilities"),
            }
        except (OSError, ValueError) as exc:
            result["ollama"]["candidate_details"][model["name"]] = {
                "error": type(exc).__name__
            }
    if registry:
        for tag in TAGS:
            url = f"https://registry.ollama.ai/v2/library/qwen2.5vl/manifests/{tag}"
            try:
                with urllib.request.urlopen(url, timeout=20) as response:
                    raw = response.read()
                manifest = json.loads(raw)
                result["registry"][tag] = {
                    "url": url,
                    "manifest": manifest,
                    "manifest_sha256": hashlib.sha256(raw).hexdigest(),
                    "blob_bytes": sum(layer["size"] for layer in manifest["layers"])
                    + manifest.get("config", {}).get("size", 0),
                    "size_kind": "registry_blob_bytes_not_measured_local_disk",
                }
            except (OSError, ValueError, KeyError) as exc:
                result["registry"][tag] = {"url": url, "error": type(exc).__name__}
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo", type=Path, default=Path(__file__).resolve().parents[2]
    )
    parser.add_argument("--envelope", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--registry",
        action="store_true",
        help="Read manifests only; no model downloads",
    )
    args = parser.parse_args()
    result = collect(args.repo, json.loads(args.envelope.read_text()), args.registry)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps(result["targets"], indent=2))
    raise SystemExit(
        0
        if all(t["status"] == "READY_FOR_GATE" for t in result["targets"].values())
        else 2
    )


if __name__ == "__main__":
    main()
