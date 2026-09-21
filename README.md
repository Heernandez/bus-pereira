# Bus Pereira RN

Aplicación móvil para consultar rutas, paradas y experiencia de viaje en Pereira, construida con React Native + Expo.

## Requisitos

Antes de empezar, asegúrate de tener instalado:

- Node.js 18+
- npm o yarn
- Expo CLI
- Android Studio (si vas a emular Android)
- ADB activado en el sistema si quieres correr la app directamente en tu teléfono por USB

## Clonar e instalar dependencias

```bash
npm install
```

Para habilitar el login de Google preparado en la sección Cuenta:

```bash
npx expo install expo-auth-session expo-crypto
cp .env.example .env.local
```

Completa los client IDs en `.env.local`. No subas ese archivo al repositorio.

## Formas de ejecutar la app

| Forma | Comando | Uso principal |
| --- | --- | --- |
| Expo Go | `npm start` | Desarrollo JavaScript/TypeScript sin recompilar la app nativa |
| Development build | `npx expo start --dev-client` | Desarrollo con la app nativa compilada e instalada |
| Android compilado | `npm run android` | Primera instalación o cambios nativos |
| Web | `npm run web` | Probar la interfaz en el navegador |

### Opción 1: Expo Go

Inicia Metro con:

```bash
npm start
```

Después abre la app Expo Go en el teléfono y escanea el código QR. También puedes usar estas teclas en la terminal:

- `a` para Android
- `w` para web
- `i` para iOS

Expo Go es útil para cambios de pantallas, estilos, navegación y datos mock. No reemplaza una development build cuando se necesitan módulos nativos o una configuración nativa específica.

### Opción 2: development build compilada

Cuando la app nativa ya está instalada en el teléfono, inicia solamente Metro:

```bash
npx expo start --dev-client
```

La aplicación instalada se conecta a Metro y los cambios de JavaScript/TypeScript se actualizan dinámicamente. Para recargar manualmente, presiona `r` en la terminal de Metro.

### Opción 3: compilar e instalar Android

```bash
npm run android
```

Este comando compila el proyecto Android, instala el APK en el dispositivo detectado por ADB y luego inicia Metro. Úsalo para la primera instalación y después de cambios que afecten la parte nativa.

No es necesario ejecutarlo después de cada cambio visual o de lógica JavaScript.

Debes volver a ejecutarlo cuando cambies:

- `app.json` o plugins de Expo
- permisos Android
- Google Maps o `react-native-maps`
- dependencias nativas
- archivos dentro de `android/`
- versiones de Expo o React Native

Si solo cambias `App.tsx`, una pantalla, estilos o datos mock, usa `npx expo start --dev-client` con la development build ya instalada.

### Opción 4: navegador

```bash
npm run web
```

La versión web sirve para revisar la interfaz, pero algunas funciones nativas como ubicación y mapas pueden comportarse diferente a Android.

### Opción 5: compilar e instalar un APK release

Con el teléfono conectado por USB y visible en `adb devices`, ejecuta desde la raíz del proyecto:

