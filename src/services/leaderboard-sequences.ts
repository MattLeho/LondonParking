import { createHash } from 'node:crypto';

import type { Coordinate } from '../lib/geo.js';
import { centroid, haversineDistanceMeters } from '../lib/geo.js';

export const DISTANCE_THRESHOLD_M = 150;
export const TIME_THRESHOLD_MS = 12 * 60 * 1000;

export type TicketPoint = {
  id: string;
  borough: string;
  issuedAt: Date;
  estMinP: number | null;
  estMaxP: number | null;
  coordinate: Coordinate;
};

export type OfficerSequence = {
  borough: string;
  day: string;
  points: Coordinate[];
  tickets: number;
  estMinP: number;
  estMaxP: number;
  firstSeen: Date;
  lastSeen: Date;
};

export const buildSequences = (points: readonly TicketPoint[]): OfficerSequence[] => {
  const sequences: OfficerSequence[] = [];

  for (const point of points) {
    const day = point.issuedAt.toISOString().slice(0, 10);
    const previous = sequences.length > 0 ? sequences[sequences.length - 1] : undefined;

    if (!previous) {
      sequences.push({
        borough: point.borough,
        day,
        points: [point.coordinate],
        tickets: 1,
        estMinP: point.estMinP ?? 0,
        estMaxP: point.estMaxP ?? 0,
        firstSeen: point.issuedAt,
        lastSeen: point.issuedAt,
      });
      continue;
    }

    const sameBorough = previous.borough === point.borough;
    const sameDay = previous.day === day;
    const timeGap = point.issuedAt.getTime() - previous.lastSeen.getTime();
    const lastCoordinate = previous.points.at(-1);
    const exceedsDistance =
      lastCoordinate !== undefined &&
      haversineDistanceMeters(lastCoordinate, point.coordinate) > DISTANCE_THRESHOLD_M;

    if (!sameBorough || !sameDay || timeGap > TIME_THRESHOLD_MS || exceedsDistance) {
      sequences.push({
        borough: point.borough,
        day,
        points: [point.coordinate],
        tickets: 1,
        estMinP: point.estMinP ?? 0,
        estMaxP: point.estMaxP ?? 0,
        firstSeen: point.issuedAt,
        lastSeen: point.issuedAt,
      });
      continue;
    }

    previous.points.push(point.coordinate);
    previous.tickets += 1;
    previous.estMinP += point.estMinP ?? 0;
    previous.estMaxP += point.estMaxP ?? 0;
    previous.lastSeen = point.issuedAt;
  }

  return sequences;
};

export const sequenceHash = (sequence: OfficerSequence, secret: string) => {
  const digest = createHash('sha256');
  digest.update(secret);
  digest.update('|');
  digest.update(sequence.borough.toLowerCase());
  digest.update('|');
  digest.update(sequence.day);
  digest.update('|');
  digest.update(sequence.firstSeen.toISOString());
  digest.update('|');
  digest.update(sequence.lastSeen.toISOString());
  digest.update('|');
  digest.update(String(sequence.tickets));
  return digest.digest('hex');
};

export const decorateSequences = (
  sequences: readonly OfficerSequence[],
  secret: string,
) =>
  sequences
    .map((sequence) => ({
      ...sequence,
      centroid: centroid(sequence.points),
      hash: sequenceHash(sequence, secret),
    }))
    .sort((a, b) => {
      if (b.tickets !== a.tickets) {
        return b.tickets - a.tickets;
      }
      if (b.estMaxP !== a.estMaxP) {
        return b.estMaxP - a.estMaxP;
      }
      return a.hash.localeCompare(b.hash);
    })
    .map((sequence, index) => ({
      ...sequence,
      label: `Parking Officer ${String(index + 1)}`,
      rank: index + 1,
    }));

export type DecoratedOfficerSequence = ReturnType<typeof decorateSequences>[number];
