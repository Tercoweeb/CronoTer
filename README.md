# CronoTerco — Kitchen Display System

Sistema de control de horno para Terco Pizza Barcelona.

## Desplegar en GitHub Pages

1. Subir todos los archivos a la raíz del repo `CronoTerco`
2. Activar GitHub Pages desde `Settings > Pages > Branch: main`
3. La app estará en `https://tercoweeb.github.io/CronoTerco/`

## Archivos

- `index.html` — Aplicación completa
- `sw.js` — Service Worker (PWA, offline, notificaciones)
- `manifest.json` — Configuración PWA
- `icons/` — Iconos para PWA e instalación en móvil

## PIN de acceso

PIN actual: **2025** (cambiar en `index.html` línea `const PIN_HASH = '2025'`)

## Funcionalidades implementadas

✓ Temporizadores basados en timestamps reales (no pierden tiempo en background)
✓ Múltiples grupos simultáneos e independientes
✓ Persistencia en localStorage (sobrevive recargas y cierres)
✓ Alarma visual + sonora + vibración
✓ Control por voz: "Alto", "Para", "Stop", "Apaga la alarma"
✓ Notificaciones locales via Service Worker
✓ PWA instalable en Android e iOS
✓ Soporte offline
✓ PIN de acceso privado por sesión
✓ Responsive: mobile, tablet, desktop
✓ Botones grandes táctiles
✓ Historial de grupos cocinados
✓ Ajustes persistentes

## Limitaciones conocidas (Fase 22)

### Timers en background
- **Web abierta**: ✓ Funciona perfectamente
- **Pestaña en background (Android Chrome)**: ✓ Recalcula al volver
- **PWA Android (pantalla bloqueada)**: ⚠ JS suspendido; recalcula al desbloquear
- **iOS Safari / PWA iOS**: ⚠ JS suspendido; recalcula al volver
- **App nativa**: ✓ Funcionaría perfectamente (futura versión)

### Alarma en background
- **Página visible**: ✓
- **Android Chrome background**: ⚠ Notificación, sin sonido automático
- **iOS**: ⚠ Notificaciones limitadas; sin sonido en background
- **Solución real**: App nativa (React Native / Capacitor)

### Voz
- **Android Chrome**: ✓ SpeechRecognition disponible
- **iOS Safari**: ✗ No disponible en background
- **iOS PWA**: ✗ No disponible

## Recomendación Fase 22 — ¿PWA o App nativa?

Para 5 usuarios internos con necesidades de alarma en background:
**Capacitor.js** convirtiendo esta PWA en app nativa.
- Coste: gratuito
- Mantenimiento: código web existente
- Alarmas: pueden sonar con pantalla bloqueada
- Distribución: APK directo (no App Store necesario para Android)
