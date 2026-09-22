# Planificación de viajes en el móvil

## Estado de integración

El móvil está preparado para un **contrato propuesto v1**. No se ha implementado ni verificado el backend desde este repositorio.
`EXPO_PUBLIC_USE_DUMMY_DATA=false` activa `POST ${EXPO_PUBLIC_API_URL}/journeys/plan`; el URL base ya incluye el prefijo del API (por ejemplo `/api/v1`).
Un backend sin ese endpoint muestra un mensaje de indisponibilidad y permite reintentar. No se vuelve silenciosamente al cálculo anterior ni a datos demo.

- Definiciones: [`src/types/journey.ts`](../src/types/journey.ts).
- Consumo y validación: [`src/services/journeys.ts`](../src/services/journeys.ts).
- Integración React: [`src/hooks/useJourneyPlan.ts`](../src/hooks/useJourneyPlan.ts).
- Petición y respuesta sintéticas con caminata de transbordo: [examples/journey-plan.json](examples/journey-plan.json).
- Prompt autocontenido para el otro repositorio: [backend-journey-planner-prompt.md](backend-journey-planner-prompt.md).

## Comportamiento

El cliente envía coordenadas originales; solo agrega `stopId` si el usuario seleccionó expresamente una estación/parada. Nunca busca primero una parada cercana ni envía el ID ficticio de un punto del mapa.
El backend decide acceso, bajada y conexiones de cada alternativa. El catálogo existente se conserva para las sugerencias y la región inicial del mapa.

La consulta se dispara al completar ambos extremos y cambiar las preferencias. Hay 250 ms de espera para agrupar cambios rápidos, cancelación de la consulta anterior y descarte de respuestas obsoletas. Al limpiar/invertir/cambiar los puntos se oculta inmediatamente el itinerario anterior.
Cada consulta y cada reintento incluyen una nueva `departureTime` ISO 8601 para salir ahora. El botón de actualizar permite volver a consultar; no hay seguimiento de navegación ni actualización automática de horarios en esta pantalla.

Preferencias actuales: `fastest`, `least_walking`, `fewest_transfers`; caminata máxima **total** de 500, 1000, 1500 o 2500 m; entre 0 y 2 transbordos. Predeterminado: 1500 m, 2 transbordos y `fastest`.

Las tarjetas representan itinerarios, no líneas de bus. Cambiar de tarjeta cambia todos los tramos y los marcadores del mapa. Se muestran subida, bajada, sentido, caminata entre paradas, espera/abordaje y pasos de cada conexión.
El mapa dibuja solo la alternativa seleccionada y ajusta su encuadre. Los tramos aproximados están identificados; una línea no demuestra accesibilidad peatonal.

Se distinguen cálculo en curso, fallo de servicio, respuesta incompatible y búsqueda exitosa sin itinerarios. Si falta una espera, el total es `null` y la interfaz dice “Tiempo total no disponible”.
No se reutilizan itinerarios en una caché persistente: las esperas dependen de la hora y el backend aún no define una vigencia. Se mantiene el resultado actual en memoria hasta cambiar la consulta o actualizar.

## Contrato y reglas

Enviar JSON por POST (sin coordenadas en el URL). Responder JSON con `{ data: { itineraries: [...] }, meta: { contractVersion: 1, source: "backend", generatedAt } }`.
Los campos completos y un ejemplo figuran en el prompt del backend.

