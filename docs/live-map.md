# Mapa de transporte: integración en la app existente

## Inspección y decisiones

| Elemento existente | Decisión |
| --- | --- |
| Expo 57 / React Native 0.86 | Mantener proyecto y configuración |
| react-native-maps 1.27.2, Google Maps | Mantener MapView, Marker y Polyline |
| React Navigation con pestañas | Mantener Explorar en su pestaña y manejar Atrás dentro del mapa |
| Context de ubicación | Reutilizar LocationGate y sus permisos; no permitir interacción sin acceso |
| Estado local React; sin Redux/Zustand | Reducer local para selección y almacén local observable para posiciones |
| Modal de estación | Sustituirlo por panel inferior no modal; conservar el Modal de búsqueda |
| Sin librería BottomSheet | Panel con View/Animated/PanResponder existentes, sin dependencias nuevas |
| transit.ts y hooks de consultas | Extenderlos; conservar variable dummy/API |
| Sin cliente WebSocket | Añadir transporte nativo WebSocket dentro de services |

No se creó otra app ni navegación, ni se modificó el backend. Durante el trabajo aparecieron endpoints live en el backend hermano: el adaptador consume ese contrato real, además de soportar versiones antiguas mediante un fallback explícito.

## Etapas y archivos

1. **Selección y panel:** `src/services/mapSelection.ts`, `src/components/map/MapDetailSheet.tsx`, `src/screens/ExploreScreen.tsx`. Una selección principal; historial para Atrás; expansión independiente.
2. **Buses en estación:** `src/services/transit.ts`, `src/components/map/BusMarker.tsx`. Posiciones dummy/REST y chip de bus con código de ruta.
3. **Tiempo real:** `src/services/liveTransport.ts`, `src/services/liveBuses.ts`, `src/hooks/useStationArrivals.ts`. REST primero, conexión al canal, bajas, reconexión y estado normalizado.
4. **Ruta y cámara:** `transit.ts`, `ExploreScreen.tsx`. Consulta de ruta live, geometría por sentido y fitToCoordinates con espacio reservado al panel.
5. **Detalle:** `src/components/map/TransitDetail.tsx`. Rutas de estación, próximos buses, ETA, incidencias, sentidos, paradas ordenadas y bus seleccionado.
6. **Optimización y movimiento:** `src/components/map/TransitMap.tsx`, `BusMarker.tsx`, `MapDetailSheet.tsx`, `src/services/liveProtocol.ts`. Mapa memoizado, suscripción por bus, animación de posición, panel animado y adaptación al protocolo real.

Se verificó TypeScript, pruebas y exportación Android por etapas. No hay configuración de lint independiente en este proyecto.

## Uso y selección

`MapSelection` permite `none`, `station`, `route` o `bus`. Solo una está activa. En selección de bus se conserva su routeId/variantId para consultar su recorrido; el contexto anterior vive únicamente en el historial, no como otra selección activa.

- Tocar estación abre el panel y su canal; minimizar con el chevrón o deslizar el tirador conserva la selección y el stream.
- Tocar un código de ruta o una llegada reemplaza la estación por la ruta/sentido. Se muestra geometría y paradas de esa variante.
- Tocar bus selecciona ese bus y abre el contexto de su ruta.
- Atrás del panel vuelve a la selección anterior. Atrás de Android minimiza primero y luego vuelve.
- La X con etiqueta “Quitar selección del mapa” sí limpia la selección; es distinta de minimizar.
- El botón de ubicación recentra sin eliminar la selección.
- Se conserva el bloqueo de ubicación, la búsqueda y la navegación existente.

## Variables

```dotenv
EXPO_PUBLIC_USE_DUMMY_DATA=true
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
EXPO_PUBLIC_WS_URL=
```

Con `EXPO_PUBLIC_USE_DUMMY_DATA=true`, los buses se actualizan cada 2 segundos con movimiento de demostración sobre los recorridos locales, identificados como simulación. No se abre una conexión de red en ese modo. Con `false`, se consume el backend. El valor de `.env` determina el modo activo; `.env.example` propone `true`.

Para API, usar `false`. Si `EXPO_PUBLIC_WS_URL` está vacío, se deriva de API_URL: `http://host/api/v1` → `ws://host/api/v1/live`; HTTPS → WSS. Se puede configurar explícitamente otro host. Cambiar `.env` requiere reiniciar Metro; en release requiere un nuevo bundle.

## REST del backend actual

La base sigue siendo `/api/v1`, no `/api`.

### GET /stations/:id/arrivals

Se conserva `{data: {station, servingRoutes, arrivals}, meta}`. Cada llegada del backend incluye `id`, `vehicle.id`, `route`, `variant`, `busId`, `routeId`, `variantId`, `tripId`, `latitude`, `longitude`, `headingDegrees`, `arrivalMinutes`, `estimatedArrivalAt`, `predictionSource`, `lastPositionAt`, `nextStationId` y `live`.

El adaptador extrae las posiciones de esas llegadas y las normaliza en `LiveBusStore`. `shape_speed` se presenta como estimación basada en GPS, no como garantía exacta. Rutas sin buses siguen siendo seleccionables desde `servingRoutes`.

### GET /routes/:id/live

Contrato actual del backend:

