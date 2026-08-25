"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

type ApiPerson = { id: number; name: string; phone: string; details: string; latitude: number; longitude: number; status: "safe" | "at_risk" };
type Zone = { id: number; name: string; zone_type: "safe" | "at_risk" | "hazard"; details: string; coordinates: LatLng[] };
type Stage = "standby" | "active" | "routed" | "alerted";
type AlertStatus = "idle" | "sending" | "sent" | "error";
type LatLng = { lat: number; lng: number };
type EditMode = "none" | "person" | "zone";
type SearchResult = { id: string; label: string; detail: string; position: LatLng; person?: ApiPerson };
type Hazard = { id: number; name: string; hazard_type: string; severity: string; latitude: number; longitude: number; radius: number; status: "active" | "cleared" };
type Shelter = { id: number; name: string; latitude: number; longitude: number; capacity: number; current_occupancy: number; status: "open" | "closed" };
type ResidentRoute = { shelter_id: number; shelter_name: string; distance_meters: number; duration_seconds: number; unsafe: boolean; hazards: string[]; safety_score: number };

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleOverlay;
    Polygon: new (options: Record<string, unknown>) => GoogleOverlay;
    Polyline: new (options: Record<string, unknown>) => GoogleOverlay;
  };
};
type GoogleMapInstance = { setCenter: (center: LatLng) => void; setZoom: (zoom: number) => void; addListener?: (event: string, callback: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => GoogleListener };
type GoogleOverlay = { setMap: (map: GoogleMapInstance | null) => void };
type GooglePolygon = GoogleOverlay & { getPath: () => { getArray: () => Array<{ lat: () => number; lng: () => number }> } };
type GoogleListener = { remove: () => void };

const mapCenter: LatLng = { lat: 5, lng: 20 };
const googleMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#26343b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b9c8c9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#26343b" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#53666b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#46585d" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#36484d" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#65777a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#174c59" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
];

function distanceBetweenPoints(first: LatLng, second: LatLng): number {
  const latitudeDistance = (second.lat - first.lat) * 111_000;
  const longitudeDistance = (second.lng - first.lng) * 111_000 * Math.cos(first.lat * Math.PI / 180);
  return Math.sqrt(latitudeDistance ** 2 + longitudeDistance ** 2);
}

function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses = current.lng > point.lng !== prior.lng > point.lng
      && point.lat < (prior.lat - current.lat) * (point.lng - current.lng) / (prior.lng - current.lng) + current.lat;
    if (crosses) inside = !inside;
  }
  return inside;
}

function zoomForZone(coordinates: LatLng[]): number {
  const latitudes = coordinates.map((coordinate) => coordinate.lat);
  const longitudes = coordinates.map((coordinate) => coordinate.lng);
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const span = Math.max(latitudeSpan, longitudeSpan, 0.01);
  return Math.max(5, Math.min(14, Math.floor(Math.log2(360 / span)) - 1));
}

