type Point = { latitude: number; longitude: number };

// Google Maps: at zoom z the world is 256 * 2^z dp wide, so one dp covers this many meters at a latitude.
const metersPerDp = (latitude: number, zoom: number) => 156543.03392 * Math.cos(latitude * Math.PI / 180) / 2 ** zoom;

// Camera center that makes `point` appear `upDp` above the middle of the map view, e.g. in the middle
// of the part of the map left visible above a bottom sheet.
export function centerShowingPointAbove(point: Point, zoom: number, upDp: number): Point {
  return { latitude: point.latitude - upDp * metersPerDp(point.latitude, zoom) / 111320, longitude: point.longitude };
}

// How far above the map's middle the middle of the visible band [top, bottom] is.
export const visibleCenterOffset = (mapHeight: number, visibleTop: number, visibleBottom: number) =>
  mapHeight / 2 - (visibleTop + visibleBottom) / 2;
