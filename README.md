# Mi Ruta - Pereira

Aplicación móvil de transporte público para Pereira, construida con **Expo SDK 57 + React Native 0.86 + TypeScript**. Consume el backend real (`https://heernandezdev.com/buses/api/v1`) por REST y WebSocket.

| Pestaña | Qué hace |
| --- | --- |
| **Explorar** | Mapa con estaciones, rutas y buses en vivo. Al seleccionar una estación, ruta o bus se abre un panel inferior con llegadas, sentidos y paradas. |
| **Viaje** | Planificador puerta a puerta: caminatas, buses y transbordos calculados por el backend (`POST /journeys/plan`). |
| **Rutas Favoritas** | Pendiente (pantalla de marcador de posición). |
| **Pasabordo** | Compra, activación y QR dinámico firmado por el dispositivo. |
| **Cuenta** | Inicio de sesión con Google. |

## Requisitos

- Node.js 18+ y npm
- Android Studio (SDK y emulador) o un teléfono Android con depuración USB
- ADB disponible en el `PATH`

La app usa módulos nativos (Google Maps, Google Sign-In, SecureStore), por lo que **no funciona en Expo Go**: se ejecuta como development build o como APK compilado.

## Configuración

```bash
npm install
cp .env.example .env
```

Variables de `.env`:

| Variable | Valor habitual | Uso |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `development` / `production` | Ambiente de la app. Controla los logs (ver abajo). |
| `EXPO_PUBLIC_API_URL` | `https://heernandezdev.com/buses/api/v1` | URL base del backend. |
| `EXPO_PUBLIC_WS_URL` | vacío | Opcional. Si está vacío se deriva de `API_URL` (`http→ws`, `https→wss`) agregando `/live`. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | ID de cliente OAuth | Necesario para Google Sign-In. |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `_IOS_CLIENT_ID` | ID de cliente OAuth | Clientes nativos de Google. |
| `EXPO_PUBLIC_STARTUP_LOGS` | `true` | Logs de tiempos de apertura; solo aplican en `development`. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | vacío | Heredado: solo lo usa el cálculo de caminata anterior al planificador. |

Todas las variables `EXPO_PUBLIC_*` se **incrustan en el bundle** al compilar: son visibles en la app, así que nunca pongas secretos en ellas. Después de cambiarlas reinicia Metro con `npx expo start --clear`, o vuelve a compilar si usas un APK release.

## Ambientes y logs

Los logs de depuración (`[HTTP]`, `[Viaje]`, `[Campañas]`, `[Direcciones]`, `[APERTURA …]`) pasan por `src/services/logger.ts`:

- `EXPO_PUBLIC_APP_ENV=development`: se escriben en la consola.
- `EXPO_PUBLIC_APP_ENV=production`: se silencian.
- Sin la variable: `development` en builds debug (Metro) y `production` en builds release.

Los perfiles de EAS ya la definen en `eas.json`: `development` y `preview` usan `development`, y `production` usa `production`.

Para ver los logs de un APK release compilado localmente, pon `EXPO_PUBLIC_APP_ENV=development` en `.env` antes de compilar y luego:

```bash
adb logcat -v time ReactNativeJS:V AndroidRuntime:E '*:S'
```

Para usar los logs nuevos, importa `logger` en lugar de llamar a `console.log` directamente:

```ts
import { logger } from '../services/logger';
logger.log('[Módulo] mensaje', detalles);
```

## Ejecutar la app

| Situación | Comando |
| --- | --- |
| Primera instalación o cambio nativo | `npm run android` |
| Desarrollo diario con la development build ya instalada | `npx expo start --dev-client` |
| APK release sin Metro | ver abajo |

Hay que recompilar con `npm run android` cuando cambian `app.json`, los plugins de Expo, los permisos, las dependencias nativas, los archivos de `android/` o las versiones de Expo/React Native. Para cambios de pantallas, estilos o lógica TypeScript basta con `npx expo start --dev-client` (`r` recarga).

### APK release

Con el teléfono conectado y visible en `adb devices`:

