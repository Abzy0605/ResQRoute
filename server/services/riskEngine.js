const WEIGHTS = {
    ml_severe_flood_score: 0.35,
    disaster_severity: 0.20,
    hazard_proximity: 0.15,
    population_exposure: 0.10,
    road_accessibility: 0.10,
    shelter_availability: 0.10
};

const HAZARD_SAFETY_RADIUS_KM = 50;

const isFiniteNumber = (value) => (
    typeof value === "number" && Number.isFinite(value)
);

const clamp = (value, minimum = 0, maximum = 100) => (
    Math.min(Math.max(value, minimum), maximum)
);

const requireNumber = (inputs, field) => {
    if (!isFiniteNumber(inputs[field])) {
        throw new Error(`${field} must be a finite number`);
    }

    return inputs[field];
};

const validateOperationalInputs = (inputs) => {
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        throw new Error("Risk engine inputs must be a JSON object");
    }

    const disasterSeverity = requireNumber(inputs, "disaster_severity");
    const hazardDistance = requireNumber(inputs, "hazard_distance_km");
    const populationExposure = requireNumber(inputs, "population_exposure");
    const roadAccessibility = requireNumber(inputs, "road_accessibility");
    const shelterAvailable = requireNumber(
        inputs,
        "shelter_available_capacity"
    );
    const shelterRequired = requireNumber(
        inputs,
        "shelter_required_capacity"
    );

    if (disasterSeverity < 1 || disasterSeverity > 10) {
        throw new Error("disaster_severity must be between 1 and 10");
    }

    if (hazardDistance < 0) {
        throw new Error("hazard_distance_km must not be negative");
    }

    if (populationExposure < 0 || populationExposure > 1) {
        throw new Error("population_exposure must be between 0 and 1");
    }

    if (roadAccessibility < 0 || roadAccessibility > 1) {
        throw new Error("road_accessibility must be between 0 and 1");
    }

    if (shelterAvailable < 0) {
        throw new Error("shelter_available_capacity must not be negative");
    }

    if (shelterRequired <= 0) {
        throw new Error("shelter_required_capacity must be greater than 0");
    }
};

const validateInputs = (inputs) => {
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        throw new Error("Risk engine inputs must be a JSON object");
    }

    const mlScore = requireNumber(inputs, "ml_severe_flood_score");

    if (mlScore < 0 || mlScore > 1) {
        throw new Error("ml_severe_flood_score must be between 0 and 1");
    }

    validateOperationalInputs(inputs);
};

const calculateRiskScore = (inputs) => {
    validateInputs(inputs);

    const mlScore = inputs.ml_severe_flood_score * 100;
    const disasterSeverity = ((inputs.disaster_severity - 1) / 9) * 100;

    // This 50 km linear safety radius is an explainable application heuristic,
    // not a scientifically validated physical flood model.
    const hazardProximity = clamp(
        (1 - inputs.hazard_distance_km / HAZARD_SAFETY_RADIUS_KM) * 100
    );

    const populationExposure = inputs.population_exposure * 100;
    const roadAccessibility = (1 - inputs.road_accessibility) * 100;
    const shelterAvailability = clamp(
        (1 - inputs.shelter_available_capacity /
            inputs.shelter_required_capacity) * 100
    );

    const factorScores = {
        ml_severe_flood_score: mlScore,
        disaster_severity: disasterSeverity,
        hazard_proximity: hazardProximity,
        population_exposure: populationExposure,
        road_accessibility: roadAccessibility,
        shelter_availability: shelterAvailability
    };

    const riskScore = clamp(
        Object.entries(WEIGHTS).reduce(
            (total, [factor, weight]) => total + factorScores[factor] * weight,
            0
        )
    );

    let riskLevel = "LOW";

    if (riskScore >= 81) {
        riskLevel = "CRITICAL";
    } else if (riskScore >= 61) {
        riskLevel = "HIGH";
    } else if (riskScore >= 31) {
        riskLevel = "MODERATE";
    }

    return {
        risk_score: Number(riskScore.toFixed(2)),
        risk_level: riskLevel,
        factor_scores: factorScores,
        weights: WEIGHTS,
        explanation: {
            ml_severe_flood_score: "ML severe flood score converted from 0-1 to 0-100",
            disaster_severity: "Database/application severity normalized from 1-10 to 0-100",
            hazard_proximity: `Linear risk within a ${HAZARD_SAFETY_RADIUS_KM} km application safety radius`,
            population_exposure: "Supplied exposure ratio converted from 0-1 to 0-100",
            road_accessibility: "Supplied accessibility ratio inverted so blocked roads increase risk",
            shelter_availability: "Available capacity compared with supplied required capacity; surplus is capped at zero risk"
        }
    };
};

module.exports = {
    HAZARD_SAFETY_RADIUS_KM,
    WEIGHTS,
    calculateRiskScore,
    validateOperationalInputs
};
