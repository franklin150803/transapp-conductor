// firebase.js
// Inicializa Firebase (Realtime Database + Authentication) y expone las
// funciones necesarias en window para que el resto de scripts (que no
// son modulos) puedan usarlas. Debe cargarse con <script type="module">
// porque usa import de los SDKs de Firebase. Debe ir ANTES que cualquier
// otro script que llame a window.fbXxx o que dependa de 'firebase-ready'.

        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getDatabase, ref, set, onValue, push, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
        import {
            getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
            onAuthStateChanged, signOut, updateProfile
        } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

        const firebaseConfig = {
            apiKey: "AIzaSyC3E45VIACvOOsdif2TBtQfNbVv2rOqtNk",
            authDomain: "transapp-prueba.firebaseapp.com",
            databaseURL: "https://transapp-prueba-default-rtdb.firebaseio.com",
            projectId: "transapp-prueba",
            storageBucket: "transapp-prueba.firebasestorage.app",
            messagingSenderId: "1020351679207",
            appId: "1:1020351679207:web:75bff846e26cf60e263042"
        };

        const fbApp = initializeApp(firebaseConfig);
        const db = getDatabase(fbApp);
        const auth = getAuth(fbApp);

        window.fbRef = ref;
        window.fbSet = set;
        window.fbOnValue = onValue;
        window.fbPush = push;
        window.fbGet = get;
        window.fbDb = db;
        window.fbAuth = auth;
        window.fbCreateUser = createUserWithEmailAndPassword;
        window.fbSignIn = signInWithEmailAndPassword;
        window.fbOnAuthStateChanged = onAuthStateChanged;
        window.fbSignOut = signOut;
        window.fbUpdateProfile = updateProfile;
        window.firebaseReady = true;
        window.dispatchEvent(new Event('firebase-ready'));
