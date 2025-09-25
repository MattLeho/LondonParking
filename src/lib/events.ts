import { EventEmitter } from 'node:events';

export type StreamPayloads = {
  ticket: {
    id: string;
    issuedAt: string;
    borough: string;
    location: { lat: number; lon: number };
  };
  patrol: {
    label: string;
    borough: string;
    firstSeen: string;
    lastSeen: string;
    centroid: { lat: number; lon: number };
  };
  leaderboard: {
    scope: 'officers' | 'streets';
    borough: string | null;
    updatedAt: string;
  };
  heartbeat: {
    timestamp: string;
  };
};

export type StreamEventName = keyof StreamPayloads;

const emitter = new EventEmitter();

export const publishStreamEvent = <K extends StreamEventName>(
  event: K,
  payload: StreamPayloads[K],
) => {
  emitter.emit(event, payload);
};

export const onStreamEvent = <K extends StreamEventName>(
  event: K,
  listener: (payload: StreamPayloads[K]) => void,
) => {
  const handler = (payload: StreamPayloads[K]) => {
    listener(payload);
  };
  emitter.on(event, handler);
  return () => {
    emitter.off(event, handler);
  };
};
