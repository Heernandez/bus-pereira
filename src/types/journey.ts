import type { Coordinate } from '../data/catalog';

export type JourneyPreference = 'fastest' | 'least_walking' | 'fewest_transfers';
export type JourneyPoint = Coordinate & { stopId?: string };
export type JourneyRequest = {
  origin: JourneyPoint;
  destination: JourneyPoint;
  departureTime: string;
  preferences: {
    maxWalkingDistanceMeters: number; // Total across ALL walking legs.
    maxTransfers: number;
    optimize: JourneyPreference;
  };
};
export type JourneyPlace = Coordinate & { name: string; stopId?: string };
type LegBase = {
  id: string;
  from: JourneyPlace;
  to: JourneyPlace;
  durationSeconds: number;
  distanceMeters: number;
  geometry: { coordinates: Coordinate[]; source: 'network' | 'approximate' };
};
export type WalkLeg = LegBase & { mode: 'walk' };
export type BusLeg = LegBase & {
  mode: 'bus';
  routeId: string;
  variantId: string;
  routeCode: string;
  headsign: string;
  color: string;
  // Includes waiting + minimum boarding/transfer buffer BEFORE this ride.
  waitSeconds: number | null;
  timingSource: 'schedule' | 'frequency' | 'realtime' | 'estimated' | 'unavailable';
};
export type JourneyLeg = WalkLeg | BusLeg;
export type Itinerary = {
  id: string;
  legs: JourneyLeg[];
  // Null if any waiting time is unknown; never claim a full ETA in that case.
  durationSeconds: number | null;
  walkingDistanceMeters: number;
  transfers: number;
  warnings: string[];
};
export type JourneyResponse = {
  data: { itineraries: Itinerary[] };
  meta: {
    contractVersion: 1;
    generatedAt: string;
    source: 'demo' | 'backend';
    // Required only for an empty result, which is different from service failure.
    noRouteReason?: 'outside_coverage' | 'no_service' | 'no_connection' | 'walking_limit';
  };
};
