import AuthPanel from "../components/AuthPanel";
import MapView from "../components/MapView";

function UnauthenticatedView() {
  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">ResQRoute</p>
          <h1>Emergency response map</h1>
        </div>
        <p className="service-status">Sign in to access the application.</p>
      </header>
      <AuthPanel />
      <section className="map-panel" aria-label="ResQRoute map">
        <MapView />
      </section>
    </>
  );
}

export default UnauthenticatedView;
