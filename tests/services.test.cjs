const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run dependency-free service tests without loading React Native in Node.
require.extensions['.ts'] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = specifier => {
    const tsPath = path.resolve(path.dirname(filename), `${specifier}.ts`);
    return originalRequire(specifier.startsWith('.') && fs.existsSync(tsPath) ? tsPath : specifier);
  };
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(result.outputText, filename);
};
// Log-leak tests below need debug logging on, as in a development build.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
const { resolveLocationAccess } = require('../src/services/locationAccess.ts');
function adapter(permission = { granted: true, canAskAgain: true, status: 'granted' }, services = true) {
  const calls = [];
  return {
    calls,
    permission: async () => permission,
    requestPermission: async () => { calls.push('permission'); return permission; },
    servicesEnabled: async () => services,
    enableServices: async () => { calls.push('services'); },
  };
}
test('permission denied is distinct from service disabled; passive checks never prompt', async () => {
  const denied = adapter({ granted: false, canAskAgain: true, status: 'denied' }, false);
  assert.equal(await resolveLocationAccess(denied), 'permission-denied');
  assert.deepEqual(denied.calls, []);
  assert.equal(await resolveLocationAccess(adapter(undefined, false)), 'services-disabled');
  assert.equal(await resolveLocationAccess(adapter()), 'ready');
});
test('first request and retry respect canAskAgain', async () => {
  const initial = adapter({ granted: false, canAskAgain: true, status: 'undetermined' });
  assert.equal(await resolveLocationAccess(initial), 'permission-required');
  initial.requestPermission = async () => ({ granted: true, canAskAgain: true, status: 'granted' });
  assert.equal(await resolveLocationAccess(initial, true), 'ready');
  const blocked = adapter({ granted: false, canAskAgain: false, status: 'denied' });
  assert.equal(await resolveLocationAccess(blocked, true), 'permission-blocked');
  assert.deepEqual(blocked.calls, []);
  const denied = adapter({ granted: false, canAskAgain: true, status: 'denied' });
  assert.equal(await resolveLocationAccess(denied, true), 'permission-denied');
  assert.deepEqual(denied.calls, ['permission']);
});
test('accepting Android service dialog rechecks actual system state; cancellation stays blocked', async () => {
  const enabled = adapter(undefined, false);
  enabled.enableServices = async () => { enabled.servicesEnabled = async () => true; };
  assert.equal(await resolveLocationAccess(enabled, true), 'ready');
  const cancelled = adapter(undefined, false);
  cancelled.enableServices = async () => { throw new Error('cancelled'); };
  assert.equal(await resolveLocationAccess(cancelled, true), 'services-disabled');
  // Dialog acceptance alone is not proof that location services are enabled.
  assert.equal(await resolveLocationAccess(adapter(undefined, false), true), 'services-disabled');
});
test('native check failures propagate instead of being misreported as denied permissions', async () => {
  const broken = adapter();
  broken.servicesEnabled = async () => { throw new Error('provider unavailable'); };
  await assert.rejects(resolveLocationAccess(broken), /provider unavailable/);
});
const catalogFixture = require('./fixtures/catalog.cjs');
function service() {
  process.env.EXPO_PUBLIC_API_URL = 'http://backend.example/api/v1/';
  delete require.cache[require.resolve('../src/services/transit.ts')];
  return require('../src/services/transit.ts');
}
test('API uses the backend endpoints and unwraps data', async t => {
  const api = service();
  const urls = [];
  const responses = {
    '/city': { id: 'remote-city' }, '/stops': [], '/stations': [], '/routes': [], '/products': [],
    '/stations/remote%20station/arrivals': { station: { id: 'remote station' }, arrivals: [], servingRoutes: [] },
  };
  t.mock.method(global, 'fetch', async url => {
    const path = url.replace('http://backend.example/api/v1', '');
    urls.push(path);
    assert.ok(path in responses);
    return new Response(JSON.stringify({ data: responses[path], meta: { source: 'live' } }));
  });
  const catalog = await api.getCatalog();
  assert.equal(catalog.city.id, 'remote-city');
  assert.deepEqual(catalog.routes, []);
  assert.deepEqual(await api.getProducts(), []);
  assert.equal((await api.getArrivals('remote station')).data.station.id, 'remote station');
  assert.equal(urls.length, 6);
});
test('API failures are visible and caller cancellation aborts fetch', async t => {
  const api = service();
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(api.getCatalog(), /503/);
  t.mock.method(global, 'fetch', async (_url, { signal }) => {
    assert.equal(signal.aborted, true);
    throw new Error('aborted');
  });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.getProducts(controller.signal), /aborted/);
});

