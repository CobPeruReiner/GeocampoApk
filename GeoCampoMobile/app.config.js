const app = require('./app.json').expo;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

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
