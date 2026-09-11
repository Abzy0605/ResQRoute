const {
    MlServiceError,
    requiredFeatures,
    requestMlPrediction,
    validateMlFeatures
} = require("../services/mlService");

const predictFloodSeverity = async (req, res) => {
    const payload = req.body;

    const validationError = validateMlFeatures(payload);

    if (validationError) {
        return res.status(400).json({
            message: validationError.message,
            features: validationError.features
        });
    }

    try {
        return res.json(await requestMlPrediction(payload));
    } catch (error) {
        if (error instanceof MlServiceError) {
            const response = {
                message: error.message
            };

            return res.status(error.statusCode).json(response);
        }

        return res.status(500).json({
            message: "ML prediction failed"
        });
    }
};

module.exports = {
    requiredFeatures,
    predictFloodSeverity
};