test('map selection replaces station with route; collapsing preserves station and back restores it', () => {
  const { initialMapState, mapSelectionReducer: reduce } = require('../src/services/mapSelection.ts');
  const station = reduce(initialMapState, { type: 'select', selection: { type: 'station', stationId: 's1' } });
  const collapsed = reduce(station, { type: 'sheet', value: 'collapsed' });
  assert.deepEqual(collapsed.selection, station.selection);
  const route = reduce(collapsed, { type: 'select', selection: { type: 'route', routeId: 'r1' } });
  assert.equal(route.selection.type, 'route');
  assert.equal(route.selection.stationId, 's1');
  assert.deepEqual(reduce(route, { type: 'back' }).selection, station.selection);
  assert.equal(reduce(route, { type: 'clear' }).selection.type, 'none');
});

function busFixture(id = 'bus-1') {
  return { id, routeId: 'r1', variantId: 'v1', routeCode: '43', coordinate: { latitude: 4.8, longitude: -75.7 }, heading: 90, etaMinutes: 3, lastPositionAt: '2026-09-19T12:00:00.000Z', live: true, source: 'gps' };
}
test('normalized buses notify only the changed bus, reject old GPS and remove missing members', () => {
  const { LiveBusStore, isRecentBus } = require('../src/services/liveBuses.ts');
  const store = new LiveBusStore();
  store.replace([busFixture(), busFixture('bus-2')]);
  let list = 0, one = 0, two = 0;
  store.subscribeIds(() => list++); store.subscribe('bus-1', () => one++); store.subscribe('bus-2', () => two++);
  const ids = store.getIds();
  store.patch({ id: 'bus-1', coordinate: { latitude: 4.81, longitude: -75.71 }, lastPositionAt: '2026-09-19T12:00:01.000Z' });
  assert.equal(one, 1); assert.equal(two, 0); assert.equal(list, 0); assert.equal(store.getIds(), ids);
  store.patch({ id: 'bus-1', coordinate: { latitude: 0, longitude: 0 }, lastPositionAt: '2026-09-19T11:00:00.000Z' });
  assert.equal(store.get('bus-1').coordinate.latitude, 4.81);
  store.patch({ id: 'bus-1', coordinate: { latitude: 999, longitude: 0 } });
  assert.equal(store.get('bus-1').coordinate.latitude, 4.81);
  assert.equal(isRecentBus(store.get('bus-1'), Date.parse('2026-09-19T12:00:20Z')), true);
  assert.equal(isRecentBus(store.get('bus-1'), Date.parse('2026-09-19T12:02:00Z')), false);
  store.replace([store.get('bus-1')]); assert.equal(store.get('bus-2'), undefined); assert.equal(list, 1);
});

test('WebSocket subscribes once, filters channel, reconnects and unsubscribes on cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { subscribeLive } = require('../src/services/liveTransport.ts');
  const sockets = [], events = [], states = [];
  let refreshes = 0;
  const stop = subscribeLive({ url: 'ws://test', channel: 'station:s1', onEvent: event => events.push(event), onState: state => states.push(state), onReconnect: async () => { refreshes++; }, createSocket: () => {
    const socket = { readyState: 1, messages: [], send(message) { this.messages.push(JSON.parse(message)); }, close() { this.closed = true; } };
    sockets.push(socket); return socket;
  } });
  assert.equal(sockets.length, 1);
  sockets[0].onopen();
  assert.deepEqual(sockets[0].messages, [{ type: 'subscribe', channels: ['station:s1'] }]);
  sockets[0].onmessage({ data: JSON.stringify({ type: 'snapshot_end', channel: 'station:s1' }) });
  assert.equal(states.at(-1), 'live');
  events.length = 0;
  sockets[0].onmessage({ data: JSON.stringify({ type: 'bus_removed', channel: 'station:other', busId: 'b' }) });
  assert.equal(events.length, 0);
  sockets[0].onmessage({ data: JSON.stringify({ type: 'bus_removed', channel: 'station:s1', busId: 'b' }) });
  assert.equal(events.length, 1);
  sockets[0].onclose();
  assert.equal(states.at(-1), 'disconnected');
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  assert.equal(refreshes, 1); assert.equal(sockets.length, 2);
  sockets[1].onopen(); stop();
  assert.deepEqual(sockets[1].messages.at(-1), { type: 'unsubscribe', channels: ['station:s1'] });
  assert.equal(sockets[1].closed, true);
  t.mock.timers.tick(60000); assert.equal(sockets.length, 2);
});

