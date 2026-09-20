# Apertura, sesión y pasabordos

Campañas adaptadas al contrato publicado de `/campaigns/active`. `/me/passes` continúa como contrato propuesto pendiente de implementación en el backend.

## Secuencia

`SessionProvider` recupera Google al montar la app. Cuenta consume esa misma sesión. La campaña se consulta en paralelo a la recuperación de Google, sin esperar ni enviar identidad. Al recuperar un usuario se consultan sus pasabordos. Iniciar sesión posteriormente también carga pasabordos. Logout cancela las consultas privadas y elimina su estado; las respuestas antiguas no pueden poblar otra cuenta.

`OpeningProvider` guarda los pasabordos durante la sesión; Pasabordo los muestra y permite actualizar. No se persisten tickets ni tokens en almacenamiento JS. El SDK nativo mantiene Google y obtiene el ID token para cada consulta. La sesión de Google no implica por sí sola que el backend autorice una cuenta: debe validarla en cada petición.

La apertura se ejecuta una vez por montaje de la app, no cada cambio de pestaña ni regreso del segundo plano. AsyncStorage conserva los contadores de campañas por instalación.

## Autenticación propuesta

`Authorization: Bearer <Google ID token>` para `/me/passes`. Campañas e imagen se consultan sin autenticación. No es un access token de Google ni un token de administrador. Backend debe verificar firma, issuer, audience del Web Client ID y expiración mediante el verificador oficial de Google. Identificar por `sub`, consultar el usuario local y comprobar que está activo. No aceptar un email o ID enviados por el cliente como prueba de identidad. Responder 401 ante token inválido/expirado y 403 ante usuario inactivo.

## GET /api/v1/campaigns/active

El contrato ahora admite una lista ordenada y `maxViewsPerDevice`, con contador persistente por UUID. Ver [contrato de campañas para backend](campaigns.md) para JSON, limpieza, métricas y comportamiento completo. La consulta no depende de la sesión Google.

## GET /api/v1/me/passes

Solo usuario autenticado y activo. Devolver todos sus pasabordos, incluidos expirados:

```json
{
  "data": {
    "passes": [{
      "id": "pass-123",
      "productId": "7_days",
      "name": "Pasabordo 7 días",
      "description": "Viajes ilimitados durante 7 días",
      "price": 42000,
      "currency": "COP",
      "purchasedAt": "2026-09-19T13:00:00Z",
      "expiresAt": "2026-09-26T13:00:00Z",
      "remainingUses": null,
      "status": "active"
    }]
  }
}
```

`productId`: `round_trip`, `7_days`, `28_days`. `status`: `active` o `expired`; backend calcula vigencia y agotamiento de usos. Fechas ISO 8601; `expiresAt:null` sin vencimiento temporal; `remainingUses:null` ilimitados. `passes:[]` significa sin compras. Error HTTP no se presenta como lista vacía y ofrece reintento. No enviar credenciales de abordaje en este contrato; en modo API no se muestra el patrón QR ficticio de la demo. Compras, QR válido y NFC siguen pendientes.

Con `EXPO_PUBLIC_USE_DUMMY_DATA=true` no se consultan estos endpoints: no hay campaña y los tickets son simulados para una sesión Google activa. Google sigue siendo real. Con `false` se consulta el backend sin fallback a tickets ficticios. Los logs HTTP muestran URL/código, nunca Authorization ni el cuerpo.

## Verificación manual en dispositivo

1. Reiniciar con Google conectado: sin visitar Cuenta deben salir campañas y pasabordos.
2. Inicio anónimo: consultar campañas sin Authorization y no consultar pasabordos.
3. Probar campaña nula, imagen rota/lenta, duración inválida y backend caído.
4. Enviar app al fondo durante publicidad: contador pausa y continúa al volver.
5. Probar pasabordos activos/expirados, lista vacía y 401/403/500.
6. Cerrar sesión durante una consulta: no reaparecen datos privados. Entrar con otra cuenta y comprobar aislamiento.

## Transición del splash a Explorar

El splash nativo se retiene con `expo-splash-screen` desde la carga de `App.tsx`. Explorar y su mapa se montan inmediatamente detrás; la publicidad ya no reemplaza el árbol de navegación. El splash nativo se oculta con layout y `onMapReady` (o un panel de permisos/error), cuando la cubierta React está preparada. La cubierta conserva imagen/color mientras se espera `onMapLoaded` y la consulta de campañas; no bloquea el dibujo nativo del mapa. Si el mapa no carga en 12 segundos desde recibir el catálogo, se muestra un mensaje de conexión en lugar de un fondo gris.

Las campañas se superponen a Explorar y bloquean su interacción; al terminar la cola, el mapa sigue montado. La sesión, los pasabordos y el GPS no tienen que finalizar para quitar el splash. Se conserva imagen y color verde del splash configurado.

Nuevo módulo/config plugin nativo: ejecutar `npx expo prebuild --platform android` y recompilar con `npm run android` (en iOS, regenerar/recompilar su proyecto). Verificar la transición arrancando la app desde cero, especialmente en build release; Fast Refresh no reproduce el splash nativo. Probar con campaña, sin campaña, red caída y permiso denegado.

## Logs temporales de rendimiento

Filtrar consola por `[APERTURA`. Cada ejecución tiene un identificador, `+Nms` desde el comienzo de la instrumentación JavaScript y etapas con inicio/fin, `durationMs` y estado. Se registran navegación, Google, instalación, HTTP (hasta parsear JSON), catálogo, permisos, primer layout, mapa listo/cargado, preparación/filtrado de campañas, imagen, token de pasabordos y ocultamiento del splash. No se imprimen credenciales, UUID de instalación, coordenadas ni datos de cuenta.

`Splash: sigue esperando` se imprime cada 3 segundos con `exploreReady` y `campaignsReady`. `Mapa: onMapReady` significa mapa nativo inicializado; `onMapLoaded` indica su carga. Hay límites de 12 segundos para HTTP y mapa (desde recibir catálogo), y 15 segundos para la consulta/preparación de campañas. Estos tiempos se solapan: no deben sumarse.

`EXPO_PUBLIC_STARTUP_LOGS=false` desactiva esta instrumentación; temporalmente está activa por defecto. No desactiva los logs HTTP previos. Comparar arranques completos en dispositivo; Fast Refresh no es un arranque. El tiempo previo al primer código JavaScript (lanzamiento del proceso, carga del runtime/bundle) no se mide aquí; los logs y el modo desarrollo también pueden afectar rendimiento. La resolución de `hideAsync` confirma la llamada nativa, no mide el primer frame físico en pantalla.

Los logs de apertura y HTTP incluyen timestamp ISO 8601 UTC con milisegundos (`2026-09-19T20:00:00.123Z`), además de las duraciones y tiempos relativos.

Las pantallas Explorar, Viaje, Pasabordo, Cuenta, Rutas favoritas y la capa de campaña registran `Vista …: primer render confirmado`, `primer layout completado`, `enfocada` y `desmontada`. El layout se registra una vez por montaje y el enfoque cada vez que se entra en la pestaña. `sinceRenderMs` mide desde la primera ejecución del componente. Un render/layout confirma que React y la vista nativa procesaron la pantalla; no garantiza que el usuario la vea todavía (puede cubrirla el splash/publicidad) ni que sus imágenes/datos hayan terminado de cargar. Los logs existentes de splash, mapa e imagen completan esa información. No se registra cada rerender de buses/contadores para reducir ruido.
