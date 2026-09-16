def test_valid_kyc_payload_returns_valid_plan(client, kyc_payload):
    response = client.post("/v1/plan", json=kyc_payload)
    assert response.status_code == 200
    body = response.json()
    assert "plan" in body
    assert body["plan"][-1]["action"] == "ask_user"
    # every type action must target one of the elements from the payload
    element_marks = {el["mark_id"] for el in kyc_payload["elements"]}
    for action in body["plan"]:
        if action["action"] == "type":
            assert action["target"]["mark_id"] in element_marks


def test_non_kyc_payload_returns_done_plan(client, kyc_payload):
    payload = {**kyc_payload, "page": {**kyc_payload["page"], "type": "checkout"}}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["plan"]) == 1
    assert body["plan"][0]["action"] == "done"
    assert body["plan"][0]["reason"] == "mock"


def test_invalid_payload_missing_required_field_returns_422(client, kyc_payload):
    payload = dict(kyc_payload)
    del payload["elements"]
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422


def test_invalid_payload_bad_schema_marker_returns_422(client, kyc_payload):
    payload = {**kyc_payload, "schema": "aegis/2"}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422


def test_invalid_payload_extra_field_returns_422(client, kyc_payload):
    payload = {**kyc_payload, "raw_cookie": "should never be a field"}
    response = client.post("/v1/plan", json=payload)
    assert response.status_code == 422
