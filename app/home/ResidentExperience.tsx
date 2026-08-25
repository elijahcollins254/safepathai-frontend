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

export default function ResidentExperience({ apiBaseUrl }: { apiBaseUrl: string }) {
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

