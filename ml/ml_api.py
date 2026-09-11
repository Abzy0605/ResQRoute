import math
import os
from numbers import Real
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "flood_severity_model.joblib"
CONFIG_PATH = BASE_DIR / "models" / "feature_config.joblib"


app = Flask(__name__)

MODEL = None
FEATURE_CONFIG = None
REQUIRED_FEATURES = []
THRESHOLD = None
MODEL_LOAD_ERROR = None


def load_artifacts():
    """Load the trained model and its feature configuration once at startup."""
    global MODEL, FEATURE_CONFIG, REQUIRED_FEATURES, THRESHOLD, MODEL_LOAD_ERROR

    try:
        MODEL = joblib.load(MODEL_PATH)
        FEATURE_CONFIG = joblib.load(CONFIG_PATH)
        REQUIRED_FEATURES = list(FEATURE_CONFIG["all_features"])
        THRESHOLD = float(FEATURE_CONFIG["threshold"])

        if len(REQUIRED_FEATURES) != 34:
            raise ValueError(
                f"Expected 34 model features, found {len(REQUIRED_FEATURES)}"
            )

        if getattr(MODEL, "n_features_in_", len(REQUIRED_FEATURES)) != len(
            REQUIRED_FEATURES
        ):
            raise ValueError("Model and feature configuration have different sizes")
    except Exception as error:
        MODEL = None
        FEATURE_CONFIG = None
        REQUIRED_FEATURES = []
        THRESHOLD = None
        MODEL_LOAD_ERROR = str(error)


load_artifacts()


def error_response(message, status_code):
    return jsonify({"error": message}), status_code


@app.get("/health")
def health():
    if MODEL_LOAD_ERROR:
        return error_response("ML model failed to load", 503)

    return jsonify({
        "status": "ok",
        "message": "ML service is running"
    })


@app.post("/predict")
def predict():
    if MODEL_LOAD_ERROR:
        return error_response("ML model is unavailable", 503)

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return error_response("Request body must be a JSON object", 400)

    missing_features = [
        feature for feature in REQUIRED_FEATURES if feature not in payload
    ]

    if missing_features:
        return error_response(
            "Missing required features: " + ", ".join(missing_features),
            400
        )

    invalid_features = []
    values = []

    for feature in REQUIRED_FEATURES:
        value = payload[feature]

        if isinstance(value, bool) or not isinstance(value, Real):
            invalid_features.append(feature)
            continue

        numeric_value = float(value)

        if not math.isfinite(numeric_value):
            invalid_features.append(feature)
            continue

        values.append(numeric_value)

    if invalid_features:
        return error_response(
            "Features must contain finite numeric values: "
            + ", ".join(invalid_features),
            400
        )

    try:
        feature_values = pd.DataFrame(
            np.array([values], dtype=float),
            columns=REQUIRED_FEATURES
        )
        probabilities = MODEL.predict_proba(feature_values)[0]
        severe_class_index = next(
            index for index, class_value in enumerate(MODEL.classes_)
            if int(class_value) == 1
        )
        severe_flood_score = float(probabilities[severe_class_index])
        classification = (
            "SEVERE_FLOOD"
            if severe_flood_score >= THRESHOLD
            else "FLOOD"
        )
    except Exception:
        app.logger.exception("Prediction failed")
        return error_response("Prediction failed", 500)

    return jsonify({
        "severe_flood_score": severe_flood_score,
        "threshold": THRESHOLD,
        "classification": classification
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
