const RISK_WEIGHT = 2;
const EARTH_RADIUS_KM = 6371;
const NODE_PRECISION = 6;
const MAX_SNAP_DISTANCE_KM = 50;

const isFiniteNumber = (value) => (
    typeof value === "number" && Number.isFinite(value)
);

const toNumber = (value, field) => {
    const number = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(number)) {
        throw new Error(`${field} must be a finite number`);
    }

    return number;
};

const normalizeCoordinate = (value) => (
    toNumber(value, "coordinate").toFixed(NODE_PRECISION)
);

const nodeKey = (latitude, longitude) => (
    `${normalizeCoordinate(latitude)},${normalizeCoordinate(longitude)}`
);

const toNode = (latitude, longitude) => ({
    key: nodeKey(latitude, longitude),
    latitude: toNumber(latitude, "latitude"),
    longitude: toNumber(longitude, "longitude")
});

const normalizeRiskLevel = (value) => {
    const riskLevel = toNumber(value, "risk_level");

    if (riskLevel < 0 || riskLevel > 10) {
        throw new Error("risk_level must be between 0 and 10");
    }

    return riskLevel;
};

const normalizeStatus = (value) => (
    value === undefined || value === null
        ? "OPEN"
        : String(value).trim().toUpperCase()
);

const edgeCost = (distanceKm, riskLevel) => {
    // Risk-aware cost: distance + distance * (risk level / 10) * 2.
    return distanceKm + (distanceKm * (riskLevel / 10) * RISK_WEIGHT);
};

const haversineDistanceKm = (first, second) => {
    const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
    const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
    const firstLatitude = first.latitude * Math.PI / 180;
    const secondLatitude = second.latitude * Math.PI / 180;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(firstLatitude)
        * Math.cos(secondLatitude)
        * Math.sin(longitudeDelta / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
};

const addEdge = (graph, fromNode, toNode, road) => {
    if (!graph.has(fromNode.key)) {
        graph.set(fromNode.key, []);
    }

    graph.get(fromNode.key).push({
        to: toNode.key,
        road,
        cost: edgeCost(road.distance_km, road.risk_level)
    });
};

const buildGraph = (roads) => {
    if (!Array.isArray(roads)) {
        throw new Error("Road data must be an array");
    }

    const graph = new Map();
    const nodes = new Map();
    const blockedRoads = [];

    roads.forEach((road) => {
        const status = normalizeStatus(road.status);

        if (status === "BLOCKED") {
            blockedRoads.push({
                id: road.id,
                road_name: road.road_name
            });
            return;
        }

        const startNode = toNode(
            road.start_latitude,
            road.start_longitude
        );
        const endNode = toNode(
            road.end_latitude,
            road.end_longitude
        );
        const normalizedRoad = {
            id: road.id,
            road_name: road.road_name,
            distance_km: toNumber(road.distance_km, "distance_km"),
            risk_level: normalizeRiskLevel(road.risk_level),
            status
        };

        if (normalizedRoad.distance_km < 0) {
            throw new Error("distance_km must not be negative");
        }

        nodes.set(startNode.key, startNode);
        nodes.set(endNode.key, endNode);
        addEdge(graph, startNode, endNode, normalizedRoad);
        addEdge(graph, endNode, startNode, normalizedRoad);
    });

    return {
        graph,
        nodes,
        blockedRoads
    };
};

const findNearestNode = (nodes, coordinates) => {
    let nearestNode = null;
    let nearestDistance = Infinity;
    const targetNode = toNode(
        coordinates.latitude,
        coordinates.longitude
    );

    for (const node of nodes.values()) {
        const distance = haversineDistanceKm(targetNode, node);

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestNode = node;
        }
    }

    return nearestNode;
};

const nearestNodeDistanceKm = (nodes, coordinates, node) => {
    if (!node) return Infinity;
    return haversineDistanceKm(toNode(coordinates.latitude, coordinates.longitude), node);
};

