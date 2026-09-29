import polyline from '@mapbox/polyline';

export type LocationType = 'stop' | 'station' | 'poi';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Location = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: LocationType;
};

export type RouteVariant = {
  id: string;
  direction: 'outbound' | 'return';
  destinationName: string;
  stopSequence: string[];
  // Minutes the driver waits at the first stop before starting this variant (terminal layover).
  layoverMinutes?: number | null;
  geometry: {
    provider: 'mock' | 'google-routes' | 'manual';
    status: 'pending' | 'ready';
    encodedPolyline: string | null;
    coordinates: Coordinate[];
  };
};

export type RouteOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  mode: 'bus';
  color: string;
  duration: string;
  transfers: string;
  stops: string;
  variants: RouteVariant[];
};

export const getVariantCoordinates = (variant: RouteVariant, stops: Location[] = []): Coordinate[] => {
  if (variant.geometry.coordinates.length > 0) {
    return variant.geometry.coordinates;
  }

  if (variant.geometry.encodedPolyline) {
    return polyline.decode(variant.geometry.encodedPolyline).map(([latitude, longitude]) => ({
      latitude,
      longitude,
    }));
  }

  return variant.stopSequence
    .map((stopId) => stops.find(stop => stop.id === stopId))
    .filter((stop): stop is Location => Boolean(stop));
};
