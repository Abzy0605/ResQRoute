import "./App.css";
import AdminDashboard from "./pages/AdminDashboard";
import CitizenDashboard from "./pages/CitizenDashboard";
import RescueTeamDashboard from "./pages/RescueTeamDashboard";
import UnauthenticatedView from "./pages/UnauthenticatedView";
import useAuth from "./context/useAuth";

function App() {
  const { isAuthenticated, currentUser } = useAuth();

  let view = <UnauthenticatedView />;

  if (isAuthenticated && currentUser?.role === "ADMIN") {
    view = <AdminDashboard />;
  } else if (isAuthenticated && currentUser?.role === "RESCUE_TEAM") {
    view = <RescueTeamDashboard />;
  } else if (isAuthenticated && currentUser?.role === "CITIZEN") {
    view = <CitizenDashboard />;
  }

  return <main className="app-shell">{view}</main>;
}

export default App;