# Release del catálogo

El móvil guarda en el teléfono, cifrado, el catálogo estático (`/city`, `/stops`, `/stations`, `/routes`) y solo lo vuelve a descargar cuando cambia el **release** del backend.

## Contrato para el backend

```http
GET /api/v1/catalog/release
```

```json
{ "data": { "release": 42 } }
```

- `release`: número entero o texto no vacío (por ejemplo un contador, una fecha `2026-09-29T10:00:00Z` o un hash). El móvil solo lo compara por igualdad; no necesita ser creciente.
- Debe cambiar **cada vez** que se modifique cualquier dato que devuelvan `/city`, `/stops`, `/stations` o `/routes`: crear, editar o borrar rutas, variantes, geometrías, paradas o estaciones.
- Público y sin autenticación, como el resto del catálogo. Debe ser una respuesta liviana y rápida: el móvil lo consulta en cada apertura.
- Las llegadas, los buses en vivo y la planificación de viajes no forman parte del catálogo y no deben cambiar el release.

Implementación sugerida: una fila `catalog_release` que se incrementa en la misma transacción que cualquier escritura sobre rutas o estaciones (o un trigger en esas tablas).

## Comportamiento del móvil

| Situación | Resultado |
| --- | --- |
| Primera apertura, sin copia local | Descarga el catálogo y lo guarda con el release actual. Si falla, muestra error con reintento. |
| Hay copia local y el release coincide | Usa la copia; no descarga el catálogo. |
| Hay copia local y el release cambió | Muestra la copia de inmediato, descarga el catálogo nuevo en segundo plano y reemplaza la copia. |
| Hay copia local y no hay red (o el backend falla) | Usa la copia sin mostrar error. |
| El backend responde 404 en `/catalog/release` | Modo de respaldo: vuelve a descargar solo si la copia tiene más de 24 horas. |

## Almacenamiento

- El catálogo (~200 KB) se cifra con XChaCha20-Poly1305 y se guarda en AsyncStorage. La llave de 256 bits se genera en el teléfono y vive en SecureStore (Android Keystore / iOS Keychain), sin salir del dispositivo.
- Una copia alterada o que no se pueda descifrar se descarta y se descarga de nuevo.
- `CACHE_VERSION` en `src/services/catalogCache.ts` debe incrementarse si cambia la forma del catálogo en la app; las copias anteriores se ignoran.

Código: `src/services/catalogCache.ts` (cifrado), `src/services/catalogStore.ts` (reglas de arriba), `src/hooks/useCatalog.ts` (conexión con las pantallas).
