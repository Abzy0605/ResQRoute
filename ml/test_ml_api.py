from ml_api import REQUIRED_FEATURES, THRESHOLD, app


def make_valid_payload():
    return {feature: 0.0 for feature in REQUIRED_FEATURES}


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_prediction_with_valid_features(client):
    response = client.post("/predict", json=make_valid_payload())

    assert response.status_code == 200
    result = response.get_json()
    assert "severe_flood_score" in result
    assert result["threshold"] == THRESHOLD
    assert result["classification"] in {"SEVERE_FLOOD", "FLOOD"}
    assert result["classification"] == (
        "SEVERE_FLOOD"
        if result["severe_flood_score"] >= THRESHOLD
        else "FLOOD"
    )


def test_prediction_rejects_missing_feature(client):
    payload = make_valid_payload()
    payload.pop(REQUIRED_FEATURES[0])

    response = client.post("/predict", json=payload)

    assert response.status_code == 400
    assert REQUIRED_FEATURES[0] in response.get_json()["error"]


def test_prediction_rejects_non_numeric_feature(client):
    payload = make_valid_payload()
    payload[REQUIRED_FEATURES[0]] = "not-a-number"

    response = client.post("/predict", json=payload)

    assert response.status_code == 400
    assert REQUIRED_FEATURES[0] in response.get_json()["error"]


def run_tests():
    with app.test_client() as client:
        test_health(client)
        test_prediction_with_valid_features(client)
        test_prediction_rejects_missing_feature(client)
        test_prediction_rejects_non_numeric_feature(client)

    print("ML API tests passed.")


if __name__ == "__main__":
    run_tests()