```bash
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`assembleRelease` genera el APK, pero **no lo instala en el teléfono**. El comando `adb install -r` instala el release sobre la app existente conservando sus datos, siempre que la firma sea compatible. Después abre Bus Pereira en el teléfono; esta versión incluye JavaScript y funciona sin Metro.

Antes de compilar, verifica la configuración del backend en tus archivos `.env`:

```dotenv
EXPO_PUBLIC_USE_DUMMY_DATA=false
EXPO_PUBLIC_API_URL=https://heernandezdev.com/buses/api/v1
```

Si cambias estas variables o el código JavaScript/TypeScript, vuelve a compilar e instalar el release para incluir los cambios.

#### Si la app se queda en el splash

Comprueba que instalaste el APK generado. Una versión debug que sigue instalada puede quedarse en el splash intentando conectarse a Metro en `localhost:8081`; esto puede parecer un fallo del backend aunque todavía no se haya ejecutado el código que lo consulta.

Puedes revisar el tipo de app instalada y los registros con:

```bash
adb shell dumpsys package com.heernandez.buspereira | grep 'flags='
adb logcat -v time ReactNativeJS:V AndroidRuntime:E '*:S'
```

En este proyecto, `DEBUGGABLE` en los flags indica que sigue instalada una versión debug. Abre la app mientras observas los registros: las líneas `[HTTP] GET ... -> 200` confirman que el backend respondió correctamente. Si quieres usar debug, inicia Metro; para probar sin Metro, instala el release con el comando anterior.

## Ejecutar en tu teléfono Android conectado por USB

### 1) Habilita depuración USB en tu celular

En tu teléfono Android:

- Ve a Ajustes
- Busca "Sobre el teléfono"
- Toca varias veces "Número de compilación" para activar opciones de desarrollador
- Vuelve a Ajustes
- Entra a "Opciones de desarrollador"
- Activa "Depuración USB"

### 2) Conecta el teléfono por USB

Conecta tu celular a la computadora con el cable USB.

### 3) Verifica que ADB detecta el dispositivo

```bash
adb devices
```

Si tu dispositivo aparece listado, todo está bien. Debe verse algo como:

```bash
List of devices attached
XXXXXXXXXXXX    device
```

Si no aparece:

- Asegúrate de aceptar la solicitud de depuración en el teléfono
- Revisa que el cable funcione
- Prueba otra vez el comando

### 4) Ejecuta la app en el dispositivo

Desde la raíz del proyecto, para compilar e instalar:

```bash
cd /home/luis/Documents/personal/bus-pereira
npm run android
```

Después de que la app ya esté instalada, para trabajar con cambios dinámicos:

```bash
npx expo start --dev-client
```

Expo intentará usar el dispositivo físico detectado con ADB.

## Cuándo recompilar

La regla práctica es:

1. Primera vez o cambio nativo: `npm run android`.
2. Cambios normales de la app: `npx expo start --dev-client`.
3. Prueba rápida sin development build: `npm start` y Expo Go.

El build de Android puede tardar porque ejecuta Gradle. Si termina correctamente pero falla al instalar, revisa el espacio disponible del teléfono y que ADB lo detecte como `device`.

## Variables / configuración actual

La app de momento usa datos simulados en el frontend para representar:

- mapa principal
- ubicaciones de paradas
- búsqueda por ubicación
- tabs principales del flujo de la app

Este frontend está preparado para más adelante conectarse a una API Node.js real.

## Assets de marca

Los recursos visuales están en `assets/`:

- `icon.png`: icono cuadrado principal de la aplicación.
- `android-icon-foreground.png`: foreground transparente para el adaptive icon.
- `splash-icon.png`: marca usada en el splash nativo.
- `splash-portrait.png`, `splash-portrait-alt.png` y `splash-landscape.png`: composiciones alternativas para futuras variantes de splash.
- `favicon.png`: icono usado en web.

## Configurar Google Login

El proyecto usa `expo-auth-session` con OAuth 2.0 y el esquema nativo `buspereira://oauth`. La pantalla Cuenta muestra un modo de preparación mientras no existan credenciales y usa un perfil mock después de completar el flujo.

### Pasos en Google Cloud Console

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea o selecciona un proyecto.
2. Ve a **APIs y servicios > Pantalla de consentimiento OAuth**.
3. Configura la aplicación como **Externa** durante desarrollo.
4. Completa el nombre de la app, correo de soporte y correo del desarrollador.
5. Agrega los scopes `openid`, `email` y `profile`.
6. En **Usuarios de prueba**, agrega las cuentas Google que usarás en el teléfono.
7. Ve a **APIs y servicios > Credenciales > Crear credenciales > ID de cliente OAuth**.
8. Crea un cliente para **Aplicación web** y copia su ID en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
9. Crea un cliente para **Android** usando el package actual `com.heernandez.buspereira`.
10. Para Android necesitarás el SHA-1 del certificado con el que ejecutas la development build. El client ID va en `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.
11. Si luego publicarás iOS, crea también un cliente **iOS** con el Bundle ID definitivo y usa `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

El client ID no es un secreto. Nunca pongas un `client_secret` dentro de la app; el intercambio de códigos, la sesión del usuario y la asociación de un dispositivo deben resolverse en el backend.

Ejemplo de `.env.local`:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-example.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=1234567890-example.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

Como se agregó el esquema OAuth en `app.json`, después de configurar credenciales debes recompilar la development build:

```bash
npm run android
```

Para cambios posteriores de TypeScript, puedes volver a usar:

```bash
npx expo start --dev-client
```

Los datos de prueba (modo dummy) se mantienen en `src/data/dummyData.json`. Puedes agregar o modificar paradas y rutas allí; al recargar Metro, la aplicación utilizará esos cambios.

### Formato temporal de rutas

El JSON se organiza en tres niveles:

