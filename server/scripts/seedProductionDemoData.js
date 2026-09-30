const fs = require("fs");
const path = require("path");
const {
    STATUSES,
    validateDisaster,
    validateIncidentCreate,
    validateResource,
    validateRiskZone,
    validateRoad,
    validateShelter,
    validateTeam,
} = require("../validation");
const { calculateRoute, haversineDistanceKm } = require("../services/routingEngine");

const DEMO_PREFIX = "DEMO-RESQ-2026";
const SQL_OUTPUT_PATH = path.join(__dirname, "generated", "demoSeed.sql");
const EXPECTED_COUNTS = {
    disasters: 3,
    shelters: 18,
    rescueTeams: 10,
    roads: 45,
    resources: 36,
    riskZones: 18,
    incidents: 12,
};

const redactSensitiveText = (value) => String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1<redacted>@")
    .replace(/(password\s*=\s*)[^\s,;]+/gi, "$1<redacted>")
    .replace(/(jwt[_ -]?secret\s*=\s*)[^\s,;]+/gi, "$1<redacted>");

const formatSeedError = (error) => {
    if (typeof error === "string" && error.trim()) return redactSensitiveText(error.trim());
    if (!error || typeof error !== "object") return "Unknown error: no diagnostic details were provided.";

    const details = [];
    const addDetail = (label, value) => {
        if (typeof value === "string" && value.trim()) {
            details.push(`${label}: ${redactSensitiveText(value.trim())}`);
        }
    };

    addDetail("message", error.message);
    addDetail("code", error.code);
    addDetail("detail", error.detail);
    addDetail("hint", error.hint);
    if (details.length === 0) addDetail("name", error.name);

    return details.length > 0
        ? details.join("; ")
        : "Unknown error: no message, code, detail, or hint was provided.";
};

const gridNodes = [
    { key: "A", latitude: 13.045, longitude: 80.220 },
    { key: "B", latitude: 13.045, longitude: 80.235 },
    { key: "C", latitude: 13.045, longitude: 80.250 },
    { key: "D", latitude: 13.045, longitude: 80.265 },
    { key: "E", latitude: 13.045, longitude: 80.280 },
    { key: "F", latitude: 13.060, longitude: 80.220 },
    { key: "G", latitude: 13.060, longitude: 80.235 },
    { key: "H", latitude: 13.060, longitude: 80.250 },
    { key: "I", latitude: 13.060, longitude: 80.265 },
    { key: "J", latitude: 13.060, longitude: 80.280 },
    { key: "K", latitude: 13.075, longitude: 80.220 },
    { key: "L", latitude: 13.075, longitude: 80.235 },
    { key: "M", latitude: 13.075, longitude: 80.250 },
    { key: "N", latitude: 13.075, longitude: 80.265 },
    { key: "O", latitude: 13.075, longitude: 80.280 },
    { key: "P", latitude: 13.090, longitude: 80.220 },
    { key: "Q", latitude: 13.090, longitude: 80.235 },
    { key: "R", latitude: 13.090, longitude: 80.250 },
    { key: "S", latitude: 13.090, longitude: 80.265 },
    { key: "T", latitude: 13.090, longitude: 80.280 },
];

const node = Object.fromEntries(gridNodes.map((entry) => [entry.key, entry]));
const point = (key) => ({ latitude: node[key].latitude, longitude: node[key].longitude });
const withPrefix = (value) => `${DEMO_PREFIX} ${value}`;

const disasters = [
    { key: "flood", type: withPrefix("Northeast Monsoon Flood"), severity: 8, ...point("S"), status: "ACTIVE", description: withPrefix("Synthetic flood scenario near North Chennai for map and evacuation demonstrations.") },
    { key: "surge", type: withPrefix("Cyclone Storm Surge"), severity: 9, ...point("E"), status: "ACTIVE", description: withPrefix("Synthetic coastal storm-surge scenario for response workflow demonstrations.") },
    { key: "waterlogging", type: withPrefix("Urban Waterlogging"), severity: 6, ...point("H"), status: "ACTIVE", description: withPrefix("Synthetic urban waterlogging scenario for route and shelter demonstrations.") },
];

