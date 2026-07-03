/**
 * Firebase Configuration - SEGURO
 * 
 * ⚠️ IMPORTANTE: 
 * - NUNCA hardcodees keys aquí
 * - Usa .env.local para variables sensibles
 * - .gitignore debe incluir .env.local
 * - Firebase Security Rules deben estar configuradas
 * 
 * Archivos relacionados:
 * - .env.local (local, no subir a git)
 * - .env.example (template para otros devs)
 * - firebase-security-rules.json (rules)
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// ✅ Variables de entorno (desde .env.local)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Validación en desarrollo
if (process.env.NODE_ENV === 'development') {
  const requiredKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'databaseURL',
    'storageBucket',
    'appId'
  ];

  const missingKeys = requiredKeys.filter(key => !firebaseConfig[key]);
  
  if (missingKeys.length > 0) {
    console.error(
      '❌ Firebase config incompleto. Variables faltantes en .env.local:',
      missingKeys
    );
    console.error('👉 Copia .env.example a .env.local y completa los valores');
  }
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Servicios
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

// Analytics (solo en producción)
let analytics = null;
if (process.env.NODE_ENV === 'production') {
  analytics = getAnalytics(app);
}

// App Check para proteger endpoints (Recomendado)
// Requiere haber configurado reCAPTCHA v3 en Firebase Console
if (process.env.REACT_APP_FIREBASE_RECAPTCHA_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.REACT_APP_FIREBASE_RECAPTCHA_KEY),
      isTokenAutoRefreshEnabled: true // Auto-refresh tokens
    });
    console.log('✅ App Check initialized');
  } catch (error) {
    console.warn('⚠️ App Check no disponible:', error.message);
  }
}

// Configuración adicional
export const firebaseConfig as const;
export { app, auth, database, storage, analytics };

// ============ SECURITY NOTES ============

/**
 * SEGURIDAD DE FIREBASE - CHECKLIST
 * 
 * [ ] Restringir API Key en Firebase Console:
 *     - Console → Settings → API Key restrictions
 *     - HTTP Referrers: vura-app-93548.web.app, localhost:3000
 *     - APIs restringidas: Only Cloud Storage, Realtime Database
 * 
 * [ ] Configurar Security Rules en Realtime DB:
 *     - Denylist por defecto, allowlist específico
 *     - Ver: firebase-security-rules.json
 * 
 * [ ] Configurar Storage Rules:
 *     - Solo usuarios autenticados pueden leer/escribir
 *     - Validar tamaño de archivos
 * 
 * [ ] Auth Configuration:
 *     - Habilitar solo métodos necesarios
 *     - Anonymous auth para guests (si aplica)
 *     - Email/Password o Social Login
 * 
 * [ ] CORS y HTTPS:
 *     - HTTPS obligatorio (Firebase Hosting lo proporciona)
 *     - CORS configurado en Cloud Functions si aplica
 * 
 * [ ] Monitoreo:
 *     - Firebase Console → Audit Logs
 *     - Alertas para accesos anómalos
 *     - BigQuery export para análisis
 */

// ============ DEBUGGING ============

// Habilitar logs en desarrollo
if (process.env.NODE_ENV === 'development') {
  // Uncomment para ver logs detallados
  // import { enableLogging } from 'firebase/database';
  // enableLogging(true);
  
  console.log('🔥 Firebase initialized:', {
    projectId: firebaseConfig.projectId,
    databaseURL: firebaseConfig.databaseURL.split('.firebaseio.com')[0] + '.firebaseio.com',
    storageBucket: firebaseConfig.storageBucket,
    // NO loguear apiKey por seguridad
  });
}

export default app;
