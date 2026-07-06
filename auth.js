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
        let isGuestSession = false; // true si entro con fbSignInAnonymously (Parte 34)
        let favoritesUnsub = null;
        let favoriteStopsUnsub = null;

        function goToAuth(mode) {
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

        // ==================== MODO INVITADO (Parte 34) ====================
        // El pasajero puede ver el mapa en tiempo real sin crear una cuenta:
        // entra con una sesion anonima de Firebase (sin correo ni
        // contraseña). Esa sesion SI puede usar favoritos mientras dure
        // (estan ligados a su uid anonimo), pero no se sincronizan a otro
        // dispositivo ni sobreviven si borra los datos del navegador — por
        // eso se le invita a crear una cuenta real desde el banner que
        // aparece en su pantalla de Inicio.
        function continueAsGuest() {
            const btn = document.getElementById('guestLink');
            if (btn) btn.disabled = true;
            window.fbSignInAnonymously(window.fbAuth)
                .catch(err => {
                    console.error('Error entrando como invitado:', err);
                    showToast('No se pudo entrar como invitado. Intenta de nuevo.', 'error');
                })
                .finally(() => { if (btn) btn.disabled = false; });
        }

        function updateGuestBanner() {
            const banner = document.getElementById('guestBanner');
            if (banner) banner.style.display = isGuestSession ? 'flex' : 'none';
        }

        function hideSplash() {
            const splash = document.getElementById('splashScreen');
            if (splash) splash.classList.add('fade-out');
            // Parte 44: apenas se oculta el splash, si es la primera vez que
            // se abre Vura en este dispositivo, mostramos el onboarding.
            // El resto de applyAuthUI sigue corriendo con normalidad debajo
            // (landing/auth/app ya quedan listos), el onboarding solo se
            // superpone encima hasta que el usuario lo cierra.
            maybeShowOnboarding();
        }

        // ==================== ONBOARDING (Parte 44) ====================
        const ONBOARDING_KEY = 'vura_onboarding_seen';
        let onboardingIndex = 0;
        const ONBOARDING_TOTAL = 3;

        function maybeShowOnboarding() {
            let seen = false;
            try { seen = localStorage.getItem(ONBOARDING_KEY) === '1'; } catch (e) {}
            if (seen) return;
            const screen = document.getElementById('onboardingScreen');
            if (screen) screen.style.display = 'flex';
        }

        function onboardingNext() {
            if (onboardingIndex >= ONBOARDING_TOTAL - 1) {
                finishOnboarding();
                return;
            }
            const slides = document.querySelectorAll('.onboarding-slide');
            const dots = document.querySelectorAll('.onboarding-dot');
            slides[onboardingIndex].classList.remove('active');
            slides[onboardingIndex].classList.add('prev');
            onboardingIndex++;
            slides[onboardingIndex].classList.remove('prev');
            slides[onboardingIndex].classList.add('active');
            dots.forEach((d, i) => d.classList.toggle('active', i === onboardingIndex));

            const nextBtn = document.getElementById('onboardingNextBtn');
            if (nextBtn && onboardingIndex === ONBOARDING_TOTAL - 1) {
                nextBtn.textContent = 'Comenzar';
            }
        }

        function finishOnboarding() {
            try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) {}
            const screen = document.getElementById('onboardingScreen');
            if (screen) screen.style.display = 'none';
        }

        window.onboardingNext = onboardingNext;
        window.finishOnboarding = finishOnboarding;

        function applyAuthUI(user, profile) {
            hideSplash();
            const authScreen = document.getElementById('authScreen');
            const appShell = document.getElementById('appShell');

            if (!user) {
                authScreen.style.display = 'flex';
                appShell.style.display = 'none';
                currentUserId = null;
                favoriteCompanyIds = {};
                isGuestSession = false;
                if (favoritesUnsub) {
                    favoritesUnsub();
                    favoritesUnsub = null;
                }
                if (favoriteStopsUnsub) {
                    favoriteStopsUnsub();
                    favoriteStopsUnsub = null;
                }
                listenFavoriteStops(null);
                return;
            }

            authScreen.style.display = 'none';
            appShell.style.display = 'block';
            currentUserProfile = profile;
            currentUserId = user.uid;
            isGuestSession = !!user.isAnonymous;
            updateGuestBanner();

            if (favoritesUnsub) {
                favoritesUnsub();
                favoritesUnsub = null;
            }
            if (favoriteStopsUnsub) {
                favoriteStopsUnsub();
                favoriteStopsUnsub = null;
            }

            favoritesUnsub = listenFavorites(user.uid);
            favoriteStopsUnsub = listenFavoriteStops(user.uid);

            window.currentUserProfile = profile;

            const adminTabBtn = document.getElementById('adminTabBtn');
            const isAdmin = !!(profile && profile.isAdmin === true);
            adminTabBtn.style.display = isAdmin ? 'flex' : 'none';

            const passengerTabBtn = document.getElementById('passengerTabBtn');
            const driverTabBtn = document.getElementById('driverTabBtn');
            const profileTabBtn = document.getElementById('profileTabBtn');
            const userRole = (profile && profile.role) || 'pasajero';
            
            // Ocultar barra de navegación si no es administrador (simplificación de UX)
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) {
                bottomNav.style.display = isAdmin ? 'flex' : 'none';
            }
            if (window.updateBottomNavHeight) window.updateBottomNavHeight();
            
            passengerTabBtn.style.display = (isAdmin || userRole !== 'conductor') ? 'flex' : 'none';
            driverTabBtn.style.display = (isAdmin || userRole === 'conductor') ? 'flex' : 'none';
            if (profileTabBtn) profileTabBtn.style.display = 'flex';
            
            const correctTabBtn = userRole === 'conductor' ? driverTabBtn : passengerTabBtn;
            const correctViewName = userRole === 'conductor' ? 'driver' : 'passenger';

            // Poblar campos de la vista Perfil
            const nameHeader = document.getElementById('profileNameHeader');
            const roleHeader = document.getElementById('profileRoleHeader');
            const nameVal = document.getElementById('profileNameVal');
            const emailVal = document.getElementById('profileEmailVal');
            const roleVal = document.getElementById('profileRoleVal');
            const driverExtra = document.getElementById('profileDriverExtra');
            const gpsRow = document.getElementById('configGpsRow');
            
            const nameText = (profile && profile.name) || (window.fbAuth.currentUser ? window.fbAuth.currentUser.displayName : '') || 'Invitado';
            const roleText = isAdmin ? 'Administrador' : (userRole === 'conductor' ? 'Conductor' : 'Pasajero');
            
            if (nameHeader) nameHeader.textContent = nameText;
            if (roleHeader) roleHeader.textContent = roleText;
            if (nameVal) nameVal.textContent = nameText;
            if (emailVal) emailVal.textContent = (window.fbAuth.currentUser ? window.fbAuth.currentUser.email : '') || 'No registrado';
            if (roleVal) roleVal.textContent = roleText;
            
            if (gpsRow) {
                gpsRow.style.display = (isAdmin || userRole === 'conductor') ? 'flex' : 'none';
            }
            
            if (driverExtra) {
                if (profile && profile.role === 'conductor') {
                    driverExtra.style.display = 'block';
                    const dniVal = document.getElementById('profileDniVal');
                    const vehicleVal = document.getElementById('profileVehicleVal');
                    if (dniVal) dniVal.textContent = profile.dni || '—';
                    if (vehicleVal) vehicleVal.textContent = profile.vehicleId || '—';
                } else {
                    driverExtra.style.display = 'none';
                }
            }

            // Si la vista activa no corresponde al rol de esta cuenta, ir a la vista correcta
            const currentActiveView = document.querySelector('.view.active');
            const currentActiveViewId = currentActiveView ? currentActiveView.id : '';
            const viewIsAllowed = currentActiveViewId === `view-${correctViewName}` ||
                currentActiveViewId === 'view-profile' ||
                (currentActiveViewId === 'view-admin' && isAdmin);
            if (!viewIsAllowed) {
                switchView(correctViewName, correctTabBtn);
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
            return window.fbOnValue(favRef, (snap) => {
                favoriteCompanyIds = snap.val() || {};
                renderCompanyList();
                renderPassengerHome();
                if (selectedCompanyId) {
                    document.getElementById('favoriteToggleBtn').classList.toggle('active', !!favoriteCompanyIds[selectedCompanyId]);
                }
            });
        }

        function listenFavoriteStops(uid) {
            if (!uid || !window.firebaseReady) {
                if (typeof renderStopsList === 'function') {
                    renderStopsList({});
                }
                return () => {};
            }
            const stopsRef = window.fbRef(window.fbDb, 'favoritos_paradas/' + uid);
            return window.fbOnValue(stopsRef, (snap) => {
                const cachedFavoriteStops = snap.val() || {};
                if (typeof renderStopsList === 'function') {
                    renderStopsList(cachedFavoriteStops);
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

        window.goToAuth = goToAuth;
        window.setAuthMode = setAuthMode;
        window.setRegisterRole = setRegisterRole;
        window.backToRoleChoice = backToRoleChoice;
        window.doLogin = doLogin;
        window.doRegisterPassenger = doRegisterPassenger;
        window.doRegisterDriver = doRegisterDriver;
        window.doLogout = doLogout;
        window.continueAsGuest = continueAsGuest;
        window.toggleFavorite = toggleFavorite;
        window.toggleFavoriteSelected = toggleFavoriteSelected;
        window.listenFavoriteStops = listenFavoriteStops;
