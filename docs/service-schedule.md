# Horarios, frecuencias y espera en terminal

La app muestra "Próximas salidas" en cada estación combinando buses en vivo y salidas programadas, y suma la espera del conductor cuando un bus termina su recorrido en una terminal y la ruta reinicia desde ahí.

## Catálogo: campos opcionales de cada variante

En `route.variants[]` de `/routes`, `/routes/:id`, `/routes/:id/live` y en `route` de `/stations/:id/arrivals`:

```json
{
  "id": "variant-c4-return",
  "layoverMinutes": 8,
  "frequencies": [
    { "days": "weekdays", "startTime": "05:00", "endTime": "22:00", "headwayMinutes": 8 },
    { "days": "saturday", "startTime": "05:30", "endTime": "21:00", "headwayMinutes": 12 },
    { "days": "sunday_holiday", "startTime": "06:00", "endTime": "20:00", "headwayMinutes": 15 }
  ]
}
```

- `layoverMinutes`: minutos que el conductor espera en la **primera** parada de esta variante antes de arrancar. `null` o ausente si no se conoce.
- `frequencies[].days`: `weekdays` (lunes a viernes hábiles), `saturday`, `sunday_holiday` (domingos y festivos).
- `startTime` / `endTime`: primera y última salida desde la primera parada, hora local de Colombia `HH:MM`. Como en GTFS, puede pasar de `24:00` para servicio después de medianoche.
- `headwayMinutes`: minutos entre salidas.

La app los muestra en la sección "Horario" del detalle de ruta. Cambiarlos debe cambiar el `release` del catálogo ([catalog-release.md](catalog-release.md)).

## Llegadas: salidas programadas

`/stations/:id/arrivals` puede incluir, además de las llegadas en vivo, entradas con `"predictionSource": "schedule"` y `"vehicle": null`, con `arrivalMinutes` y `estimatedArrivalAt`. La app las muestra como "Salida programada". Si faltan más de 60 minutos, muestra la hora en lugar de los minutos. Se mantienen aunque el WebSocket esté conectado, porque solo llegan por REST.

## Espera en terminal (cálculo en la app)

Si una llegada es de una variante que **termina** en la estación y la ruta tiene una variante que **empieza** ahí, la app la muestra como salida de esa variante: `arrivalMinutes + layoverMinutes` de la variante que arranca. Por eso el backend **no** debe sumar la espera a las llegadas en vivo de la variante que termina; se contaría dos veces. Las salidas programadas desde una terminal se envían ya como salidas de la variante que arranca (`kind` "pass" en la app, sin suma adicional).

Código: `src/services/stationArrivals.ts`, `src/services/serviceSchedule.ts`, `src/components/map/TransitDetail.tsx`.
