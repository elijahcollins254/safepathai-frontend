"use client";

import Script from "next/script";
import { type FormEvent, useEffect, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };
type Person = { id: number; name: string; phone: string; details: string; latitude: number; longitude: number; status: "safe" | "at_risk" };
type Zone = { id: number; name: string; zone_type: "safe" | "at_risk" | "hazard"; details: string; coordinates: LatLng[] };
type SearchResult = { id: string; label: string; detail: string; position: LatLng; person?: Person };
type LocationStatus = "safe" | "at_risk" | "hazard";
type GoogleMapsApi = { maps: { Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap; Marker: new (options: Record<string, unknown>) => GoogleOverlay; Polygon: new (options: Record<string, unknown>) => GoogleOverlay } };
type GoogleMap = { setCenter: (center: LatLng) => void; setZoom: (zoom: number) => void };
type GoogleOverlay = { setMap: (map: GoogleMap | null) => void; addListener?: (event: string, callback: () => void) => void };

const mapCenter: LatLng = { lat: 5, lng: 20 };
const googleMapStyles = [
	{ elementType: "geometry", stylers: [{ color: "#26343b" }] },
	{ elementType: "labels.text.fill", stylers: [{ color: "#b9c8c9" }] },
	{ elementType: "labels.text.stroke", stylers: [{ color: "#26343b" }] },
	{ featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#53666b" }] },
	{ featureType: "road", elementType: "geometry", stylers: [{ color: "#46585d" }] },
	{ featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#65777a" }] },
	{ featureType: "water", elementType: "geometry", stylers: [{ color: "#174c59" }] },
	{ featureType: "poi", stylers: [{ visibility: "simplified" }] },
];

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
	const latitudeSpan = Math.max(...coordinates.map((coordinate) => coordinate.lat)) - Math.min(...coordinates.map((coordinate) => coordinate.lat));
	const longitudeSpan = Math.max(...coordinates.map((coordinate) => coordinate.lng)) - Math.min(...coordinates.map((coordinate) => coordinate.lng));
	const span = Math.max(latitudeSpan, longitudeSpan, 0.01);
	return Math.max(5, Math.min(14, Math.floor(Math.log2(360 / span)) - 1));
}

function zoomForPerson(person: Person, zones: Zone[]): number {
	const containingZone = zones.find((zone) => pointInPolygon({ lat: person.latitude, lng: person.longitude }, zone.coordinates));
	return containingZone ? zoomForZone(containingZone.coordinates) : 14;
}

function getLocationStatus(location: LatLng, zones: Zone[]): LocationStatus {
	const containingZones = zones.filter((zone) => pointInPolygon(location, zone.coordinates));
	if (containingZones.some((zone) => zone.zone_type === "hazard")) return "hazard";
	if (containingZones.some((zone) => zone.zone_type === "at_risk")) return "at_risk";
	return "safe";
}

function ResidentMap({ people, zones, center, zoom, userLocation, ready, onSelect }: { people: Person[]; zones: Zone[]; center: LatLng | null; zoom: number; userLocation: LatLng | null; ready: boolean; onSelect: (person: Person) => void }) {
	const mapElement = useRef<HTMLDivElement>(null);
	const mapInstance = useRef<GoogleMap | null>(null);
	const overlays = useRef<GoogleOverlay[]>([]);
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

	useEffect(() => {
		const mapsApi = (window as Window & { google?: GoogleMapsApi }).google;
		if (!mapsApi || !mapElement.current) return;
		if (!mapInstance.current) {
			mapInstance.current = new mapsApi.maps.Map(mapElement.current, { center: mapCenter, zoom: 3, streetViewControl: true, mapTypeControl: false, fullscreenControl: false, styles: googleMapStyles });
		}
		overlays.current.forEach((overlay) => overlay.setMap(null));
		const nextOverlays: GoogleOverlay[] = [];
		people.forEach((person) => {
			const marker = new mapsApi.maps.Marker({ map: mapInstance.current, position: { lat: person.latitude, lng: person.longitude }, title: person.name, icon: { path: "M 0,0 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0", fillColor: person.status === "at_risk" ? "#f05d5e" : "#72d6a3", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1 } });
			marker.addListener?.("click", () => onSelect(person));
			nextOverlays.push(marker);
		});
		zones.forEach((zone) => {
			const colors = { safe: "#72d6a3", at_risk: "#f2a65a", hazard: "#f05d5e" };
			nextOverlays.push(new mapsApi.maps.Polygon({ map: mapInstance.current, paths: zone.coordinates, fillColor: colors[zone.zone_type], fillOpacity: 0.24, strokeColor: colors[zone.zone_type], strokeWeight: 2 }));
		});
		if (userLocation) {
			nextOverlays.push(new mapsApi.maps.Marker({ map: mapInstance.current, position: userLocation, title: "Your location", icon: { path: "M 0,0 m -7,0 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0", fillColor: "#4285f4", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 1 } }));
		}
		overlays.current = nextOverlays;
	}, [onSelect, people, zones, userLocation, ready]);

	useEffect(() => {
		if (center && mapInstance.current) {
			mapInstance.current.setCenter(center);
			mapInstance.current.setZoom(zoom);
		}
	}, [center, zoom]);

	return apiKey ? <div className="resident-map-canvas" ref={mapElement} /> : <div className="resident-map-missing">Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to load Google Maps.</div>;
}

export default function ResidentExperience({ apiBaseUrl }: { apiBaseUrl: string }) {
	const [mapsReady, setMapsReady] = useState(false);
	const [people, setPeople] = useState<Person[]>([]);
	const [zones, setZones] = useState<Zone[]>([]);
	const [selected, setSelected] = useState<Person | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [recenterPoint, setRecenterPoint] = useState<LatLng | null>(null);
	const [recenterZoom, setRecenterZoom] = useState(12);
	const [userLocation, setUserLocation] = useState<LatLng | null>(null);
	const [locationPromptOpen, setLocationPromptOpen] = useState(true);
	const [locationMessage, setLocationMessage] = useState("");
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

	useEffect(() => {
		async function loadMapData() {
			try {
				const [peopleResponse, zonesResponse] = await Promise.all([fetch(`${apiBaseUrl}/people/`), fetch(`${apiBaseUrl}/zones/`)]);
				if (peopleResponse.ok) setPeople(await peopleResponse.json());
				if (zonesResponse.ok) setZones(await zonesResponse.json());
			} catch {
			}
		}
		void loadMapData();
	}, [apiBaseUrl]);

	function requestLocation() {
		if (!navigator.geolocation) {
			setLocationMessage("Location sharing is not available in this browser.");
			return;
		}
		setLocationMessage("");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const location = { lat: position.coords.latitude, lng: position.coords.longitude };
				setUserLocation(location);
				setRecenterPoint(location);
				setRecenterZoom(14);
				setLocationPromptOpen(true);
			},
			(error) => {
				setLocationMessage(error.code === error.PERMISSION_DENIED ? "Location access was denied. You can allow it in your browser settings." : "We could not determine your location. Please try again.");
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
		);
	}

	const locationStatus = userLocation ? getLocationStatus(userLocation, zones) : null;
	const locationStatusCopy = {
		safe: { title: "You are in a safe zone", detail: "No active hazards are reported in your current area.", icon: "✓" },
		at_risk: { title: "You are in an at-risk zone", detail: "Stay alert and review the recommended safe routes.", icon: "!" },
		hazard: { title: "You are in a hazard zone", detail: "Move away from this area and follow local emergency guidance.", icon: "!" },
	};

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
			if (`${person.name} ${person.phone} ${person.details}`.toLowerCase().includes(query)) results.push({ id: `person-${person.id}`, label: person.name, detail: person.phone || "Saved person", position: { lat: person.latitude, lng: person.longitude }, person });
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
		setRecenterPoint(result.position);
		const zone = zones.find((candidate) => `zone-${candidate.id}` === result.id);
		setRecenterZoom(result.person ? zoomForPerson(result.person, zones) : zone ? zoomForZone(zone.coordinates) : 14);
	}

	function submitSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (searchResults[0]) selectSearchResult(searchResults[0]);
	}

	return (
		<main className="resident-shell">
			{apiKey && <Script src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`} strategy="afterInteractive" onLoad={() => setMapsReady(true)} />}
			<div className="resident-map-panel">
				<ResidentMap people={people} zones={zones} center={recenterPoint} zoom={recenterZoom} userLocation={userLocation} ready={mapsReady} onSelect={setSelected} />
				<form className="resident-map-searchbar" onSubmit={submitSearch}>
					<button className="resident-map-menu" type="button" aria-label="Map menu">☰</button>
					<input aria-label="Search people, places, or coordinates" placeholder="Search people, places, or coordinates" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} />
					<button className="resident-map-search" type="submit" aria-label="Search">⌕</button>
					{searchOpen && searchQuery.trim() && <div className="search-results">{searchResults.length ? searchResults.map((result) => <button type="button" className="search-result" key={result.id} onClick={() => selectSearchResult(result)}><strong>{result.label}</strong><small>{result.detail}</small></button>) : <span className="search-empty">No matching map data</span>}</div>}
				</form>
				<div className="resident-map-tools"><button type="button">Layers</button><button type="button" aria-label="My location">◎</button><button type="button" aria-label="Zoom in" onClick={() => setRecenterZoom((current) => Math.min(20, current + 1))}>+</button><button type="button" aria-label="Zoom out" onClick={() => setRecenterZoom((current) => Math.max(1, current - 1))}>−</button></div>
				{selected && <div className="person-card"><button className="close-card" onClick={() => setSelected(null)} aria-label="Close profile">×</button><span className="eyebrow">PERSON PROFILE</span><h2>{selected.name}</h2><p>{selected.phone || "No phone number"}</p><div className="card-status"><i className={selected.status === "at_risk" ? "key-risk" : "key-safe"} /> {selected.status === "at_risk" ? "AT RISK" : "SAFE"}</div></div>}
			</div>
			{locationPromptOpen && <div className="resident-dialog-backdrop"><section className="resident-dialog" role="dialog" aria-modal="true" aria-labelledby="location-dialog-title"><span className="resident-dialog-icon">⌖</span>{locationStatus ? <><h2 id="location-dialog-title">{locationStatusCopy[locationStatus].title}</h2><p>{locationStatusCopy[locationStatus].detail}</p></> : <><h2 id="location-dialog-title">Share your location</h2><p>Allow SafePath to find your area and check whether you are in a safe, at-risk, or hazard zone.</p></>}{locationMessage && <p className="alert-error">{locationMessage}</p>}<div className="resident-dialog-actions"><button className="resident-dialog-primary" type="button" onClick={locationStatus ? () => setLocationPromptOpen(false) : requestLocation}>{locationStatus ? "Continue" : locationMessage ? "Try again" : "Share location"}</button><button className="resident-dialog-secondary" type="button" onClick={() => setLocationPromptOpen(false)}>{locationStatus ? "Check again later" : "Not now"}</button></div></section></div>}
			{locationStatus && !locationPromptOpen && <button className="resident-profile-trigger" type="button" onClick={() => setLocationPromptOpen(true)}>{locationStatusCopy[locationStatus].icon} {locationStatusCopy[locationStatus].title}</button>}
		</main>
	);
}
