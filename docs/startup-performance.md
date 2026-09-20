# Medición nativa y mejoras de apertura

## Android: medición desde antes de JavaScript

El plugin `plugins/withNativeStartupLogs.js` agrega marcas y las conserva al regenerar Android. También se aplicaron al proyecto Android existente. Recompilar e instalar (`npm run android`). Logs nativos con tag `BusPereiraStartup`:

- `Application.attachBaseContext: inicio/fin`: primera marca incorporada, antes de `Application.onCreate` y de iniciar React Native.
- `Application.onCreate: inicio/fin`.
- `Activity.onCreate: inicio/fin`, `Activity.onResume`.
- Primer `onDraw` de la Activity (puede incluir splash; no equivale a mapa cargado).

Cada marca contiene UTC con milisegundos, PID y `processElapsedMs`, calculado con el reloj monotónico de Android desde `Process.getStartElapsedRealtime()`. El proceso existe antes del primer callback instrumentado; no se presenta `attachBaseContext` como el toque del icono. El tiempo desde creación de proceso no es una medición de apertura caliente (el proceso puede seguir vivo).

Capturar ANTES de iniciar la aplicación:

```bash
bash scripts/capture-startup.sh
```

En otra terminal, arranque frío reproducible:

```bash
adb shell am start -S -W -n com.heernandez.buspereira/.MainActivity
```

`-S` detiene el proceso de esta app antes de abrirlo. Los logs JavaScript conservan sus timestamps UTC; correlacionarlos con los nativos permite medir el tramo previo a JS y hasta ocultamiento del splash/carga del mapa. `processElapsedMs` es monotónico; la correlación mediante UTC asume que el reloj del dispositivo no cambia durante la medición. No usar el tiempo de llegada a Metro como reloj.

Los logs nativos son temporales y no dependen de `EXPO_PUBLIC_STARTUP_LOGS` (ese flag controla JavaScript). Para quitarlos, retirar el plugin y regenerar Android. No se instrumentó iOS en este cambio; no hay proyecto iOS generado en este workspace.

La medición del sistema `Displayed`/`am start -W` representa primer display, no necesariamente app completamente utilizable. Android distingue TTID y TTFD: https://developer.android.com/topic/performance/vitals/launch-time. Comparar builds release, arranques fríos y calientes por separado, varias repeticiones y mediana/p95; no inferir mejora de una recarga de Metro.

## Evidencia de la medición recibida

Desde JS: catálogo listo 787 ms (consulta completa 191 ms), campañas listas 811 ms (185 ms), mapa inicializado 1039 ms, splash oculto 12858 ms tras timeout y mapa cargado 13149 ms. Google y pasabordos no bloquearon el splash.

El código instalado de `expo-splash-screen`, `SplashScreenManager.kt`, devuelve `false` en `onPreDraw` mientras se retiene el splash. Nuestra condición en Explorar exige `onMapLoaded`. El patrón observado es consistente con que esa dependencia retrase el dibujo del mapa hasta el timeout. Confirmar mediante los nuevos logs/una comparación controlada, no atribuirlo al backend.

## Mejoras y siguientes prioridades

1. **Implementado:** separar el splash nativo de una cubierta React con la misma imagen y color. Retirar el nativo al estar listos layout y `onMapReady`; mantener cubierta React mientras cargan tiles y preparar publicidad encima. Así se permite dibujar el mapa sin un destello gris. No esperar `onMapLoaded` debajo del splash nativo.
2. Montar el mapa con región inicial local mientras se consulta catálogo; actualizar estaciones al recibir datos. Actualmente el mapa espera todo el catálogo. Considerar separar datos críticos de Explorar (ciudad/estaciones) de rutas detalladas para reducir tamaño del arranque.
3. Catálogo compartido con caché local versionada y revalidación en segundo plano. Hoy cada pantalla que usa `getCatalog` puede volver a descargarlo; no cachear posiciones/ETA como si fueran datos estáticos.
4. Preparar solo imágenes de campañas elegibles después de filtrar contadores. Actualmente las agotadas **no crean Image ni descargan imagen**; tampoco hay prefetch de campañas agotadas. Una cola larga añade deliberadamente la suma de sus tiempos de exposición; medir por separado espera técnica y publicidad.
5. Evaluar presupuesto de espera de campañas para que una respuesta lenta no retenga navegación 15 s. Requiere definir si campañas tardías se omiten o se superponen una vez dentro.
6. Redis/ETag/compresión según medición del servidor y tamaño de payload. En esta muestra HTTP tardó 126–188 ms y no explica la espera de 12 s; Redis no resuelve el bloqueo de dibujo nativo.

Ya hay paralelismo: `/city`, `/stops`, `/stations`, `/routes` usan `Promise.all`. Google, catálogo y campañas arrancan concurrentemente. Campañas espera UUID persistido y luego filtra contadores; los pasabordos esperan identidad/token por necesidad. No es seguro adelantar la consulta privada antes de disponer de sesión.

La salida nativa ahora espera `onMapReady` y que la cubierta tenga layout e imagen local lista, sin esperar campañas ni `onMapLoaded`. La cubierta React bloquea interacción hasta que Explorar esté cargado y termine la consulta de campañas. Las campañas elegibles aparecen encima; su contador empieza después de liberar el splash nativo. Permisos/error de catálogo/timeout de mapa ofrecen una salida alternativa. Se conserva el límite de 12 s ante un fallo real del mapa. El tiempo de mejora debe verificarse en dispositivo; la compilación/exportación no miden latencia real.

Comparar `Splash nativo: liberado; mapa puede dibujarse`, primer `onDraw`, `Mapa: onMapLoaded` y `Apertura: Explorar revelado sin cubiertas`. En un arranque normal no debería alcanzarse el timeout del mapa para retirar el splash. La apariencia exacta entre splash del sistema y cubierta debe revisarse en release, pues Android puede aplicar máscara/tamaño al icono.
