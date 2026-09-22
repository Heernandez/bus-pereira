const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = specifier => {
    const tsPath = path.resolve(path.dirname(filename), `${specifier}.ts`);
    return originalRequire(specifier.startsWith('.') && fs.existsSync(tsPath) ? tsPath : specifier);
  };
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};

function service(dummy = false) {
  process.env.EXPO_PUBLIC_USE_DUMMY_DATA = String(dummy);
  process.env.EXPO_PUBLIC_API_URL = 'https://backend.example/api/v1/';
  for (const name of ['transit', 'journeys']) delete require.cache[require.resolve(`../src/services/${name}.ts`)];
  return require('../src/services/journeys.ts');
}
const { planDemoJourney } = require('../src/services/journeyDemo.ts');
const { itineraryDuration, itineraryTitle, legInstruction } = require('../src/services/journeyPresentation.ts');
const stop = (id, longitude) => ({ id, name: id, latitude: 4.81, longitude, type: 'stop', subtitle: '' });
const stops = [stop('A', -75.73), stop('B', -75.71), stop('C', -75.69), stop('D', -75.67)];
const route = (id, sequence) => ({ id, code: id, name: id, description: '', mode: 'bus', color: '#123456',
  variants: [{ id: `${id}-out`, direction: 'outbound', destinationName: sequence.at(-1), stopSequence: sequence,
    geometry: { coordinates: [], encodedPolyline: null, provider: 'mock', status: 'pending' } }] });
const routes = [route('R1', ['A', 'B']), route('R2', ['B', 'C']), route('R3', ['C', 'D'])];
const point = s => ({ latitude: s.latitude, longitude: s.longitude, stopId: s.id });
const query = (overrides = {}) => ({ origin: point(stops[0]), destination: point(stops[2]),
  departureTime: '2026-09-21T15:00:00.000Z', preferences: { maxWalkingDistanceMeters: 500, maxTransfers: 2, optimize: 'fastest' }, ...overrides });
const fixture = () => {
  const result = planDemoJourney(query(), stops, routes);
  result.meta.source = 'backend';
  return result;
};

test('published backend handoff example is accepted unchanged by the mobile adapter', async t => {
  const api = service();
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/examples/journey-plan.json'), 'utf8'));
  t.mock.method(global, 'fetch', async () => Response.json(example.response));
  assert.deepEqual(await api.planJourney(example.request), example.response);
});

test('demo finds one and two transfers, respects direction and transfer limit', () => {
  const api = service();
  const one = api.parseJourneyResponse(fixture()).data.itineraries[0];
  assert.equal(one.transfers, 1);
  assert.equal(itineraryTitle(one), 'R1 → R2');
  assert.match(legInstruction(one.legs[1], 1, one.legs), /Transborda al R2 en B/);
  const two = planDemoJourney(query({ destination: point(stops[3]) }), stops, routes).data.itineraries[0];
  assert.equal(two.transfers, 2);
  assert.equal(planDemoJourney(query({ origin: point(stops[2]), destination: point(stops[0]) }), stops, routes).data.itineraries.length, 0);
  assert.equal(planDemoJourney(query({ preferences: { ...query().preferences, maxTransfers: 0 } }), stops, routes).data.itineraries.length, 0);
});

test('free endpoints compare multiple stops and sum access plus egress walking', () => {
  const nearby = stop('unserved-nearest', -75.7301);
  const request = query({ origin: { latitude: 4.81, longitude: -75.7301 }, destination: { latitude: 4.81, longitude: -75.6899 } });
  const result = planDemoJourney(request, [nearby, ...stops], routes).data.itineraries[0];
  assert.equal(result.legs[0].mode, 'walk');
  assert.equal(result.legs[1].from.stopId, 'A');
  assert.equal(result.legs.at(-1).mode, 'walk');
  assert.equal(result.walkingDistanceMeters, result.legs[0].distanceMeters + result.legs.at(-1).distanceMeters);
  const limited = planDemoJourney({ ...request, preferences: { ...request.preferences, maxWalkingDistanceMeters: result.walkingDistanceMeters - 1 } }, stops, routes);
  assert.equal(limited.data.itineraries.length, 0);
});

test('demo can return a walking-only journey and obeys preference ordering', () => {
  const request = query({ destination: { latitude: 4.81, longitude: -75.7299 } });
  const walk = planDemoJourney(request, stops, routes).data.itineraries[0];
  assert.equal(itineraryTitle(walk), 'Todo a pie');
  assert.equal(walk.transfers, 0);
  assert.equal(walk.legs.length, 1);
  const alternativeStops = [...stops, stop('near-C', -75.6901)];
  const alternativeRoutes = [...routes, route('DIRECT', ['A', 'near-C'])];
  const base = query({ destination: { latitude: stops[2].latitude, longitude: stops[2].longitude } });
  const lessWalking = planDemoJourney({ ...base, preferences: { ...base.preferences, optimize: 'least_walking' } }, alternativeStops, alternativeRoutes);
  assert.equal(lessWalking.data.itineraries[0].walkingDistanceMeters, 0);
  const fewerTransfers = planDemoJourney({ ...base, preferences: { ...base.preferences, optimize: 'fewest_transfers' } }, alternativeStops, alternativeRoutes);
  assert.equal(fewerTransfers.data.itineraries[0].transfers, 0);
});

test('POST sends raw endpoints and preferences, never preselects a nearest stop', async t => {
  const api = service();
  const input = query();
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://backend.example/api/v1/journeys/plan');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json(fixture());
  });
  assert.equal((await api.planJourney(input)).data.itineraries[0].transfers, 1);
});

