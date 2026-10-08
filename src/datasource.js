// Fuente de datos real y pública: USGS Earthquake Hazards Program.
// Feeds oficiales por rango temporal (sin API key, sin auth).
const FEEDS = {
  hour: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  week: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
};

const PERIOD_LABEL = { hour: "last hour", day: "last 24 hours", week: "last 7 days" };

export async function fetchData({
  period = "day",
  minMagnitude = 2.5,
  maxDepthKm = null,
  place = null,
  limit = 60,
} = {}) {
  const feedKey = FEEDS[period] ? period : "day";
  const res = await fetch(FEEDS[feedKey]);
  if (!res.ok) throw new Error(`USGS upstream error ${res.status}`);
  const raw = await res.json();

  const needle = place ? String(place).trim().toLowerCase() : null;

  const all = raw.features.map((f) => ({
    id: f.id,
    place: f.properties.place ?? "Unknown location",
    magnitude: f.properties.mag,
    depthKm: f.geometry?.coordinates?.[2] ?? null,
    lon: f.geometry?.coordinates?.[0] ?? null,
    lat: f.geometry?.coordinates?.[1] ?? null,
    time: f.properties.time,
    url: f.properties.url,
    tsunami: Boolean(f.properties.tsunami),
  }));

  const items = all
    .filter((e) => typeof e.magnitude === "number" && e.magnitude >= minMagnitude)
    .filter((e) => (maxDepthKm == null ? true : e.depthKm != null && e.depthKm <= maxDepthKm))
    .filter((e) => (needle ? e.place.toLowerCase().includes(needle) : true))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, limit);

  const filterBits = [`M ≥ ${minMagnitude}`];
  if (maxDepthKm != null) filterBits.push(`depth ≤ ${maxDepthKm} km`);
  if (needle) filterBits.push(`place contains “${place}”`);

  return {
    title: "Earthquake Activity Explorer",
    subtitle: `USGS · ${PERIOD_LABEL[feedKey]} · ${filterBits.join(" · ")} · ${items.length} of ${all.length} events`,
    source: "USGS Earthquake Hazards Program (public GeoJSON feed)",
    fetchedAt: new Date().toISOString(),
    filters: { period: feedKey, minMagnitude, maxDepthKm, place: place ?? null },
    totalInFeed: all.length,
    items,
  };
}
