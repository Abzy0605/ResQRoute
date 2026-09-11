const requiredFeatures = [
    "T1d",
    "T2d",
    "T3d",
    "T4d",
    "T5d",
    "T6d",
    "T7d",
    "T8d",
    "T9d",
    "T10d",
    "Stream Order",
    "Drainage Area",
    "Catchment Relief",
    "Catchment Length",
    "Catchment Perimeter",
    "Sinuosity Index",
    "Form Factor",
    "Relief Ratio",
    "Elongation Ratio",
    "Circularity Ratio",
    "Drainage Density",
    "Basin Magnitude",
    "Channel Frequency",
    "Drainage Intensity",
    "Infiltration Number",
    "Ruggedness Number",
    "Annual Mean Temperature",
    "Annual Precipitation",
    "Precipitation of Wettest Month",
    "Precipitation Seasonality",
    "Road Density",
    "Urban percentage",
    "Population Count",
    "Population Density"
];

class MlServiceError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "MlServiceError";
        this.statusCode = statusCode;
    }
}

const validateMlFeatures = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {
            message: "Request body must be a JSON object",
            features: []
        };
    }

    const missingFeatures = requiredFeatures.filter(
        (feature) => !(feature in payload)
    );

    if (missingFeatures.length > 0) {
        return {
            message: "Missing required features",
            features: missingFeatures
        };
    }

    const invalidFeatures = requiredFeatures.filter((feature) => {
        const value = payload[feature];

        return typeof value !== "number" || !Number.isFinite(value);
    });

    if (invalidFeatures.length > 0) {
        return {
            message: "Features must contain finite numeric values",
            features: invalidFeatures
        };
    }

    return null;
};

const validatePrediction = (response) => {
    if (!response || typeof response !== "object") return false;
    return Number.isFinite(response.severe_flood_score)
        && response.severe_flood_score >= 0
        && response.severe_flood_score <= 1
        && Number.isFinite(response.threshold)
        && response.threshold >= 0
        && response.threshold <= 1
        && ["FLOOD", "SEVERE_FLOOD"].includes(response.classification);
};

const requestMlPrediction = async (payload) => {
    const validationError = validateMlFeatures(payload);

    if (validationError) {
        throw new MlServiceError(validationError.message, 400);
    }

    const mlApiUrl = process.env.ML_API_URL;

    if (!mlApiUrl) {
        throw new MlServiceError("ML API URL is not configured", 500);
    }

    const configuredTimeout = Number(process.env.ML_API_TIMEOUT_MS || 8000);
    const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 8000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const mlResponse = await fetch(
            `${mlApiUrl.replace(/\/$/, "")}/predict`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            }
        );
        if (!mlResponse.ok) {
            console.error("ML service returned status", mlResponse.status);
            throw new MlServiceError("ML service is unavailable", 502);
        }
        let responseBody;
        try { responseBody = await mlResponse.json(); } catch { throw new MlServiceError("ML service returned an invalid response", 502); }
        if (!validatePrediction(responseBody)) {
            console.error("ML service returned an invalid prediction response");
            throw new MlServiceError("ML service returned an invalid response", 502);
        }
        return responseBody;
    } catch (error) {
        if (error instanceof MlServiceError) {
            throw error;
        }

        console.error("ML service request failed:", error.name === "AbortError" ? "request timed out" : error.message);
        throw new MlServiceError("ML service is unavailable", 502);
    } finally {
        clearTimeout(timeout);
    }
};

module.exports = {
    MlServiceError,
    requiredFeatures,
    requestMlPrediction,
    validatePrediction,
    validateMlFeatures
};
