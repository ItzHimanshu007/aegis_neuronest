"""Regression tests for measurement integrity, not measurements of a model."""

import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


probe = load("aegis_model_probe_test", "eval/model_probe/probe.py")
preflight = load("aegis_model_preflight_test", "eval/model_selection/preflight.py")
ENVELOPE = json.loads((ROOT / "eval/model_selection/envelope.json").read_text())


def test_nearest_rank_p90_and_even_median():
    assert probe.latency_summary(list(range(1, 13))) == {
        "median": 6.5,
        "p90": 11,
        "min": 1,
        "max": 12,
    }


@pytest.mark.parametrize(
    "values", [[], [1, 2], [1] * 11, [float("nan")] * 12, [float("inf")] * 12, [-1] * 12]
)
def test_invalid_or_insufficient_samples_cannot_produce_quantiles(values):
    with pytest.raises(ValueError):
        probe.latency_summary(values)


def test_accuracy_keeps_every_attempt_and_refusals_in_denominator():
    from app.schemas.plan import PlanV2

    entry = next(e for e in probe.load_fixtures() if e["goldEid"] and e["goldAction"] == "click")

    class AlternatingAdapter:
        last_metrics = probe.CallMetrics()
        calls = 0

        async def plan(self, payload):
            self.calls += 1
            target = next(el for el in payload.elements if el.eid == entry["goldEid"])
            action = (
                {"action": "fail", "reason": "MODEL_OUTPUT_INVALID"}
                if self.calls % 2
                else {"action": "click", "target": {"eid": target.eid, "fp": target.fp}}
            )
            return PlanV2.model_validate(
                {"schema": "aegis/2", "state_token": payload.state_token, "plan": [action]}
            )

    async def run():
        adapter = AlternatingAdapter()
        return [await probe.run_one(adapter, entry, i) for i in range(1, 13)]

    rows = asyncio.run(run())
    assert probe.rate([r.grounded for r in rows]) == "6/12"
    assert probe.rate([r.action_matched for r in rows]) == "6/12"
    assert [r.run_index for r in rows] == list(range(1, 13))
    assert sum(r.error == "MODEL_OUTPUT_INVALID" for r in rows) == 6
    assert all(r.latency_ms > 0 for r in rows)


def test_exception_is_a_timed_failed_attempt():
    class BrokenAdapter:
        async def plan(self, payload):
            raise TimeoutError("must not be copied into the data")

    entry = next(e for e in probe.load_fixtures() if e["goldEid"])
    row = asyncio.run(probe.run_one(BrokenAdapter(), entry, 1))
    assert row.error == "TimeoutError"
    assert row.latency_ms > 0
    assert row.grounded is False
    assert row.action_matched is False


def test_duplicate_or_partial_repetitions_do_not_get_latency_statistics():
    for indexes in ([1, 2], [1] * 12):
        rows = [probe.FixtureResult("case", i, True, True, latency_ms=100) for i in indexes]
        report = probe.ProbeReport("synthetic", "none", "mock", 12, live=False, results=rows)
        assert "NOT REPORTABLE" in probe.render(report)


def test_preexisting_swap_fails_both_targets_without_hiding_unified_memory_blocker():
    host = {
        "system_ram_bytes": 16 * preflight.GIB,
        "swap_used_bytes": 1,
        "memory_architecture": "unified",
    }
    results = preflight.assess_host(host, ENVELOPE)
    assert results["A"]["status"] == results["B"]["status"] == "FAIL"
    assert results["A"]["blockers"] == ["NO_SEPARATE_VRAM_ENVELOPE"]
    assert all(r["model_fit"] == "NOT_MEASURED" for r in results.values())


def test_missing_telemetry_is_not_a_pass():
    assert all(r["status"] == "BLOCKED" for r in preflight.assess_host({}, ENVELOPE).values())


def test_clean_unified_host_is_only_ready_for_cpu_gate_not_a_hardware_pass():
    host = {
        "system_ram_bytes": 16 * preflight.GIB,
        "swap_used_bytes": 0,
        "memory_architecture": "unified",
    }
    results = preflight.assess_host(host, ENVELOPE)
    assert results["A"]["status"] == "BLOCKED"
    assert results["B"]["status"] == "READY_FOR_GATE"
    assert results["B"]["model_fit"] == "NOT_MEASURED"
    assert results["B"]["gpu_inference_disabled_verified"] is False
