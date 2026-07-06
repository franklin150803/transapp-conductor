/**
 * Firebase Cloud Function - OpenRouteService Proxy
 * 
 * Deploy: firebase deploy --only functions:getOrsRoute
 * 
 * This function securely proxies requests to OpenRouteService API,
 * keeping the API key server-side and validating inputs.
 */
const functions = require('firebase-functions');
const fetch = require('node-fetch'); // npm install node-fetch@2

// Configure via: firebase functions:config:set ors.key="YOUR_ORS_API_KEY"
const ORS_API_KEY = functions.config().ors?.key;
const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car';

exports.getOrsRoute = functions.https.onCall(async (data, context) => {
  // 1. Validación de autenticación (opcional pero recomendado)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Se requiere autenticación');
  }

  // 2. Validación de entrada
  const { coordinates } = data;
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Se requieren al menos 2 coordenadas [lat, lng]');
  }

  // Validar formato de coordenadas
  for (const coord of coordinates) {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new functions.https.HttpsError('invalid-argument', 'Cada coordenada debe ser [lat, lng]');
    }
    const [lat, lng] = coord;
    if (typeof lat !== 'number' || typeof lng !== 'number' || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new functions.https.HttpsError('invalid-argument', 'Coordenadas inválidas: lat [-90,90], lng [-180,180]');
    }
  }

  if (!ORS_API_KEY) {
    console.error('ORS_API_KEY no configurado en Firebase Functions config');
    throw new functions.https.HttpsError('internal', 'Servicio de routing no configurado');
  }

  try {
    // 3. Llamada a OpenRouteService (coords: [lng, lat] para ORS)
    const body = {
      coordinates: coordinates.map(([lat, lng]) => [lng, lat]),
      // Opciones opcionales para mejor calidad
      preference: 'recommended',
      instructions: false,
      elevation: false,
      extra_info: [],
    };

    const response = await fetch(`${ORS_BASE}/geojson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ORS_API_KEY,
        'Accept': 'application/geo+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ORS error:', response.status, errorText);
      throw new functions.https.HttpsError('internal', `Error en servicio de routing: ${response.status}`);
    }

    const data = await response.json();
    const coords = data.features?.[0]?.geometry?.coordinates;
    
    if (!coords || !coords.length) {
      throw new functions.https.HttpsError('internal', 'Ruta no encontrada');
    }

    // 4. Transformar respuesta: ORS devuelve [lng, lat] -> convertir a [lat, lng]
    const latLngs = coords.map(([lng, lat]) => [lat, lng]);

    // 5. Cache simple en memoria (opcional, para producción usar Redis/Firestore)
    return { coordinates: latLngs };

  } catch (error) {
    console.error('getOrsRoute error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

// Función adicional para health check
exports.orsHealthCheck = functions.https.onRequest(async (req, res) => {
  if (!ORS_API_KEY) {
    res.status(500).json({ status: 'error', message: 'ORS_API_KEY no configurado' });
    return;
  }
  
  try {
    const response = await fetch(`${ORS_BASE}/geojson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ORS_API_KEY,
      },
      body: JSON.stringify({ coordinates: [[-77.0428, -12.0464], [-77.0300, -12.0500]] }),
    });
    
    res.json({ 
      status: response.ok ? 'ok' : 'degraded', 
      orsStatus: response.status 
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});