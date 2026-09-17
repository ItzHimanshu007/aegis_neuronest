"""Only plans and the latest state survive between requests; history stays in sealed bodies."""

from app.session_store import MAX_RECORD_CHARS, SessionStore


def test_store_has_no_history_or_image_slot():
    state = SessionStore().get("s1")
    assert set(vars(state)) == {"created_at", "last_seen", "plan_steps", "last_state_token"}


def test_plan_steps_are_bounded_and_recorded_once():
    store = SessionStore()
    store.record_plan_steps("s1", ["x" * 5000] * 20)
    store.record_plan_steps("s1", ["replacement"])
    assert len(store.get("s1").plan_steps) == 8
    assert len(store.get("s1").plan_steps[0]) == MAX_RECORD_CHARS


def test_entries_expire_after_the_ttl():
    store = SessionStore(ttl_s=0)
    store.record_state_token("s1", "Sabcdefghij")
    assert len(store) == 0


def test_end_deletes_immediately():
    store = SessionStore(ttl_s=10_000)
    store.record_state_token("s1", "Sabcdefghij")
    assert store.end("s1") is True
    assert store.end("s1") is False


def test_prompt_history_is_only_the_original_plan():
    store = SessionStore()
    store.record_plan_steps("s1", ["fill the form"])
    assert store.history_for_prompt("s1") == ["planned: fill the form"]


def test_sessions_are_isolated():
    store = SessionStore()
    store.record_state_token("s1", "Sabcdefghij")
    store.record_state_token("s2", "Sjabcdefghi")
    assert store.get("s1").last_state_token == "Sabcdefghij"
    assert store.get("s2").last_state_token == "Sjabcdefghi"
