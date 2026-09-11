const {
    MlServiceError,
    requiredFeatures,
    requestMlPrediction,
    validateMlFeatures
} = require("../services/mlService");
const {
    calculateRiskScore,
    validateOperationalInputs
} = require("../services/riskEngine");

const predictRisk = async (req, res) => {
    const payload = req.body;

    try {
        validateOperationalInputs(payload);
    } catch (error) {
        return res.status(400).json({
            message: error.message
        });
    }

    const mlValidationError = validateMlFeatures(payload);

    if (mlValidationError) {
        return res.status(400).json({
            message: mlValidationError.message,
            features: mlValidationError.features
        });
    }

    const mlFeatures = Object.fromEntries(
        requiredFeatures.map((feature) => [feature, payload[feature]])
    );

    try {
        const mlPrediction = await requestMlPrediction(mlFeatures);
        const riskResult = calculateRiskScore({
            ...payload,
            ml_severe_flood_score: mlPrediction.severe_flood_score
        });

        return res.json({
            ...riskResult,
            inputs: {
                operational: {
                    disaster_severity: payload.disaster_severity,
                    hazard_distance_km: payload.hazard_distance_km,
                    population_exposure: payload.population_exposure,
                    road_accessibility: payload.road_accessibility,
                    shelter_available_capacity: payload.shelter_available_capacity,
                    shelter_required_capacity: payload.shelter_required_capacity
                },
                ml: mlPrediction
            }
        });
    } catch (error) {
        if (error instanceof MlServiceError) {
            const response = {
                message: error.message
            };

            return res.status(error.statusCode).json(response);
        }

        console.error("Risk calculation failed:", error.message);

        return res.status(500).json({
            message: "Risk calculation failed"
        });
    }
};

module.exports = {
    predictRisk
};