- `stops`: catálogo de paradas y estaciones, cada una con coordenadas e `id` único.
- `routes`: buses disponibles, por ejemplo `code: "7"`.
- `routes[].variants`: sentidos del bus (`outbound` y `return`) con su `stopSequence` ordenada.

Cada variante tiene una `geometry`. Mientras no exista el backend, `provider` es `mock` y `coordinates` contiene puntos de prueba. Más adelante el backend puede guardar la geometría calculada por Google en `encodedPolyline`, cambiar `provider` a `google-routes` y marcar `status` como `ready`.

Ejemplo mínimo:

```json
{
	"id": "route-7",
	"code": "7",
	"name": "Bus 7",
	"variants": [
		{
			"id": "route-7-outbound",
			"direction": "outbound",
			"destinationName": "Universidad Tecnológica",
			"stopSequence": ["stop-terminal", "stop-central", "stop-utp"],
			"geometry": {
				"provider": "mock",
				"status": "ready",
				"encodedPolyline": null,
				"coordinates": []
			}
		}
	]
}
```

Los identificadores de `stopSequence` deben existir en `stops`. Para agregar un nuevo bus, agrega una entrada en `routes` y sus paradas en `stops`; no necesitas modificar `TripScreen`.

## Estructura general

```bash
bus-pereira/
├── App.tsx
├── src/
│   ├── data/
│   │   ├── dummyData.json
│   │   └── catalog.ts
│   └── screens/
│       └── ExploreScreen.tsx
├── app.json
├── package.json
├── README.md
└── tsconfig.json
```

## Comandos útiles

```bash
npm install
npm start
npx expo start --dev-client
npm run android
npm run web
npx expo start --clear
adb devices
adb reverse tcp:8081 tcp:8081
```

## Nota importante

La app es un prototipo funcional con datos mockeados. Cuando construyas la API en Node.js, podrás reemplazar ese mock por peticiones HTTP reales a tu backend.

## Solución rápida si falla el dispositivo USB

```bash
adb kill-server
adb start-server
adb devices
```

Si aún no reconoce el teléfono, revisa:

- que la depuración USB esté activa
- que el dispositivo esté desbloqueado
- que aceptaste la autorización de depuración en el teléfono
- que el cable y el puerto USB funcionen

---

Si quieres, el siguiente paso puede ser dejarte un README más profesional con badges, screenshots, arquitectura y checklist de despliegue.

## Fuente de datos: dummy o API

Para activar los datos dummy, configura `.env` así:

```dotenv
EXPO_PUBLIC_USE_DUMMY_DATA=true
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
```

- `true` (también el valor predeterminado si no existe la variable): rutas, estaciones, llegadas y productos locales. No realiza consultas al backend.
- `false`: consulta `/city`, `/stops`, `/stations`, `/routes`, `/stations/:id/arrivals` y `/products` en el backend. Los errores aparecen con reintento; no hay fallback silencioso a dummy.
- `10.0.2.2` sirve para acceder al equipo desde el emulador Android estándar. En un teléfono físico usa la IP LAN del equipo que ejecuta el backend. Para una compilación que restrinja HTTP utiliza un servidor HTTPS. Producción debe usar HTTPS.
- Reinicia Metro después de cambiar las variables (`npx expo start --clear`). En una app release, las variables se incorporan al bundle: genera una nueva compilación/actualización para cambiarlas.

El backend puede devolver `meta.source: "demo"` incluso con el modo API activado. La pantalla identifica las llegadas simuladas, por horario, GPS o sin estimación. Consulta de llegadas cada 30 segundos (o el intervalo indicado por la API) mientras el modal está visible y la app está activa; cancela peticiones al cambiar de estación o cerrar.

En modo API, Viaje filtra variantes que conectan las paradas en el sentido correcto, muestra el trazado completo de la variante y calcula la caminata real hacia/desde la estación de conexión con la Directions API de Google (ver [docs/walking-directions.md](docs/walking-directions.md)). Todavía no existe planificación con transbordos ni duración real de todo el itinerario (bus + caminata combinados). El catálogo de pasabordos sí se consulta; compras e historial remoto están pendientes del backend, por lo que no se generan tickets dummy en modo API. Google Sign-In conserva su integración actual.

## Ubicación en Explorar y Viaje

Ambos mapas quedan bloqueados por un panel mientras falta el permiso o el servicio de ubicación. El permiso solo es de primer plano.

