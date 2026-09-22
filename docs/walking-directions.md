# Ruta a pie real en Viaje

> Documento histórico: Viaje ahora consume itinerarios completos mediante `POST /journeys/plan`.
> Ya no selecciona paradas con `getNearestStops` ni llama a Google Directions desde esta pantalla.
> Ver [el contrato actual](journey-planning.md). El servicio y sus pruebas anteriores se conservan como código heredado.

## Qué resuelve

En Viaje, el origen/destino puede ser un punto libre (mapa, "mi ubicación", o una estación). El tramo caminando entre ese punto libre y la estación más cercana ya elegida (`getNearestStop`, sin cambios) se dibujaba como una línea recta. Ahora ese tramo se calcula con la Directions API de Google (`mode=walking`), llamada directamente desde el móvil con la misma API key ya embebida en `app.json`. No hay backend propio involucrado en este cálculo.

Esto **no** cambia cómo se elige la estación más cercana (distancia tipo Manhattan, sin comparar caminatas reales entre candidatas, sin transbordos); solo cambia cómo se dibuja y mide el tramo a pie hacia/desde la estación ya elegida.

## Contrato con Google Directions API (externo, no de este backend)

```
GET https://maps.googleapis.com/maps/api/directions/json
  ?origin={lat},{lng}&destination={lat},{lng}&mode=walking&key={API_KEY}
```

Respuesta relevante:

```json
{
  "status": "OK",
  "routes": [{
    "overview_polyline": { "points": "..." },
    "legs": [{ "distance": { "value": 812 }, "duration": { "value": 640 } }]
  }]
}
```

`overview_polyline.points` es una polilínea codificada de precisión 5, igual a la que ya decodifica `@mapbox/polyline` en `catalog.ts`. `legs[0].distance.value`/`duration.value` están en metros/segundos.

### Estados de Google y su manejo

| `status` | Comportamiento del servicio |
| --- | --- |
| `OK` | Se decodifica la polilínea y se usan `distance`/`duration` reales. |
| `ZERO_RESULTS` | Se lanza error (sin ruta a pie entre esos puntos); la app cae a línea recta. |
| `NOT_FOUND` | Se lanza error (no se pudo ubicar alguno de los puntos); línea recta. |
| `OVER_QUERY_LIMIT` | Se lanza error (límite de consultas); línea recta. |
| `REQUEST_DENIED` | Se lanza error (key/restricciones); línea recta. |
| `INVALID_REQUEST` | Se lanza error; línea recta. |
| `UNKNOWN_ERROR` / otro | Se lanza error genérico; línea recta. |

HTTP no-200, timeout (12 s) o error de red se traducen igual que en `transit.ts`: mensaje en español, y la app cae a línea recta.

## Comportamiento móvil

1. Se llama como máximo dos veces por selección de viaje: origen → estación de conexión de origen, y estación de conexión de destino → destino. No depende de qué ruta de bus esté seleccionada en el panel inferior.
2. Se omite por completo (sin red) cuando ese extremo ya es una estación/parada.
3. Modo dummy (`EXPO_PUBLIC_USE_DUMMY_DATA=true`): no hay red; se sintetiza al instante una línea recta con duración estimada a ~1.35 m/s, etiquetada `source: "straight-line"`.
4. Modo API: mientras se resuelve la consulta real se muestra de inmediato esa misma línea recta como marcador de posición, que se reemplaza por la geometría real al llegar. El mapa nunca queda sin trazo de caminata.
5. Cualquier falla (ver tabla de estados, HTTP, timeout o red) se registra con `console.warn('[Direcciones] ...')` y la app conserva la línea recta como respaldo visible, con un aviso no bloqueante en pantalla. No hay reintento manual: cambiar origen/destino, o invertirlos, dispara un nuevo cálculo.
6. Cambiar de tarjeta de ruta de bus no recalcula ni redibuja la caminata: ya no se dibuja una vez por ruta visible, sino una sola vez por extremo (0, 1 o 2 polilíneas punteadas en total).

## Diagnóstico

Registro `[Direcciones]`: inicio de la consulta, código HTTP, `status` de Google, y cuándo se usa la línea recta de respaldo con el motivo. La API key nunca se imprime en el log (se omite la URL completa).

## Variables

```dotenv
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Reutiliza la misma key de `androidGoogleMapsApiKey`/`iosGoogleMapsApiKey` en `app.json`. Requiere habilitar manualmente "Directions API" para esa key en Google Cloud Console (fuera de este repo); las restricciones existentes por paquete/SHA-1 (Android) o bundle ID (iOS) siguen aplicando. Cambiar `.env` requiere reiniciar Metro; en release requiere una nueva compilación/actualización.

## Validación

Pruebas automáticas (`tests/services.test.cjs`) cubren: modo dummy sin red, decodificación de la polilínea real, cada `status` de Google, error HTTP, cancelación del llamador, timeout y falta de API key; además que la key nunca se imprima en los logs.

Verificar en dispositivo/emulador:

1. `EXPO_PUBLIC_USE_DUMMY_DATA=true`: origen libre + estación destino; la caminata es instantánea, sin log `[Direcciones] GET`, con distancia/duración mostradas.
2. `EXPO_PUBLIC_USE_DUMMY_DATA=false` con key válida y "Directions API" habilitada: la polilínea sigue calles reales (no una línea recta) y el log muestra `status=OK`.
3. Cambiar de tarjeta de ruta de bus con el mismo origen/destino: la caminata no se recalcula ni redibuja.
4. Cambiar origen/destino, o invertirlos: dispara un nuevo cálculo y actualiza el trazo/aviso.
5. Origen y destino ambos estaciones: no aparece ninguna polilínea de caminata ni texto asociado, y no se llama a `getWalkingRoute`.
6. Key inválida/revocada o `Directions API` deshabilitada: cae a línea recta con el aviso en pantalla; el resto de la pantalla (rutas de bus) sigue funcionando.
7. Sin `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` configurada en modo API: mismo resultado que el punto 6.
8. Cortar red durante el cálculo real: se agota el timeout (~12 s) y cae al mismo respaldo, sin bloquear el resto de la pantalla.