- Coordenadas WGS84 en objetos `{ latitude, longitude }`, nunca arrays ambiguos `[lng, lat]`.
- Metros y segundos como números finitos no negativos, nunca strings de presentación.
- Cada tramo tiene `id`, `mode`, `from`, `to`, `durationSeconds`, `distanceMeters` y `geometry`.
- `geometry.coordinates` lleva al menos dos puntos y el segmento específico del viaje; no la ruta completa del bus. `source` es `network` o `approximate`.
- Cada tramo bus incluye `routeId`, `variantId`, `routeCode`, `headsign`, `color` hexadecimal de seis dígitos, `waitSeconds` y `timingSource`. Sus extremos incluyen `stopId`.
- `waitSeconds` incluye toda la espera más el margen de abordaje previo al tramo de bus. La caminata de un transbordo es un tramo aparte y no se cuenta de nuevo en esa espera.
- `timingSource`: `schedule`, `frequency`, `realtime`, `estimated` o `unavailable`. `unavailable` exige `waitSeconds: null`, y viceversa.
- `durationSeconds` del itinerario suma las duraciones de TODOS los tramos y las esperas de TODOS los buses, o es `null` si alguna espera es desconocida. Tolerancia de redondeo del cliente: 2 segundos.
- `walkingDistanceMeters` suma TODAS las caminatas; tolerancia de redondeo de 2 m. No exceder la preferencia del usuario.
- `transfers = max(0, cantidad de tramos bus - 1)` y no excede `maxTransfers`.
- Tramos consecutivos comparten el punto físico y, si ambos declaran `stopId`, el mismo ID. Si son distintas paradas, incluir un tramo peatonal explícito, aunque estén dentro de la misma estación.
- Los extremos del itinerario conservan las coordenadas de la petición (tolerancia de validación: 0.00001 grados por eje) y el `stopId` explícito. El ajuste a una red no elimina el acceso/egreso desde el punto original.
- IDs de itinerarios únicos por respuesta; IDs de tramos únicos dentro de un itinerario.
- `warnings` es una lista de mensajes en español para el usuario; puede estar vacía.
- Una caminata sin bus es válida y tiene 0 transbordos. Mantener al menos un tramo incluso si origen y destino coinciden.
- Sin itinerarios: HTTP 200, lista vacía y `meta.noRouteReason` obligatorio: `outside_coverage`, `no_service`, `no_connection` o `walking_limit`. Omitir esa propiedad cuando hay resultados.
- Un fallo del proveedor o del motor no es “sin ruta”: devolver error HTTP. El móvil distingue 400/422, 404/405/501, 429 y otros errores. Timeout del móvil: 15 s.

## Demo y límites

`EXPO_PUBLIC_USE_DUMMY_DATA=true` evita todas las llamadas de planificación. Usa solo el pequeño catálogo dummy, respeta el orden/sentido de las variantes y busca hasta dos transbordos en paradas compartidas. Compara varios puntos de acceso y egreso y puede devolver solo caminata.
Las distancias peatonales son rectas; velocidad y espera son ficticias. La interfaz lo indica. No es un motor offline de producción y no infiere transbordos caminando entre paradas distintas.

El servicio de Google Directions anterior permanece en el repositorio pero Viaje ya no lo usa. No se requieren nuevas dependencias nativas ni cambios de API keys para esta integración.

## Verificación

`npm run typecheck` y `npm test` cubren contrato, transporte HTTP, errores, cancelación/timeout, datos inválidos, esperas desconocidas, destinos libres, dirección y conexiones del demo.

Verificar en dispositivo cuando el backend esté disponible:

1. Punto libre → punto libre: acceso y egreso pertenecen a la alternativa elegida.
2. Viaje con 1–2 transbordos: pasos, esperas, marcadores y caminata intermedia coinciden.
3. Seleccionar otra alternativa actualiza todo el mapa; invertir/limpiar durante una consulta no muestra la respuesta vieja.
4. Cambiar límite de caminata y transbordos, ordenar por cada preferencia y actualizar hora de salida.
5. Probar sin resultados, sin servicio horario, fuera de cobertura, red caída y endpoint inexistente.
6. Esperas desconocidas no producen un ETA ficticio; advertencias son visibles en el paso a paso.

Para cerrar la integración, traer del backend su OpenAPI/DTO definitivo y respuestas reales para: directo, conexión caminando, solo caminata, espera desconocida y ningún resultado. Si cambian los campos, actualizar el adaptador y las pruebas antes de liberar.