- **Sin solicitar / denegado:** solicita permiso al primer acceso; el panel permite pedirlo nuevamente si el SO lo permite.
- **Bloqueado permanentemente:** abre Ajustes de la app para conceder permiso. El SO decide cuándo se puede volver a mostrar su diálogo.
- **Servicio de ubicación apagado:** en Android, “Activar ubicación” llama a `enableNetworkProviderAsync` para mostrar la resolución nativa del sistema. Al aceptar vuelve a comprobar que el servicio esté encendido; si se cancela, mantiene el bloqueo. Incluye acceso alternativo a Ajustes de ubicación si el dispositivo no soporta la resolución con Google Play Services.
- **iOS:** dirige a Ajustes e indica activar Localización. No existe una API equivalente para encenderla automáticamente desde la app.
- **Permiso y servicio disponibles, pero sin posición:** muestra un mensaje de señal/posición con reintento tras un máximo de 15 segundos. No se presenta como permiso denegado.
- Revisa permiso y servicio al volver del segundo plano, al entrar en las vistas y cada 3 segundos mientras la app está activa. Los modales de búsqueda se cierran si se pierde acceso; los gestos, pulsaciones y accesibilidad del mapa quedan bloqueados.

La app no puede forzar la aceptación del diálogo ni encender ubicación sin consentimiento. En Android solicita el diálogo nativo y solo desbloquea tras verificar el servicio. Referencia: [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/#locationenablenetworkproviderasync).

## Verificar estos flujos

```bash
npm run typecheck
npm test
npx expo export --platform android --output-dir /tmp/bus-pereira-export
```

En dispositivo/emulador, verificar:

1. Primera apertura: aceptar y denegar el permiso; ambos mapas deben respetar la decisión.
2. Denegar permanentemente: “Abrir ajustes”, conceder y volver; comprobar desbloqueo.
3. Con permiso concedido, apagar la ubicación: ambos mapas deben bloquearse. Cancelar y luego aceptar “Activar ubicación”; verificar el diálogo nativo y el estado final.
4. Apagar ubicación desde ajustes rápidos con un modal abierto: debe cerrarse y aparecer el panel.
5. Mantener servicio encendido sin señal GPS: comprobar mensaje distinto de permiso denegado y reintento.
6. `EXPO_PUBLIC_USE_DUMMY_DATA=false`: arrancar backend, consultar estaciones y tocar una; apagar backend y verificar error/reintento. Cambiar rápido de estación no debe mostrar la respuesta de la anterior.

## Explorar: estaciones, rutas y buses en vivo

La pantalla existente ahora tiene selección exclusiva de estación/ruta/bus y un panel inferior expandible y colapsable. Minimizar conserva la selección y sus actualizaciones. Las rutas muestran su geometría, sentidos y estaciones; los buses tienen markers animados.

Consulta [docs/live-map.md](docs/live-map.md) para las etapas implementadas, archivos, contrato REST/WebSocket y pruebas. `EXPO_PUBLIC_WS_URL` es opcional: por defecto se deriva de `EXPO_PUBLIC_API_URL` con el protocolo ws/wss y `/live`. La variable `EXPO_PUBLIC_USE_DUMMY_DATA` selecciona el modo; cuando es `true`, el movimiento se identifica como simulación.

Esta integración reemplaza el comportamiento anterior de consultar llegadas solo mientras el modal estaba abierto: ahora se actualizan mientras la estación siga seleccionada, incluso con el panel colapsado.

La recuperación de Google ahora ocurre al iniciar la app. La publicidad de apertura consume `/campaigns/active` sin autenticación y con una consulta por apertura. El endpoint de pasabordos autenticados sigue pendiente en el backend. Contratos y pruebas manuales: [docs/app-opening.md](docs/app-opening.md).

Campañas múltiples con límite por dispositivo: [contrato y JSON para backend](docs/campaigns.md). Requiere recompilar la app nativa para incorporar AsyncStorage.

## Viaje: ruta a pie real

El tramo caminando entre un punto libre (mapa/"mi ubicación") y la estación de conexión elegida —origen y destino— se calcula con la Directions API de Google llamada directamente desde el móvil, en vez de una línea recta. La estación de conexión sigue eligiéndose igual que antes (distancia tipo Manhattan, sin comparar caminatas reales entre candidatas).

```dotenv
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Reutiliza la misma key de `androidGoogleMapsApiKey`/`iosGoogleMapsApiKey` en `app.json`; requiere habilitar "Directions API" para esa key en Google Cloud Console. Contrato, manejo de errores de Google y pruebas manuales: [docs/walking-directions.md](docs/walking-directions.md).
