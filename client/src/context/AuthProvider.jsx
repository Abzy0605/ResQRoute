import { useState } from "react";
import AuthContext from "./AuthContext";
import { API_BASE_URL } from "../config";
const TOKEN_KEY = "token";
const USER_KEY = "resqroute_user";

const decodeToken = (token) => {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));

    if (decoded.exp && decoded.exp * 1000 <= Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
};

const getStoredSession = () => {
  const token = window.localStorage.getItem(TOKEN_KEY);

  if (!token || !decodeToken(token)) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    return { token: null, user: null };
  }

  let storedUser;

  try {
    storedUser = JSON.parse(window.localStorage.getItem(USER_KEY));
  } catch {
    // Fall back to the token payload when stored profile data is malformed.
  }

  const decodedToken = decodeToken(token);
  const user = storedUser || {
    id: decodedToken.id,
    role: decodedToken.role,
  };

  return { token, user };
};

const createAuthError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

function AuthProvider({ children }) {
  const [session, setSession] = useState(getStoredSession);

  const login = async (email, password) => {
    let response;

    try {
      response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw createAuthError(0, "Unable to connect to the server. Please try again.");
    }

    let result;

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const message = response.status === 401
        ? "Invalid email or password."
        : "Unable to connect to the server. Please try again.";
      throw createAuthError(response.status, message);
    }

    if (!result.token || !result.user) {
      throw createAuthError(500, "Unable to complete sign in. Please try again.");
    }

    window.localStorage.setItem(TOKEN_KEY, result.token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setSession({ token: result.token, user: result.user });
  };

  const register = async ({ name, email, password }) => {
    let response;

    try {
      response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });
    } catch {
      throw createAuthError(0, "Unable to connect to the server. Please try again.");
    }

    let result;

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const message = response.status === 409
        ? "That email is already registered."
        : response.status === 400
          ? result.message || "Please check the registration details."
          : "Unable to connect to the server. Please try again.";
      throw createAuthError(response.status, message);
    }

    return result;
  };

  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setSession({ token: null, user: null });
  };

  const value = {
    currentUser: session.user,
    token: session.token,
    isAuthenticated: Boolean(session.token),
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
