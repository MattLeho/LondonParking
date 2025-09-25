const EARTH_RADIUS_M = 6_371_000;

export type Coordinate = {
  lat: number;
  lon: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

export const haversineDistanceMeters = (a: Coordinate, b: Coordinate): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));

  return EARTH_RADIUS_M * c;
};

export const centroid = (points: readonly Coordinate[]): Coordinate => {
  if (points.length === 0) {
    return { lat: 0, lon: 0 };
  }

  const sum = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lon: acc.lon + point.lon,
    }),
    { lat: 0, lon: 0 },
  );

  return {
    lat: sum.lat / points.length,
    lon: sum.lon / points.length,
  };
};
