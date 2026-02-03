const BOROUGHS = new Set([
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Staten Island",
]);

export interface MapboxAreaInfo {
  neighborhood?: string;
  borough?: string;
  place?: string;
  areaName?: string;
}

export function getMapboxToken(): string | undefined {
  return process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

export async function reverseGeocodeArea(
  latitude: number,
  longitude: number,
): Promise<MapboxAreaInfo | null> {
  const token = getMapboxToken();
  if (!token) return null;

  const types = ["neighborhood", "locality", "district", "place"].join(",");
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=${types}&limit=6&access_token=${token}`;

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mapbox geocoding error: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    features?: {
      text?: string;
      place_type?: string[];
    }[];
  };

  const features = Array.isArray(data.features) ? data.features : [];

  let neighborhood: string | undefined;
  let borough: string | undefined;
  let place: string | undefined;

  for (const feature of features) {
    const text = feature.text;
    const placeType = feature.place_type || [];
    if (!text) continue;

    if (!neighborhood && placeType.includes("neighborhood")) {
      neighborhood = text;
    }

    if (
      !borough &&
      BOROUGHS.has(text) &&
      (placeType.includes("district") ||
        placeType.includes("locality") ||
        placeType.includes("place"))
    ) {
      borough = text;
    }

    if (!place && placeType.includes("place")) {
      place = text;
    }
  }

  if (!neighborhood && !borough) {
    const locality = features.find((f) => f.place_type?.includes("locality"));
    if (locality?.text) {
      neighborhood = locality.text;
    }
  }

  const areaName = neighborhood || borough || place;

  if (!neighborhood && !borough && !place) {
    return null;
  }

  return { neighborhood, borough, place, areaName };
}
