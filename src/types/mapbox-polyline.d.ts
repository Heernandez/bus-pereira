declare module '@mapbox/polyline' {
  const polyline: {
    decode(encoded: string, precision?: number): [number, number][];
  };

  export default polyline;
}