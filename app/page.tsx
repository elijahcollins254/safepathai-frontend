"use client";

import { useEffect, useMemo, useState } from "react";

type Hazard = {
  id: number;
  name: string;
  hazard_type: string;
  severity: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
};

type Shelter = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  capacity: number;
  current_occupancy: number;
  status: string;
};

type RouteRecommendation = {
  shelter_id: number;
  shelter_name: string;
  distance_meters: number;
  duration_seconds: number;
  unsafe: boolean;
  hazards: string[];
  safety_score: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const USER_LOCATION = { latitude: -1.2864, longitude: 36.8172 };

function metersToKm(meters: number) {
  return (meters / 1000).toFixed(1);
}

function secondsToMinutes(seconds: number) {
  return Math.ceil(seconds / 60);
}

export default function Home() {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [route, setRoute] = useState<RouteRecommendation | null>(null);
  const [routes, setRoutes] = useState<RouteRecommendation[]>([]);
  const [alert, setAlert] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const userLocation = useMemo(() => USER_LOCATION, []);

  async function fetchData() {
    setLoading(true);
    const [hazardRes, shelterRes] = await Promise.all([
      fetch(`${API_BASE}/hazards/`),
      fetch(`${API_BASE}/shelters/`),
    ]);
    const hazardData = await hazardRes.json();
    const shelterData = await shelterRes.json();
    setHazards(hazardData);
    setShelters(shelterData);
    setLoading(false);
  }

  async function recommend() {
    setLoading(true);
    const response = await fetch(`${API_BASE}/route/recommend/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userLocation),
    });
    const data = await response.json();
    setRoute(data.recommended_route || null);
    setRoutes(data.routes || []);
    setLoading(false);
  }

  async function simulateFlood() {
    setLoading(true);
    await fetch(`${API_BASE}/simulate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Nairobi flood simulation" }),
    });
    await fetchData();
    await recommend();
    setAlert("Flood detected. Recalculating safe route...");
    setLoading(false);
  }

  useEffect(() => {
    fetchData().then(() => recommend());
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-cyan-300/80">SafePath demo</p>
              <h1 className="mt-4 text-4xl font-semibold text-white">Nairobi flood evacuation simulation</h1>
              <p className="mt-2 max-w-2xl text-slate-300">
                The system chooses a safe shelter, rejects flooded routes, and generates an alert message for SMS/voice.
              </p>
            </div>
            <button
              onClick={simulateFlood}
              className="inline-flex items-center justify-center rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
            >
              Simulate flood
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
              <p className="text-sm uppercase text-slate-400">User location</p>
              <p className="mt-3 text-lg font-semibold text-white">Nairobi center</p>
              <p className="mt-1 text-slate-400">{userLocation.latitude}, {userLocation.longitude}</p>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
              <p className="text-sm uppercase text-slate-400">Active hazards</p>
              <div className="mt-3 space-y-2">
                {hazards.length ? (
                  hazards.map((hazard) => (
                    <div key={hazard.id} className="rounded-2xl bg-slate-900 p-3">
                      <p className="font-semibold text-white">{hazard.name}</p>
                      <p className="text-sm text-slate-400">{hazard.hazard_type} · {hazard.severity}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">No active hazards</p>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
              <p className="text-sm uppercase text-slate-400">Recommended shelter</p>
              {route ? (
                <div className="mt-3">
                  <p className="text-xl font-semibold text-white">{route.shelter_name}</p>
                  <p className="mt-1 text-slate-400">{metersToKm(route.distance_meters)} km · {secondsToMinutes(route.duration_seconds)} min</p>
                  <p className="mt-2 text-sm text-emerald-300">Status: safe route</p>
                </div>
              ) : (
                <p className="mt-3 text-slate-500">No safe route selected yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-8 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Route selection</h2>
              <p className="mt-2 text-slate-400">The backend recommends the safest route among open shelters.</p>
            </div>
            <button
              onClick={recommend}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Refresh route
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {routes.length ? (
              routes.map((routeItem) => (
                <div key={routeItem.shelter_id} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-white">{routeItem.shelter_name}</p>
                      <p className="text-sm text-slate-400">
                        {metersToKm(routeItem.distance_meters)} km · {secondsToMinutes(routeItem.duration_seconds)} min
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${routeItem.unsafe ? "bg-red-500 text-white" : "bg-emerald-500 text-slate-950"}`}>
                      {routeItem.unsafe ? "Unsafe" : "Safe"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No route recommendations available yet.</p>
            )}
          </div>
        </section>

        {alert && (
          <section className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">
            <h3 className="text-xl font-semibold">Live alert</h3>
            <p className="mt-2 text-sm text-rose-100/90">{alert}</p>
          </section>
        )}

        <footer className="rounded-3xl border border-slate-700 bg-slate-900/90 p-6 text-slate-400">
          <p className="text-sm">Demo architecture: Django backend → Google Routes + hazard safety engine → Next.js UI → optional Africa's Talking alert delivery.</p>
          <p className="mt-2 text-xs text-slate-500">Set NEXT_PUBLIC_API_BASE to point to your backend if it is not running on localhost:8000.</p>
        </footer>
      </main>
    </div>
  );
}