const shelters = [
    ["A", "Egmore Community Hall", 420, 65, "AVAILABLE"], ["B", "Kilpauk Relief Centre", 360, 110, "AVAILABLE"], ["C", "Nungambakkam School Shelter", 500, 180, "AVAILABLE"],
    ["D", "Teynampet Civic Hall", 300, 75, "AVAILABLE"], ["E", "Marina Response Shelter", 280, 90, "AVAILABLE"], ["F", "Aminjikarai Sports Centre", 450, 205, "AVAILABLE"],
    ["G", "Arumbakkam Community Shelter", 340, 120, "AVAILABLE"], ["H", "Kodambakkam Transit Shelter", 390, 155, "AVAILABLE"], ["I", "Mylapore School Shelter", 330, 140, "AVAILABLE"],
    ["J", "Foreshore Estate Relief Hall", 260, 95, "AVAILABLE"], ["K", "Anna Nagar Community Hall", 540, 230, "AVAILABLE"], ["L", "Koyambedu Transit Centre", 480, 480, "FULL"],
    ["M", "Vadapalani Shelter Point", 350, 120, "AVAILABLE"], ["N", "Adyar Relief Centre", 410, 165, "AVAILABLE"], ["O", "Besant Nagar Community Hall", 290, 85, "AVAILABLE"],
    ["P", "Mogappair School Shelter", 460, 200, "AVAILABLE"], ["Q", "Padi Relief Centre", 380, 150, "AVAILABLE"], ["R", "Perambur Community Shelter", 320, 320, "FULL"],
].map(([nodeKey, label, capacity, current_occupancy, status]) => ({
    name: withPrefix(label),
    address: withPrefix(`Synthetic evacuation facility at Chennai network node ${nodeKey}.`),
    ...point(nodeKey),
    capacity,
    current_occupancy,
    status,
}));

const rescueTeams = [
    ["A", "North Flood Response Unit", "AVAILABLE"], ["C", "Central Water Rescue Unit", "AVAILABLE"], ["E", "Coastal Evacuation Unit", "AVAILABLE"], ["F", "Medical First Response Unit", "AVAILABLE"], ["H", "Urban Search Unit", "AVAILABLE"],
    ["J", "Harbour Support Unit", "AVAILABLE"], ["K", "Logistics Response Unit", "AVAILABLE"], ["M", "Rapid Assessment Unit", "AVAILABLE"], ["O", "Shoreline Support Unit", "AVAILABLE"], ["Q", "Relief Coordination Unit", "AVAILABLE"],
].map(([nodeKey, label, status], index) => ({
    name: withPrefix(label),
    contact_number: `044-5550-${String(1000 + index)}`,
    ...point(nodeKey),
    status,
}));

const makeRoad = (startKey, endKey, label, risk_level, status = "OPEN") => {
    const start = point(startKey);
    const end = point(endKey);
    return {
        road_name: withPrefix(`Chennai Demo Corridor ${label}`),
        start_latitude: start.latitude,
        start_longitude: start.longitude,
        end_latitude: end.latitude,
        end_longitude: end.longitude,
        distance_km: Number(haversineDistanceKm(start, end).toFixed(2)),
        risk_level,
        status,
    };
};

const roads = [
    ["A", "B", "A-B", 2], ["B", "C", "B-C", 2], ["C", "D", "C-D", 3], ["D", "E", "D-E", 5],
    ["F", "G", "F-G", 2], ["G", "H", "G-H", 3], ["H", "I", "H-I", 4], ["I", "J", "I-J", 6],
    ["K", "L", "K-L", 2], ["L", "M", "L-M", 3], ["M", "N", "M-N", 4], ["N", "O", "N-O", 6],
    ["P", "Q", "P-Q", 2], ["Q", "R", "Q-R", 3], ["R", "S", "R-S", 5], ["S", "T", "S-T", 7],
    ["A", "F", "A-F", 2], ["F", "K", "F-K", 2], ["K", "P", "K-P", 3],
    ["B", "G", "B-G", 2], ["G", "L", "G-L", 3], ["L", "Q", "L-Q", 4],
    ["C", "H", "C-H", 3], ["H", "M", "H-M", 4], ["M", "R", "M-R", 5],
    ["D", "I", "D-I", 4], ["I", "N", "I-N", 5], ["N", "S", "N-S", 6],
    ["E", "J", "E-J", 5], ["J", "O", "J-O", 6], ["O", "T", "O-T", 7],
    ["A", "G", "A-G", 2], ["B", "H", "B-H", 3], ["C", "I", "C-I", 4], ["D", "J", "D-J", 6],
    ["F", "L", "F-L", 2], ["G", "M", "G-M", 3], ["H", "N", "H-N", 5], ["I", "O", "I-O", 6],
].map(([start, end, label, risk]) => makeRoad(start, end, label, risk));

