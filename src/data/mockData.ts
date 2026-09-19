import data from './mockData.json';
import polyline from '@mapbox/polyline';

export type LocationType = 'stop' | 'station' | 'poi';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type MockLocation = {
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
  geometry: {
    provider: 'mock' | 'google-routes';
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

export const defaultRegion = data.city.defaultRegion;

export const mockStops: MockLocation[] = data.stops;

export const routeOptions: RouteOption[] = data.routes;

export const getStopById = (id: string) => mockStops.find((stop) => stop.id === id);

export const getVariantCoordinates = (variant: RouteVariant): Coordinate[] => {
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
    .map((stopId) => getStopById(stopId))
    .filter((stop): stop is MockLocation => Boolean(stop));
};
