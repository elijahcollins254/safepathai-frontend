import ResidentExperience from "./ResidentExperience";

function getApiBaseUrl(): string {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";
  const normalizedApiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, "");
  return normalizedApiBaseUrl.endsWith("/api") ? normalizedApiBaseUrl : `${normalizedApiBaseUrl}/api`;
}

export default function ResidentPage() {
  return <ResidentExperience apiBaseUrl={getApiBaseUrl()} />;
}