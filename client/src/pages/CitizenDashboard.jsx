import { useCallback, useState } from "react";
import AppHeader from "../components/AppHeader";
import CitizenIncidentReport from "../components/CitizenIncidentReport";
import CitizenSOS from "../components/CitizenSOS";
import EvacuationWorkflow from "../components/EvacuationWorkflow";
import OperationalMap from "../components/OperationalMap";

function CitizenDashboard() {
  const [route, setRoute] = useState(null);
  const [selectedShelter, setSelectedShelter] = useState(null);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const refreshOperationalData = useCallback(() => {
    setMapRefreshKey((current) => current + 1);
  }, []);

  return (
    <>
      <AppHeader subtitle="Find a safe evacuation route" />
      <section className="role-intro">
        <p className="eyebrow">Citizen evacuation view</p>
        <p>Review current conditions, choose an available shelter, and calculate an evacuation route.</p>
      </section>
      <CitizenSOS onSOSSubmitted={refreshOperationalData} />
      <EvacuationWorkflow
        onRouteChange={setRoute}
        onShelterChange={setSelectedShelter}
        onOperationalDataChanged={refreshOperationalData}
      />
      <CitizenIncidentReport onIncidentReported={refreshOperationalData} />
      <OperationalMap route={route} refreshKey={mapRefreshKey} selectedShelter={selectedShelter} />
    </>
  );
}

export default CitizenDashboard;
