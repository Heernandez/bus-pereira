# Campañas por dispositivo: contrato para backend

## GET /api/v1/campaigns/active

Público, sin autenticación. `data` siempre es una lista **completa**, sin paginación ni selección aleatoria de un subconjunto. El orden del arreglo es el orden de presentación.

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Promoción",
      "imageUrl": "/api/v1/campaigns/550e8400-e29b-41d4-a716-446655440000/image",
      "displaySeconds": 12,
      "maxViewsPerDevice": 3,
      "activatedAt": "2026-09-19T20:00:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Nueva ruta",
      "imageUrl": "/api/v1/campaigns/550e8400-e29b-41d4-a716-446655440001/image",
      "displaySeconds": 8,
      "maxViewsPerDevice": 1,
      "activatedAt": "2026-09-19T21:00:00.000Z"
    }
  ],
  "meta": { "source": "live" }
}
```

Sin campañas: `{"data":[],"meta":{"source":"live"}}`. Se admite `data:null` de la versión anterior como lista vacía. El objeto individual anterior debe migrarse a un arreglo y agregar `maxViewsPerDevice`.

- `id`: UUID único y estable de la campaña; nunca duplicado en una respuesta.
- `name`: nombre y texto accesible de la imagen.
- `imageUrl`: relativa o absoluta HTTP/HTTPS; se resuelve con `new URL(imageUrl, API_URL)`.
- `displaySeconds`: segundos positivos de exposición en primer plano; el contador empieza al cargar la imagen.
- `maxViewsPerDevice`: entero >= 0. Límite total por instalación mientras el UUID siga en la lista. `0` impide mostrarla. No es una cantidad de repeticiones consecutivas.
- `activatedAt`: metadato del backend; cambiarlo no reinicia el contador local.

## Comportamiento móvil

1. Una consulta por apertura, sin reintentos automáticos ni dependencia de Google.
2. Validar toda la lista antes de tocar el historial. Error HTTP, timeout o lista inválida: continuar sin anuncios y conservar contadores.
3. Eliminar contadores cuyos UUID no estén en la lista válida recibida. Una lista vacía limpia todos. Backend debe devolver todas las campañas activas: omitir una implica autorizar su eliminación local.
4. Leer visualizaciones completadas por UUID y omitir las que tengan `views >= maxViewsPerDevice`.
5. Mostrar las elegibles una vez cada una, en el orden recibido, durante esta apertura.
6. Al terminar el tiempo visible, incrementar y guardar el contador antes de avanzar a la siguiente imagen. Fallo de imagen o cierre de app antes de terminar no cuentan. En segundo plano el tiempo se pausa.
7. Conservar contadores agotados mientras el backend retorne el UUID, para evitar volver a mostrar la campaña. Si se elimina de una respuesta y reaparece posteriormente, empieza desde cero.

Al subir el límite de 3 a 5, un dispositivo con 3 visualizaciones puede verla 2 veces más. Bajar el límite no borra el historial. El UUID distingue campañas: cambiar nombre, imagen o fecha no reinicia el contador.

### Diagnóstico en debug y release

Instalar con `adb install -r` conserva el historial: las visualizaciones realizadas en debug también cuentan al instalar release sobre la misma aplicación. Si pasa directamente al mapa, revisa el registro `[Campañas] Elegibilidad`: `views`, `maxViewsPerDevice` y `eligible` indican si se agotó el límite. Para permitir más exposiciones de la misma campaña, aumenta `maxViewsPerDevice` en el backend y vuelve a abrir completamente la app; no hace falta republicarla ni recompilar.

Los registros `[Campañas]` están disponibles también con los tiempos de apertura desactivados. Distinguen una campaña descartada por límite, un error al preparar la publicidad, un fallo o timeout de imagen y una imagen cargada correctamente.

Persistencia local con AsyncStorage, clave `bus-pereira:campaign-views:v1`. Es por instalación, compartida entre cuentas; logout no borra el historial. Borrar datos/reinstalar puede reiniciarlo; no identifica físicamente un dispositivo ni garantiza límites entre instalaciones/restauraciones. No se almacenan imágenes ni tokens. Si falla la persistencia se omite la publicidad para no repetir sin control. Modo dummy no consulta ni limpia el historial real.

## Cambio necesario en métricas del backend

**El GET no debe sumar visualizaciones de campaña.** Ahora devuelve incluso campañas que la app descartará por límite. Si se conserva la métrica actual, debe llamarse entrega/consulta, no visualización.

El contador implementado es local. No hay envío de eventos de impresión al backend. Para analítica real se necesitaría otro contrato, por ejemplo un POST de visualización completada con clave idempotente; queda fuera de este cambio.

## Validación

Pruebas automáticas cubren límites, orden, persistencia simulada entre aperturas, aumento del límite, eliminación y reaparición de UUID, lista inválida, almacenamiento fallido y consulta única. Verificar en dispositivo dos campañas en secuencia, cierre antes de terminar, pausa en segundo plano y persistencia tras matar/reabrir la app. Al añadir AsyncStorage se requiere recompilar la app nativa (`npm run android`); recargar Metro no incorpora módulos nativos.

## Identidad de instalación enviada por el móvil

Cada GET incluye:

```http
GET /api/v1/campaigns/active
X-Installation-ID: 550e8400-e29b-41d4-a716-446655440000
X-Platform: ANDROID
```

UUID v4 aleatorio generado con Expo Crypto durante la primera apertura que consulta campañas y persistido antes de enviar la petición. Las instalaciones existentes lo generan al ejecutar esta versión por primera vez. Permanece entre aperturas, logout y limpieza de contadores. No depende de Google, no es un identificador de hardware ni una credencial de autenticación. Borrar datos/reinstalar puede cambiarlo; las restauraciones de backup pueden conservarlo. En modo dummy no se genera para esta consulta.

Backend: leer el header (en Node normalmente `request.headers['x-installation-id']`), validar UUID v4 y registrar una relación única `(campaign_id, installation_id)` para cada campaña devuelta. Usar restricción UNIQUE/upsert para que consultas repetidas no incrementen el alcance único. Puede guardar `firstDeliveredAt`, `lastDeliveredAt`, `deliveryCount`. Permitir este header en CORS si se usa cliente web.

Esta métrica es **instalaciones únicas a las que se entregó la campaña**, no usuarios únicos ni visualizaciones confirmadas. La app todavía puede omitirla por límite, fallar al cargar la imagen o cerrarse. Para medir visualizaciones completadas se requiere un evento posterior idempotente; ese endpoint no está implementado. El GET debe seguir devolviendo la lista completa aunque reconozca el UUID: filtrar campañas agotadas desde backend dispararía la limpieza local de sus contadores.

`X-Platform` se obtiene de `Platform.OS` y se envía como `ANDROID` o `IOS`. Backend puede leer `request.headers['x-platform']` y validar esos dos valores. La consulta de campañas se omite en plataformas distintas de Android/iOS. Si se configura CORS, incluir también `X-Platform` entre los headers permitidos.
