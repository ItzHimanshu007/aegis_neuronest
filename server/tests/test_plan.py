def test_valid_kyc_payload_returns_valid_plan(client, kyc_payload):
    response = client.post("/v1/plan", json=kyc_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["state_token"] == kyc_payload["state_token"]
    assert "plan" in body
    assert body["plan"][-1]["action"] == "ask_user"
    # every type action must target one of the elements from the payload
    element_marks = {el["eid"] for el in kyc_payload["elements"]}
    for action in body["plan"]:
        if action["action"] == "type":
            assert action["target"]["eid"] in element_marks


def test_non_kyc_payload_returns_done_plan(client, kyc_payload):
    payload = {**kyc_payload, "page": {**kyc_payload["page"], "type": "checkout"}}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["plan"]) == 1
    assert body["plan"][0]["action"] == "done"
    assert body["plan"][0]["evidence"] == {"url_path_prefix": "/"}
    assert body["state_token"] == payload["state_token"]


def test_invalid_payload_missing_required_field_returns_422(client, kyc_payload):
    payload = dict(kyc_payload)
    del payload["elements"]
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422


def test_invalid_payload_bad_schema_marker_returns_422(client, kyc_payload):
    payload = {**kyc_payload, "schema": "aegis/1"}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422


def test_invalid_payload_extra_field_returns_422(client, kyc_payload):
    payload = {**kyc_payload, "raw_cookie": "should never be a field"}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422


def test_digest_header_matching_body_is_accepted(client, kyc_payload):
    import hashlib
    import json

    body = json.dumps(kyc_payload).encode()
    digest = hashlib.sha256(body).hexdigest()
    response = client.post(
        "/v1/plan",
        content=body,
        headers={"content-type": "application/json", "X-Aegis-Digest": digest},
    )
    assert response.status_code == 200


def test_digest_header_mismatch_is_rejected(client, kyc_payload):
    import json

    body = json.dumps(kyc_payload).encode()
    response = client.post(
        "/v1/plan",
        content=body,
        headers={"content-type": "application/json", "X-Aegis-Digest": "0" * 64},
    )
    assert response.status_code == 400
    assert "digest" in response.json()["detail"].lower()


def test_request_without_digest_header_still_works(client, kyc_payload):
    # The header is a verification aid, not an auth mechanism — its absence is not an error.
    response = client.post("/v1/plan", json=kyc_payload)
    assert response.status_code == 200


def test_validation_errors_do_not_echo_payload_content_back(client, kyc_payload):
    payload = {**kyc_payload, "session": 12345}  # wrong type on purpose
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422
    body = response.text
    # The 422 must describe WHERE the problem is, never reflect the offending values.
    assert "12345" not in body
