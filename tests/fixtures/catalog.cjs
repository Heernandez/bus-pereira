// Small backend-shaped catalog for service tests.
const stops = [
  { id: 'stop-a', name: 'Estación A', subtitle: 'Centro', latitude: 4.8133, longitude: -75.6961, type: 'station' },
  { id: 'stop-b', name: 'Estación B', subtitle: 'Circunvalar', latitude: 4.8101, longitude: -75.6902, type: 'station' },
  { id: 'stop-c', name: 'Estación C', subtitle: 'Universidad', latitude: 4.8052, longitude: -75.6851, type: 'station' },
];

const route = {
  id: 'route-7', code: '7', name: 'Bus 7', description: '', mode: 'bus', color: '#1f6feb', duration: '', transfers: '', stops: '',
  variants: [
    {
      id: 'route-7-outbound', direction: 'outbound', destinationName: 'Estación C', stopSequence: ['stop-a', 'stop-b', 'stop-c'],
      geometry: { provider: 'manual', status: 'ready', encodedPolyline: null, coordinates: [
        { latitude: 4.8133, longitude: -75.6961 }, { latitude: 4.8118, longitude: -75.6931 },
        { latitude: 4.8101, longitude: -75.6902 }, { latitude: 4.8076, longitude: -75.6876 },
        { latitude: 4.8052, longitude: -75.6851 },
      ] },
    },
    {
      id: 'route-7-return', direction: 'return', destinationName: 'Estación A', stopSequence: ['stop-c', 'stop-b', 'stop-a'],
      geometry: { provider: 'manual', status: 'pending', encodedPolyline: null, coordinates: [] },
    },
  ],
};

module.exports = { stops, route };
