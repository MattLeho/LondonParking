import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Coordinate } from '../lib/geo.js';
import {
  DISTANCE_THRESHOLD_M,
  buildSequences,
  decorateSequences,
  sequenceHash,
  type TicketPoint,
} from './leaderboard-sequences.js';

const baseCoordinate: Coordinate = { lat: 51.5, lon: -0.12 };
const addMeters = (coordinate: Coordinate, metersEast: number, metersNorth: number): Coordinate => {
  // rough approximation suitable for unit tests; 1 deg latitude ≈ 111_111 m
  const metersPerDegreeLat = 111_111;
  const metersPerDegreeLon = Math.cos((coordinate.lat * Math.PI) / 180) * metersPerDegreeLat;
  return {
    lat: coordinate.lat + metersNorth / metersPerDegreeLat,
    lon: coordinate.lon + metersEast / metersPerDegreeLon,
  };
};

const createPoint = (overrides: Partial<TicketPoint> = {}): TicketPoint => {
  const issuedAt = overrides.issuedAt ?? new Date('2024-01-01T09:00:00Z');
  return {
    id: overrides.id ?? randomUUID(),
    borough: overrides.borough ?? 'Camden',
    issuedAt,
    estMinP: overrides.estMinP ?? 3000,
    estMaxP: overrides.estMaxP ?? 6000,
    coordinate: overrides.coordinate ?? baseCoordinate,
  };
};

describe('buildSequences', () => {
  it('groups contiguous tickets within time and distance thresholds', () => {
    const points: TicketPoint[] = [
      createPoint(),
      createPoint({ issuedAt: new Date('2024-01-01T09:05:00Z') }),
      createPoint({
        issuedAt: new Date('2024-01-01T09:06:00Z'),
        coordinate: addMeters(baseCoordinate, DISTANCE_THRESHOLD_M - 1, 0),
      }),
    ];

    const sequences = buildSequences(points);

    expect(sequences).toHaveLength(1);
    expect(sequences[0]).toMatchObject({
      borough: 'Camden',
      tickets: 3,
      estMinP: 9000,
      estMaxP: 18_000,
      firstSeen: points[0].issuedAt,
      lastSeen: points[2].issuedAt,
    });
  });

  it('creates a new sequence when borough changes', () => {
    const points: TicketPoint[] = [
      createPoint({ borough: 'Camden' }),
      createPoint({ borough: 'Hackney', issuedAt: new Date('2024-01-01T09:01:00Z') }),
    ];

    const sequences = buildSequences(points);
    expect(sequences).toHaveLength(2);
    expect(sequences[0].borough).toBe('Camden');
    expect(sequences[1].borough).toBe('Hackney');
  });

  it('creates a new sequence when the time gap exceeds 12 minutes', () => {
    const points: TicketPoint[] = [
      createPoint(),
      createPoint({ issuedAt: new Date('2024-01-01T09:13:01Z') }),
    ];

    const sequences = buildSequences(points);
    expect(sequences).toHaveLength(2);
  });

  it('creates a new sequence when the distance threshold is exceeded', () => {
    const farCoordinate = addMeters(baseCoordinate, DISTANCE_THRESHOLD_M + 50, 0);
    const points: TicketPoint[] = [
      createPoint(),
      createPoint({ coordinate: farCoordinate, issuedAt: new Date('2024-01-01T09:02:00Z') }),
    ];

    const sequences = buildSequences(points);
    expect(sequences).toHaveLength(2);
  });
});

describe('decorateSequences', () => {
  it('sorts by ticket count, estimated fines, and deterministic hash', () => {
    const day = '2024-01-01';
    const baseIssued = new Date('2024-01-01T09:00:00Z');
    const sequences = [
      {
        borough: 'Camden',
        day,
        points: [baseCoordinate],
        tickets: 2,
        estMinP: 2000,
        estMaxP: 4000,
        firstSeen: baseIssued,
        lastSeen: new Date('2024-01-01T09:10:00Z'),
      },
      {
        borough: 'Camden',
        day,
        points: [baseCoordinate],
        tickets: 2,
        estMinP: 2500,
        estMaxP: 4500,
        firstSeen: baseIssued,
        lastSeen: new Date('2024-01-01T09:05:00Z'),
      },
      {
        borough: 'Camden',
        day,
        points: [baseCoordinate],
        tickets: 3,
        estMinP: 3000,
        estMaxP: 5000,
        firstSeen: baseIssued,
        lastSeen: new Date('2024-01-01T09:15:00Z'),
      },
    ];

    const decorated = decorateSequences(sequences, 'secret');

    expect(decorated.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(decorated[0].tickets).toBe(3);
    expect(decorated[1].estMaxP).toBe(4500);
    expect(decorated.every((s) => s.label.startsWith('Parking Officer '))).toBe(true);
  });
});

describe('sequenceHash', () => {
  it('produces deterministic hashes per sequence and secret', () => {
    const sequence = buildSequences([createPoint(), createPoint({ issuedAt: new Date('2024-01-01T09:05:00Z') })])[0];
    const hashA = sequenceHash(sequence, 'secret');
    const hashB = sequenceHash(sequence, 'secret');
    const hashC = sequenceHash(sequence, 'another');

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });
});
