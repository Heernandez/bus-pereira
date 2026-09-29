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

function service() {
  process.env.EXPO_PUBLIC_API_URL = 'https://backend.example/api/v1/';
  for (const name of ['transit', 'journeys']) delete require.cache[require.resolve(`../src/services/${name}.ts`)];
  return require('../src/services/journeys.ts');
}
const { itineraryDuration, itineraryTitle, legInstruction } = require('../src/services/journeyPresentation.ts');
const stop = (id, longitude) => ({ id, name: id, latitude: 4.81, longitude, type: 'stop', subtitle: '' });
const stops = [stop('A', -75.73), stop('B', -75.71), stop('C', -75.69), stop('D', -75.67)];
const point = s => ({ latitude: s.latitude, longitude: s.longitude, stopId: s.id });
const query = (overrides = {}) => ({ origin: point(stops[0]), destination: point(stops[2]),
  departureTime: '2026-09-21T15:00:00.000Z', preferences: { maxWalkingDistanceMeters: 500, maxTransfers: 2, optimize: 'fastest' }, ...overrides });
// Valid backend response for query(): A → C riding R1 then R2, transferring at B.
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/journey-a-to-c.json'), 'utf8'));

test('published backend handoff example is accepted unchanged by the mobile adapter', async t => {
  const api = service();
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/examples/journey-plan.json'), 'utf8'));
  t.mock.method(global, 'fetch', async () => Response.json(example.response));
  assert.deepEqual(await api.planJourney(example.request), example.response);
});

test('a one-transfer itinerary parses and presents its transfer', () => {
  const api = service();
  const one = api.parseJourneyResponse(fixture()).data.itineraries[0];
  assert.equal(one.transfers, 1);
  assert.equal(itineraryTitle(one), 'R1 → R2');
  assert.match(legInstruction(one.legs[1], 1, one.legs), /Transborda al R2 en B/);
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
  assert.equal(itineraryDuration(item), null);
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

test('rejects results for different endpoints, excessive transfers and demo data', async t => {
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


const place = (name, stopId) => ({ name, latitude: 4.81, longitude: -75.7, ...(stopId ? { stopId } : {}) });
const walkLeg = (id, from, to, minutes, meters = 300) => ({ id, mode: 'walk', from, to, durationSeconds: minutes * 60, distanceMeters: meters, geometry: { coordinates: [], source: 'network' } });
const busLeg = (id, code, from, to, waitMinutes, minutes, extra = {}) => ({ id, mode: 'bus', routeId: `route-${code}`, variantId: `route-${code}-out`, routeCode: code, headsign: 'Centro', color: '#123456',
  from, to, waitSeconds: waitMinutes === null ? null : waitMinutes * 60, durationSeconds: minutes * 60, distanceMeters: 5000, timingSource: 'schedule', geometry: { coordinates: [], source: 'network' }, ...extra });
// Walk 7 → bus 41 (7 min wait, 31 min ride) → walk 1, searched at 08:48: like the reference app.
const referenceTrip = () => ({ id: 'trip', transfers: 0, walkingDistanceMeters: 500, warnings: [], durationSeconds: 46 * 60, legs: [
  walkLeg('w1', place('Casa'), place('Park House', 'A'), 7),
  busLeg('b1', '41', place('Park House', 'A'), place('Friendship', 'D'), 7, 31),
  walkLeg('w2', place('Friendship', 'D'), place('Friendship Inn'), 1, 50),
] });

test('journey schedule: leave by absorbs the first wait, arrival matches the total duration', () => {
  const { journeySchedule } = require('../src/services/journeyPresentation.ts');
  const from = new Date('2026-09-29T13:48:00.000Z');
  const schedule = journeySchedule(referenceTrip(), from);
  assert.equal(schedule.leaveAt.toISOString(), '2026-09-29T13:55:00.000Z');
  assert.equal(schedule.legs.get('b1').start.toISOString(), '2026-09-29T14:02:00.000Z');
  assert.equal(schedule.legs.get('b1').end.toISOString(), '2026-09-29T14:33:00.000Z');
  assert.equal(schedule.arriveAt.toISOString(), '2026-09-29T14:34:00.000Z');
  assert.equal(schedule.arriveAt.getTime() - from.getTime(), referenceTrip().durationSeconds * 1000);
  const transfer = referenceTrip();
  transfer.legs.splice(2, 0, busLeg('b2', '7', place('Friendship', 'D'), place('Otra', 'E'), 5, 10));
  assert.equal(journeySchedule(transfer, from).legs.get('b2').start.toISOString(), '2026-09-29T14:38:00.000Z', 'later waits are transfers');
  const unknown = referenceTrip(); unknown.legs[1].waitSeconds = null;
  assert.equal(journeySchedule(unknown, from), null);
  assert.equal(journeySchedule(referenceTrip(), new Date(NaN)), null);
});
test('journey summary chips and step rows follow the legs, skipping 0 m walking padding', () => {
  const { legChips, journeySteps, journeySchedule } = require('../src/services/journeyPresentation.ts');
  assert.deepEqual(legChips(referenceTrip()).map(chip => chip.kind === 'walk' ? `walk ${chip.minutes}` : `bus ${chip.code}`), ['walk 7', 'bus 41', 'walk 1']);
  const padded = referenceTrip(); padded.legs[0] = walkLeg('w1', place('Park House', 'A'), place('Park House', 'A'), 0, 0);
  assert.deepEqual(legChips(padded).map(chip => chip.kind), ['bus', 'walk']);
  const steps = journeySteps(referenceTrip(), journeySchedule(referenceTrip(), new Date('2026-09-29T13:48:00.000Z')));
  assert.deepEqual(steps.map(step => step.kind), ['start', 'walk', 'board', 'ride', 'alight', 'walk', 'end']);
  assert.equal(steps.at(-1).name, 'Friendship Inn');
  assert.equal(journeySteps(referenceTrip(), null)[0].at, null);
});
test('ride stop count comes from the catalog variant between boarding and alighting', () => {
  const { rideStopCount } = require('../src/services/journeyPresentation.ts');
  const routes = [{ id: 'route-41', variants: [{ id: 'route-41-out', stopSequence: ['Z', 'A', 'B', 'C', 'D', 'E'] }] }];
  assert.equal(rideStopCount(routes, referenceTrip().legs[1]), 3);
  assert.equal(rideStopCount([], referenceTrip().legs[1]), null);
  assert.equal(rideStopCount(routes, { ...referenceTrip().legs[1], to: place('Atrás', 'Z') }), null);
});
test('a usable pass is active with time and uses left, or pending within its activation window', () => {
  const { hasUsablePass } = require('../src/services/startup.ts');
  const now = Date.parse('2026-09-29T12:00:00.000Z');
  const pass = extra => ({ status: 'active', expiresAt: null, remainingUses: null, ...extra });
  assert.equal(hasUsablePass([], now), false);
  assert.equal(hasUsablePass([pass()], now), true);
  assert.equal(hasUsablePass([pass({ remainingUses: 0 })], now), false);
  assert.equal(hasUsablePass([pass({ expiresAt: '2026-09-29T11:00:00.000Z' })], now), false);
  assert.equal(hasUsablePass([pass({ status: 'pending_activation', activateBefore: '2026-09-30T00:00:00.000Z' })], now), true);
  assert.equal(hasUsablePass([pass({ status: 'pending_activation', activateBefore: '2026-09-29T10:00:00.000Z' })], now), false);
  assert.equal(hasUsablePass([pass({ status: 'expired' }), pass({ status: 'activation_expired' })], now), false);
});