test('native backend arrivals and route shapes adapt without fabricating coordinates or ETA', async t => {
  const { stops } = catalogFixture;
  const route = structuredClone(catalogFixture.route);
  const variant = route.variants[0];
  const rawBus = { busId: 'native-bus', vehicleId: 'native-bus', routeId: route.id, variantId: variant.id,
    latitude: 4.81, longitude: -75.7, headingDegrees: 80, measuredAt: new Date().toISOString(), live: true, stale: false, nextStationId: stops[1].id };
  const rawArrival = { ...rawBus, id: 'arrival-1', route, variant, vehicle: { id: rawBus.busId, publicLabel: 'BUS 1' },
    lastPositionAt: rawBus.measuredAt, arrivalMinutes: 3, predictionSource: 'shape_speed' };
  const api = service();
  t.mock.method(global, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/arrivals')
    ? { data: { station: stops[0], servingRoutes: [{ route, variant }], arrivals: [rawArrival] }, meta: { source: 'live' } }
    : { data: { route, variants: route.variants.map(v => ({ id: v.id, shape: v.geometry, stations: stops })), buses: [rawBus], updatedAt: rawBus.measuredAt }, meta: { source: 'live' } })));
  const station = await api.getArrivals(stops[0].id);
  assert.equal(station.data.buses[0].id, 'native-bus');
  assert.equal(station.data.buses[0].coordinate.latitude, 4.81);
  assert.equal(station.data.arrivals[0].predictionSource, 'gps');
  const live = await api.getRouteLive(route.id);
  assert.equal(live.data.buses[0].routeCode, route.code);
  assert.equal(live.data.buses[0].nextStopId, stops[1].id);
  assert.equal(live.data.buses[0].etaMinutes, null);
  assert.equal(live.meta.liveAvailable, true);
  assert.equal(live.meta.refreshAfterSeconds, 30);
  assert.equal(live.data.stops.length, stops.length);
  for (const shape of live.data.shapes) {
    const v = route.variants.find(v => v.id === shape.variantId);
    if (v.geometry.status !== 'ready') assert.deepEqual(shape.coordinates, []);
  }
});

test('route live fallback is limited to 404, never fabricates buses from errors', async t => {
  const api = service();
  const { stops } = catalogFixture;
  const route = structuredClone(catalogFixture.route);
  route.variants.forEach(v => { v.geometry = { provider: 'manual', status: 'pending', coordinates: [], encodedPolyline: null }; });
  t.mock.method(global, 'fetch', async url => url.endsWith('/live') ? new Response('{}', { status: 404 })
    : new Response(JSON.stringify({ data: url.endsWith('/stops') ? stops : route })));
  const live = await api.getRouteLive(route.id);
  assert.equal(live.meta.liveAvailable, false);
  assert.deepEqual(live.data.buses, []);
  assert.ok(live.data.shapes.every(shape => shape.coordinates.length === 0));
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 500 }));
  await assert.rejects(api.getRouteLive(route.id), /500/);
});

test('opening uses public campaign contract and deduplicates counted requests', async t => {
  service();
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const api = require('../src/services/startup.ts');
  const campaign = { id: 'c1', name: 'Promoción', imageUrl: '/api/v1/campaigns/c1/image', displaySeconds: 12, maxViewsPerDevice: 3, activatedAt: '2026-09-19T20:00:00.000Z' };
  assert.deepEqual(api.parseCampaign(campaign), { id: 'c1', imageUrl: 'http://backend.example/api/v1/campaigns/c1/image', durationSeconds: 12, accessibilityLabel: 'Promoción', maxViewsPerDevice: 3 });
  assert.equal(api.parseCampaign({ ...campaign, imageUrl: 'https://cdn.example/ad.jpg', displaySeconds: 90 }).durationSeconds, 90);
  assert.equal(api.parseCampaign(null), null);
  for (const displaySeconds of [0, -1, NaN, Infinity, '5']) assert.throws(() => api.parseCampaign({ ...campaign, displaySeconds }));
  assert.throws(() => api.parseCampaign({ ...campaign, imageUrl: 'file:///secret' }));
  const requests = []; const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ data: url.endsWith('/me/passes') ? { passes: [] } : [campaign] }) };
  });
  const signal = new AbortController().signal;
  const load = api.createOpeningCampaignLoader(async () => '550e8400-e29b-41d4-a716-446655440000', 'android');
  await Promise.all([load(), load()]);
  await load();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://backend.example/api/v1/campaigns/active');
  assert.deepEqual(await api.getMyPasses('private-id-token', signal), []);
  assert.deepEqual(requests[0].options.headers, { 'X-Installation-ID': '550e8400-e29b-41d4-a716-446655440000', 'X-Platform': 'ANDROID' });
  assert.equal(requests[1].options.headers.Authorization, 'Bearer private-id-token');
  assert.equal(requests[1].url, 'http://backend.example/api/v1/me/passes');
  assert.ok(logs.every(line => !line.includes('private-id-token')));
});

