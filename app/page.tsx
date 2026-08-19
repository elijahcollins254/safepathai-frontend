"use client";

import { useState } from "react";

type Person = { id: number; name: string; phone: string; x: number; y: number; affected: boolean };
type Shelter = { id: number; name: string; x: number; y: number; capacity: number; occupancy: number };
type Stage = "standby" | "active" | "routed" | "alerted";

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

export default function Home() {
  const [stage, setStage] = useState<Stage>("standby");
  const [selected, setSelected] = useState<Person | null>(null);
  const [panel, setPanel] = useState("overview");
  const affected = demoPeople.filter((person) => person.affected);

  function loadDemo() {
    setStage("standby");
    setSelected(null);
    setPanel("overview");
  }

  return (
    <main className="command-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">+</span><span>SafePath <b>AI</b></span><small>EMERGENCY OPERATIONS</small></div>
        <div className="top-actions"><span className="demo-pill"><i /> DEMO MODE</span><span className="sync"><i /> SYSTEMS ONLINE</span><button className="icon-button" aria-label="Settings">⚙</button><div className="operator">OP <span>AO</span></div></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">COMMAND CENTER</span><h1>Mission control</h1></div><span className="live-dot" /></div>
          <nav className="nav-tabs"><button className={panel === "overview" ? "selected" : ""} onClick={() => setPanel("overview")}>Overview</button><button className={panel === "people" ? "selected" : ""} onClick={() => setPanel("people")}>People <em>{demoPeople.length}</em></button><button className={panel === "shelters" ? "selected" : ""} onClick={() => setPanel("shelters")}>Safe zones <em>{shelters.length}</em></button></nav>

          <div className="status-card"><div className="status-row"><span className={`status-icon ${stage === "standby" ? "quiet" : "danger"}`}>!</span><div><span className="eyebrow">CURRENT INCIDENT</span><strong>{stage === "standby" ? "No active incident" : "Critical flood"}</strong></div></div><div className="status-details"><span className={stage === "standby" ? "muted" : "danger-text"}>{stage === "standby" ? "Monitoring area" : "ACTIVE · FLOOD ZONE"}</span><span>Updated just now</span></div></div>

          <div className="stats-grid"><div><strong>{stage === "standby" ? "—" : affected.length}</strong><span>Affected</span></div><div><strong>{stage === "standby" ? "—" : 12}</strong><span>Safe</span></div><div><strong>{stage === "routed" || stage === "alerted" ? affected.length : "—"}</strong><span>Routes</span></div></div>

          {panel === "overview" && <>
            <div className="control-section"><div className="section-title"><span>DISASTER CONTROLS</span><button className="more">•••</button></div><label className="field-label">DISASTER TYPE<select defaultValue="Flood"><option>Flood</option><option>Wildfire</option><option>Landslide</option></select></label><label className="field-label">SEVERITY<div className="severity-options"><button className="low">Low</button><button className="medium">Med</button><button className="high">High</button><button className="critical active">Critical</button></div></label></div>
            <div className="simulation-section"><div className="section-title"><span>SIMULATION</span><span className="stage-label">{stage === "standby" ? "READY" : stage.toUpperCase()}</span></div><button className="primary-action" onClick={() => setStage("active")} disabled={stage !== "standby"}><span>△</span> Activate disaster</button><button className="secondary-action" onClick={() => setStage("routed")} disabled={stage === "standby"}>Calculate safe routes <span>→</span></button><button className="alert-action" onClick={() => setStage("alerted")} disabled={stage !== "routed"}><span>◉</span> Send emergency alerts <span className="count">{affected.length}</span></button><button className="reset-action" onClick={loadDemo}>Reset simulation</button></div>
          </>}
          {panel === "people" && <div className="list-panel">{demoPeople.map((person) => <button className="person-list" key={person.id} onClick={() => setSelected(person)}><i className={person.affected && stage !== "standby" ? "person-risk" : "person-safe"} /><span>{person.name}<small>{person.phone}</small></span><b>{person.affected && stage !== "standby" ? "AT RISK" : "SAFE"}</b></button>)}</div>}
          {panel === "shelters" && <div className="list-panel">{shelters.map((shelter) => <div className="shelter-list" key={shelter.id}><i>⌂</i><span>{shelter.name}<small>{shelter.capacity - shelter.occupancy} spaces available</small></span><b>OPEN</b></div>)}</div>}
          <div className="disclaimer">Recommended based on available hazard and map data.<br /><span>Prototype simulation · Not a guarantee of physical safety</span></div>
        </aside>

        <div className="map-panel">
          <div className="map-toolbar"><button className="search-button">⌕ <span>Search people, places, or coordinates</span></button><button className="map-button">Layers</button><button className="map-button">◎</button></div>
          <div className="map-canvas"><div className="map-label city">NAIROBI <small>METRO AREA</small></div><div className="road road-one" /><div className="road road-two" /><div className="road road-three" /><div className="water" />
            {stage !== "standby" && <div className={`hazard-zone ${stage !== "standby" ? "hazard-active" : ""}`}><span>! FLOOD ZONE <small>CRITICAL</small></span></div>}
            {stage === "routed" || stage === "alerted" ? affected.map((person, index) => <svg className="route-line" key={`route-${person.id}`} viewBox="0 0 100 100" preserveAspectRatio="none"><path d={`M ${person.x} ${person.y} Q ${(person.x + shelters[index % 3].x) / 2} ${Math.min(person.y, shelters[index % 3].y) - 12} ${shelters[index % 3].x} ${shelters[index % 3].y}`} /></svg>) : null}
            {shelters.map((shelter) => <button key={shelter.id} className="shelter-marker" style={{ left: `${shelter.x}%`, top: `${shelter.y}%` }} onClick={() => setPanel("shelters")}><i>⌂</i><span>{shelter.name}</span></button>)}
            {demoPeople.map((person) => <button key={person.id} className={`person-marker ${person.affected && stage !== "standby" ? "risk" : "safe"} ${selected?.id === person.id ? "chosen" : ""}`} style={{ left: `${person.x}%`, top: `${person.y}%` }} onClick={() => setSelected(person)} aria-label={person.name}><i /></button>)}
            <div className="map-key"><span><i className="key-safe" /> Safe</span><span><i className="key-risk" /> At risk</span><span><i className="key-zone" /> Hazard zone</span></div><div className="zoom-controls"><button>+</button><button>−</button></div><div className="map-attribution">Map data © SafePath simulation</div>
            {selected && <div className="person-card"><button className="close-card" onClick={() => setSelected(null)}>×</button><span className="eyebrow">PERSON PROFILE</span><h2>{selected.name}</h2><p>{selected.phone}</p><div className="card-status"><i className={selected.affected && stage !== "standby" ? "key-risk" : "key-safe"} /> {selected.affected && stage !== "standby" ? "AT RISK" : "SAFE"}</div>{selected.affected && stage !== "standby" && <div className="evacuation"><span>RECOMMENDED DESTINATION</span><strong>Green Primary School</strong><small>1.9 km · 8 min estimated</small></div>}</div>}
          </div>
          <div className="map-footer"><div><span className="eyebrow">OPERATION</span><strong>Detect <b>→</b> Identify <b>→</b> Route <b>→</b> Communicate</strong></div>{stage === "alerted" && <div className="alert-banner"><span>✓</span><strong>{affected.length} evacuation alerts sent</strong><small>Africa&apos;s Talking · Demo queue</small></div>}{stage === "active" && <div className="alert-banner warning"><span>!</span><strong>{affected.length} people need evacuation</strong><small>Calculate safe routes to continue</small></div>}</div>
        </div>
      </section>
    </main>
  );
}