const blockedRoads = [
    ["B", "F", "B-F Flood Closure", 8], ["C", "G", "C-G Waterlogging Closure", 7], ["D", "H", "D-H Surge Closure", 9],
    ["L", "P", "L-P Debris Closure", 8], ["M", "Q", "M-Q Drainage Closure", 7], ["N", "R", "N-R Safety Closure", 8],
].map(([start, end, label, risk]) => makeRoad(start, end, label, risk, "BLOCKED"));

roads.push(...blockedRoads);

const resourceDefinitions = [
    ["Portable Water Pumps", "Equipment", 18, "North Chennai logistics depot", "AVAILABLE"], ["Inflatable Rescue Boats", "Water Rescue", 8, "Coastal response depot", "AVAILABLE"], ["Life Jackets", "Personal Protective Equipment", 240, "Central equipment depot", "AVAILABLE"],
    ["Emergency Ration Kits", "Food", 1200, "Koyambedu relief warehouse", "AVAILABLE"], ["Drinking Water Cases", "Water", 900, "Anna Nagar relief warehouse", "AVAILABLE"], ["First Aid Kits", "Medical", 150, "Medical response depot", "AVAILABLE"],
    ["Trauma Care Packs", "Medical", 65, "Adyar medical depot", "LOW"], ["Portable Generators", "Power", 14, "Central equipment depot", "AVAILABLE"], ["Emergency Light Towers", "Power", 22, "Marina response depot", "AVAILABLE"],
    ["Satellite Communication Sets", "Communications", 12, "Emergency operations centre", "AVAILABLE"], ["Handheld Radios", "Communications", 85, "Emergency operations centre", "AVAILABLE"], ["Tarpaulin Shelter Kits", "Shelter", 400, "Koyambedu relief warehouse", "AVAILABLE"],
    ["Blanket Bundles", "Shelter", 600, "Anna Nagar relief warehouse", "AVAILABLE"], ["Hygiene Kits", "Relief Supplies", 850, "Central relief warehouse", "AVAILABLE"], ["Infant Care Kits", "Relief Supplies", 130, "Central relief warehouse", "LOW"],
    ["Wheelchairs", "Medical", 20, "Mylapore medical depot", "AVAILABLE"], ["Ambulance Stretchers", "Medical", 35, "Medical response depot", "AVAILABLE"], ["Portable Toilets", "Sanitation", 24, "Coastal response depot", "AVAILABLE"],
    ["Water Purification Units", "Water", 10, "North Chennai logistics depot", "AVAILABLE"], ["Sandbag Pallets", "Flood Control", 3000, "Flood control depot", "AVAILABLE"], ["Flood Barrier Panels", "Flood Control", 180, "Flood control depot", "AVAILABLE"],
    ["Debris Clearance Tool Sets", "Equipment", 28, "Urban response depot", "AVAILABLE"], ["Chainsaw Sets", "Equipment", 16, "Urban response depot", "LOW"], ["High Visibility Vests", "Personal Protective Equipment", 300, "Central equipment depot", "AVAILABLE"],
    ["N95 Mask Packs", "Medical", 0, "Medical response depot", "DEPLETED"], ["Mosquito Net Bundles", "Shelter", 220, "Koyambedu relief warehouse", "AVAILABLE"], ["Cooking Stove Sets", "Food", 95, "Central relief warehouse", "AVAILABLE"],
    ["Mobile Charging Stations", "Power", 9, "Emergency operations centre", "LOW"], ["Drone Survey Kits", "Assessment", 6, "Rapid assessment depot", "AVAILABLE"], ["Portable Loudhailers", "Communications", 40, "Emergency operations centre", "AVAILABLE"],
    ["Search Rope Coils", "Water Rescue", 70, "Coastal response depot", "AVAILABLE"], ["Thermal Blankets", "Medical", 180, "Medical response depot", "AVAILABLE"], ["Child Nutrition Packs", "Food", 340, "Central relief warehouse", "AVAILABLE"],
    ["Temporary Ramp Kits", "Accessibility", 18, "Shelter support depot", "AVAILABLE"], ["Fuel Voucher Packs", "Logistics", 75, "Logistics response depot", "LOW"], ["Portable Fans", "Shelter", 30, "Shelter support depot", "AVAILABLE"],
];

