import { useState } from "react";
import useAuth from "../context/useAuth";

const initialLogin = {
  email: "",
  password: "",
};

const initialRegistration = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthPanel() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [loginValues, setLoginValues] = useState(initialLogin);
  const [registrationValues, setRegistrationValues] = useState(initialRegistration);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setError("");
  };

  const updateLogin = (event) => {
    const { name, value } = event.target;
    setLoginValues((current) => ({ ...current, [name]: value }));
  };

  const updateRegistration = (event) => {
    const { name, value } = event.target;
    setRegistrationValues((current) => ({ ...current, [name]: value }));
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!loginValues.email || !loginValues.password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      await login(loginValues.email, loginValues.password);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const { name, email, password, confirmPassword } = registrationValues;

    if (!name || !email || !password || !confirmPassword) {
      setError("Name, email, password, and confirmation are required.");
      return;
    }

    if (!emailPattern.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await register({ name, email, password });
      setRegistrationValues(initialRegistration);
      setLoginValues((current) => ({ ...current, email }));
      setMode("login");
      setMessage("Registration successful. You can now sign in as a citizen.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-panel" aria-label="Authentication">
      <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === "login" ? "auth-tab active" : "auth-tab"}
          onClick={() => switchMode("login")}
          role="tab"
          aria-selected={mode === "login"}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "register" ? "auth-tab active" : "auth-tab"}
          onClick={() => switchMode("register")}
          role="tab"
          aria-selected={mode === "register"}
        >
          Register
        </button>
      </div>

      {mode === "login" ? (
        <form className="auth-form" onSubmit={submitLogin}>
          <div>
            <p className="eyebrow">ResQRoute access</p>
            <h2>Sign in to continue</h2>
          </div>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={loginValues.email}
              onChange={updateLogin}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={loginValues.password}
              onChange={updateLogin}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submitRegistration}>
          <div>
            <p className="eyebrow">Citizen registration</p>
            <h2>Create a citizen account</h2>
          </div>
          <label>
            Name
            <input
              name="name"
              type="text"
              autoComplete="name"
              value={registrationValues.name}
              onChange={updateRegistration}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={registrationValues.email}
              onChange={updateRegistration}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              value={registrationValues.password}
              onChange={updateRegistration}
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={registrationValues.confirmPassword}
              onChange={updateRegistration}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>
      )}

      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </section>
  );
}

export default AuthPanel;