const dijkstra = (graph, startKey, destinationKey) => {
    const distances = new Map();
    const previous = new Map();
    const unvisited = new Set(graph.keys());

    for (const key of graph.keys()) {
        distances.set(key, Infinity);
    }

    distances.set(startKey, 0);

    while (unvisited.size > 0) {
        let currentKey = null;
        let currentDistance = Infinity;

        for (const key of unvisited) {
            if (distances.get(key) < currentDistance) {
                currentKey = key;
                currentDistance = distances.get(key);
            }
        }

        if (currentKey === null || currentDistance === Infinity) {
            break;
        }

        unvisited.delete(currentKey);

        if (currentKey === destinationKey) {
            break;
        }

        for (const edge of graph.get(currentKey) || []) {
            if (!unvisited.has(edge.to)) {
                continue;
            }

            const candidateDistance = currentDistance + edge.cost;

            if (candidateDistance < distances.get(edge.to)) {
                distances.set(edge.to, candidateDistance);
                previous.set(edge.to, {
                    nodeKey: currentKey,
                    edge
                });
            }
        }
    }

    if (!distances.has(destinationKey) || distances.get(destinationKey) === Infinity) {
        return null;
    }

    const edges = [];
    let currentKey = destinationKey;

    while (currentKey !== startKey) {
        const previousStep = previous.get(currentKey);

        if (!previousStep) {
            return null;
        }

        edges.unshift(previousStep.edge);
        currentKey = previousStep.nodeKey;
    }

    return {
        cost: distances.get(destinationKey),
        edges
    };
};

const createNoRouteResult = (start, destination, nearestStartNode, nearestDestinationNode, blockedRoads) => ({
    route_found: false,
    message: "No safe route available",
    start_coordinates: start,
    destination_coordinates: destination,
    nearest_start_node: nearestStartNode,
    nearest_destination_node: nearestDestinationNode,
    blocked_roads: blockedRoads
});

const calculateRoute = (roads, start, destination) => {
    const { graph, nodes, blockedRoads } = buildGraph(roads);
    const nearestStartNode = findNearestNode(nodes, start);
    const nearestDestinationNode = findNearestNode(nodes, destination);

    if (!nearestStartNode || !nearestDestinationNode
        || nearestNodeDistanceKm(nodes, start, nearestStartNode) > MAX_SNAP_DISTANCE_KM
        || nearestNodeDistanceKm(nodes, destination, nearestDestinationNode) > MAX_SNAP_DISTANCE_KM) {
        return createNoRouteResult(
            start,
            destination,
            nearestStartNode,
            nearestDestinationNode,
            blockedRoads
        );
    }

    const shortestPath = dijkstra(
        graph,
        nearestStartNode.key,
        nearestDestinationNode.key
    );

    if (!shortestPath) {
        return createNoRouteResult(
            start,
            destination,
            nearestStartNode,
            nearestDestinationNode,
            blockedRoads
        );
    }

    const routeNodes = [nearestStartNode];
    const routeRoads = [];
    let currentNodeKey = nearestStartNode.key;

    for (const edge of shortestPath.edges) {
        currentNodeKey = edge.to;
        routeRoads.push({
            ...edge.road,
            cost: Number(edge.cost.toFixed(4))
        });
        routeNodes.push(nodes.get(currentNodeKey));
    }

    const riskLevels = routeRoads.map((road) => road.risk_level);
    const totalDistance = routeRoads.reduce(
        (total, road) => total + road.distance_km,
        0
    );

    return {
        route_found: true,
        start_coordinates: start,
        destination_coordinates: destination,
        nearest_start_node: nearestStartNode,
        nearest_destination_node: nearestDestinationNode,
        route_nodes: routeNodes,
        roads: routeRoads,
        total_distance_km: Number(totalDistance.toFixed(4)),
        total_cost: Number(shortestPath.cost.toFixed(4)),
        maximum_risk_level: riskLevels.length > 0 ? Math.max(...riskLevels) : 0,
        average_risk_level: riskLevels.length > 0
            ? Number((riskLevels.reduce((total, risk) => total + risk, 0) / riskLevels.length).toFixed(4))
            : 0,
        number_of_roads: routeRoads.length,
        blocked_roads: blockedRoads
    };
};

module.exports = {
    EARTH_RADIUS_KM,
    NODE_PRECISION,
    MAX_SNAP_DISTANCE_KM,
    RISK_WEIGHT,
    buildGraph,
    calculateRoute,
    dijkstra,
    edgeCost,
    findNearestNode,
    haversineDistanceKm,
    nodeKey
};
