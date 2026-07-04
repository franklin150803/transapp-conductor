/**
 * Firebase Configuration - Vanilla JS (No Bundler)
 * 
 * ⚠️ IMPORTANTE: 
 * - NUNCA hardcodees keys aquí
 * - Inyecta la config via window.__FIREBASE_CONFIG__ desde index.html
 * - Firebase Security Rules deben estar configuradas (ver firebase-security-rules.json)
 * 
 * Archivos relacionados:
 * - index.html (inyecta window.__FIREBASE_CONFIG__)
 * - firebase-security-rules.json (rules)
 */

// ============ FIREBASE BOOTSTRAP (Vanilla JS, no bundler) ============

(function () {
  'use strict';

  // Esperar a que window.__FIREBASE_CONFIG__ esté disponible (inyectado desde index.html)
  function waitForConfig() {
    return new Promise((resolve, reject) => {
      if (window.__FIREBASE_CONFIG__) {
        resolve(window.__FIREBASE_CONFIG__);
        return;
      }
      const timeout = setTimeout(() => reject(new Error('Firebase config timeout: window.__FIREBASE_CONFIG__ no definido')), 5000);
      window.addEventListener('firebase-config-ready', () => {
        clearTimeout(timeout);
        if (window.__FIREBASE_CONFIG__) resolve(window.__FIREBASE_CONFIG__);
        else reject(new Error('firebase-config-ready fired but config missing'));
      }, { once: true });
    });
  }

  async function initFirebase() {
    try {
      const firebaseConfig = await waitForConfig();

      // Validación básica en desarrollo
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
        const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'databaseURL', 'storageBucket', 'appId'];
        const missingKeys = requiredKeys.filter(key => !firebaseConfig[key]);
        if (missingKeys.length > 0) {
          console.error('❌ Firebase config incompleto. Faltan:', missingKeys);
          console.error('👉 Define window.__FIREBASE_CONFIG__ en index.html antes de cargar firebase.js');
        }
      }

      // Cargar Firebase SDKs via CDN (compat mode para vanilla JS)
      await loadFirebaseSDKs();

      // Inicializar Firebase
      const app = firebase.initializeApp(firebaseConfig);
      const auth = firebase.auth();
      const database = firebase.database();
      const storage = firebase.storage();

      // Analytics (solo en producción)
      let analytics = null;
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
        try { analytics = firebase.analytics(); } catch (_) {}
      }

      // App Check (opcional, requiere reCAPTCHA v3 key en config)
      if (firebaseConfig.appCheckReCaptchaKey) {
        try {
          firebase.appCheck().activate(
            new firebase.appCheck.ReCaptchaV3Provider(firebaseConfig.appCheckReCaptchaKey),
            true // isTokenAutoRefreshEnabled
          );
          console.log('✅ App Check initialized');
        } catch (e) {
          console.warn('⚠️ App Check no disponible:', e.message);
        }
      }

      // Exponer servicios globalmente (para passenger.js, index.html, etc.)
      window.fbApp = app;
      window.fbAuth = auth;
      window.fbDb = database;
      window.fbStorage = storage;
      window.fbAnalytics = analytics;

      // Exponer métodos de Database globalmente (window.fbRef, window.fbSet, etc.)
      window.fbRef = (db, path) => (db || database).ref(path);
      window.fbSet = (ref, value) => ref.set(value);
      window.fbGet = (ref) => ref.once('value');
      window.fbOnValue = (ref, callback, cancelCallback) => {
        ref.on('value', callback, cancelCallback);
        return () => ref.off('value', callback);
      };
      window.fbOff = (ref) => ref.off();
      window.fbPush = (ref, value) => ref.push(value);
      window.fbUpdate = (ref, values) => ref.update(values);
      window.fbRemove = (ref) => ref.remove();
      window.fbRunTransaction = (ref, transactionUpdate) => ref.transaction(transactionUpdate);

      // Exponer métodos de Auth globalmente (compatibles con auth.js)
      window.fbSignIn = (authObj, email, password) => authObj.signInWithEmailAndPassword(email, password);
      window.fbCreateUser = (authObj, email, password) => authObj.createUserWithEmailAndPassword(email, password);
      window.fbSignInAnonymously = (authObj) => authObj.signInAnonymously();
      window.fbUpdateProfile = (userObj, profileData) => userObj.updateProfile(profileData);
      window.fbSignOut = (authObj) => (authObj || auth).signOut();
      window.fbOnAuthStateChanged = (authObj, callback) => (authObj || auth).onAuthStateChanged(callback);
      window.fbSendPasswordResetEmail = (authObj, email) => authObj.sendPasswordResetEmail(email);

      // Señal de listo para el resto de la app
      window.firebaseReady = true;
      window.dispatchEvent(new Event('firebase-ready'));

      // Debug en desarrollo
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
        console.log('🔥 Firebase initialized:', {
          projectId: firebaseConfig.projectId,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket
        });
      }

    } catch (err) {
      console.error('❌ Firebase initialization failed:', err);
      window.dispatchEvent(new CustomEvent('firebase-error', { detail: err }));
    }
  }

  // Cargar Firebase SDKs via CDN (compat namespaced)
  function loadFirebaseSDKs() {
    return new Promise((resolve, reject) => {
      if (window.firebase) { resolve(); return; }
      
      // Cargar en orden: app-compat, auth-compat, database-compat, storage-compat, analytics-compat, app-check-compat
      const scripts = [
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check-compat.js'
      ];

      let loaded = 0;
      scripts.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { if (++loaded === scripts.length) resolve(); };
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    });
  }

  // Iniciar bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase, { once: true });
  } else {
    initFirebase();
  }
})();