test('private passes distinguish server failure from empty history', async t => {
  service();
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const api = require('../src/services/startup.ts');
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 403 }));
  await assert.rejects(api.getMyPasses('test', new AbortController().signal), error => error.status === 403);
});

 test('campaign null and failure are retained without counting a second request', async t => {
  service();
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const api = require('../src/services/startup.ts');
  let calls = 0;
  t.mock.method(global, 'fetch', async () => { calls++; return { ok: true, status: 200, json: async () => ({ data: null, meta: { source: 'live' } }) }; });
  const load = api.createOpeningCampaignLoader(async () => '550e8400-e29b-41d4-a716-446655440000', 'android');
  assert.deepEqual(await load(), []);
  assert.deepEqual(await load(), []);
  assert.equal(calls, 1);
  t.mock.method(global, 'fetch', async () => { calls++; throw new Error('offline'); });
  const failed = api.createOpeningCampaignLoader(async () => '550e8400-e29b-41d4-a716-446655440000', 'android');
  await assert.rejects(failed(), /offline/);
  await assert.rejects(failed(), /offline/);
  assert.equal(calls, 2);
});

test('campaign counters persist, obey limits and preserve server ordering', async () => {
  const { createCampaignHistory } = require('../src/services/campaignHistory.ts');
  let raw = null;
  const storage = { getItem: async () => raw, setItem: async (_, value) => { raw = value; } };
  const a = { id: 'a', maxViewsPerDevice: 2 };
  const b = { id: 'b', maxViewsPerDevice: 1 };
  const history = createCampaignHistory(storage);
  assert.deepEqual(await history.reconcile([b, a]), [b, a]);
  await history.complete(b);
  await history.complete(a);
  const reopened = createCampaignHistory(storage);
  assert.deepEqual(await reopened.reconcile([b, a]), [a]);
  await reopened.complete(a);
  assert.deepEqual(await reopened.reconcile([b, a]), []);
  assert.deepEqual(await reopened.reconcile([{ ...a, maxViewsPerDevice: 3 }, b]), [{ ...a, maxViewsPerDevice: 3 }]);
  assert.deepEqual(await reopened.reconcile([{ id: 'disabled', maxViewsPerDevice: 0 }]), []);
  assert.deepEqual(JSON.parse(raw), []);
});

test('authoritative list prunes absent UUIDs and allows a removed campaign to start fresh', async () => {
  const { createCampaignHistory } = require('../src/services/campaignHistory.ts');
  let raw = JSON.stringify([['gone', 5], ['keep', 1]]);
  const history = createCampaignHistory({ getItem: async () => raw, setItem: async (_, value) => { raw = value; } });
  await history.reconcile([{ id: 'keep', maxViewsPerDevice: 2 }]);
  assert.deepEqual(JSON.parse(raw), [['keep', 1]]);
  assert.deepEqual(await history.reconcile([{ id: 'gone', maxViewsPerDevice: 1 }]), [{ id: 'gone', maxViewsPerDevice: 1 }]);
  await history.reconcile([]);
  assert.deepEqual(JSON.parse(raw), []);
});

test('invalid campaign lists are rejected before pruning; storage failures do not reset limits', async () => {
  const api = require('../src/services/startup.ts');
  const campaign = { id: 'a', name: 'A', imageUrl: '/image', displaySeconds: 1, maxViewsPerDevice: 2 };
  assert.equal(api.parseCampaigns([campaign]).length, 1);
  for (const value of [undefined, campaign, [campaign, campaign], [campaign, null], [{ ...campaign, maxViewsPerDevice: -1 }], [{ ...campaign, maxViewsPerDevice: 1.5 }]]) {
    assert.throws(() => api.parseCampaigns(value));
  }
  const { createCampaignHistory } = require('../src/services/campaignHistory.ts');
  let writes = 0;
  const broken = createCampaignHistory({ getItem: async () => { throw new Error('disk'); }, setItem: async () => { writes++; } });
  await assert.rejects(broken.reconcile([campaign]), /disk/);
  assert.equal(writes, 0);
});

test('installation UUID is generated once, persisted and reused on subsequent launches', async () => {
  const { createInstallationIdentity } = require('../src/services/installationIdentity.ts');
  const id = '550e8400-e29b-41d4-a716-446655440000';
  let saved = null; let generated = 0; let writes = 0;
  const storage = { getItem: async () => saved, setItem: async (_, value) => { writes++; saved = value; } };
  const getId = createInstallationIdentity(storage, () => { generated++; return id; });
  assert.deepEqual(await Promise.all([getId(), getId(), getId()]), [id, id, id]);
  assert.equal(generated, 1); assert.equal(writes, 1);
  const reopened = createInstallationIdentity(storage, () => { throw new Error('must reuse UUID'); });
  assert.equal(await reopened(), id);
});

