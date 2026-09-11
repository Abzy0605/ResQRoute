const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUSES = {
    disaster: ["ACTIVE", "INACTIVE", "RESOLVED"],
    shelter: ["AVAILABLE", "FULL", "CLOSED"],
    team: ["AVAILABLE", "ASSIGNED", "EN_ROUTE", "ON_SCENE"],
    incident: ["REPORTED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "COMPLETED"],
    road: ["OPEN", "BLOCKED"],
    resource: ["AVAILABLE", "LOW", "DEPLETED"],
    risk: ["LOW", "MODERATE", "HIGH", "CRITICAL"]
};

const fail = (message) => ({ error: message });
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const text = (value, name, { min = 1, max = 500, required = true } = {}) => {
    if ((value === undefined || value === null) && !required) return undefined;
    if (typeof value !== "string") throw new Error(`${name} must be text`);
    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max) throw new Error(`${name} must be between ${min} and ${max} characters`);
    return normalized;
};
const number = (value, name, min, max) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${name} must be a finite number between ${min} and ${max}`);
    }
    return value;
};
const integer = (value, name, min = 1, max = Number.MAX_SAFE_INTEGER) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
};
const nullableId = (value, name) => value === null || value === undefined || value === "" ? null : integer(value, name);
const status = (value, name, choices, { required = false } = {}) => {
    if ((value === undefined || value === null || value === "") && !required) return undefined;
    if (typeof value !== "string" || !choices.includes(value.trim().toUpperCase())) throw new Error(`${name} is invalid`);
    return value.trim().toUpperCase();
};
const coordinates = (source, lat = "latitude", lng = "longitude", nullable = false) => {
    const hasLat = source[lat] !== undefined && source[lat] !== null && source[lat] !== "";
    const hasLng = source[lng] !== undefined && source[lng] !== null && source[lng] !== "";
    if (nullable && !hasLat && !hasLng) return { [lat]: null, [lng]: null };
    if (!hasLat || !hasLng) throw new Error(`${lat} and ${lng} must be provided together`);
    return { [lat]: number(source[lat], lat, -90, 90), [lng]: number(source[lng], lng, -180, 180) };
};
const validate = (fn) => (...args) => {
    try { return { value: fn(...args) }; } catch (error) { return fail(error.message); }
};

const validateRegistration = validate((body) => {
    if (!object(body)) throw new Error("Request body must be a JSON object");
    const name = text(body.name, "name", { min: 2, max: 100 });
    if (typeof body.email !== "string" || body.email.trim().length > 254 || !EMAIL_PATTERN.test(body.email.trim())) throw new Error("email must be valid");
    if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128 || !/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) throw new Error("password must be 10-128 characters and include a letter and number");
    return { name, email: body.email.trim().toLowerCase(), password: body.password };
});
const validateLogin = validate((body) => {
    if (!object(body) || typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) throw new Error("Email and password are required");
    if (body.email.trim().length > 254 || body.password.length > 128) throw new Error("Invalid email or password");
    return { email: body.email.trim().toLowerCase(), password: body.password };
});
const validateDisaster = validate((b, update = false) => ({ type: text(b.type, "type", { max: 100 }), severity: number(b.severity, "severity", 1, 10), ...coordinates(b), description: text(b.description, "description", { min: 0, max: 2000, required: false }) || null, status: status(b.status, "status", STATUSES.disaster, { required: update }) }));
const validateShelter = validate((b, update = false) => { const capacity = integer(b.capacity, "capacity", 1); const occupancy = b.current_occupancy === undefined && !update ? 0 : integer(b.current_occupancy, "current_occupancy", 0); if (occupancy > capacity) throw new Error("current_occupancy must not exceed capacity"); return { name: text(b.name, "name", { max: 150 }), address: text(b.address, "address", { min: 0, max: 500, required: false }) || null, ...coordinates(b), capacity, current_occupancy: occupancy, status: status(b.status, "status", STATUSES.shelter, { required: update }) }; });
const validateTeam = validate((b, update = false) => ({ name: text(b.name, "name", { max: 150 }), contact_number: text(b.contact_number, "contact_number", { min: 3, max: 40, required: false }) || null, ...coordinates(b, "latitude", "longitude", true), status: status(b.status, "status", STATUSES.team, { required: update }) }));
const validateIncidentCreate = validate((b) => ({ disaster_id: nullableId(b.disaster_id, "disaster_id"), description: text(b.description, "description", { max: 2000 }), ...coordinates(b), severity: integer(b.severity, "severity", 1, 10) }));
const validateIncidentUpdate = validate((b) => ({ description: text(b.description, "description", { max: 2000 }), ...coordinates(b), severity: integer(b.severity, "severity", 1, 10), status: status(b.status, "status", STATUSES.incident, { required: true }), assigned_team_id: nullableId(b.assigned_team_id, "assigned_team_id") }));
const validateRoad = validate((b, update = false) => ({ road_name: text(b.road_name, "road_name", { max: 150 }), ...coordinates(b, "start_latitude", "start_longitude"), ...coordinates(b, "end_latitude", "end_longitude"), distance_km: number(b.distance_km, "distance_km", Number.EPSILON, 10000), risk_level: integer(b.risk_level, "risk_level", 1, 10), status: status(b.status, "status", STATUSES.road, { required: update }) }));
const validateResource = validate((b, update = false) => ({ name: text(b.name, "name", { max: 150 }), resource_type: text(b.resource_type, "resource_type", { max: 100 }), quantity: integer(b.quantity, "quantity", 0), location: text(b.location, "location", { min: 0, max: 500, required: false }) || null, status: status(b.status, "status", STATUSES.resource, { required: update }) }));
const validateRiskZone = validate((b) => ({ disaster_id: nullableId(b.disaster_id, "disaster_id"), zone_name: text(b.zone_name, "zone_name", { max: 150 }), risk_score: number(b.risk_score, "risk_score", 0, 100), risk_level: status(b.risk_level, "risk_level", STATUSES.risk, { required: true }), ...coordinates(b, "center_latitude", "center_longitude"), radius_km: number(b.radius_km, "radius_km", Number.EPSILON, 10000) }));
const validateId = (value, name = "ID") => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

module.exports = { STATUSES, validateRegistration, validateLogin, validateDisaster, validateShelter, validateTeam, validateIncidentCreate, validateIncidentUpdate, validateRoad, validateResource, validateRiskZone, validateId };
