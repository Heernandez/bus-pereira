# Pases: confirmación, pago y activación

Tocar un plan abre el detalle del ticket, con volver atrás. Elegir Google Pay (Android), Apple Pay (iOS) u «Otros pagos» → Tarjeta/PSE y confirmar. En esta etapa los pagos son SIMULADOS: no se abre la wallet ni se cobra dinero.

La compra crea un pase «Por activar», guardado en SecureStore. «Activar pasabordo» pide confirmación e inicia la vigencia desde la hora del servidor. El plazo para activar se obtiene del backend; por defecto 24 horas desde la compra. Si vence, el pase aparece como «Perdido» y no admite QR ni activación. Los pases anteriores conservan su vigencia.

El móvil guarda `requestId` y el medio elegido antes del POST: reintentar no duplica la compra ni cambia el medio de una orden ya enviada. Las claves y firmas del QR siguen vinculadas al UUID de instalación. Los QR se renuevan cada 15 segundos y caducan a los 30; el lector debe estar conectado al backend.

Contrato completo: `../bus-pereira-backend/docs/mobile-pass-handoff.md`. Configuración servidor: `PASSES_ACTIVATION_WINDOW_SECONDS`, `PASSES_PAYMENT_MODE`, `PASSES_VALIDATOR_TOKEN`. La credencial del lector nunca debe estar en la app del pasajero.

Los cobros reales requieren integrar una pasarela, Google Pay y Apple Pay con credenciales de comercio; Tarjeta/PSE también dependen de esa pasarela. No se capturan datos bancarios en la simulación. No se añade el pase a Apple Wallet/Google Wallet.

Persistencia: clave P-256 y pases en SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; AsyncStorage solo contiene el índice de IDs. Reinstalar/cambiar de dispositivo no transfiere pases. Una captura aún vigente puede ser usada antes de caducar: no hay desafío físico del lector en este MVP.

Ejecutar `npm test` y `npm run typecheck`. Las dependencias nativas añadidas en la entrega anterior requieren reconstruir el development build si todavía no se hizo. Pendiente validación visual en dispositivo/lector reales y conexión con pasarela; no se ha publicado ni desplegado.
