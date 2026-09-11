import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const EMPTY_FORM = {
  name: "",
  resource_type: "",
  quantity: "",
  location: "",
  status: "",
};

const toFormValues = (resource) => ({
  name: resource.name ?? "",
  resource_type: resource.resource_type ?? "",
  quantity: resource.quantity ?? "",
  location: resource.location ?? "",
  status: resource.status ?? "",
});

const validateForm = (values) => {
  if (!values.name.trim()) return "Resource name is required.";
  if (!values.resource_type.trim()) return "Resource type is required.";
  if (!values.quantity.trim()) return "Quantity is required.";

  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return "Quantity must be a non-negative integer.";
  }

  return null;
};

const toPayload = (values, includeStatus = false) => {
  const payload = {
    name: values.name.trim(),
    resource_type: values.resource_type.trim(),
    quantity: Number(values.quantity),
    location: values.location.trim() || null,
  };

  if (includeStatus) payload.status = values.status.trim() || null;
  return payload;
};

const errorMessage = (status, fallback) => {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You are not authorized to manage resources.";
  if (status === 404) return "Resource not found.";
  if (status === 400) return fallback || "Please check the resource details.";
  return "Unable to update resources. Please try again.";
};

const formatDate = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Not provided";
};

function ResourceManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadResources = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/resources`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(errorMessage(response.status));
      const data = await response.json();
      setResources(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to load resources. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => loadResources(controller.signal));
    return () => controller.abort();
  }, [currentUser?.role, loadResources]);

  const readError = async (response) => {
    try {
      return (await response.json()).message;
    } catch {
      return undefined;
    }
  };

  const refreshAfterChange = async (message) => {
    setFeedback(message);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await loadResources();
    onChanged();
  };

  const submitForm = async (event, isEdit = false) => {
    event.preventDefault();
    setError("");
    setFeedback("");
    const values = isEdit ? editingForm : form;
    const validationError = validateForm(values);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const endpoint = isEdit
        ? `${API_BASE_URL}/api/resources/${editingId}`
        : `${API_BASE_URL}/api/resources`;
      const response = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(values, isEdit)),
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status, await readError(response)));
      }

      await refreshAfterChange(isEdit ? "Resource updated successfully." : "Resource created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update resources. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteResource = async (resource) => {
    if (!window.confirm(`Delete resource "${resource.name}"?`)) return;
    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/resources/${resource.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status, await readError(response)));
      }

      await refreshAfterChange("Resource deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update resources. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  if (currentUser?.role !== "ADMIN") return null;

  const formFields = (values, setter, includeStatus = false) => (
    <div className="resource-form-grid">
      <label>Name<input name="name" value={values.name} onChange={updateForm(setter)} /></label>
      <label>Resource type<input name="resource_type" value={values.resource_type} onChange={updateForm(setter)} /></label>
      <label>Quantity<input name="quantity" type="number" min="0" step="1" value={values.quantity} onChange={updateForm(setter)} /></label>
      <label>Location (optional)<input name="location" value={values.location} onChange={updateForm(setter)} /></label>
      {includeStatus ? (
        <label>Status<input name="status" value={values.status} onChange={updateForm(setter)} /></label>
      ) : (
        <p className="resource-status-note">Status is assigned by the server when the resource is created.</p>
      )}
    </div>
  );

  return (
    <section className="resource-management" aria-label="Resource management">
      <div className="section-heading">
        <div><p className="eyebrow">Admin controls</p><h2>Resource management</h2></div>
        <span>{loading ? "Loading..." : `${resources.length} records`}</span>
      </div>

      <form className="resource-form" onSubmit={(event) => submitForm(event)}>
        <h3>Create resource</h3>
        {formFields(form, setForm)}
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Resource"}</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="resource-form edit-form" onSubmit={(event) => submitForm(event, true)}>
          <div className="section-heading"><h3>Edit resource</h3><button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></div>
          {formFields(editingForm, setEditingForm, true)}
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="resource-table-wrap">
        <table className="resource-table">
          <thead><tr><th>Name</th><th>Type</th><th>Quantity</th><th>Location</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && resources.length === 0 && <tr><td colSpan="7">No resources found.</td></tr>}
            {resources.map((resource) => (
              <tr key={resource.id}>
                <td>{resource.name || "Not provided"}</td>
                <td>{resource.resource_type || "Not provided"}</td>
                <td>{resource.quantity ?? "Not provided"}</td>
                <td>{resource.location || "Not provided"}</td>
                <td>{resource.status || "Not provided"}</td>
                <td>{formatDate(resource.created_at)}</td>
                <td className="table-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingId(resource.id); setEditingForm(toFormValues(resource)); setError(""); }}>Edit</button>
                  <button type="button" className="text-button danger" onClick={() => deleteResource(resource)} disabled={submitting}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ResourceManagement;