```bash
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`assembleRelease` genera el APK pero no lo instala; `adb install -r` lo instala conservando los datos si la firma es compatible. El release incluye el JavaScript y las variables de `.env` del momento de compilar.

### Teléfono Android por USB

1. En el teléfono: Ajustes → Sobre el teléfono → toca varias veces "Número de compilación" → Opciones de desarrollador → activa "Depuración USB".
2. Conecta el cable y acepta la autorización de depuración.
3. Verifica con `adb devices` que aparezca como `device`.
4. Ejecuta `npm run android` desde la raíz del proyecto.

## Backend

La app espera respuestas con la forma `{ data, meta? }`. Los errores se muestran con opción de reintento; no hay datos de respaldo.

| Endpoint | Usado por |
| --- | --- |
| `GET /catalog/release` | Saber si el catálogo cambió ([contrato](docs/catalog-release.md)) |
| `GET /city`, `/stops`, `/stations`, `/routes` | Catálogo (Explorar y Viaje), solo cuando cambia el release |
| `GET /stations/:id/arrivals` | Llegadas a una estación |
| `GET /routes/:id/live` (si no existe, usa `GET /routes/:id`) | Detalle de ruta con buses |
| WebSocket `/live` | Posiciones y llegadas en tiempo real |
| `POST /journeys/plan` | Planificador de Viaje |
| `GET /products` | Catálogo de pasabordos |
| `GET /me/passes`, `/me/passes/purchase-options`, `/me/passes/clock` | Pasabordos del usuario (autenticado con Google) |
| `POST /me/installations`, `/me/passes/purchases`, `/me/passes/:id/activate` | Registro del dispositivo, compra y activación |
| `GET /campaigns/active` | Publicidad de apertura |

Contratos detallados en [`docs/`](docs):

- [Release y caché del catálogo](docs/catalog-release.md)
- [Horarios, frecuencias y espera en terminal](docs/service-schedule.md)
- [Planificador de viajes](docs/journey-planning.md)
- [Mapa en vivo](docs/live-map.md)
- [Pasabordos](docs/passes.md)
- [Apertura](docs/app-opening.md)
- [Campañas](docs/campaigns.md)
- [Rendimiento de arranque](docs/startup-performance.md)
- [Caminata con Google (heredado)](docs/walking-directions.md)

## Funcionalidades

### Explorar

Las estaciones y rutas salen de una copia local cifrada que solo se descarga de nuevo cuando cambia el release del backend (ver [docs/catalog-release.md](docs/catalog-release.md)), así que el mapa abre sin esperar a la red. Las estaciones se dibujan con íconos de parada que crecen con el zoom (`scripts/generate-station-markers.py`).

La selección de estación, ruta o bus es exclusiva. El panel inferior se puede expandir y minimizar sin perder la selección. Las llegadas de una estación se actualizan por WebSocket mientras siga seleccionada; si la conexión se cae, la app reconecta con backoff exponencial y vuelve a sincronizar por REST.

### Viaje

El usuario elige el origen y el destino desde el catálogo, desde su ubicación actual o tocando el mapa. También puede ajustar sus preferencias:

- Prioridad: más rápido, menos caminata o menos transbordos.
- Caminata máxima.
- Número máximo de transbordos.

La búsqueda solo se ejecuta al tocar "Buscar viajes", y cualquier cambio posterior invalida los resultados. El detalle muestra el itinerario en el mapa, los buses que se acercan a la parada de abordaje y el paso a paso.

### Pasabordo

- Cada instalación genera una clave P-256 que se guarda en SecureStore y se registra en el backend.
- Las compras son idempotentes gracias a un `requestId` persistido.
- El QR se firma en el dispositivo con la hora sincronizada del servidor y solo se puede mostrar en la instalación donde se compró el pasabordo.

### Ubicación

Ambos mapas quedan bloqueados mientras falte el permiso de ubicación o el servicio esté apagado. El permiso solo es de primer plano.

- **Permiso denegado:** se puede volver a pedir si el sistema operativo lo permite.
- **Permiso bloqueado permanentemente:** la app abre sus Ajustes.
- **Servicio apagado:**
  - En Android, "Activar ubicación" muestra el diálogo nativo (`enableNetworkProviderAsync`).
  - En iOS, la app remite a Ajustes.
- **Sin señal:** se muestra un mensaje distinto con reintento.

La app revisa el estado al volver del segundo plano, al entrar a cada vista y cada 3 segundos mientras está activa.

## Google Sign-In

Se usa `@react-native-google-signin/google-signin`. El client ID no es un secreto, pero nunca incluyas un `client_secret` en la app.

1. En [Google Cloud Console](https://console.cloud.google.com/), configura la pantalla de consentimiento OAuth:
   - Tipo externo.
   - Scopes `openid`, `email` y `profile`.
   - Usuarios de prueba.
2. Crea un cliente **Aplicación web** y copia su ID en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. Crea un cliente **Android** con el paquete `com.heernandez.buspereira` y el SHA-1 del certificado con el que firmas. Su ID va en `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.
4. Para iOS, crea un cliente con el Bundle ID `com.heernandez.buspereira` y usa `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
5. Recompila con `npm run android`.

La API key de Google Maps está en `app.json` (plugin `react-native-maps`). Debe estar restringida en Google Cloud al paquete Android y su SHA-1, y al Bundle ID de iOS.

## Estructura

```text
App.tsx                     Navegación por pestañas y providers
src/
├── screens/                Explore, Trip, Pass, Account
├── components/
│   ├── map/                Marcadores, panel inferior y detalle de transporte
│   └── trip/               Piezas de la pantalla Viaje (formulario, mapas, detalle, modales)
├── context/                Sesión, acceso a ubicación, apertura
├── hooks/                  Datos remotos, llegadas, plan de viaje
├── services/               Cliente HTTP, WebSocket, planificador, pasabordos, logger
├── types/                  Contrato del planificador
└── data/catalog.ts         Tipos del catálogo y utilidades de geometría
plugins/                    Config plugins de Expo (memoria de Gradle, logs nativos de arranque)
tests/                      Pruebas de servicios con node:test
docs/                       Contratos con el backend
```

## Verificación

```bash
npm run typecheck
npm test
npx expo export --platform android --output-dir /tmp/bus-pereira-export
```

Pruebas manuales recomendadas en un dispositivo:

1. Aceptar y denegar el permiso de ubicación.
2. Denegar el permiso de forma permanente, concederlo desde Ajustes y volver.
3. Apagar la ubicación con un mapa o un modal abierto.
4. Tocar una estación, cambiar rápido a otra y verificar que no aparezca la respuesta de la anterior.
5. Apagar el backend y comprobar que aparecen el error y el reintento.

## Solución de problemas

**La app se queda en el splash.** Probablemente está instalada una versión debug que intenta conectarse a Metro en `localhost:8081`. Compruébalo con:

```bash
adb shell dumpsys package com.heernandez.buspereira | grep 'flags='
```

Si los flags incluyen `DEBUGGABLE`, es una versión debug: inicia Metro o instala el APK release.

**ADB no detecta el teléfono:**

```bash
adb kill-server && adb start-server && adb devices
```

Si sigue sin aparecer, revisa el cable, que el teléfono esté desbloqueado y que hayas aceptado la autorización de depuración.

**Metro no conecta por USB:**

```bash
adb reverse tcp:8081 tcp:8081
```
