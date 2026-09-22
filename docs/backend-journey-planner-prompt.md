# Prompt para el repositorio del backend

Copia todo el contenido a partir de la siguiente línea al agente que trabaja en el backend. Es autocontenido; no necesita acceder al repositorio móvil.

---

Implementa el planificador de viajes puerta a puerta para Bus Pereira. El móvil React Native/Expo ya fue adaptado al siguiente contrato propuesto v1. Revisa primero las instrucciones del repositorio, la arquitectura, los modelos, endpoints y datos reales. Trabaja en el backend y completa implementación, documentación y pruebas; no te limites a proponer un plan.

## Objetivo

Recibir origen/destino como coordenadas arbitrarias y devolver hasta tres itinerarios útiles, incluyendo caminata inicial, uno o varios buses en su sentido correcto, transbordos (también caminando entre paradas distintas) y caminata final. Poder devolver solo caminata cuando sea razonable. Elegir las paradas como parte de la optimización del viaje completo.

El móvil dejó de elegir las cinco paradas más cercanas y la primera pareja con ruta directa. Ya NO llama a Google Directions para este flujo. Todas las caminatas y geometrías de los itinerarios deben venir del backend.

## Endpoint requerido

`POST /journeys/plan` relativo al prefijo existente del API; por ejemplo, `/api/v1/journeys/plan`. JSON de entrada y salida. No cambiar los endpoints existentes `/city`, `/stops`, `/stations`, `/routes` ni sus IDs.

Ejemplo de petición:

```json
{
  "origin": { "latitude": 4.8100, "longitude": -75.7300 },
  "destination": { "latitude": 4.8200, "longitude": -75.6900 },
  "departureTime": "2026-09-21T15:00:00.000Z",
  "preferences": {
    "maxWalkingDistanceMeters": 1500,
    "maxTransfers": 2,
    "optimize": "fastest"
  }
}
```

La fecha anterior es ilustrativa: el móvil siempre envía la hora actual. Interpretar calendarios/horarios con America/Bogota e intercambiar fechas con zona horaria explícita.

Los puntos pueden incluir `stopId` SOLO cuando el usuario seleccionó expresamente una estación/parada. Ese ID fija el extremo solicitado; no sustituirlo silenciosamente por una parada cercana. Si es una estación con varias plataformas, modelar sus accesos/caminatas internos. Validar ID y coordenadas: devolver 422 ante inconsistencias fuera de la tolerancia documentada, no ignorarlas.

## Contrato TypeScript del cliente

Estos tipos describen el JSON, no obligan a usar TypeScript en el backend. Todos los campos no opcionales son obligatorios, incluidos los `null` y arrays vacíos.

```ts
type Coordinate = { latitude: number; longitude: number };

export type JourneyPreference = 'fastest' | 'least_walking' | 'fewest_transfers';
export type JourneyPoint = Coordinate & { stopId?: string };
export type JourneyRequest = {
  origin: JourneyPoint;
  destination: JourneyPoint;
  departureTime: string;
  preferences: {
    maxWalkingDistanceMeters: number; // Total across ALL walking legs.
    maxTransfers: number;
    optimize: JourneyPreference;
  };
};
export type JourneyPlace = Coordinate & { name: string; stopId?: string };
type LegBase = {
  id: string;
  from: JourneyPlace;
  to: JourneyPlace;
  durationSeconds: number;
  distanceMeters: number;
  geometry: { coordinates: Coordinate[]; source: 'network' | 'approximate' };
};
export type WalkLeg = LegBase & { mode: 'walk' };
export type BusLeg = LegBase & {
  mode: 'bus';
  routeId: string;
  variantId: string;
  routeCode: string;
  headsign: string;
  color: string;
  // Includes waiting + minimum boarding/transfer buffer BEFORE this ride.
  waitSeconds: number | null;
  timingSource: 'schedule' | 'frequency' | 'realtime' | 'estimated' | 'unavailable';
};
export type JourneyLeg = WalkLeg | BusLeg;
export type Itinerary = {
  id: string;
  legs: JourneyLeg[];
  // Null if any waiting time is unknown; never claim a full ETA in that case.
  durationSeconds: number | null;
  walkingDistanceMeters: number;
  transfers: number;
  warnings: string[];
};
export type JourneyResponse = {
  data: { itineraries: Itinerary[] };
  meta: {
    contractVersion: 1;
    generatedAt: string;
    source: 'demo' | 'backend';
    // Required only for an empty result, which is different from service failure.
    noRouteReason?: 'outside_coverage' | 'no_service' | 'no_connection' | 'walking_limit';
  };
};

```

## Semántica obligatoria para interoperar