test('failed identity persistence prevents campaign requests', async t => {
  service();
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const { createOpeningCampaignLoader } = require('../src/services/startup.ts');
  const { createInstallationIdentity } = require('../src/services/installationIdentity.ts');
  const getId = createInstallationIdentity({ getItem: async () => null, setItem: async () => { throw new Error('disk'); } }, () => '550e8400-e29b-41d4-a716-446655440000');
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests++; throw new Error('unexpected HTTP'); });
  await assert.rejects(createOpeningCampaignLoader(getId, 'android')(), /disk/);
  assert.equal(requests, 0);
});

 test('campaign requests label iOS and skip unsupported platforms', async t => {
  service();
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const { createOpeningCampaignLoader } = require('../src/services/startup.ts');
  const headers = [];
  t.mock.method(global, 'fetch', async (_, options) => {
    headers.push(options.headers);
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  const identity = async () => '550e8400-e29b-41d4-a716-446655440000';
  await createOpeningCampaignLoader(identity, 'ios')();
  assert.equal(headers[0]['X-Platform'], 'IOS');
  await createOpeningCampaignLoader(identity, 'web')();
  assert.equal(headers.length, 1);
});

const geoPolyline = require('@mapbox/polyline');

function walkingService(apiKey) {
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = apiKey ?? '';
  delete require.cache[require.resolve('../src/services/walkingDirections.ts')];
  return require('../src/services/walkingDirections.ts');
}

const ORIGIN = { latitude: 4.8157, longitude: -75.6961 };
const DESTINATION = { latitude: 4.8143, longitude: -75.6946 };

test('straight-line fallback is instant and never calls fetch', t => {
  t.mock.method(global, 'fetch', async () => { throw new Error('fetch should not be called'); });
  const api = walkingService();
  const route = api.straightLineWalkingRoute(ORIGIN, DESTINATION);
  assert.equal(route.source, 'straight-line');
  assert.deepEqual(route.coordinates, [ORIGIN, DESTINATION]);
  assert.ok(route.distanceMeters > 0);
  assert.equal(route.durationSeconds, Math.round(route.distanceMeters / 1.35));
});

test('live mode decodes the real polyline and distance/duration on status OK', async t => {
  const api = walkingService('test-key');
  const points = geoPolyline.encode([[ORIGIN.latitude, ORIGIN.longitude], [DESTINATION.latitude, DESTINATION.longitude]]);
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({
    status: 'OK',
    routes: [{ overview_polyline: { points }, legs: [{ distance: { value: 812 }, duration: { value: 640 } }] }],
  }), { status: 200 }));
  const route = await api.getWalkingRoute(ORIGIN, DESTINATION);
  assert.equal(route.source, 'google-directions');
  assert.equal(route.distanceMeters, 812);
  assert.equal(route.durationSeconds, 640);
  assert.deepEqual(route.coordinates, [ORIGIN, DESTINATION]);
});

test('every non-OK Google status rejects with a specific message', async t => {
  const api = walkingService('test-key');
  const cases = [
    ['ZERO_RESULTS', /no encontró una ruta/],
    ['NOT_FOUND', /ubicar alguno de los puntos/],
    ['OVER_QUERY_LIMIT', /límite de consultas/],
    ['REQUEST_DENIED', /rechazó la solicitud/],
    ['INVALID_REQUEST', /no fue válida/],
    ['UNKNOWN_ERROR', /Error temporal/],
    ['SOMETHING_NEW', /estado no reconocido/],
  ];
  for (const [status, expected] of cases) {
    t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ status }), { status: 200 }));
    await assert.rejects(api.getWalkingRoute(ORIGIN, DESTINATION), expected);
  }
});

test('HTTP failure and caller cancellation are surfaced', async t => {
  const api = walkingService('test-key');
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(api.getWalkingRoute(ORIGIN, DESTINATION), /503/);
  t.mock.method(global, 'fetch', async (_url, { signal }) => {
    assert.equal(signal.aborted, true);
    throw new Error('aborted');
  });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.getWalkingRoute(ORIGIN, DESTINATION, controller.signal), /aborted/);
});

test('a stuck request times out and falls back to a clear message', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = walkingService('test-key');
  t.mock.method(global, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted by timeout')));
  }));
  const pending = assert.rejects(api.getWalkingRoute(ORIGIN, DESTINATION), /tardó demasiado/);
  t.mock.timers.tick(12000);
  await pending;
});

test('missing API key rejects before ever calling fetch', async t => {
  const api = walkingService('');
  t.mock.method(global, 'fetch', async () => { throw new Error('fetch should not be called'); });
  await assert.rejects(api.getWalkingRoute(ORIGIN, DESTINATION), /EXPO_PUBLIC_GOOGLE_MAPS_API_KEY/);
});

test('the API key is never written to the logs', async t => {
  const api = walkingService('super-secret-key');
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  const points = geoPolyline.encode([[ORIGIN.latitude, ORIGIN.longitude], [DESTINATION.latitude, DESTINATION.longitude]]);
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({
    status: 'OK',
    routes: [{ overview_polyline: { points }, legs: [{ distance: { value: 100 }, duration: { value: 80 } }] }],
  }), { status: 200 }));
  await api.getWalkingRoute(ORIGIN, DESTINATION);
  assert.ok(!logs.some(line => line.includes('super-secret-key')));
});

