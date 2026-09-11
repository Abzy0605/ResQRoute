import { useCallback, useState } from "react";
import MapLayers from "./MapLayers";
import MapLegend from "./MapLegend";
import MapView from "./MapView";
import RouteLayer from "./RouteLayer";

function OperationalMap({ route = null, refreshKey = 0, selectedShelter = null }) {
  const [layerStatus, setLayerStatus] = useState({
    loading: false,
    message: "",
  });

  const handleLayerStatusChange = useCallback((status) => {
    setLayerStatus(status);
  }, []);

  return (
    <>
      <section className="map-panel" aria-label="ResQRoute map">
        <MapView>
          <MapLayers onStatusChange={handleLayerStatusChange} refreshKey={refreshKey} selectedShelterId={selectedShelter?.id} />
          <RouteLayer route={route} />
        </MapView>
      </section>
      <div className="map-meta">
        <p className="layer-status" role="status">
          {layerStatus.loading ? "Loading operational layers..." : layerStatus.message}
        </p>
        <MapLegend />
      </div>
    </>
  );
}

export default OperationalMap;