- Metros y segundos numéricos no negativos y finitos; coordenadas WGS84 `{latitude, longitude}`. Colores `#RRGGBB`.
- `source: "backend"` en producción; `contractVersion: 1`. `generatedAt` ISO 8601 con zona horaria.
- IDs de itinerario únicos dentro de la respuesta y de tramo únicos dentro del itinerario.
- Los extremos del primer y último tramo conservan las coordenadas originales y los `stopId` solicitados. El móvil tolera 0.00001 grados por eje. No eliminar el acceso/egreso al ajustar a la red.
- Cada tramo contiene sus lugares con nombre y al menos dos coordenadas de geometría. La geometría de bus corresponde SOLO al segmento abordado, nunca a toda la variante.
- Los tramos consecutivos se conectan en el mismo punto; tolerancia de 0.00001 grados por eje. Si ambos extremos declaran `stopId`, debe coincidir. Para cambiar entre paradas/plataformas distintas se necesita un tramo `walk` explícito, incluso dentro de una estación.
- Un tramo `bus` es un abordaje: contiene ruta, variante/sentido, letrero de destino, parada de subida y bajada. No partir cada intervalo entre paradas en otro tramo de bus.
- `waitSeconds` incluye espera y margen de abordaje antes de ese bus. La caminata intermedia está en otro tramo y NO se cuenta nuevamente como espera. No sumar un margen dos veces si ya quedó incluido en el horario de partida.
- `timingSource` describe la calidad del tiempo del tramo. Si se estima velocidad o espera, no marcarlo como `realtime` ni `schedule`. `frequency` es estimación por frecuencia, no garantía de un vehículo concreto. Si la espera no está disponible, `waitSeconds: null` y `timingSource: "unavailable"` (y viceversa).
- `Itinerary.durationSeconds` = suma de duraciones de todos los tramos + suma de esperas de todos los buses. Si alguna espera es desconocida, total `null`. El móvil valida la suma con tolerancia de 2 s; no incluir penalizaciones artificiales de ranking en los tiempos físicos.
- `walkingDistanceMeters` = suma de distancias de TODOS los tramos `walk`, incluidos acceso, transbordos y egreso; tolerancia de 2 m. Respetar el límite TOTAL, no aplicarlo por tramo.
- `transfers = max(0, número de tramos bus - 1)` y no supera la preferencia.
- `warnings` contiene mensajes breves en español que el móvil puede mostrar, sin detalles técnicos internos. Identificar estimaciones, datos incompletos y limitaciones reales.
- `geometry.source` puede ser `network` o `approximate`. Una aproximación geométrica no autoriza a inventar conectividad peatonal. Si no se puede comprobar el paso a pie, no tratar una línea recta como prueba de que se puede caminar.
- Viajes solo caminando: un tramo `walk` y 0 transbordos; origen y destino iguales también deben producir una respuesta consistente (puede ser un tramo de duración/distancia 0 con dos puntos iguales).
- Ordenar las alternativas según `optimize`: `fastest`, `least_walking` o `fewest_transfers`. Para tiempos incompletos, explicar que el orden es aproximado y no prometer una llegada exacta. El móvil respeta el orden recibido.
- No devolver tres copias casi idénticas del mismo viaje. Favorecer diversidad útil de líneas, caminata o transbordos; conservar la mejor opción para la preferencia solicitada.
- Sin resultados válidos: HTTP 200 con `itineraries: []` y `meta.noRouteReason` obligatorio (`outside_coverage`, `no_service`, `no_connection`, `walking_limit`). Omitir esa propiedad cuando sí hay resultados. No atribuir falta de rutas a una causa que los datos no permiten demostrar.
- Validación de entrada: 400/422; límites de uso: 429; error temporal de proveedor/motor o datos esenciales faltantes: 503 u otro 5xx apropiado. NO devolver lista vacía como si no existiera una conexión cuando el cálculo falló. El cliente usa timeout de 15 s y reintento manual.

## Ejemplo mínimo de respuesta exitosa

Ejemplo sintético solo caminando para una petición con origen `(4.8100, -75.7300)` y destino `(4.8110, -75.7290)`. No son instrucciones de viaje reales. Para transbordos, concatenar tramos bus/walk respetando las reglas anteriores.

```json
{
  "data": {
    "itineraries": [{
      "id": "example-walk",
      "legs": [{
        "id": "walk-1",
        "mode": "walk",
        "from": { "latitude": 4.8100, "longitude": -75.7300, "name": "Origen" },
        "to": { "latitude": 4.8110, "longitude": -75.7290, "name": "Destino" },
        "durationSeconds": 120,
        "distanceMeters": 160,
        "geometry": {
          "coordinates": [
            { "latitude": 4.8100, "longitude": -75.7300 },
            { "latitude": 4.8110, "longitude": -75.7290 }
          ],
          "source": "approximate"
        }
      }],
      "durationSeconds": 120,
      "walkingDistanceMeters": 160,
      "transfers": 0,
      "warnings": ["Ejemplo sintético del contrato; no representa un viaje real."]
    }]
  },
  "meta": {
    "contractVersion": 1,
    "source": "backend",
    "generatedAt": "2026-09-21T15:00:00.000Z"
  }
}
```

Sin conexión (búsqueda completada, no fallo del servicio):

```json
{
  "data": { "itineraries": [] },
  "meta": {
    "contractVersion": 1,
    "source": "backend",
    "generatedAt": "2026-09-21T15:00:00.000Z",
    "noRouteReason": "no_connection"
  }
}
```

## Cómo resolver la búsqueda

