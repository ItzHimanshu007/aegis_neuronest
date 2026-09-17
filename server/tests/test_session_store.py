"""Session store limits and lifecycle (Stage 3A Part C3)."""

from __future__ import annotations

from app.session_store import MAX_HISTORY_RECORDS, MAX_RECORD_CHARS, SessionStore


def test_history_is_capped_and_keeps_the_recent_past():
    store = SessionStore()
    store.append_history("s1", [f"step-{i}" for i in range(MAX_HISTORY_RECORDS + 20)])
    history = store.get("s1").history
    assert len(history) == MAX_HISTORY_RECORDS
    assert history[-1] == f"step-{MAX_HISTORY_RECORDS + 19}"


def test_records_are_truncated():
    store = SessionStore()
    store.append_history("s1", ["x" * 5000])
    assert len(store.get("s1").history[0]) == MAX_RECORD_CHARS


def test_plan_steps_are_recorded_once():
    store = SessionStore()
    store.record_plan_steps("s1", ["first plan"])
    store.record_plan_steps("s1", ["a different plan"])
    assert store.get("s1").plan_steps == ["first plan"]


def test_entries_expire_after_the_ttl():
    store = SessionStore(ttl_s=0)
    store.append_history("s1", ["step"])
    assert len(store) == 0


def test_end_deletes_immediately():
    store = SessionStore(ttl_s=10_000)
    store.append_history("s1", ["step"])
    assert store.end("s1") is True
    assert store.end("s1") is False


def test_history_for_prompt_puts_the_plan_first():
    store = SessionStore()
    store.record_plan_steps("s1", ["fill the form"])
    store.append_history("s1", ["type E1 OK"])
    assert store.history_for_prompt("s1") == ["planned: fill the form", "type E1 OK"]


def test_sessions_are_isolated():
    store = SessionStore()
    store.append_history("s1", ["a"])
    store.append_history("s2", ["b"])
    assert store.get("s1").history == ["a"]
    assert store.get("s2").history == ["b"]