const resources = resourceDefinitions.map(([label, resource_type, quantity, location, status]) => ({
    name: withPrefix(label),
    resource_type,
    quantity,
    location: withPrefix(`Synthetic inventory location: ${location}.`),
    status,
}));

const riskZones = [
    ["flood", "S", "Manali Low Risk Watch", 18, "LOW", 1.2], ["flood", "T", "Ennore Moderate Inundation", 44, "MODERATE", 1.8], ["flood", "R", "Perambur High Flood Impact", 69, "HIGH", 2.1], ["flood", "Q", "Padi Critical Flood Corridor", 88, "CRITICAL", 1.5], ["flood", "P", "Mogappair Moderate Drainage", 36, "MODERATE", 1.3], ["flood", "N", "Adyar Low Water Watch", 22, "LOW", 1.1],
    ["surge", "E", "Marina Critical Surge Band", 92, "CRITICAL", 2.4], ["surge", "J", "Foreshore High Surge Band", 74, "HIGH", 1.9], ["surge", "O", "Besant Nagar Moderate Surge", 53, "MODERATE", 1.7], ["surge", "D", "Teynampet Low Spillover", 16, "LOW", 1.0], ["surge", "I", "Mylapore High Tidal Impact", 67, "HIGH", 1.6], ["surge", "N", "Adyar Critical Tidal Channel", 84, "CRITICAL", 1.8],
    ["waterlogging", "H", "Kodambakkam High Waterlogging", 63, "HIGH", 1.4], ["waterlogging", "G", "Arumbakkam Moderate Waterlogging", 41, "MODERATE", 1.2], ["waterlogging", "M", "Vadapalani Critical Underpass", 82, "CRITICAL", 1.0], ["waterlogging", "C", "Nungambakkam Low Water Watch", 24, "LOW", 0.9], ["waterlogging", "L", "Koyambedu Moderate Drainage", 48, "MODERATE", 1.5], ["waterlogging", "F", "Aminjikarai High Channel Risk", 71, "HIGH", 1.3],
].map(([disasterKey, nodeKey, label, risk_score, risk_level, radius_km]) => ({
    disasterKey,
    zone_name: withPrefix(label),
    risk_score,
    risk_level,
    ...{ center_latitude: node[nodeKey].latitude, center_longitude: node[nodeKey].longitude },
    radius_km,
}));

const incidents = [
    ["flood", "S", "Flooded residential lane needs assessment", 7], ["flood", "R", "Water entry reported at community facility", 6], ["flood", "Q", "Residents require evacuation coordination", 8], ["flood", "P", "Roadside drainage overflow reported", 5],
    ["surge", "E", "Coastal access point requires safety inspection", 9], ["surge", "J", "High tide relief support requested", 7], ["surge", "O", "Beachfront shelter transport request", 6], ["surge", "N", "Tidal channel observation requires response", 8],
    ["waterlogging", "H", "Waterlogged junction needs traffic support", 5], ["waterlogging", "G", "Basement water removal support requested", 6], ["waterlogging", "M", "Underpass access blocked by standing water", 8], ["waterlogging", "C", "School approach road waterlogging report", 4],
].map(([disasterKey, nodeKey, detail, severity]) => ({
    disasterKey,
    description: withPrefix(`Synthetic incident: ${detail}.`),
    ...point(nodeKey),
    severity,
    status: "REPORTED",
}));

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertValidation = (result, label) => {
    if (result.error) throw new Error(`${label} failed application validation: ${result.error}`);
};

