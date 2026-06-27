// auth.js
// Login, registro (pasajero/conductor) y manejo de sesion con Firebase
// Authentication. Depende de variables y funciones globales definidas en
// el script principal del index.html: currentUserId, favoriteCompanyIds,
// currentUserProfile, companies, map, switchView(), listenFavorites(),
// populateDriverVehicleSelect(), renderCompanyList(). Por eso debe
// cargarse despues de que esas declaraciones existan, y firebase.js debe
// cargarse antes que este archivo (usa window.fbAuth, window.fbSignIn, etc).

        // ==================== AUTH (LOGIN / REGISTRO) ====================
        let currentUserProfile = null; // { role: 'pasajero'|'conductor', ...datos }
        let currentUserId = null;
        let favoriteCompanyIds = {}; // { companyId: true }

        function backToLanding() {
            window._authScreenManuallyOpened = false;
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('landingScreen').style.display = 'block';
        }

        function goToAuth(mode) {
            window._authScreenManuallyOpened = true;
            document.getElementById('landingScreen').style.display = 'none';
            document.getElementById('authScreen').style.display = 'flex';
            setAuthMode(mode);
        }

        function setAuthMode(mode) {
            document.getElementById('authTabLogin').classList.toggle('active', mode === 'login');
            document.getElementById('authTabRegister').classList.toggle('active', mode === 'register');
            document.getElementById('authFormLogin').style.display = mode === 'login' ? 'flex' : 'none';
            document.getElementById('authFormRegisterRole').style.display = mode === 'register' ? 'flex' : 'none';
            document.getElementById('authFormRegisterPassenger').style.display = 'none';
            document.getElementById('authFormRegisterDriver').style.display = 'none';
        }

        function setRegisterRole(role) {
            document.getElementById('authFormRegisterRole').style.display = 'none';
            if (role === 'pasajero') {
                document.getElementById('authFormRegisterPassenger').style.display = 'flex';
            } else {
                populateDriverCompanyChoices();
                document.getElementById('authFormRegisterDriver').style.display = 'flex';
            }
        }

        function backToRoleChoice() {
            document.getElementById('authFormRegisterPassenger').style.display = 'none';
            document.getElementById('authFormRegisterDriver').style.display = 'none';
            document.getElementById('authFormRegisterRole').style.display = 'flex';
        }

        function populateDriverCompanyChoices() {
            const select = document.getElementById('regDrvCompany');
            select.innerHTML = '';
            Object.keys(companies).forEach(companyId => {
                const opt = document.createElement('option');
                opt.value = companyId;
                opt.textContent = companies[companyId].name;
                select.appendChild(opt);
            });
        }

        function showAuthError(elId, message) {
            document.getElementById(elId).textContent = message;
        }

        function friendlyAuthError(err) {
            const code = err && err.code || '';
            if (code.includes('email-already-in-use')) return 'Ese correo ya está registrado. Intenta iniciar sesión.';
            if (code.includes('invalid-email')) return 'El correo no es válido.';
            if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
            if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
            if (code.includes('network-request-failed')) return 'Sin conexión a Internet. Verifica tu conexión e intenta de nuevo.';
            if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
            return 'Ocurrió un error. Intenta de nuevo.';
        }

        function doLogin() {
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            showAuthError('loginError', '');

            if (!email || !password) {
                showAuthError('loginError', 'Completa correo y contraseña.');
                return;
            }

            document.getElementById('loginBtn').disabled = true;
            window.fbSignIn(window.fbAuth, email, password)
                .catch(err => showAuthError('loginError', friendlyAuthError(err)))
                .finally(() => { document.getElementById('loginBtn').disabled = false; });
        }

        function doRegisterPassenger() {
            const name = document.getElementById('regPassName').value.trim();
            const email = document.getElementById('regPassEmail').value.trim();
            const phone = document.getElementById('regPassPhone').value.trim();
            const password = document.getElementById('regPassPassword').value;
            showAuthError('regPassError', '');

            if (!name || !email || !password) {
                showAuthError('regPassError', 'Completa nombre, correo y contraseña.');
                return;
            }

            document.getElementById('regPassBtn').disabled = true;
            window.fbCreateUser(window.fbAuth, email, password)
                .then(cred => {
                    return window.fbUpdateProfile(cred.user, { displayName: name }).then(() => {
                        const profileRef = window.fbRef(window.fbDb, 'usuarios/' + cred.user.uid);
                        return window.fbSet(profileRef, {
                            role: 'pasajero', name, email, phone: phone || null,
                            createdAt: Date.now()
                        });
                    });
                })
                .catch(err => showAuthError('regPassError', friendlyAuthError(err)))
                .finally(() => { document.getElementById('regPassBtn').disabled = false; });
        }

        function doRegisterDriver() {
            const name = document.getElementById('regDrvName').value.trim();
            const dni = document.getElementById('regDrvDni').value.trim();
            const companyId = document.getElementById('regDrvCompany').value;
            const vehiclePlate = document.getElementById('regDrvVehicle').value.trim();
            const email = document.getElementById('regDrvEmail').value.trim();
            const password = document.getElementById('regDrvPassword').value;
            showAuthError('regDrvError', '');

            if (!name || !dni || !companyId || !vehiclePlate || !email || !password) {
                showAuthError('regDrvError', 'Completa todos los campos.');
                return;
            }

            document.getElementById('regDrvBtn').disabled = true;
            window.fbCreateUser(window.fbAuth, email, password)
                .then(cred => {
                    return window.fbUpdateProfile(cred.user, { displayName: name }).then(() => {
                        const profileRef = window.fbRef(window.fbDb, 'usuarios/' + cred.user.uid);
                        return window.fbSet(profileRef, {
                            role: 'conductor', name, dni, email,
                            companyId, vehiclePlate,
                            validated: false,
                            createdAt: Date.now()
                        });
                    });
                })
                .catch(err => showAuthError('regDrvError', friendlyAuthError(err)))
                .finally(() => { document.getElementById('regDrvBtn').disabled = false; });
        }

        function doLogout() {
            window.fbSignOut(window.fbAuth);
        }

        function applyAuthUI(user, profile) {
            const landingScreen = document.getElementById('landingScreen');
            const authScreen = document.getElementById('authScreen');
            const appShell = document.getElementById('appShell');

            if (!user) {
                // Si el usuario ya habia avanzado al login (p. ej. tras cerrar sesion
                // desde dentro de la app), lo dejamos en login en vez de regresarlo
                // a la landing; si es la primera carga, ve la landing primero.
                if (!window._authScreenManuallyOpened) {
                    landingScreen.style.display = 'block';
                    authScreen.style.display = 'none';
                } else {
                    landingScreen.style.display = 'none';
                    authScreen.style.display = 'flex';
                }
                appShell.style.display = 'none';
                currentUserId = null;
                favoriteCompanyIds = {};
                return;
            }

            landingScreen.style.display = 'none';
            authScreen.style.display = 'none';
            appShell.style.display = 'block';
            currentUserProfile = profile;
            currentUserId = user.uid;
            listenFavorites(user.uid);

            const adminTabBtn = document.getElementById('adminTabBtn');
            const isAdmin = !!(profile && profile.isAdmin === true);
            adminTabBtn.style.display = isAdmin ? 'flex' : 'none';

            // Si la vista Admin quedo activa de una sesion anterior y esta cuenta
            // no es admin, la regresamos a la vista de pasajero por seguridad.
            if (!isAdmin && document.getElementById('view-admin').classList.contains('active')) {
                const passengerTabBtn = document.querySelector('.tab-btn');
                if (passengerTabBtn) switchView('passenger', passengerTabBtn);
            }

            // Pre-rellenar datos conocidos en la vista de conductor si el usuario es conductor.
            if (profile && profile.role === 'conductor') {
                setTimeout(() => {
                    const nameInput = document.getElementById('driverName');
                    if (nameInput) nameInput.value = profile.name || '';
                    const companySelect = document.getElementById('driverCompany');
                    if (companySelect && profile.companyId) {
                        companySelect.value = profile.companyId;
                        populateDriverVehicleSelect();
                    }
                }, 600);
            }

            setTimeout(() => { if (map) map.invalidateSize(); }, 200);
        }

        function listenFavorites(uid) {
            const favRef = window.fbRef(window.fbDb, 'favoritos/' + uid);
            window.fbOnValue(favRef, (snap) => {
                favoriteCompanyIds = snap.val() || {};
                renderCompanyList();
                if (selectedCompanyId) {
                    document.getElementById('favoriteToggleBtn').classList.toggle('active', !!favoriteCompanyIds[selectedCompanyId]);
                }
            });
        }

        function toggleFavorite(companyId) {
            if (!currentUserId) return;
            const isFav = !!favoriteCompanyIds[companyId];
            const favRef = window.fbRef(window.fbDb, `favoritos/${currentUserId}/${companyId}`);
            window.fbSet(favRef, isFav ? null : true);
        }

        function toggleFavoriteSelected() {
            if (!selectedCompanyId) return;
            toggleFavorite(selectedCompanyId);
        }

        function listenAuthState() {
            window.fbOnAuthStateChanged(window.fbAuth, (user) => {
                if (!user) {
                    applyAuthUI(null, null);
                    return;
                }
                const profileRef = window.fbRef(window.fbDb, 'usuarios/' + user.uid);
                window.fbGet(profileRef).then(snap => {
                    applyAuthUI(user, snap.exists() ? snap.val() : null);
                }).catch(() => applyAuthUI(user, null));
            });
        }

        window.backToLanding = backToLanding;
        window.goToAuth = goToAuth;
        window.setAuthMode = setAuthMode;
        window.setRegisterRole = setRegisterRole;
        window.backToRoleChoice = backToRoleChoice;
        window.doLogin = doLogin;
        window.doRegisterPassenger = doRegisterPassenger;
        window.doRegisterDriver = doRegisterDriver;
        window.doLogout = doLogout;
        window.toggleFavorite = toggleFavorite;
        window.toggleFavoriteSelected = toggleFavoriteSelected;
