"use client";

import Script from "next/script";
import { type FormEvent, useEffect, useRef, useState } from "react";

type Person = { id: number; name: string; phone: string; x: number; y: number; affected: boolean };
type ApiPerson = { id: number; name: string; phone: string; details: string; latitude: number; longitude: number; status: "safe" | "at_risk" };
type Zone = { id: number; name: string; zone_type: "safe" | "at_risk" | "hazard"; details: string; coordinates: LatLng[] };
type Shelter = { id: number; name: string; x: number; y: number; capacity: number; occupancy: number };
type Stage = "standby" | "active" | "routed" | "alerted";
type AlertStatus = "idle" | "sending" | "sent" | "error";
type LatLng = { lat: number; lng: number };
type EditMode = "none" | "person" | "zone";

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleOverlay;
    Polygon: new (options: Record<string, unknown>) => GoogleOverlay;
    Polyline: new (options: Record<string, unknown>) => GoogleOverlay;
    drawing: { DrawingManager: new (options: Record<string, unknown>) => GoogleDrawingManager; OverlayType: { POLYGON: string } };
  };
};
type GoogleMapInstance = { setCenter: (center: LatLng) => void; addListener?: (event: string, callback: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => GoogleOverlay };
type GoogleOverlay = { setMap: (map: GoogleMapInstance | null) => void };
type GooglePolygon = GoogleOverlay & { getPath: () => { getArray: () => Array<{ lat: () => number; lng: () => number }> } };
type GoogleDrawingManager = GoogleOverlay & { addListener: (event: string, callback: (event: { overlay: GooglePolygon }) => void) => void };

const demoPeople: Person[] = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  name: `Person ${String(index + 1).padStart(2, "0")}`,
  phone: "+254 7XX XXX " + String(110 + index),
  x: 9 + ((index * 17) % 78),
  y: 17 + ((index * 29) % 67),
  affected: [1, 3, 4, 6, 8, 11, 14, 17].includes(index),
}));

const shelters: Shelter[] = [
  { id: 1, name: "Green Primary School", x: 18, y: 74, capacity: 500, occupancy: 230 },
  { id: 2, name: "Civic Community Hall", x: 76, y: 19, capacity: 300, occupancy: 184 },
  { id: 3, name: "Central Stadium", x: 84, y: 77, capacity: 1200, occupancy: 612 },
];

const mapCenter: LatLng = { lat: 16.5062, lng: 80.6480 };
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

function toCoordinates(x: number, y: number): LatLng {
  return { lat: mapCenter.lat + (50 - y) * 0.0022, lng: mapCenter.lng + (x - 50) * 0.0024 };
}