```ts
{
  data: {
    route: RouteOption;
    variants: Array<{
      id: string;
      direction: 'outbound' | 'return';
      shape: RouteVariant['geometry'];
      stations: Array<Location & { stopSequence: number }>;
    }>;
    buses: Array<{
      busId: string;
      vehicleId: string;
      routeId: string;
      variantId: string;
      tripId: string | null;
      latitude: number;
      longitude: number;
      headingDegrees: number | null;
      measuredAt: string;
      nextStationId: string | null;
      stale: boolean;
      live: boolean;
    }>;
    updatedAt: string;
  };
  meta: { source: 'live' };
}
```

El servicio adapta `variants[].shape` a coordenadas y obtiene las estaciones de `variants[].stations`. `route.variants[].stopSequence` conserva el orden y las repeticiones. No usa una línea recta entre estaciones como geometría real si falta el shape. Polyline codificada usa precisión 5, igual que el cliente anterior.

Un 404 en `/live` permite cargar `/routes/:id` y `/stops`, sin buses inventados y mostrando “servicio en vivo aún no disponible”. Otros errores no activan ese fallback.

Campos opcionales internos `incidents` y `nextDepartures` pueden mostrarse si el backend los proporciona. Hoy no se inventan incidencias, horarios, estación actual o ETA de ruta si esos datos no existen. La próxima estación se toma de `nextStationId`.

## WebSocket real

Endpoint `/api/v1/live`. Conexión después de REST y una sola selección activa:

```json
{"type":"subscribe","channels":["station:stop-intercambiador-cuba"]}
```

Respuesta: `subscribed` con `channels`, eventos iniciales con `snapshot: true`, luego `snapshot_end` con `channel`. La UI marca el canal conectado después de completar ese snapshot.

Eventos soportados:

| Evento | Acción |
| --- | --- |
| `arrival_update` | Actualizar/agregar llegada por id y posición del bus; routeId/variantId se resuelven contra servingRoutes |
| `arrival_removed` | Quitar esa ocurrencia de llegada; quitar marker si no quedan llegadas del bus |
| `bus_position` | Actualizar bus por busId/vehicleId, posición, orientación y próxima estación |
| `bus_removed` | Quitar bus |
| `snapshot_end` | Conciliar membresía inicial con el snapshot completo |

Solo se aceptan eventos del canal activo. Para rutas se usa `route:ROUTE_ID`; el detalle de bus comparte el canal de su ruta. Al abandonar la selección:

```json
{"type":"unsubscribe","channels":["station:stop-intercambiador-cuba"]}
```

Se cierra el socket, se cancelan fetches y timers. Se pausa al pasar a segundo plano, salir de Explorar o perder permiso/servicio de ubicación. Al volver se carga REST y se suscribe otra vez. Colapsar el panel no cancela nada.

Reconexión con espera exponencial de 1 a 30 segundos y nueva consulta REST. Timeout de suscripción: 15 segundos. El servidor usa frames ping/pong del protocolo; el cliente nativo responde automáticamente. No se envían mensajes JSON `ping`, porque el servidor no los admite.

REST se refresca también periódicamente (30 segundos o intervalo informado), para reconciliar datos y permitir consultar con WebSocket desconectado. Los eventos recibidos durante una consulta se reaplican después de su snapshot para no perder cambios recientes.

## Render y animaciones

- `TransitMap` y markers usan `React.memo`; callbacks y geometría permanecen estables cuando no cambian.
- `LiveBusStore` normaliza por busId; una posición solo notifica al marker/fila de ese bus. La lista de IDs cambia solo al agregar/quitar miembros.
- No se crean markers con keys basadas en fecha ni coordenadas.
- Android utiliza `animateMarkerToCoordinate`; iOS utiliza `Marker.Animated` y `AnimatedRegion`. Interpolación: 700 ms.
- `tracksViewChanges` se activa brevemente al cambiar el aspecto del chip y se desactiva después; no queda calculando el bitmap indefinidamente.
- Posiciones con más de 90 segundos, inválidas o sin fecha se ocultan del mapa; el detalle muestra estado no disponible. Comprobación local cada 5 segundos, incluso si no llegan eventos.
- Se rechazan coordenadas fuera de rango y observaciones más antiguas que la última aceptada.
- La cámara se ajusta al seleccionar/cambiar sentido o tamaño del panel, no en cada actualización GPS.

## Verificación y límites

```bash
npm run typecheck
npm test
npx expo export --platform android --output-dir /tmp/bus-pereira-live-export
```

Pruebas automatizadas: selección exclusiva y retorno, panel independiente, notificaciones por bus, GPS antiguo/inválido, suscripción, filtrado de canal, reconexión, cancelación, formatos del backend, ausencia de shape y fallback solo en 404. Se verificó además el cliente contra REST y WebSocket del backend usando una base de datos en memoria.

Validación manual pendiente en dispositivo/emulador: apariencia y movimiento del marker nativo, arrastre del panel, viewport con distintos tamaños, accesibilidad y recuperación después de apagar GPS/red. Una exportación JS no reemplaza esa prueba nativa ni genera un APK.

Recorrido de prueba: estación → minimizar → observar buses → expandir → elegir ruta → cambiar sentido → tocar bus → Atrás. Repetir con backend sin buses, WebSocket desconectado, geometría ausente y permisos de ubicación revocados. Comprobar que no aparecen ETA/posiciones falsas en modo API.
