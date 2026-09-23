const app = require('./app.json').expo;
// Android usa una clave restringida al paquete y certificado de GeoCampo.
// Se mantiene el nombre genérico como respaldo para configuraciones anteriores.
const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

module.exports = () => ({
  ...app,
  android: {
    ...app.android,
    // Identificador ya usado por el wrapper Android anterior de GeoCampo.
    package: 'pe.com.cobperu.geocampo',
  },
  plugins: [
    ...app.plugins,
    ...(googleMapsApiKey ? [[
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey,
      },
    ]] : []),
  ],
});