1. Auditar qué datos existen realmente: paradas/plataformas, variantes dirigidas, secuencias de paradas, geometrías, horarios/calendarios/frecuencias, permisos de abordaje/bajada, reglas de transbordo, posiciones en vivo y antigüedad. No inventar horarios ni sustituir la red por ejemplos de producción.
2. Considerar varias paradas de acceso y egreso dentro del presupuesto peatonal. Usar un índice espacial y distancia geográfica para prefiltrar; verificar accesibilidad, tiempo y distancia reales sobre red peatonal. No quedarse con una sola parada ni cinco vecinas sin evaluar conexiones. Los límites de exploración deben justificarse y documentar su efecto.
3. Respetar el orden y sentido de cada variante, incluido el caso de una parada repetida en una ruta circular. Una intersección visual de polilíneas NO es una conexión. Dos paradas cercanas NO son necesariamente accesibles entre sí.
4. Buscar simultáneamente acceso + transporte + conexiones + egreso; considerar viajes directos y hasta dos transbordos, configurable desde la petición. Permitir transbordos autorizados en la misma parada y entre paradas distintas mediante caminos peatonales válidos. No excluir una buena alternativa por preferir primero la parada más cercana.
5. Evaluar caminata, tiempo en vehículo, esperas, margen de transbordo y horarios/calendarios cuando existan. Verificar que se puede abordar el segundo bus a la hora de llegada; distinguir una conexión topológica de una conexión temporal confirmada.
6. Elegir el motor según los datos y la arquitectura: si hay GTFS válido, evaluar un adaptador de OpenTripPlanner u otro motor adecuado; si faltan horarios, implementar una búsqueda dirigida con estado que distinga variante/abordaje y transbordos. No aplicar Dijkstra sobre simples paradas de modo que cambiar de línea sea gratis. No introducir un servicio pesado sin necesidad ni exigir GTFS como condición si los datos actuales permiten un MVP honesto.
7. Sin horarios/frecuencias suficientes, ofrecer recorridos topológicamente posibles con estimaciones claramente identificadas o espera desconocida y total null; no asegurar que estén operativos a una hora específica. Informar las carencias que impidan calcular con seguridad.
8. Preparar en memoria el grafo/catálogo versionado; precalcular conexiones peatonales entre paradas. Cachear caminatas/topología según permisos del proveedor y cambios de datos. Si cacheas resultados por zona/hora, volver a validar extremos exactos, restricciones, hora y vigencia: no devolver acceso/egreso de otro usuario o esperar un bus que ya pasó.
9. Respetar las políticas del proveedor de mapas. Claves privadas del proveedor se mantienen en el servidor. No registrar coordenadas precisas del usuario por defecto. Medir latencia, tamaño de búsqueda, uso del proveedor y versión del catálogo sin datos de ubicación personales.

## Pruebas mínimas

- Origen y destino libres donde la parada geográficamente más cercana no sirve y otra accesible sí.
- Comparación entre varios accesos/egresos: caminar más puede mejorar el viaje total.
- Bus directo; uno y dos transbordos; límite 0 que excluye conexiones; conexión peatonal entre dos IDs de parada distintos.
- Sentido contrario inválido, ruta circular con parada repetida y cambio de vehículo contado correctamente.
- Paradas cercanas separadas por una barrera peatonal; cruce de líneas sin punto permitido para transbordo.
- Espera inicial y después de cada transbordo, margen mínimo, calendario sin servicio y conexión perdida por horario cuando esos datos existan.
- Esperas desconocidas, geometría aproximada identificada y total null sin ETA falso.
- Límite TOTAL de caminata incluyendo conexiones; solo caminar; extremos iguales; fuera de cobertura.
- Orden y diversidad según las tres preferencias, sin bucles innecesarios ni duplicados.
- Validación de request y response, IDs coherentes con catálogo, sumas de métricas, continuidad y geometrías recortadas.
- Caída del proveedor distinta de “no se encontró ruta”; caché sin contaminación entre peticiones; presupuesto de latencia compatible con 15 s.

## Entregables

Implementa los cambios y ejecútalos contra las pruebas del repositorio. Entrega:

1. Endpoint y motor/adaptador funcionando con los datos disponibles, sin modificar silenciosamente el contrato móvil.
2. OpenAPI/JSON Schema y DTO definitivos, incluyendo todas las unidades, nulabilidad y reglas de error.
3. Respuestas JSON de integración para viaje directo, transbordo con caminata, solo caminar, espera desconocida y lista vacía. Identificar fixtures sintéticos frente a datos reales.
4. Variables de entorno, pasos de carga/preparación de datos, cambios de base de datos necesarios y cómo arrancar/probar. Explicar limitaciones de datos y rendimiento medido.
5. Un archivo `docs/mobile-journey-handoff.md` con el contrato final, ejemplos y cualquier diferencia que el móvil deba adaptar. Si el contrato propuesto no encaja, documenta la diferencia concreta y su razón; conserva compatibilidad mediante un adaptador cuando sea posible.

No publicar ni desplegar por este pedido. Termina con lo implementado, pruebas realizadas y lo que sigue pendiente por falta real de datos o credenciales.
