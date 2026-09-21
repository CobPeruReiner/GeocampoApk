const app = require('./app.json').expo;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

module.exports = () => ({
  ...app,
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