function GoogleMapSurface({ stage, onSelect, ready, mode, people, zones, onPointSelect, onZoneDrawn }: { stage: Stage; onSelect: (person: Person) => void; ready: boolean; mode: EditMode; people: ApiPerson[]; zones: Zone[]; onPointSelect: (point: LatLng) => void; onZoneDrawn: (coordinates: LatLng[], polygon: GooglePolygon) => void }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GoogleMapInstance | null>(null);
  const overlays = useRef<GoogleOverlay[]>([]);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  useEffect(() => {
    const mapsApi = (window as Window & { google?: GoogleMapsApi }).google;
    if (!mapsApi || !mapElement.current) return;

    if (!mapInstance.current) {
      mapInstance.current = new mapsApi.maps.Map(mapElement.current, {
        center: mapCenter,
        zoom: 13,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: googleMapStyles,
      });
    }

    overlays.current.forEach((overlay) => overlay.setMap(null));
    const nextOverlays: GoogleOverlay[] = [];

    if (mode === "person") {
      mapInstance.current.addListener?.("click", (event) => {
        if (event.latLng) onPointSelect({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
    }

    if (mode === "zone" && mapsApi.maps.drawing) {
      const drawingManager = new mapsApi.maps.drawing.DrawingManager({
        drawingMode: mapsApi.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: { fillColor: "#f05d5e", fillOpacity: 0.25, strokeColor: "#f05d5e", strokeWeight: 2 },
        map: mapInstance.current,
      });
      drawingManager.addListener("overlaycomplete", ({ overlay }) => {
        onZoneDrawn(overlay.getPath().getArray().map((point) => ({ lat: point.lat(), lng: point.lng() })), overlay);
      });
      nextOverlays.push(drawingManager);
    }

    shelters.forEach((shelter) => {
      nextOverlays.push(new mapsApi.maps.Marker({
        map: mapInstance.current,
        position: toCoordinates(shelter.x, shelter.y),
        title: shelter.name,
        label: { text: "S", color: "#ffffff", fontWeight: "700" },
        icon: { path: "M 0,0 m -13,0 a 13,13 0 1,0 26,0 a 13,13 0 1,0 -26,0", fillColor: "#2ca66f", fillOpacity: 1, strokeColor: "#d9ffea", strokeWeight: 2, scale: 1 },
      }));
    });

    demoPeople.forEach((person) => {
      const marker = new mapsApi.maps.Marker({
        map: mapInstance.current,
        position: toCoordinates(person.x, person.y),
        title: person.name,
        icon: { path: "M 0,0 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0", fillColor: person.affected && stage !== "standby" ? "#f05d5e" : "#72d6a3", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1 },
      }) as GoogleOverlay & { addListener?: (event: string, callback: () => void) => void };
      marker.addListener?.("click", () => onSelect(person));
      nextOverlays.push(marker);
    });

    people.forEach((person) => {
      nextOverlays.push(new mapsApi.maps.Marker({ map: mapInstance.current, position: { lat: person.latitude, lng: person.longitude }, title: person.name, icon: { path: "M 0,0 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0", fillColor: person.status === "at_risk" ? "#f05d5e" : "#72d6a3", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1 } }));
    });

    zones.forEach((zone) => {
      const colors = { safe: "#72d6a3", at_risk: "#f2a65a", hazard: "#f05d5e" };
      nextOverlays.push(new mapsApi.maps.Polygon({ map: mapInstance.current, paths: zone.coordinates, fillColor: colors[zone.zone_type], fillOpacity: 0.24, strokeColor: colors[zone.zone_type], strokeWeight: 2 }));
    });

    if (stage !== "standby") {
      const hazardPath = [
        toCoordinates(27, 32), toCoordinates(71, 28), toCoordinates(82, 50),
        toCoordinates(68, 72), toCoordinates(35, 75), toCoordinates(22, 55),
      ];
      nextOverlays.push(new mapsApi.maps.Polygon({ map: mapInstance.current, paths: hazardPath, fillColor: "#d83d4b", fillOpacity: 0.27, strokeColor: "#f05d5e", strokeOpacity: 0.95, strokeWeight: 2 }));
    }

    if (stage === "routed" || stage === "alerted") {
      affectedPeople.forEach((person, index) => {
        const shelter = shelters[index % shelters.length];
        const start = toCoordinates(person.x, person.y);
        const finish = toCoordinates(shelter.x, shelter.y);
        nextOverlays.push(new mapsApi.maps.Polyline({ map: mapInstance.current, path: [start, { lat: (start.lat + finish.lat) / 2 + 0.018, lng: (start.lng + finish.lng) / 2 }, finish], strokeColor: "#a6f0bf", strokeOpacity: 0.9, strokeWeight: 3, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#a6f0bf", scale: 3 }, offset: "0", repeat: "12px" }] }));
      });
    }

    overlays.current = nextOverlays;
    if (apiKey && mapInstance.current) mapInstance.current.setCenter(mapCenter);
  }, [stage, onSelect, apiKey, ready, mode, people, zones, onPointSelect, onZoneDrawn]);

  return apiKey ? <div className="google-map" ref={mapElement} /> : <div className="map-key-missing">Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to load Google Maps.</div>;
}

const affectedPeople = demoPeople.filter((person) => person.affected);

export default function Home() {
  const [stage, setStage] = useState<Stage>("standby");
  const [selected, setSelected] = useState<Person | null>(null);
  const [panel, setPanel] = useState("overview");
  const [mapsReady, setMapsReady] = useState(false);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("idle");
  const [testRecipient, setTestRecipient] = useState("");
  const [mode, setMode] = useState<EditMode>("none");
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [personPoint, setPersonPoint] = useState<LatLng | null>(null);
  const [zoneDraft, setZoneDraft] = useState<{ coordinates: LatLng[]; polygon: GooglePolygon } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", details: "", status: "safe" as "safe" | "at_risk", zoneType: "hazard" as Zone["zone_type"] });
  const [saveError, setSaveError] = useState("");
  const affected = affectedPeople;
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";
  const normalizedApiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, "");
  const apiBaseUrl = normalizedApiBaseUrl.endsWith("/api")
    ? normalizedApiBaseUrl
    : `${normalizedApiBaseUrl}/api`;

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

  function startPerson() {
    setSaveError("");
    setPersonPoint(null);
    setZoneDraft(null);
    setMode("person");
  }

  function startZone() {
    setSaveError("");
    setPersonPoint(null);
    setZoneDraft(null);
    setMode("zone");
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

  function sendTestSms() {
    if (!/^\+[1-9]\d{7,14}$/.test(testRecipient.replace(/[\s()-]/g, ""))) {
      setAlertStatus("error");
      return;
    }
    void sendSms([testRecipient], false);
  }

  return (
    <main className="command-shell">
      {(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) && <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=drawing`} strategy="afterInteractive" onLoad={() => setMapsReady(true)} />}
      <header className="topbar">
        <div className="brand"><span className="brand-mark">+</span><span>SafePath <b>AI</b></span><small>EMERGENCY OPERATIONS</small></div>
        <div className="top-actions"><span className="demo-pill"><i /> DEMO MODE</span><span className="sync"><i /> SYSTEMS ONLINE</span><button className="icon-button" aria-label="Settings">⚙</button><div className="operator">OP <span>AO</span></div></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">COMMAND CENTER</span><h1>Mission control</h1></div><span className="live-dot" /></div>
          <nav className="nav-tabs"><button className={panel === "overview" ? "selected" : ""} onClick={() => setPanel("overview")}>Overview</button><button className={panel === "people" ? "selected" : ""} onClick={() => setPanel("people")}>People <em>{demoPeople.length + people.length}</em></button><button className={panel === "shelters" ? "selected" : ""} onClick={() => setPanel("shelters")}>Safe zones <em>{shelters.length + zones.filter((zone) => zone.zone_type === "safe").length}</em></button></nav>

          <div className="status-card"><div className="status-row"><span className={`status-icon ${stage === "standby" ? "quiet" : "danger"}`}>!</span><div><span className="eyebrow">CURRENT INCIDENT</span><strong>{stage === "standby" ? "No active incident" : "Critical flood"}</strong></div></div><div className="status-details"><span className={stage === "standby" ? "muted" : "danger-text"}>{stage === "standby" ? "Monitoring area" : "ACTIVE · FLOOD ZONE"}</span><span>Updated just now</span></div></div>

          <div className="stats-grid"><div><strong>{stage === "standby" ? "—" : affected.length}</strong><span>Affected</span></div><div><strong>{stage === "standby" ? "—" : 12}</strong><span>Safe</span></div><div><strong>{stage === "routed" || stage === "alerted" ? affected.length : "—"}</strong><span>Routes</span></div></div>

          {panel === "overview" && <>
            <div className="control-section"><div className="section-title"><span>DISASTER CONTROLS</span><button className="more">•••</button></div><label className="field-label">DISASTER TYPE<select defaultValue="Flood"><option>Flood</option><option>Wildfire</option><option>Landslide</option></select></label><label className="field-label">SEVERITY<div className="severity-options"><button className="low">Low</button><button className="medium">Med</button><button className="high">High</button><button className="critical active">Critical</button></div></label></div>
            <div className="simulation-section"><div className="section-title"><span>SIMULATION</span><span className="stage-label">{stage === "standby" ? "READY" : stage.toUpperCase()}</span></div><button className="primary-action" onClick={() => setStage("active")} disabled={stage !== "standby"}><span>△</span> Activate disaster</button><button className="secondary-action" onClick={() => setStage("routed")} disabled={stage === "standby"}>Calculate safe routes <span>→</span></button><button className="alert-action" onClick={sendEmergencyAlerts} disabled={stage !== "routed" || alertStatus === "sending"}><span>◉</span> {alertStatus === "sending" ? "Sending SMS..." : "Send emergency alerts"} <span className="count">{affected.length}</span></button><label className="test-recipient">TEST SMS NUMBER<input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="+254712345678" inputMode="tel" /></label><button className="test-action" onClick={sendTestSms} disabled={!testRecipient || alertStatus === "sending"}>Send test SMS</button>{alertStatus === "error" && <p className="alert-error">SMS failed. Use E.164 format, for example +254712345678.</p>}{alertStatus === "sent" && <p className="alert-success">SMS accepted by Africa&apos;s Talking.</p>}<button className="reset-action" onClick={loadDemo}>Reset simulation</button></div>
          </>}
          {panel === "people" && <div className="list-panel">{demoPeople.map((person) => <button className="person-list" key={`demo-${person.id}`} onClick={() => setSelected(person)}><i className={person.affected && stage !== "standby" ? "person-risk" : "person-safe"} /><span>{person.name}<small>{person.phone}</small></span><b>{person.affected && stage !== "standby" ? "AT RISK" : "SAFE"}</b></button>)}{people.map((person) => <div className="person-list" key={`saved-${person.id}`}><i className={person.status === "at_risk" ? "person-risk" : "person-safe"} /><span>{person.name}<small>{person.phone || "No phone number"}</small></span><b>{person.status === "at_risk" ? "AT RISK" : "SAFE"}</b></div>)}</div>}
          {panel === "shelters" && <div className="list-panel">{shelters.map((shelter) => <div className="shelter-list" key={shelter.id}><i>⌂</i><span>{shelter.name}<small>{shelter.capacity - shelter.occupancy} spaces available</small></span><b>OPEN</b></div>)}</div>}
          <div className="disclaimer">Recommended based on available hazard and map data.<br /><span>Prototype simulation · Not a guarantee of physical safety</span></div>
        </aside>

        <div className="map-panel">
          <div className="map-toolbar"><button className="search-button">⌕ <span>Search people, places, or coordinates</span></button><button className="map-button">Layers</button><button className="map-button">◎</button></div>
          <div className="map-canvas"><GoogleMapSurface stage={stage} onSelect={setSelected} ready={mapsReady} mode={mode} people={people} zones={zones} onPointSelect={setPersonPoint} onZoneDrawn={(coordinates, polygon) => { polygon.setMap(null); setZoneDraft({ coordinates, polygon }); setMode("none"); }} />
            <div className="map-edit-toolbar"><button className={mode === "person" ? "active" : ""} onClick={startPerson}>+ Add person</button><button className={mode === "zone" ? "active" : ""} onClick={startZone}>Draw zone</button></div>
            {personPoint && <form className="map-form" onSubmit={saveMapItem}><span className="eyebrow">NEW PERSON</span><input required placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input placeholder="Phone number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "safe" | "at_risk" })}><option value="safe">Safe</option><option value="at_risk">At risk</option></select><textarea placeholder="Details" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /><button type="submit">Save person</button><button type="button" onClick={() => { setPersonPoint(null); setMode("none"); }}>Cancel</button></form>}
            {zoneDraft && <form className="map-form" onSubmit={saveMapItem}><span className="eyebrow">NEW ZONE</span><input required placeholder="Zone name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><select value={form.zoneType} onChange={(event) => setForm({ ...form, zoneType: event.target.value as Zone["zone_type"] })}><option value="safe">Safe zone</option><option value="at_risk">At risk zone</option><option value="hazard">Hazard zone</option></select><textarea placeholder="Details" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /><button type="submit">Save zone</button><button type="button" onClick={() => { zoneDraft.polygon.setMap(null); setZoneDraft(null); }}>Cancel</button></form>}
            {saveError && <p className="save-error">{saveError}</p>}
            <div className="map-key"><span><i className="key-safe" /> Safe</span><span><i className="key-risk" /> At risk</span><span><i className="key-zone" /> Hazard zone</span></div><div className="zoom-controls"><button>+</button><button>−</button></div><div className="map-attribution">Map data © SafePath simulation</div>
            {selected && <div className="person-card"><button className="close-card" onClick={() => setSelected(null)}>×</button><span className="eyebrow">PERSON PROFILE</span><h2>{selected.name}</h2><p>{selected.phone}</p><div className="card-status"><i className={selected.affected && stage !== "standby" ? "key-risk" : "key-safe"} /> {selected.affected && stage !== "standby" ? "AT RISK" : "SAFE"}</div>{selected.affected && stage !== "standby" && <div className="evacuation"><span>RECOMMENDED DESTINATION</span><strong>Green Primary School</strong><small>1.9 km · 8 min estimated</small></div>}</div>}
          </div>
          <div className="map-footer"><div><span className="eyebrow">OPERATION</span><strong>Detect <b>→</b> Identify <b>→</b> Route <b>→</b> Communicate</strong></div>{stage === "alerted" && <div className="alert-banner"><span>✓</span><strong>{affected.length} evacuation alerts sent</strong><small>Africa&apos;s Talking · Demo queue</small></div>}{stage === "active" && <div className="alert-banner warning"><span>!</span><strong>{affected.length} people need evacuation</strong><small>Calculate safe routes to continue</small></div>}</div>
        </div>
      </section>
    </main>
  );
}