const assertChennaiCoordinate = (latitude, longitude, label) => {
    assert(latitude >= 12.9 && latitude <= 13.25 && longitude >= 80.05 && longitude <= 80.4, `${label} is outside the Chennai metropolitan area`);
};

const validateDemoData = () => {
    Object.entries(EXPECTED_COUNTS).forEach(([name, expected]) => {
        const actual = ({ disasters, shelters, rescueTeams, roads, resources, riskZones, incidents })[name].length;
        assert(actual === expected, `Expected ${expected} ${name}, found ${actual}`);
    });

    disasters.forEach((record) => {
        assertValidation(validateDisaster(record), record.type);
        assert(STATUSES.disaster.includes(record.status), `${record.type} has an invalid status`);
        assertChennaiCoordinate(record.latitude, record.longitude, record.type);
    });
    shelters.forEach((record) => {
        assertValidation(validateShelter(record), record.name);
        assert(STATUSES.shelter.includes(record.status), `${record.name} has an invalid status`);
        assertChennaiCoordinate(record.latitude, record.longitude, record.name);
    });
    rescueTeams.forEach((record) => {
        assertValidation(validateTeam(record), record.name);
        assert(STATUSES.team.includes(record.status), `${record.name} has an invalid status`);
        assertChennaiCoordinate(record.latitude, record.longitude, record.name);
    });
    roads.forEach((record) => {
        assertValidation(validateRoad(record), record.road_name);
        assert(STATUSES.road.includes(record.status), `${record.road_name} has an invalid status`);
        assertChennaiCoordinate(record.start_latitude, record.start_longitude, record.road_name);
        assertChennaiCoordinate(record.end_latitude, record.end_longitude, record.road_name);
    });
    resources.forEach((record) => {
        assertValidation(validateResource(record), record.name);
        assert(STATUSES.resource.includes(record.status), `${record.name} has an invalid status`);
    });
    riskZones.forEach((record) => {
        assertValidation(validateRiskZone({ ...record, disaster_id: 1 }), record.zone_name);
        assert(STATUSES.risk.includes(record.risk_level), `${record.zone_name} has an invalid risk level`);
        assertChennaiCoordinate(record.center_latitude, record.center_longitude, record.zone_name);
    });
    incidents.forEach((record) => {
        assertValidation(validateIncidentCreate({ ...record, disaster_id: 1 }), record.description);
        assert(STATUSES.incident.includes(record.status), `${record.description} has an invalid status`);
        assertChennaiCoordinate(record.latitude, record.longitude, record.description);
    });

    const route = calculateRoute(roads, point("A"), point("T"));
    assert(route.route_found, "Demo road network cannot route between Chennai demo nodes");
};

const emptySummary = () => Object.fromEntries(
    Object.keys(EXPECTED_COUNTS).map((entity) => [entity, { created: 0, skipped: 0 }]),
);

const findOrInsert = async (client, { entity, table, keyColumn, key, insertSql, values, dryRun, summary }) => {
    const existing = await client.query(`SELECT id FROM ${table} WHERE ${keyColumn} = $1`, [key]);
    if (existing.rows.length > 0) {
        summary[entity].skipped += 1;
        return existing.rows[0].id;
    }

    summary[entity].created += 1;
    if (dryRun) return null;

    const inserted = await client.query(insertSql, values);
    return inserted.rows[0].id;
};

