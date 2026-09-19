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

Mientras se construye el backend, los datos de prueba se mantienen en `src/data/mockData.json`. Puedes agregar o modificar paradas y rutas allí; al recargar Metro, la aplicación utilizará esos cambios.

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
│   │   ├── mockData.json
│   │   └── mockData.ts
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
