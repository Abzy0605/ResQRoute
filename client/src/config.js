const configuredApiUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = (configuredApiUrl || "http://localhost:5000").replace(/\/$/, "");
