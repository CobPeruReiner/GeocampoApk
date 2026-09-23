# Google Maps en Android

El proyecto móvil usa el identificador Android histórico de GeoCampo:
`pe.com.cobperu.geocampo`.

## Google Cloud

1. En el proyecto de Google Cloud correspondiente, habilitar **Maps SDK for Android**.
2. Crear o modificar una clave para Android. Una clave limitada a HTTP referrers o a
   Maps JavaScript API sirve para el web, pero no para un APK.
3. En restricciones de aplicación, registrar:
   - paquete: `pe.com.cobperu.geocampo`;
   - SHA-1 del certificado de la compilación que se va a instalar.
4. Restringir la API de esa clave a **Maps SDK for Android**.

## Configuración local

En `.env` del proyecto móvil:

```env
GOOGLE_MAPS_API_KEY=clave_android_restringida
```

`app.config.js` usa esa variable solo al preparar el binario nativo. Nunca debe
subirse la clave al repositorio.

## Prueba nativa

Expo Go no incorpora la configuración de `app.config.js` al binario ya instalado.
Para probar la clave de GeoCampo se necesita un build propio:

```bash
npx expo prebuild --clean
npx expo run:android
```

Después de cambiar la clave o su restricción, repetir el build. Para obtener el
SHA-1 del build de depuración generado, ejecutar en la carpeta `android`:

```bash
.\gradlew signingReport
```