test('backend walking transfer geometry and places survive intact', async t => {
  const api = service();
  const response = fixture();
  const item = response.data.itineraries[0];
  const from = item.legs[0].to;
  const to = { ...from, stopId: 'B-other-side', longitude: from.longitude + 0.001 };
  item.legs[1].from = to;
  item.legs.splice(1, 0, { id: 'transfer-walk', mode: 'walk', from, to, durationSeconds: 90, distanceMeters: 120,
    geometry: { coordinates: [from, to], source: 'network' } });
  item.durationSeconds += 90;
  item.walkingDistanceMeters = 120;
  t.mock.method(global, 'fetch', async () => Response.json(response));
  const result = await api.planJourney(query());
  assert.deepEqual(result, response);
  assert.match(legInstruction(item.legs[1], 1, item.legs), /Camina/);
  assert.match(legInstruction(item.legs[2], 2, item.legs), /Transborda/);
});

test('unknown waits cannot be presented as a complete ETA', () => {
  const api = service();
  const response = fixture();
  const item = response.data.itineraries[0];
  item.legs[0].waitSeconds = null;
  item.legs[0].timingSource = 'unavailable';
  assert.throws(() => api.parseJourneyResponse(response), /incompatible/);
  item.durationSeconds = null;
  api.parseJourneyResponse(response);
  assert.equal(itineraryDuration(item), 'Tiempo total no disponible');
  assert.match(legInstruction(item.legs[0], 0, item.legs), /Espera no disponible/);
});

test('rejects malformed, disconnected, inconsistent and incompatible itineraries', () => {
  const api = service();
  for (const mutate of [
    x => { x.meta.contractVersion = 2; },
    x => { x.data.itineraries[0].legs[0].geometry.coordinates[0].latitude = 999; },
    x => { x.data.itineraries[0].legs[0].geometry.coordinates = []; },
    x => { x.data.itineraries[0].legs[0].color = 'red'; },
    x => { x.data.itineraries[0].legs[0].durationSeconds = -1; },
    x => { x.data.itineraries[0].legs[1].from = { ...x.data.itineraries[0].legs[1].from, longitude: 0 }; },
    x => { x.data.itineraries[0].transfers = 0; },
    x => { x.data.itineraries[0].walkingDistanceMeters = 500; },
    x => { x.data.itineraries[0].durationSeconds = 1; },
    x => { x.data.itineraries.push(x.data.itineraries[0]); },
    x => { x.data.itineraries[0].legs[1].id = x.data.itineraries[0].legs[0].id; },
  ]) {
    const response = fixture(); mutate(response);
    assert.throws(() => api.parseJourneyResponse(response), /incompatible/);
  }
});

test('empty results are distinct from unavailable endpoint and HTTP errors; no fallback', async t => {
  const api = service();
  const empty = { data: { itineraries: [] }, meta: { contractVersion: 1, source: 'backend', generatedAt: query().departureTime, noRouteReason: 'no_connection' } };
  t.mock.method(global, 'fetch', async () => Response.json(empty));
  assert.deepEqual(await api.planJourney(query()), empty);
  for (const [status, message] of [[404, /todavía no/], [405, /todavía no/], [501, /todavía no/], [422, /preferencias/], [429, /muchas consultas/], [503, /no está disponible/]]) {
    t.mock.method(global, 'fetch', async () => new Response('{}', { status }));
    await assert.rejects(api.planJourney(query()), message);
  }
  delete empty.meta.noRouteReason;
  t.mock.method(global, 'fetch', async () => Response.json(empty));
  await assert.rejects(api.planJourney(query()), /incompatible/);
});

test('rejects results for different endpoints, excessive transfers and demo data in live mode', async t => {
  const api = service();
  t.mock.method(global, 'fetch', async () => Response.json(fixture()));
  await assert.rejects(api.planJourney(query({ destination: point(stops[3]) })), /incompatible/);
  await assert.rejects(api.planJourney(query({ preferences: { ...query().preferences, maxTransfers: 0 } })), /incompatible/);
  const demo = fixture(); demo.meta.source = 'demo';
  t.mock.method(global, 'fetch', async () => Response.json(demo));
  await assert.rejects(api.planJourney(query()), /incompatible/);
});

test('cancellation and timeout abort network requests; pre-aborted requests do not fetch', async t => {
  const api = service();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchMock = t.mock.method(global, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const controller = new AbortController();
  const cancelled = assert.rejects(api.planJourney(query(), controller.signal), /aborted/);
  controller.abort(); await cancelled;
  const count = fetchMock.mock.callCount();
  await assert.rejects(api.planJourney(query(), controller.signal), /cancelada/);
  assert.equal(fetchMock.mock.callCount(), count);
  const timedOut = assert.rejects(api.planJourney(query()), /tardó demasiado/);
  t.mock.timers.tick(15000); await timedOut;
});

test('dummy mode stays offline and produces valid responses for the bundled catalog', async t => {
  const api = service(true);
  const { dummyStops } = require('../src/data/catalog.ts');
  t.mock.method(global, 'fetch', async () => { throw new Error('Unexpected network'); });
  const realStops = dummyStops.filter(stop => stop.type !== 'poi');
  for (const origin of realStops) {
    const result = await api.planJourney(query({ origin: point(origin), destination: point(realStops.at(-1)) }));
    assert.equal(result.meta.source, 'demo');
  }
});
