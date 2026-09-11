import useAuth from "../context/useAuth";

function AppHeader({ subtitle }) {
  const { currentUser, logout } = useAuth();

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">ResQRoute</p>
        <h1>{subtitle}</h1>
      </div>
      <div className="user-summary">
        <p>Signed in as: {currentUser?.name || currentUser?.email || "User"}</p>
        <p>Role: {currentUser?.role || "Unknown"}</p>
        <button type="button" onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}

export default AppHeader;
