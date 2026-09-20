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
function service(dummy) {
  process.env.EXPO_PUBLIC_USE_DUMMY_DATA = dummy ? 'true' : 'false';
  process.env.EXPO_PUBLIC_API_URL = 'http://backend.example/api/v1/';
  delete require.cache[require.resolve('../src/services/transit.ts')];
  return require('../src/services/transit.ts');
}
test('dummy mode makes no HTTP requests and keeps arrivals linked to their station', async t => {
  t.mock.method(global, 'fetch', async () => { throw new Error('HTTP forbidden in dummy mode'); });
  const api = service(true);
  const catalog = await api.getCatalog();
  assert.ok(catalog.routes.length > 0);
  assert.ok(catalog.stations.every(stop => stop.type !== 'poi'));
  const { data, meta } = await api.getArrivals(catalog.stations[0].id);
  assert.equal(meta.source, 'demo');
  assert.ok(data.arrivals.length > 0);
  assert.ok(data.arrivals.every(item => item.variant.stopSequence.includes(data.station.id)));
  assert.equal((await api.getProducts()).length, 3);
});
test('API mode uses the new endpoints and unwraps data without dummy fallback', async t => {
  const api = service(false);
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
  const api = service(false);
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
  assert.equal(route.selection.stationId, undefined);
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
  const { routeOptions, mockStops } = require('../src/data/mockData.ts');
  const route = structuredClone(routeOptions[0]);
  const variant = route.variants[0];
  const rawBus = { busId: 'native-bus', vehicleId: 'native-bus', routeId: route.id, variantId: variant.id,
    latitude: 4.81, longitude: -75.7, headingDegrees: 80, measuredAt: new Date().toISOString(), live: true, stale: false, nextStationId: mockStops[1].id };
  const rawArrival = { ...rawBus, id: 'arrival-1', route, variant, vehicle: { id: rawBus.busId, publicLabel: 'BUS 1' },
    lastPositionAt: rawBus.measuredAt, arrivalMinutes: 3, predictionSource: 'shape_speed' };
  const api = service(false);
  t.mock.method(global, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/arrivals')
    ? { data: { station: mockStops[0], servingRoutes: [{ route, variant }], arrivals: [rawArrival] }, meta: { source: 'live' } }
    : { data: { route, variants: route.variants.map(v => ({ id: v.id, shape: v.geometry, stations: mockStops })), buses: [rawBus], updatedAt: rawBus.measuredAt }, meta: { source: 'live' } })));
  const station = await api.getArrivals(mockStops[0].id);
  assert.equal(station.data.buses[0].id, 'native-bus');
  assert.equal(station.data.buses[0].coordinate.latitude, 4.81);
  assert.equal(station.data.arrivals[0].predictionSource, 'gps');
  const live = await api.getRouteLive(route.id);
  assert.equal(live.data.buses[0].routeCode, route.code);
  assert.equal(live.data.buses[0].nextStopId, mockStops[1].id);
  assert.equal(live.data.buses[0].etaMinutes, null);
  assert.equal(live.meta.liveAvailable, true);
  assert.equal(live.meta.refreshAfterSeconds, 30);
  assert.equal(live.data.stops.length, mockStops.length);
  for (const shape of live.data.shapes) {
    const v = route.variants.find(v => v.id === shape.variantId);
    if (v.geometry.status !== 'ready') assert.deepEqual(shape.coordinates, []);
  }
});

test('route live fallback is limited to 404, never turns errors into dummy buses', async t => {
  const api = service(false);
  const { routeOptions, mockStops } = require('../src/data/mockData.ts');
  const route = structuredClone(routeOptions[0]);
  route.variants.forEach(v => { v.geometry = { provider: 'manual', status: 'pending', coordinates: [], encodedPolyline: null }; });
  t.mock.method(global, 'fetch', async url => url.endsWith('/live') ? new Response('{}', { status: 404 })
    : new Response(JSON.stringify({ data: url.endsWith('/stops') ? mockStops : route })));
  const live = await api.getRouteLive(route.id);
  assert.equal(live.meta.liveAvailable, false);
  assert.deepEqual(live.data.buses, []);
  assert.ok(live.data.shapes.every(shape => shape.coordinates.length === 0));
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 500 }));
  await assert.rejects(api.getRouteLive(route.id), /500/);
});

test('dummy route preserves variant shapes and explicitly simulated moving buses', async () => {
  const api = service(true);
  const catalog = await api.getCatalog();
  const live = await api.getRouteLive(catalog.routes[0].id);
  assert.equal(live.meta.source, 'demo');
  assert.ok(live.data.buses.length > 0);
  assert.ok(live.data.buses.every(bus => bus.source === 'demo' && bus.live === false));
  assert.ok(live.data.shapes.every(shape => catalog.routes[0].variants.some(v => v.id === shape.variantId)));
});

test('opening uses public campaign contract and deduplicates counted requests', async t => {
  service(false);
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
  service(false);
  delete require.cache[require.resolve('../src/services/startup.ts')];
  const api = require('../src/services/startup.ts');
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 403 }));
  await assert.rejects(api.getMyPasses('test', new AbortController().signal), error => error.status === 403);
});

 test('campaign null and failure are retained without counting a second request', async t => {
  service(false);
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
  service(false);
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
  service(false);
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