function zoomForPerson(person: ApiPerson, zones: Zone[]): number {
  const position = { lat: person.latitude, lng: person.longitude };
  const containingZone = zones.find((zone) => pointInPolygon(position, zone.coordinates));
  return containingZone ? zoomForZone(containingZone.coordinates) : 14;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function ResidentExperience({ apiBaseUrl }: { apiBaseUrl: string }) {
  const router = useRouter();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState("Location not shared");
  const [routes, setRoutes] = useState<ResidentRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<ResidentRoute | null>(null);
  const [language, setLanguage] = useState("English");
  const [chatOpen, setChatOpen] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");

  useEffect(() => {
    async function loadPublicData() {
      try {
        const [hazardsResponse, sheltersResponse] = await Promise.all([fetch(`${apiBaseUrl}/hazards/`), fetch(`${apiBaseUrl}/shelters/`)]);
        if (hazardsResponse.ok) setHazards((await hazardsResponse.json()).filter((hazard: Hazard) => hazard.status === "active"));
        if (sheltersResponse.ok) setShelters((await sheltersResponse.json()).filter((shelter: Shelter) => shelter.status === "open"));
      } catch {
        setRouteMessage("Live safety data is temporarily unavailable. Call local emergency services if you are in immediate danger.");
      }
    }
    void loadPublicData();
  }, [apiBaseUrl]);

  function shareLocation() {
    if (!navigator.geolocation) {
      setRouteMessage("Location sharing is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      setLocation(nextLocation);
      setLocationLabel("Your location shared");
      setRouteMessage("");
    }, () => setRouteMessage("We could not access your location. You can try again or contact emergency services."), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function findRoutes() {
    if (!location) {
      shareLocation();
      return;
    }
    setLoadingRoutes(true);
    setRouteMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/route/recommend/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: location.lat, longitude: location.lng }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Route search failed");
      setRoutes(result.routes || []);
      setSelectedRoute(result.recommended_route || null);
      if (!result.routes?.length) setRouteMessage("No clear route is available right now. Move to a safe, elevated place and wait for an updated alert.");
    } catch {
      setRouteMessage("Routes could not be calculated right now. Stay away from marked hazard areas and seek local help.");
    } finally {
      setLoadingRoutes(false);
    }
  }

  const copy = language === "Swahili" ? { title: "Njia salama kwako", subtitle: "Pata maelekezo ya haraka kulingana na hatari zilizo karibu.", share: "Shiriki eneo langu", route: "Nionyeshe njia", help: "Mahali pa kupata msaada", risks: "Elewa hatari", calm: "Nahitaji msaada wa utulivu" } : { title: "A safer way through", subtitle: "Get clear guidance based on hazards near you. Share your location once, then choose a route.", share: "Share my location", route: "Find my safe route", help: "Help nearby", risks: "Understand the risk", calm: "I need help staying calm" };

  return (
    <main className="resident-shell">
      <section className="resident-hero"><div className="resident-nav"><div className="resident-brand"><span className="resident-mark">+</span><strong>SafePath <b>AI</b></strong><span className="live-chip"><i /> LIVE SAFETY GUIDE</span></div><div className="resident-actions"><label className="language-select"><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>Swahili</option></select></label><button className="admin-link" onClick={() => router.push("/admin")}>Operator access</button></div></div><div className="resident-intro"><span className="eyebrow light-eyebrow">FOR PEOPLE IN THE AREA</span><h1>{copy.title}</h1><p>{copy.subtitle}</p><div className="resident-actions-row"><button className="location-button" onClick={shareLocation}>{location ? "✓ " : "◎ "}{location ? locationLabel : copy.share}</button><button className="route-button" onClick={findRoutes} disabled={loadingRoutes}>{loadingRoutes ? "Checking routes..." : copy.route} <span>→</span></button></div><small className="location-note">{location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Your location stays on this device until you choose a route."}</small></div></section>
      <section className="resident-content"><div className="resident-main-column"><div className={`safety-status ${hazards.length ? "has-hazard" : "clear"}`}><span className="status-pulse">{hazards.length ? "!" : "✓"}</span><div><span className="eyebrow">CURRENT AREA STATUS</span><h2>{hazards.length ? `${hazards.length} active hazard${hazards.length === 1 ? "" : "s"} nearby` : "No active hazards reported"}</h2><p>{hazards.length ? "Stay calm. Review the route options below and keep away from marked areas." : "We are monitoring the area for changes."}</p></div><span className="status-time">Updated now</span></div>{routeMessage && <p className="resident-message">{routeMessage}</p>}<div className="section-heading"><div><span className="eyebrow">YOUR OPTIONS</span><h2>{selectedRoute ? "Choose a route to help" : "Ready when you are"}</h2></div>{routes.length > 0 && <span className="route-count">{routes.length} options</span>}</div>{routes.length > 0 ? <div className="route-list">{routes.map((route, index) => <button className={`route-card ${selectedRoute?.shelter_id === route.shelter_id ? "chosen" : ""}`} key={route.shelter_id} onClick={() => setSelectedRoute(route)}><span className="route-number">{index + 1}</span><span className="route-card-content"><strong>{route.shelter_name}</strong><small>{formatDuration(route.duration_seconds)} · {formatDistance(route.distance_meters)} · {route.hazards.length ? `Avoids ${route.hazards.join(", ")}` : "No active hazards detected on route"}</small></span><span className="safety-score">{route.safety_score}<small>SAFETY</small></span></button>)}</div> : <div className="empty-routes"><span className="empty-icon">◎</span><strong>Share your location to see nearby routes</strong><p>We will compare open help points and explain the risks before you choose.</p><button className="text-action" onClick={shareLocation}>{copy.share} →</button></div>}<div className="risk-section"><div className="section-heading"><div><span className="eyebrow">WHAT THE RISK MEANS</span><h2>{copy.risks}</h2></div></div><div className="risk-grid"><div><span>01</span><strong>Hazard</strong><p>The dangerous event itself, such as flooding or fire.</p></div><div><span>02</span><strong>Exposure</strong><p>People, roads, and buildings that are in its path.</p></div><div><span>03</span><strong>Vulnerability</strong><p>How easily people may be harmed based on their situation.</p></div></div></div></div><aside className="resident-side"><div className="help-panel"><div className="section-heading"><div><span className="eyebrow">OPEN SUPPORT POINTS</span><h2>{copy.help}</h2></div><span className="help-icon">+</span></div>{shelters.length ? shelters.slice(0, 4).map((shelter) => <div className="help-item" key={shelter.id}><span className="help-pin">⌂</span><div><strong>{shelter.name}</strong><small>{shelter.capacity - shelter.current_occupancy > 0 ? `${shelter.capacity - shelter.current_occupancy} spaces available` : "Capacity may be full"}</small></div><span className="open-dot">OPEN</span></div>) : <p className="muted-copy">Help points will appear here when the response team publishes them.</p>}</div><div className="meet-panel"><span className="eyebrow">MEET ME IN THE MIDDLE</span><h2>Let help find you.</h2><p>Share your chosen route with a trusted person or rescue team when this connection is available.</p><button className="secondary-resident-button" onClick={() => setRouteMessage("Your selected help point is ready to share from this device.")} disabled={!selectedRoute}>Share my plan <span>↗</span></button></div><button className="calm-button" onClick={() => setChatOpen(!chatOpen)}><span>✦</span>{copy.calm}<b>→</b></button>{chatOpen && <div className="calm-panel"><strong>You are doing the right thing.</strong><p>Take one slow breath in for four counts and out for six. Move away from water, smoke, or unstable structures. Follow official instructions and call local emergency services if you are in immediate danger.</p><button onClick={() => setChatOpen(false)}>Close guide</button></div>}</aside></section><footer className="resident-footer"><span>SafePath AI · Guidance uses available local data.</span><span>In immediate danger, contact local emergency services.</span></footer>
    </main>
  );
}

function GoogleMapSurface({ onSelect, recenterPoint, recenterZoom, ready, mode, people, zones, zonePoints, finishZoneSignal, onPointSelect, onZonePoint, onZoneClose, onZoneDrawn }: { onSelect: (person: ApiPerson) => void; recenterPoint: LatLng | null; recenterZoom: number; ready: boolean; mode: EditMode; people: ApiPerson[]; zones: Zone[]; zonePoints: LatLng[]; finishZoneSignal: number; onPointSelect: (point: LatLng) => void; onZonePoint: (point: LatLng) => void; onZoneClose: (firstPoint?: LatLng) => void; onZoneDrawn: (coordinates: LatLng[], polygon: GooglePolygon) => void }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GoogleMapInstance | null>(null);
  const overlays = useRef<GoogleOverlay[]>([]);
  const mapListeners = useRef<GoogleListener[]>([]);
  const lastFinishSignal = useRef(0);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  useEffect(() => {
    const mapsApi = (window as Window & { google?: GoogleMapsApi }).google;
    if (!mapsApi || !mapElement.current) return;

    if (!mapInstance.current) {
      mapInstance.current = new mapsApi.maps.Map(mapElement.current, {
        center: mapCenter,
        zoom: 3,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: googleMapStyles,
      });
    }

    overlays.current.forEach((overlay) => overlay.setMap(null));
    mapListeners.current.forEach((listener) => listener.remove());
    mapListeners.current = [];
    const nextOverlays: GoogleOverlay[] = [];

    if (mode === "person") {
      const listener = mapInstance.current.addListener?.("click", (event) => {
        if (event.latLng) onPointSelect({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      if (listener) mapListeners.current.push(listener);
    }

    if (mode === "zone") {
      const listener = mapInstance.current.addListener?.("click", (event) => {
        if (!event.latLng) return;
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        if (zonePoints.length >= 3 && distanceBetweenPoints(point, zonePoints[0]) <= 250) {
          onZoneClose(zonePoints[0]);
          return;
        }
        onZonePoint(point);
      });
      if (listener) mapListeners.current.push(listener);
      if (zonePoints.length > 1) {
        nextOverlays.push(new mapsApi.maps.Polyline({ map: mapInstance.current, path: zonePoints, strokeColor: "#f05d5e", strokeWeight: 2, strokeOpacity: 0.9 }));
      }
      if (zonePoints.length > 0) {
        nextOverlays.push(new mapsApi.maps.Marker({
          map: mapInstance.current,
          position: zonePoints[0],
          title: zonePoints.length >= 3 ? "Click here to close the zone" : "Zone starting point",
          label: { text: "1", color: "#ffffff", fontWeight: "700" },
          icon: { path: "M 0,0 m -11,0 a 11,11 0 1,0 22,0 a 11,11 0 1,0 -22,0", fillColor: "#f05d5e", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 1 },
        }));
      }
    }

    if (mode === "zone" && finishZoneSignal > lastFinishSignal.current && zonePoints.length >= 3) {
      lastFinishSignal.current = finishZoneSignal;
      const polygon = new mapsApi.maps.Polygon({ map: mapInstance.current, paths: zonePoints, fillColor: "#f05d5e", fillOpacity: 0.25, strokeColor: "#f05d5e", strokeWeight: 2 }) as GooglePolygon;
      onZoneDrawn(zonePoints, polygon);
    }

    people.forEach((person) => {
      const marker = new mapsApi.maps.Marker({
        map: mapInstance.current,
        position: { lat: person.latitude, lng: person.longitude },
        title: person.name,
        icon: { path: "M 0,0 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0", fillColor: person.status === "at_risk" ? "#f05d5e" : "#72d6a3", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1 },
      }) as GoogleOverlay & { addListener?: (event: string, callback: () => void) => void };
      marker.addListener?.("click", () => onSelect(person));
      nextOverlays.push(marker);
    });

    zones.forEach((zone) => {
      const colors = { safe: "#72d6a3", at_risk: "#f2a65a", hazard: "#f05d5e" };
      nextOverlays.push(new mapsApi.maps.Polygon({ map: mapInstance.current, paths: zone.coordinates, fillColor: colors[zone.zone_type], fillOpacity: 0.24, strokeColor: colors[zone.zone_type], strokeWeight: 2 }));
    });

    overlays.current = nextOverlays;
  }, [onSelect, apiKey, ready, mode, people, zones, zonePoints, finishZoneSignal, onPointSelect, onZonePoint, onZoneClose, onZoneDrawn]);

  useEffect(() => {
    if (recenterPoint && mapInstance.current) {
      mapInstance.current.setCenter(recenterPoint);
      mapInstance.current.setZoom(recenterZoom);
    }
  }, [recenterPoint, recenterZoom]);

  return apiKey ? <div className="google-map" ref={mapElement} /> : <div className="map-key-missing">Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to load Google Maps.</div>;
}

export default function Home({ initialView = "resident" }: { initialView?: "resident" | "operator" }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("standby");
  const [selected, setSelected] = useState<ApiPerson | null>(null);
  const [panel, setPanel] = useState("overview");
  const [mapsReady, setMapsReady] = useState(false);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("idle");
  const [zoneAlertCount, setZoneAlertCount] = useState(0);
  const [testRecipient, setTestRecipient] = useState("");
  const [targetZoneId, setTargetZoneId] = useState<number | "">("");
  const [mode, setMode] = useState<EditMode>("none");
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [personPoint, setPersonPoint] = useState<LatLng | null>(null);
  const [zonePoints, setZonePoints] = useState<LatLng[]>([]);
  const [finishZoneSignal, setFinishZoneSignal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);
  const [searchZoom, setSearchZoom] = useState(12);
  const [zoneDraft, setZoneDraft] = useState<{ coordinates: LatLng[]; polygon: GooglePolygon } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", details: "", status: "safe" as "safe" | "at_risk", zoneType: "hazard" as Zone["zone_type"] });
  const [saveError, setSaveError] = useState("");
  const effectivePeople = people.map((person) => ({
    ...person,
    status: zones.some((zone) => zone.zone_type === "safe" && pointInPolygon({ lat: person.latitude, lng: person.longitude }, zone.coordinates))
      ? "safe" as const
      : zones.some((zone) => zone.zone_type === "hazard" && pointInPolygon({ lat: person.latitude, lng: person.longitude }, zone.coordinates))
        ? "at_risk" as const
        : person.status,
  }));
  const effectiveSelected = selected ? effectivePeople.find((person) => person.id === selected.id) ?? selected : null;
  const affected = effectivePeople.filter((person) => person.status === "at_risk");
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";
  const normalizedApiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, "");
  const apiBaseUrl = normalizedApiBaseUrl.endsWith("/api")
    ? normalizedApiBaseUrl
    : `${normalizedApiBaseUrl}/api`;

  const searchResults: SearchResult[] = (() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const coordinateParts = query.split(",").map(Number);
    if (coordinateParts.length === 2 && coordinateParts.every(Number.isFinite)) {
      const [lat, lng] = coordinateParts;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return [{ id: "coordinates", label: `${lat}, ${lng}`, detail: "Coordinates", position: { lat, lng } }];
    }
    const results: SearchResult[] = [];
    people.forEach((person) => {
      if (`${person.name} ${person.phone} ${person.details}`.toLowerCase().includes(query)) results.push({ id: `saved-${person.id}`, label: person.name, detail: person.phone || "Saved person", position: { lat: person.latitude, lng: person.longitude }, person });
    });
    zones.forEach((zone) => {
      if (`${zone.name} ${zone.details}`.toLowerCase().includes(query) && zone.coordinates[0]) results.push({ id: `zone-${zone.id}`, label: zone.name, detail: `${zone.zone_type.replace("_", " ")} zone`, position: zone.coordinates[0] });
    });
    return results.slice(0, 6);
  })();

  function selectSearchResult(result: SearchResult) {
    if (result.person) setSelected(result.person);
    setSearchQuery(result.label);
    setSearchOpen(false);
    setMode("none");
    setSearchCenter(result.position);
    setSearchZoom(result.person ? zoomForPerson(result.person, zones) : 3);
  }

  function selectPerson(person: ApiPerson) {
    setSelected(person);
    setSearchCenter({ lat: person.latitude, lng: person.longitude });
    setSearchZoom(zoomForPerson(person, zones));
  }

  function selectZone(zone: Zone) {
    if (!zone.coordinates.length) return;
    const center = zone.coordinates.reduce(
      (point, coordinate) => ({ lat: point.lat + coordinate.lat, lng: point.lng + coordinate.lng }),
      { lat: 0, lng: 0 },
    );
    setSearchCenter({ lat: center.lat / zone.coordinates.length, lng: center.lng / zone.coordinates.length });
    setSearchZoom(zoomForZone(zone.coordinates));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchResults[0]) selectSearchResult(searchResults[0]);
  }

  useEffect(() => {
    async function loadMapData() {
      try {
        const [peopleResponse, zonesResponse] = await Promise.all([fetch(`${apiBaseUrl}/people/`), fetch(`${apiBaseUrl}/zones/`)]);
        if (peopleResponse.ok) setPeople(await peopleResponse.json());
        if (zonesResponse.ok) setZones(await zonesResponse.json());
      } catch {
        setSaveError("Map data could not be loaded from the server.");
      }
    }
    void loadMapData();
  }, [apiBaseUrl]);

  if (initialView === "resident") {
    return <ResidentExperience apiBaseUrl={apiBaseUrl} />;
  }

  function startPerson() {
    setSaveError("");
    setPersonPoint(null);
    setZonePoints([]);
    setZoneDraft(null);
    setMode("person");
  }

  function startZone() {
    setSaveError("");
    setPersonPoint(null);
    setZonePoints([]);
    setZoneDraft(null);
    setMode("zone");
  }

  function closeZone(firstPoint?: LatLng) {
    if (firstPoint) setZonePoints((current) => current.length >= 3 ? [...current, firstPoint] : current);
    setFinishZoneSignal((current) => current + 1);
  }

  async function saveMapItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isPerson = Boolean(personPoint);
    const payload = isPerson
      ? { name: form.name, phone: form.phone, details: form.details, status: form.status, latitude: personPoint?.lat, longitude: personPoint?.lng }
      : { name: form.name, details: form.details, zone_type: form.zoneType, coordinates: zoneDraft?.coordinates };
    const endpoint = isPerson ? "people" : "zones";
    try {
      const response = await fetch(`${apiBaseUrl}/${endpoint}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("Save failed");
      const saved = await response.json();
      if (isPerson) setPeople((current) => [saved, ...current]);
      else setZones((current) => [saved, ...current]);
      setForm({ name: "", phone: "", details: "", status: "safe", zoneType: "hazard" });
      setPersonPoint(null);
      setZoneDraft(null);
      setZonePoints([]);
      setMode("none");
    } catch {
      setSaveError("The item could not be saved. Check that the API is running.");
    }
  }

  function loadDemo() {
    setStage("standby");
    setSelected(null);
    setPanel("overview");
    setAlertStatus("idle");
    setZoneAlertCount(0);
  }

  async function sendSms(recipients: string[], markAlert = false) {
    setAlertStatus("sending");
    const message = "SAFEPATH ALERT: Flooding detected near your location. Avoid River Road and proceed to Green Primary School using the recommended route. Estimated travel time: 8 minutes.";

    try {
      const response = await fetch(`${apiBaseUrl}/alert/sms/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, recipients }),
      });
      if (!response.ok) throw new Error("SMS service rejected the request");
      setAlertStatus("sent");
      if (markAlert) setStage("alerted");
    } catch {
      setAlertStatus("error");
      if (markAlert) setStage("routed");
    }
  }

  function sendEmergencyAlerts() {
    void sendSms(affected.map((person) => person.phone), true);
  }

  async function sendZoneRouteAlerts() {
    if (targetZoneId === "") return;
    setAlertStatus("sending");
    try {
      const response = await fetch(`${apiBaseUrl}/alert/zone-sms/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone_id: targetZoneId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || "Zone SMS failed");
      setZoneAlertCount(result.sent.length);
      setAlertStatus("sent");
      setStage("alerted");
    } catch {
      setAlertStatus("error");
    }
  }

  function sendTestSms() {
    if (!/^\+[1-9]\d{7,14}$/.test(testRecipient.replace(/[\s()-]/g, ""))) {
      setAlertStatus("error");
      return;
    }
    void sendSms([testRecipient], false);
  }

  return (
    <main className="command-shell">
      {(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) && <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}`} strategy="afterInteractive" onLoad={() => setMapsReady(true)} />}
      <header className="topbar">
        <div className="brand"><span className="brand-mark">+</span><span>SafePath <b>AI</b></span><small>EMERGENCY OPERATIONS</small></div>
        <div className="top-actions"><button className="view-switch" onClick={() => router.push("/home")}>Resident view</button><span className="demo-pill"><i /> DEMO MODE</span><span className="sync"><i /> SYSTEMS ONLINE</span><button className="icon-button" aria-label="Settings">⚙</button><div className="operator">OP <span>AO</span></div></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">COMMAND CENTER</span><h1>Mission control</h1></div><span className="live-dot" /></div>
          <nav className="nav-tabs"><button className={panel === "overview" ? "selected" : ""} onClick={() => setPanel("overview")}>Overview</button><button className={panel === "people" ? "selected" : ""} onClick={() => setPanel("people")}>People <em>{people.length}</em></button><button className={panel === "shelters" ? "selected" : ""} onClick={() => setPanel("shelters")}>Zones <em>{zones.length}</em></button></nav>

          <div className="status-card"><div className="status-row"><span className={`status-icon ${stage === "standby" ? "quiet" : "danger"}`}>!</span><div><span className="eyebrow">CURRENT INCIDENT</span><strong>{stage === "standby" ? "No active incident" : "Critical flood"}</strong></div></div><div className="status-details"><span className={stage === "standby" ? "muted" : "danger-text"}>{stage === "standby" ? "Monitoring area" : "ACTIVE · FLOOD ZONE"}</span><span>Updated just now</span></div></div>

          <div className="stats-grid"><div><strong>{stage === "standby" ? "—" : affected.length}</strong><span>Affected</span></div><div><strong>{stage === "standby" ? "—" : people.filter((person) => person.status === "safe").length}</strong><span>Safe</span></div><div><strong>{stage === "routed" || stage === "alerted" ? affected.length : "—"}</strong><span>Routes</span></div></div>

          {panel === "overview" && <>
            <div className="control-section"><div className="section-title"><span>DISASTER CONTROLS</span><button className="more">•••</button></div><label className="field-label">DISASTER TYPE<select defaultValue="Flood"><option>Flood</option><option>Wildfire</option><option>Landslide</option></select></label><label className="field-label">SEVERITY<div className="severity-options"><button className="low">Low</button><button className="medium">Med</button><button className="high">High</button><button className="critical active">Critical</button></div></label></div>
            <div className="simulation-section"><div className="section-title"><span>SIMULATION</span><span className="stage-label">{stage === "standby" ? "READY" : stage.toUpperCase()}</span></div><button className="primary-action" onClick={() => setStage("active")} disabled={stage !== "standby"}><span>△</span> Activate disaster</button><button className="secondary-action" onClick={() => setStage("routed")} disabled={stage === "standby"}>Calculate safe routes <span>→</span></button><button className="alert-action" onClick={sendEmergencyAlerts} disabled={stage !== "routed" || alertStatus === "sending"}><span>◉</span> {alertStatus === "sending" ? "Sending SMS..." : "Send emergency alerts"} <span className="count">{affected.length}</span></button><label className="field-label">SEND ROUTE SMS TO PEOPLE IN<select value={targetZoneId} onChange={(event) => setTargetZoneId(event.target.value ? Number(event.target.value) : "")}><option value="">Choose a zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} ({zone.zone_type.replace("_", " ")})</option>)}</select></label><button className="secondary-action" onClick={sendZoneRouteAlerts} disabled={targetZoneId === "" || stage === "standby" || alertStatus === "sending"}>Send personalized route SMS <span>→</span></button><label className="test-recipient">TEST SMS NUMBER<input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="+254712345678" inputMode="tel" /></label><button className="test-action" onClick={sendTestSms} disabled={!testRecipient || alertStatus === "sending"}>Send test SMS</button>{alertStatus === "error" && <p className="alert-error">SMS failed. Use E.164 format, for example +254712345678.</p>}{alertStatus === "sent" && <p className="alert-success">SMS accepted by Africa&apos;s Talking. {zoneAlertCount ? `${zoneAlertCount} personalized route alert${zoneAlertCount === 1 ? "" : "s"} sent.` : ""}</p>}<button className="reset-action" onClick={loadDemo}>Reset simulation</button></div>
          </>}
          {panel === "people" && <div className="list-panel">{effectivePeople.map((person) => <button className="person-list" key={`saved-${person.id}`} onClick={() => selectPerson(person)}><i className={person.status === "at_risk" ? "person-risk" : "person-safe"} /><span>{person.name}<small>{person.phone || "No phone number"}</small></span><b>{person.status === "at_risk" ? "AT RISK" : "SAFE"}</b></button>)}</div>}
          {panel === "shelters" && <div className="list-panel">{zones.map((zone) => { const label = zone.zone_type === "hazard" ? "HAZARD" : zone.zone_type === "at_risk" ? "AT RISK" : "SAFE"; return <button className="shelter-list" key={zone.id} onClick={() => selectZone(zone)}><i>⌂</i><span>{zone.name}<small>{zone.details || `${zone.zone_type.replace("_", " ")} zone`}</small></span><b>{label}</b></button>; })}</div>}
          <div className="disclaimer">Recommended based on available hazard and map data.<br /><span>Prototype simulation · Not a guarantee of physical safety</span></div>
        </aside>

        <div className="map-panel">
          <div className="map-toolbar"><form className="search-form" onSubmit={submitSearch}><span className="search-icon">⌕</span><input className="search-input" aria-label="Search people, places, or coordinates" placeholder="Search people, places, or coordinates" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} />{searchOpen && searchQuery.trim() && <div className="search-results">{searchResults.length ? searchResults.map((result) => <button type="button" className="search-result" key={result.id} onClick={() => selectSearchResult(result)}><strong>{result.label}</strong><small>{result.detail}</small></button>) : <span className="search-empty">No matching map data</span>}</div>}</form><button className="map-button">Layers</button><button className="map-button">◎</button></div>
          <div className="map-canvas"><GoogleMapSurface onSelect={setSelected} recenterPoint={searchCenter} recenterZoom={searchZoom} ready={mapsReady} mode={mode} people={effectivePeople} zones={zones} zonePoints={zonePoints} finishZoneSignal={finishZoneSignal} onPointSelect={setPersonPoint} onZonePoint={(point) => setZonePoints((current) => [...current, point])} onZoneClose={closeZone} onZoneDrawn={(coordinates, polygon) => { setZoneDraft({ coordinates, polygon }); setMode("none"); }} />
            <div className="map-edit-toolbar"><button className={mode === "person" ? "active" : ""} onClick={startPerson}>+ Add person</button><button className={mode === "zone" ? "active" : ""} onClick={startZone}>Draw zone</button>{mode === "zone" && <button className="finish-zone" onClick={() => closeZone()} disabled={zonePoints.length < 3}>Finish zone ({zonePoints.length}/3)</button>}</div>
            {personPoint && <form className="map-form" onSubmit={saveMapItem}><span className="eyebrow">NEW PERSON</span><input required placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input placeholder="Phone number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "safe" | "at_risk" })}><option value="safe">Safe</option><option value="at_risk">At risk</option></select><textarea placeholder="Details" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /><button type="submit">Save person</button><button type="button" onClick={() => { setPersonPoint(null); setMode("none"); }}>Cancel</button></form>}
            {zoneDraft && <form className="map-form" onSubmit={saveMapItem}><span className="eyebrow">NEW ZONE</span><input required placeholder="Zone name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><select value={form.zoneType} onChange={(event) => setForm({ ...form, zoneType: event.target.value as Zone["zone_type"] })}><option value="safe">Safe zone</option><option value="at_risk">At risk zone</option><option value="hazard">Hazard zone</option></select><textarea placeholder="Details" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /><button type="submit">Save zone</button><button type="button" onClick={() => { zoneDraft.polygon.setMap(null); setZoneDraft(null); setZonePoints([]); }}>Cancel</button></form>}
            {saveError && <p className="save-error">{saveError}</p>}
            <div className="map-key"><span><i className="key-safe" /> Safe</span><span><i className="key-risk" /> At risk</span><span><i className="key-zone" /> Hazard zone</span></div><div className="zoom-controls"><button>+</button><button>−</button></div><div className="map-attribution">Map data © SafePath simulation</div>
            {effectiveSelected && <div className="person-card"><button className="close-card" onClick={() => setSelected(null)}>×</button><span className="eyebrow">PERSON PROFILE</span><h2>{effectiveSelected.name}</h2><p>{effectiveSelected.phone || "No phone number"}</p><div className="card-status"><i className={effectiveSelected.status === "at_risk" ? "key-risk" : "key-safe"} /> {effectiveSelected.status === "at_risk" ? "AT RISK" : "SAFE"}</div>{effectiveSelected.details && <div className="evacuation"><span>DETAILS</span><strong>{effectiveSelected.details}</strong></div>}</div>}
          </div>
          <div className="map-footer"><div><span className="eyebrow">OPERATION</span><strong>Detect <b>→</b> Identify <b>→</b> Route <b>→</b> Communicate</strong></div>{stage === "alerted" && <div className="alert-banner"><span>✓</span><strong>{affected.length} evacuation alerts sent</strong><small>Africa&apos;s Talking · Demo queue</small></div>}{stage === "active" && <div className="alert-banner warning"><span>!</span><strong>{affected.length} people need evacuation</strong><small>Calculate safe routes to continue</small></div>}</div>
        </div>
      </section>
    </main>
  );
}