test('route and bus selections retain the station through direction changes and back navigation', () => {
  const { initialMapState, mapSelectionReducer: reduce } = require('../src/services/mapSelection.ts');
  const select = (state, selection) => reduce(state, { type: 'select', selection });
  const station = select(initialMapState, { type: 'station', stationId: 'stop-a' });
  const route = select(station, { type: 'route', routeId: 'r1', variantId: 'out' });
  const inbound = select(route, { type: 'route', routeId: 'r1', variantId: 'in' });
  const bus = select(inbound, { type: 'bus', routeId: 'r1', variantId: 'in', busId: 'bus1' });
  assert.equal(route.selection.stationId, 'stop-a');
  assert.equal(inbound.selection.stationId, 'stop-a');
  assert.equal(bus.selection.stationId, 'stop-a');
  assert.deepEqual(reduce(route, { type: 'back' }).selection, station.selection);
  assert.equal(select(bus, { type: 'station', stationId: 'stop-b' }).selection.stationId, 'stop-b');
  assert.equal(select(reduce(bus, { type: 'clear' }), { type: 'route', routeId: 'r1' }).selection.stationId, undefined);
});

test('route departures filter buses by route and sort station ETAs without mutating the response', () => {
  const { departuresForRoute } = require('../src/services/stationArrivals.ts');
  const variant = { id: 'v', stopSequence: ['s', 'end'] };
  const arrival = (id, routeId, minutes, vehicle = { id }) => ({ id, route: { id: routeId, variants: [variant] }, variant, arrivalMinutes: minutes, vehicle });
  const items = [
    arrival('unknown', 'r1', null), arrival('later', 'r1', 8),
    arrival('other', 'r2', 1), arrival('soon', 'r1', 2),
    arrival('scheduled', 'r1', 1, null), arrival('here', 'r1', 0),
  ];
  // Scheduled departures (no vehicle) are listed too, by time.
  assert.deepEqual(departuresForRoute(items, 's', 'r1').map(item => item.id), ['here', 'scheduled', 'soon', 'later', 'unknown']);
  assert.equal(items[0].id, 'unknown');
  assert.deepEqual(departuresForRoute(items, 's', 'missing'), []);
});
test('journey departures select the boarding route and direction, preserving route-only filtering', () => {
  const { departuresForRoute } = require('../src/services/stationArrivals.ts');
  const outbound = { id: 'outbound', stopSequence: ['s', 'b'] }, inbound = { id: 'inbound', stopSequence: ['b', 's', 'a'] };
  const make = (id, routeId, variant, minutes) => ({ id, route: { id: routeId, variants: [outbound, inbound] }, variant, vehicle: { id }, arrivalMinutes: minutes });
  const arrivals = [
    make('return-bus', 'r1', inbound, 1),
    make('boarding-bus', 'r1', outbound, 4),
    make('other-route', 'r2', outbound, 2),
    make('boarding-first', 'r1', outbound, 2),
  ];
  assert.deepEqual(departuresForRoute(arrivals, 's', 'r1', 'outbound').map(item => item.id), ['boarding-first', 'boarding-bus']);
  assert.deepEqual(departuresForRoute(arrivals, 's', 'r1').map(item => item.id), ['return-bus', 'boarding-first', 'boarding-bus']);
  assert.deepEqual(departuresForRoute(arrivals, 's', 'r1', 'missing'), []);
});
test('at a terminal, a bus ending its trip departs on the next variant after the driver layover', () => {
  const { stationDepartures, departureMinutes, departuresForRoute } = require('../src/services/stationArrivals.ts');
  const outbound = { id: 'out', destinationName: 'Terminal', stopSequence: ['a', 'b', 'T'] };
  const back = { id: 'back', destinationName: 'A', stopSequence: ['T', 'b', 'a'], layoverMinutes: 8 };
  const route = { id: 'r1', code: '1', variants: [outbound, back] };
  const arriving = { id: 'bus1-out', route, variant: outbound, vehicle: { id: 'bus1' }, arrivalMinutes: 5 };
  const [departure] = stationDepartures([arriving], 'T');
  assert.equal(departure.kind, 'terminal');
  assert.equal(departure.variant.id, 'back');
  assert.equal(departureMinutes(departure), 13);
  // Journeys board the departing variant, so the arriving bus must still be found for it.
  assert.deepEqual(departuresForRoute([arriving], 'T', 'r1', 'back').map(item => item.id), ['bus1-out']);
  // The same bus listed again for its next trip is not shown twice.
  const next = { id: 'bus1-back', route, variant: back, vehicle: { id: 'bus1' }, arrivalMinutes: 14 };
  assert.deepEqual(stationDepartures([next, arriving], 'T').map(item => item.id), ['bus1-out']);
  // Without layover data the arrival time is kept and flagged; passing stations are unchanged.
  const unknown = stationDepartures([{ ...arriving, route: { ...route, variants: [outbound, { ...back, layoverMinutes: undefined }] } }], 'T')[0];
  assert.equal(unknown.layoverMinutes, null);
  assert.equal(departureMinutes(unknown), 5);
  assert.equal(stationDepartures([arriving], 'b')[0].kind, 'pass');
  // A line that ends without restarting here cannot be boarded.
  assert.equal(stationDepartures([{ ...arriving, route: { ...route, variants: [outbound] } }], 'T')[0].kind, 'ends');
});
test('scheduled terminal trips: departure time adds the layover, trips ending here are hidden', () => {
  const { stationDepartures, departureAt } = require('../src/services/stationArrivals.ts');
  const outbound = { id: 'out', stopSequence: ['a', 'T'] };
  const back = { id: 'back', stopSequence: ['T', 'a'], layoverMinutes: 10 };
  const route = { id: 'r1', variants: [outbound, back] };
  const scheduled = (id, variant, extra = {}) => ({ id, route, variant, vehicle: null, arrivalMinutes: 30, estimatedArrivalAt: '2026-09-29T11:00:00.000Z', predictionSource: 'schedule', ...extra });
  const [departure] = stationDepartures([scheduled('s1', outbound)], 'T');
  assert.equal(departureAt(departure).toISOString(), '2026-09-29T11:10:00.000Z');
  const withoutNext = { ...route, variants: [outbound] };
  assert.deepEqual(stationDepartures([scheduled('s2', outbound, { route: withoutNext })], 'T'), []);
});
test('route schedule is described per day type and ignores malformed periods', () => {
  const { describeService } = require('../src/services/serviceSchedule.ts');
  assert.deepEqual(describeService([
    { days: 'sunday_holiday', startTime: '06:00', endTime: '20:00', headwayMinutes: 15 },
    { days: 'weekdays', startTime: '05:00', endTime: '24:30', headwayMinutes: 8 },
    { days: 'weekdays', startTime: 'soon', endTime: '10:00', headwayMinutes: 8 },
    { days: 'monday', startTime: '05:00', endTime: '10:00', headwayMinutes: 8 },
    { days: 'saturday', startTime: '05:00', endTime: '21:00', headwayMinutes: 0 },
  ]), [
    'Lunes a viernes: 5:00 a. m.–12:30 a. m. · cada 8 min',
    'Domingos y festivos: 6:00 a. m.–8:00 p. m. · cada 15 min',
  ]);
  assert.deepEqual(describeService(undefined), []);
});
test('station routes collapse both directions into one chip per route', () => {
  const { routesAtStation } = require('../src/services/stationArrivals.ts');
  const route = (id, code) => ({ id, code });
  const serving = [
    { route: route('r10', 'C10'), variant: { id: 'r10-out', stopSequence: ['x', 'T'] } },
    { route: route('r2', 'C2'), variant: { id: 'r2-out', stopSequence: ['T', 'y'] } },
    { route: route('r10', 'C10'), variant: { id: 'r10-back', stopSequence: ['T', 'x'] } },
    { route: route('r2', 'C2'), variant: { id: 'r2-back', stopSequence: ['y', 'T'] } },
  ];
  assert.deepEqual(routesAtStation(serving, 'T').map(item => [item.route.code, item.variant.id]), [['C2', 'r2-out'], ['C10', 'r10-back']]);
});