const seed = async (dryRun) => {
    validateDemoData();
    const pool = require("../db");
    const client = await pool.connect();
    const summary = emptySummary();

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [DEMO_PREFIX]);

        const citizen = await client.query("SELECT id FROM users WHERE role = 'CITIZEN' ORDER BY id LIMIT 1");
        if (citizen.rows.length === 0) {
            throw new Error("A pre-existing CITIZEN user is required to seed demo incidents; no changes were made");
        }

        const disasterIds = {};
        for (const record of disasters) {
            disasterIds[record.key] = await findOrInsert(client, {
                entity: "disasters", table: "disasters", keyColumn: "type", key: record.type, dryRun, summary,
                insertSql: "INSERT INTO disasters (type, severity, latitude, longitude, description, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                values: [record.type, record.severity, record.latitude, record.longitude, record.description, record.status],
            });
        }

        for (const record of shelters) {
            await findOrInsert(client, {
                entity: "shelters", table: "shelters", keyColumn: "name", key: record.name, dryRun, summary,
                insertSql: "INSERT INTO shelters (name, address, latitude, longitude, capacity, current_occupancy, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                values: [record.name, record.address, record.latitude, record.longitude, record.capacity, record.current_occupancy, record.status],
            });
        }

        for (const record of rescueTeams) {
            await findOrInsert(client, {
                entity: "rescueTeams", table: "rescue_teams", keyColumn: "name", key: record.name, dryRun, summary,
                insertSql: "INSERT INTO rescue_teams (name, contact_number, latitude, longitude, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                values: [record.name, record.contact_number, record.latitude, record.longitude, record.status],
            });
        }

        for (const record of roads) {
            await findOrInsert(client, {
                entity: "roads", table: "roads", keyColumn: "road_name", key: record.road_name, dryRun, summary,
                insertSql: "INSERT INTO roads (road_name, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, risk_level, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                values: [record.road_name, record.start_latitude, record.start_longitude, record.end_latitude, record.end_longitude, record.distance_km, record.risk_level, record.status],
            });
        }

        for (const record of resources) {
            await findOrInsert(client, {
                entity: "resources", table: "resources", keyColumn: "name", key: record.name, dryRun, summary,
                insertSql: "INSERT INTO resources (name, resource_type, quantity, location, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                values: [record.name, record.resource_type, record.quantity, record.location, record.status],
            });
        }

        for (const record of riskZones) {
            await findOrInsert(client, {
                entity: "riskZones", table: "risk_zones", keyColumn: "zone_name", key: record.zone_name, dryRun, summary,
                insertSql: "INSERT INTO risk_zones (disaster_id, zone_name, risk_score, risk_level, center_latitude, center_longitude, radius_km) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                values: [disasterIds[record.disasterKey], record.zone_name, record.risk_score, record.risk_level, record.center_latitude, record.center_longitude, record.radius_km],
            });
        }

        for (const record of incidents) {
            await findOrInsert(client, {
                entity: "incidents", table: "incidents", keyColumn: "description", key: record.description, dryRun, summary,
                insertSql: "INSERT INTO incidents (disaster_id, reported_by, description, latitude, longitude, severity, status, assigned_team_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                values: [disasterIds[record.disasterKey], citizen.rows[0].id, record.description, record.latitude, record.longitude, record.severity, record.status, null],
            });
        }

        await client.query(dryRun ? "ROLLBACK" : "COMMIT");
        return summary;
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* Preserve the original error. */ }
        throw error;
    } finally {
        client.release();
    }
};

const sqlLiteral = (value) => {
    if (value === null) return "NULL";
    if (typeof value === "number") return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
};

const insertIfMissingSql = (table, columns, values, keyColumn, key) => (
    `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${values.map(sqlLiteral).join(", ")} `
    + `WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${keyColumn} = ${sqlLiteral(key)});`
);

const insertReferencedSql = (table, columns, values, keyColumn, key, selectPrefix) => (
    `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${selectPrefix}${values.map(sqlLiteral).join(", ")} `
    + `WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${keyColumn} = ${sqlLiteral(key)});`
);

