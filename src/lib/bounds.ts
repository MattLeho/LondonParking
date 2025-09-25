export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const parseBbox = (raw: string): Bbox => {
  const segments = raw.split(',').map((part) => Number.parseFloat(part.trim()));

  if (segments.length !== 4 || segments.some((value) => Number.isNaN(value))) {
    throw new Error('bbox must contain four comma-separated numbers');
  }

  const [west, south, east, north] = segments;

  if (!isFiniteNumber(west) || !isFiniteNumber(south) || !isFiniteNumber(east) || !isFiniteNumber(north)) {
    throw new Error('bbox coordinates must be finite numbers');
  }

  if (west > east || south > north) {
    throw new Error('bbox coordinates are invalid: west must be <= east and south <= north');
  }

  const width = Math.abs(east - west);
  const height = Math.abs(north - south);

  if (width * height > 50) {
    throw new Error('bbox area exceeds the allowed limit. Please zoom in further.');
  }

  return { west, south, east, north };
};