test('debug logs are written in development and silenced in production', t => {
  const load = env => {
    process.env.EXPO_PUBLIC_APP_ENV = env;
    delete require.cache[require.resolve('../src/services/logger.ts')];
    return require('../src/services/logger.ts');
  };
  const lines = [];
  t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args) => lines.push(args.join(' ')));
  const production = load('production');
  production.logger.log('oculto'); production.logger.warn('oculto');
  assert.equal(production.DEBUG_LOGS, false);
  // Unset: Node has no __DEV__, like a release bundle.
  assert.equal(load('').APP_ENV, 'production');
  const development = load('development');
  development.logger.log('visible');
  assert.deepEqual(lines, ['visible']);
});

function memoryStorage() {
  const items = new Map();
  return { items, getItem: async key => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value); }, removeItem: async key => { items.delete(key); } };
}
function catalogCache(storage = memoryStorage(), secrets = new Map()) {
  const { createCatalogCache } = require('../src/services/catalogCache.ts');
  const crypto = require('node:crypto');
  return createCatalogCache({ storage, randomBytes: length => new Uint8Array(crypto.randomBytes(length)),
    secrets: { getItemAsync: async key => secrets.get(key) ?? null, setItemAsync: async (key, value) => { secrets.set(key, value); } } });
}
const catalogData = { city: { id: 'pereira' }, stops: catalogFixture.stops, stations: catalogFixture.stops, routes: [catalogFixture.route] };