const buildSqlExport = () => {
    validateDemoData();
    const lines = [
        "-- Generated by scripts/seedProductionDemoData.js --sql. Do not edit manually.",
        `-- ${DEMO_PREFIX} synthetic data only. This script never inserts, updates, or deletes users.`,
        "BEGIN;",
        `SELECT pg_advisory_xact_lock(hashtext(${sqlLiteral(DEMO_PREFIX)}));`,
        "DO $demo_seed$",
        "DECLARE",
        "    demo_citizen_id integer;",
        "BEGIN",
        "    SELECT id INTO demo_citizen_id FROM users WHERE role = 'CITIZEN' ORDER BY id LIMIT 1;",
        "    IF demo_citizen_id IS NULL THEN",
        "        RAISE EXCEPTION 'A pre-existing CITIZEN user is required to seed demo incidents; no changes were made';",
        "    END IF;",
    ];
    const add = (statement) => lines.push(`    ${statement}`);

    disasters.forEach((record) => add(insertIfMissingSql(
        "disasters",
        ["type", "severity", "latitude", "longitude", "description", "status"],
        [record.type, record.severity, record.latitude, record.longitude, record.description, record.status],
        "type",
        record.type,
    )));
    shelters.forEach((record) => add(insertIfMissingSql(
        "shelters",
        ["name", "address", "latitude", "longitude", "capacity", "current_occupancy", "status"],
        [record.name, record.address, record.latitude, record.longitude, record.capacity, record.current_occupancy, record.status],
        "name",
        record.name,
    )));
    rescueTeams.forEach((record) => add(insertIfMissingSql(
        "rescue_teams",
        ["name", "contact_number", "latitude", "longitude", "status"],
        [record.name, record.contact_number, record.latitude, record.longitude, record.status],
        "name",
        record.name,
    )));
    roads.forEach((record) => add(insertIfMissingSql(
        "roads",
        ["road_name", "start_latitude", "start_longitude", "end_latitude", "end_longitude", "distance_km", "risk_level", "status"],
        [record.road_name, record.start_latitude, record.start_longitude, record.end_latitude, record.end_longitude, record.distance_km, record.risk_level, record.status],
        "road_name",
        record.road_name,
    )));
    resources.forEach((record) => add(insertIfMissingSql(
        "resources",
        ["name", "resource_type", "quantity", "location", "status"],
        [record.name, record.resource_type, record.quantity, record.location, record.status],
        "name",
        record.name,
    )));
    riskZones.forEach((record) => add(insertReferencedSql(
        "risk_zones",
        ["disaster_id", "zone_name", "risk_score", "risk_level", "center_latitude", "center_longitude", "radius_km"],
        [record.zone_name, record.risk_score, record.risk_level, record.center_latitude, record.center_longitude, record.radius_km],
        "zone_name",
        record.zone_name,
        `(SELECT id FROM disasters WHERE type = ${sqlLiteral(disasters.find(({ key }) => key === record.disasterKey).type)} ORDER BY id LIMIT 1), `,
    )));
    incidents.forEach((record) => add(insertReferencedSql(
        "incidents",
        ["disaster_id", "reported_by", "description", "latitude", "longitude", "severity", "status", "assigned_team_id"],
        [record.description, record.latitude, record.longitude, record.severity, record.status, null],
        "description",
        record.description,
        `(SELECT id FROM disasters WHERE type = ${sqlLiteral(disasters.find(({ key }) => key === record.disasterKey).type)} ORDER BY id LIMIT 1), demo_citizen_id, `,
    )));

    lines.push("END", "$demo_seed$;", "COMMIT;", "");
    return lines.join("\n");
};

const writeSqlExport = () => {
    const sql = buildSqlExport();
    fs.mkdirSync(path.dirname(SQL_OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(SQL_OUTPUT_PATH, sql, "utf8");
    console.log(`${DEMO_PREFIX} SQL export created: ${SQL_OUTPUT_PATH}`);
};

const printSummary = (summary, mode) => {
    const formatted = Object.entries(summary)
        .map(([entity, counts]) => `${entity}: ${counts.created} ${mode === "dry-run" ? "would create" : "created"}, ${counts.skipped} skipped`)
        .join("; ");
    console.log(`${DEMO_PREFIX} ${mode} summary - ${formatted}`);
};

const main = async () => {
    const mode = process.argv[2];
    if (mode === "--validate") {
        validateDemoData();
        console.log(`${DEMO_PREFIX} validation passed: ${Object.values(EXPECTED_COUNTS).join(", ")} records are valid and the road network routes from node A to node T.`);
        return;
    }
    if (mode === "--sql") {
        writeSqlExport();
        return;
    }
    if (mode !== "--dry-run" && mode !== "--apply") {
        throw new Error("Use --validate, --sql, --dry-run, or --apply. --apply is required to insert demo records.");
    }

    const summary = await seed(mode === "--dry-run");
    printSummary(summary, mode === "--dry-run" ? "dry-run" : "apply");
};

main()
    .catch((error) => {
        console.error(`${DEMO_PREFIX} seeding failed: ${formatSeedError(error)}`);
        process.exitCode = 1;
    })
    .finally(() => {
        const pool = require.cache[require.resolve("../db")]?.exports;
        return pool ? pool.end() : undefined;
    });