test('catalog cache is encrypted at rest and rejects tampering or a lost key', async () => {
  const storage = memoryStorage(), secrets = new Map();
  const cache = catalogCache(storage, secrets);
  await cache.write({ release: '7', savedAt: 1, data: catalogData });
  const [stored] = storage.items.values();
  assert.ok(!stored.includes('Estación'), 'station names must not be stored in plain text');
  assert.deepEqual(await cache.read(), { release: '7', savedAt: 1, data: catalogData });
  const [key] = storage.items.keys();
  storage.items.set(key, stored.slice(0, -4) + (stored.endsWith('AAAA') ? 'BBBB' : 'AAAA'));
  assert.equal(await cache.read(), null);
  assert.equal(storage.items.size, 0, 'a tampered copy is discarded');
  await cache.write({ release: '7', savedAt: 1, data: catalogData });
  assert.equal(await catalogCache(storage, new Map()).read(), null, 'another key cannot decrypt it');
});

function catalogStore({ cached, release = '1', now = 1000 }) {
  const { createCatalogStore } = require('../src/services/catalogStore.ts');
  const calls = { catalog: 0, writes: [] };
  const cache = { read: async () => cached ?? null, write: async value => { calls.writes.push(value); } };
  const store = createCatalogStore({ cache, now: () => now,
    fetchRelease: async () => { if (release instanceof Error) throw release; return release; },
    fetchCatalog: async () => { calls.catalog++; return { ...catalogData, city: { id: 'fresh' } }; } });
  return { store, calls, settle: () => new Promise(resolve => setTimeout(resolve, 0)) };
}
test('catalog downloads only when the backend release changes', async () => {
  const same = catalogStore({ cached: { release: '1', savedAt: 0, data: catalogData } });
  same.store.start(); await same.settle();
  assert.equal(same.calls.catalog, 0);
  assert.equal(same.store.getState().data.city.id, 'pereira');
  const changed = catalogStore({ cached: { release: '1', savedAt: 999, data: catalogData }, release: '2' });
  changed.store.start(); await changed.settle();
  assert.equal(changed.calls.catalog, 1);
  assert.equal(changed.store.getState().data.city.id, 'fresh');
  assert.deepEqual(changed.calls.writes.map(item => item.release), ['2']);
});
test('without release support the cached catalog refreshes once a day', async () => {
  const { CATALOG_MAX_AGE_MS } = require('../src/services/catalogStore.ts');
  const fresh = catalogStore({ cached: { release: null, savedAt: 0, data: catalogData }, release: null, now: CATALOG_MAX_AGE_MS - 1 });
  fresh.store.start(); await fresh.settle();
  assert.equal(fresh.calls.catalog, 0);
  const stale = catalogStore({ cached: { release: null, savedAt: 0, data: catalogData }, release: null, now: CATALOG_MAX_AGE_MS });
  stale.store.start(); await stale.settle();
  assert.equal(stale.calls.catalog, 1);
});
test('offline opening keeps the cached catalog; first opening without network shows an error', async () => {
  const offline = catalogStore({ cached: { release: '1', savedAt: 0, data: catalogData }, release: new Error('network') });
  offline.store.start(); await offline.settle();
  assert.equal(offline.calls.catalog, 0);
  assert.equal(offline.store.getState().data.city.id, 'pereira');
  assert.equal(offline.store.getState().error, null);
  const { createCatalogStore } = require('../src/services/catalogStore.ts');
  const first = createCatalogStore({ cache: { read: async () => null, write: async () => {} },
    fetchRelease: async () => { throw new Error('network'); }, fetchCatalog: async () => { throw new Error('Sin conexión'); } });
  first.start(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(first.getState(), { data: null, error: 'Sin conexión' });
});
test('catalog release treats a missing endpoint as unsupported, not as an error', async t => {
  const api = service();
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 404 }));
  assert.equal(await api.getCatalogRelease(), null);
  t.mock.method(global, 'fetch', async () => Response.json({ data: { release: 42 } }));
  assert.equal(await api.getCatalogRelease(), '42');
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 500 }));
  await assert.rejects(api.getCatalogRelease(), /500/);
});

test('camera center shifts south so a point sits in the middle of the band visible above a sheet', () => {
  const { centerShowingPointAbove, visibleCenterOffset } = require('../src/services/mapCamera.ts');
  // 800 dp map, 40 dp status bar, sheet covering the bottom 440 dp: visible band 40..360, middle 200.
  assert.equal(visibleCenterOffset(800, 40, 360), 200);
  const station = { latitude: 4.8133, longitude: -75.6961 };
  const center = centerShowingPointAbove(station, 16, 200);
  assert.equal(center.longitude, station.longitude);
  // At zoom 16 near Pereira one dp is ~2.38 m, so 200 dp is ~476 m (~0.0043°) south.
  assert.ok(Math.abs(station.latitude - center.latitude - 0.00428) < 0.0001);
  assert.deepEqual(centerShowingPointAbove(station, 16, 0), station);
});
