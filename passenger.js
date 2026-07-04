// passenger.js
// Vista del pasajero: lista de empresas (con favoritos), seleccion de
// empresa, resumen de flota con ETA, panel de detalle de un vehiculo,
// formato de "hace X tiempo". Depende de variables globales del script
// principal (companies, liveVehicles, favoriteCompanyIds, selectedCompanyId,
// map) y de funciones de map.js (initMap, showRoute, getRouteBoundsForCompany,
// updateMapFromLiveData, isOnline, estimateEtaMinutes, estimateDistanceKm,
// getActiveRoutePoints) y de auth.js (toggleFavorite). Debe cargarse antes
// del script principal, igual que map.js.

        // Si esta activo, el mapa centra la camara en este vehiculo cada
        // vez que se actualiza su posicion (boton "Seguir vehiculo").
        let followingVehicle = null;

        function renderFleetSummary(companyId) {
            const company = companies[companyId];
            const wrap = document.getElementById('fleetSummary');
            wrap.innerHTML = '';
            const vehicles = (company && company.vehicles) || {};
            const onlineIds = Object.keys(vehicles).filter(vid => isOnline((liveVehicles[companyId] || {})[vid]));

            if (onlineIds.length === 0) {
                wrap.innerHTML = '<div class="fleet-empty">Ningún vehículo de esta empresa está en ruta ahora mismo.</div>';
                return;
            }

            onlineIds.forEach(vid => {
                const vehicle = vehicles[vid];
                const live = liveVehicles[companyId][vid];
                const eta = estimateEtaMinutes(company, live);
                const conf = eta !== null ? estimateEtaConfidence(live) : null;
                const sentidoColor = live.sentido === 'retorno' ? '#ff5252' : '#22d3ee';
                const sentidoLabel = live.sentido === 'retorno' ? 'Retorno' : 'Ida';
                const moving = (live.speed || 0) >= 3;
                const occDot = { vacio: '🟢', medio: '🟡', lleno: '🔴' }[live.ocupacion] || '';
                const chip = document.createElement('div');
                chip.className = 'fleet-chip';
                chip.onclick = () => showVehiclePanel(companyId, vid);
                chip.innerHTML = `
                    <div class="fleet-chip-icon" style="background:${sentidoColor}26;">
                        ${appIcon('bus', 18)}
                    </div>
                    <div class="fleet-chip-body">
                        <div class="fleet-chip-name">${escapeHtml(vehicle.plate || vid)} ${occDot}</div>
                        <div class="fleet-chip-status" style="color:${sentidoColor};">
                            <span class="fleet-chip-dot" style="background:${sentidoColor};"></span>
                            ${sentidoLabel} · ${moving ? Math.round(live.speed || 0) + ' km/h' : 'Detenido'}
                        </div>
                    </div>
                    <div class="fleet-chip-eta-block">
                        <div class="fleet-chip-eta-value">${eta || '—'}</div>
                        <div class="fleet-chip-eta-label">${eta ? 'min' : 'calc.'}</div>
                        ${conf ? `<div class="fleet-chip-eta-confidence">${conf.dot}</div>` : ''}
                    </div>
                `;
                wrap.appendChild(chip);
            });
        }

        // Parte 45: buscador por destino. Antes solo comparaba el nombre de
        // la empresa y el texto libre de "ruta". Ahora tambien busca dentro
        // de "destinos" (los lugares de paso que cada empresa puede cargar
        // desde el panel admin, ej: "Universidad Nacional", "Plaza Norte").
        // Asi el pasajero puede escribir a donde quiere ir, no solo el
        // nombre exacto de una empresa que quizas no conoce.
        function filterCompanies() {
            const query = document.getElementById('searchInput').value.trim().toLowerCase();
            const ids = Object.keys(companies);
            const cards = document.querySelectorAll('.company-card');
            ids.forEach((companyId, idx) => {
                if (!cards[idx]) return;
                const company = companies[companyId];
                const destinos = company.destinos || [];

                if (!query) {
                    cards[idx].style.display = 'block';
                    setMatchedDestinoHint(cards[idx], null);
                    return;
                }

                const nameMatch = (company.name || '').toLowerCase().includes(query);
                const routeMatch = (company.route || '').toLowerCase().includes(query);
                const matchedDestino = destinos.find(d => d.toLowerCase().includes(query));

                const match = nameMatch || routeMatch || !!matchedDestino;
                cards[idx].style.display = match ? 'block' : 'none';

                // Si lo que hizo coincidir la tarjeta fue un destino (no el
                // nombre de la empresa), se lo mostramos al pasajero para
                // que entienda por que aparecio ese resultado.
                setMatchedDestinoHint(cards[idx], (match && !nameMatch && matchedDestino) ? matchedDestino : null);
            });
        }

        function setMatchedDestinoHint(card, destino) {
            let hint = card.querySelector('.company-destino-match');
            if (destino) {
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'company-destino-match';
                    card.appendChild(hint);
                }
                hint.textContent = `📍 Pasa por: ${destino}`;
            } else if (hint) {
                hint.remove();
            }
        }

        function showVehiclePanel(companyId, vehicleId) {
            // Si se abre el panel de OTRO vehiculo, dejamos de seguir al anterior.
            if (followingVehicle && (followingVehicle.companyId !== companyId || followingVehicle.vehicleId !== vehicleId)) {
                followingVehicle = null;
            }
            window._openPanel = { companyId, vehicleId };
            refreshOpenPanel();
            document.getElementById('vehiclePanel').classList.add('show');
            setPanelBackdrop(true);
        }

        function toggleFollowVehicle() {
            if (!window._openPanel) return;
            const btn = document.getElementById('followVehicleBtn');
            if (followingVehicle) {
                followingVehicle = null;
                btn.classList.remove('active');
                btn.textContent = 'Seguir vehículo';
            } else {
                followingVehicle = { ...window._openPanel };
                btn.classList.add('active');
                btn.textContent = '✓ Siguiendo en el mapa';
                // Centra de inmediato al activar, sin esperar la proxima actualizacion.
                const live = (liveVehicles[followingVehicle.companyId] || {})[followingVehicle.vehicleId];
                if (live && map) map.panTo([live.lat, live.lng]);
            }
        }

        // ==================== MODO ENFOQUE (Parte 46) ====================
        // Variacion sobre "Seguir vehiculo": ademas de centrar la camara,
        // atenua todo lo demas en el mapa (otros buses, otras rutas) para
        // que sea obvio cual es el bus que se esta esperando. A diferencia
        // de "Seguir vehiculo", el Modo enfoque sobrevive a que el pasajero
        // cierre el panel (sigue activo, con un aviso flotante en el mapa
        // y un boton para cancelarlo desde ahi), porque la idea es que
        // pueda seguir explorando otras tarjetas sin perder de vista cual
        // bus esta esperando.
        let waitingFocusVehicle = null;
        // Si Modo enfoque tuvo que forzar "Seguir vehiculo" porque no
        // estaba activo, recordamos eso para apagarlo de nuevo al salir
        // del Modo enfoque (y no dejar un "Seguir vehiculo" fantasma).
        let focusForcedFollow = false;

        function toggleFocusMode() {
            if (!window._openPanel) return;
            const { companyId, vehicleId } = window._openPanel;
            const key = companyId + '__' + vehicleId;

            if (waitingFocusVehicle && waitingFocusVehicle.companyId === companyId &&
                waitingFocusVehicle.vehicleId === vehicleId) {
                deactivateFocusMode();
                return;
            }

            waitingFocusVehicle = { companyId, vehicleId };
            focusForcedFollow = false;
            if (!followingVehicle || followingVehicle.companyId !== companyId || followingVehicle.vehicleId !== vehicleId) {
                focusForcedFollow = true;
                followingVehicle = { companyId, vehicleId };
                const live = (liveVehicles[companyId] || {})[vehicleId];
                if (live && map) map.panTo([live.lat, live.lng]);
            }

            setWaitingTarget(key);
            updateFocusModeUi();
            showToast('Modo enfoque activado: el resto del mapa se atenuó', 'info');
        }

        function deactivateFocusMode() {
            waitingFocusVehicle = null;
            setWaitingTarget(null);
            if (focusForcedFollow) {
                followingVehicle = null;
                focusForcedFollow = false;
                const followBtn = document.getElementById('followVehicleBtn');
                if (followBtn) {
                    followBtn.classList.remove('active');
                    followBtn.textContent = 'Seguir vehículo';
                }
            }
            updateFocusModeUi();
        }

        // Sincroniza el boton dentro del panel (si esta abierto, y es el
        // vehiculo enfocado) y el aviso flotante sobre el mapa (que se ve
        // incluso con el panel cerrado, para poder cancelar desde ahi).
        function updateFocusModeUi() {
            const isActive = !!waitingFocusVehicle;
            const open = window._openPanel;
            const isThisOne = isActive && open &&
                waitingFocusVehicle.companyId === open.companyId && waitingFocusVehicle.vehicleId === open.vehicleId;

            const btn = document.getElementById('focusModeBtn');
            if (btn) {
                btn.classList.toggle('active', isThisOne);
                btn.textContent = isThisOne ? '✓ Enfocando este bus' : '🎯 Modo enfoque';
            }

            const banner = document.getElementById('focusModeBanner');
            if (banner) {
                banner.classList.toggle('show', isActive);
                if (isActive) {
                    const company = companies[waitingFocusVehicle.companyId];
                    const vehicle = company && company.vehicles && company.vehicles[waitingFocusVehicle.vehicleId];
                    const label = vehicle ? (vehicle.plate || waitingFocusVehicle.vehicleId) : '';
                    const textEl = document.getElementById('focusModeBannerText');
                    if (textEl) textEl.textContent = `🎯 Enfocando bus ${escapeHtml(label)}`;
                }
            }
        }

        function refreshOpenPanel() {
            if (!window._openPanel) return;
            const { companyId, vehicleId } = window._openPanel;
            const company = companies[companyId];
            const vehicle = company && company.vehicles && company.vehicles[vehicleId];
            const live = (liveVehicles[companyId] || {})[vehicleId];
            if (!company || !vehicle) return;

            // Si estamos siguiendo este vehiculo y tiene una posicion valida,
            // centramos el mapa suavemente en su ubicacion actual.
            if (followingVehicle && followingVehicle.companyId === companyId &&
                followingVehicle.vehicleId === vehicleId && live && map) {
                map.panTo([live.lat, live.lng], { animate: true, duration: 0.8 });
            }

            document.getElementById('vehiclePanelTitle').textContent = `Vehículo ${vehicle.plate || vehicleId}`;
            document.getElementById('vpCompany').textContent = company.name;
            document.getElementById('vpPlate').textContent = vehicle.plate || vehicleId;

            const speed = live ? Math.round(live.speed || 0) : 0;
            document.getElementById('vpSpeed').textContent = `${speed} km/h`;

            const sentidoEl = document.getElementById('vpSentido');
            if (live && live.sentido === 'retorno') {
                sentidoEl.innerHTML = '<span class="status-dot-small stopped" style="background:#ff5252;animation:none;"></span>Retorno';
                sentidoEl.style.color = '#ff5252';
            } else if (live) {
                sentidoEl.innerHTML = '<span class="status-dot-small" style="background:#22d3ee;animation:none;"></span>Ida';
                sentidoEl.style.color = '#22d3ee';
            } else {
                sentidoEl.textContent = '—';
                sentidoEl.style.color = '';
            }

            const distEl = document.getElementById('vpDistance');
            const etaEl = document.getElementById('vpEta');
            const etaConfEl = document.getElementById('vpEtaConfidence');
            if (live && isOnline(live)) {
                const distKm = estimateDistanceKm(company, live);
                const eta = estimateEtaMinutes(company, live);
                distEl.textContent = distKm !== null ? `${distKm.toFixed(1)} km` : '—';
                etaEl.textContent = eta !== null ? `~${eta} min` : '—';
                const conf = eta !== null ? estimateEtaConfidence(live) : null;
                if (etaConfEl) {
                    if (conf) {
                        etaConfEl.textContent = `${conf.dot} ${conf.label}`;
                        etaConfEl.className = `eta-confidence conf-${conf.level}`;
                    } else {
                        etaConfEl.textContent = '';
                        etaConfEl.className = 'eta-confidence';
                    }
                }
            } else {
                distEl.textContent = '—';
                etaEl.textContent = '—';
                if (etaConfEl) { etaConfEl.textContent = ''; etaConfEl.className = 'eta-confidence'; }
            }

            const statusEl = document.getElementById('vpStatus');
            if (!live || !isOnline(live)) {
                statusEl.innerHTML = '<span class="status-offline"><span class="status-dot-small offline"></span>Sin conexión</span>';
            } else if (speed < 3) {
                statusEl.innerHTML = '<span class="status-stopped"><span class="status-dot-small stopped"></span>Detenido</span>';
            } else {
                statusEl.innerHTML = '<span class="status-moving"><span class="status-dot-small moving"></span>En movimiento</span>';
            }

            document.getElementById('vpUpdateText').textContent = live ? formatTimeAgo(live.timestamp) : '—';
            updateFreshnessRing(document.getElementById('vpFreshnessRing'), live ? live.timestamp : null);

            const accuracyEl = document.getElementById('vpAccuracy');
            const acc = live ? Math.round(live.accuracy || 0) : null;
            accuracyEl.textContent = acc ? `±${acc} m` : '—';
            const quality = gpsQuality(acc);
            accuracyEl.className = quality.cssClass;
            const qualityDotEl = document.getElementById('vpGpsQualityDot');
            if (qualityDotEl) {
                qualityDotEl.textContent = acc ? quality.dot : '⚪';
                qualityDotEl.title = acc ? quality.label : 'Sin datos';
            }

            const occupancyEl = document.getElementById('vpOccupancy');
            if (occupancyEl) {
                const occMap = { vacio: '🟢 Pocos pasajeros', medio: '🟡 Medio lleno', lleno: '🔴 Lleno' };
                occupancyEl.textContent = (live && occMap[live.ocupacion]) ? occMap[live.ocupacion] : 'Sin reportar';
            }

            const followBtn = document.getElementById('followVehicleBtn');
            if (followBtn) {
                const isFollowingThis = !!(followingVehicle &&
                    followingVehicle.companyId === companyId && followingVehicle.vehicleId === vehicleId);
                followBtn.classList.toggle('active', isFollowingThis);
                followBtn.textContent = isFollowingThis ? '✓ Siguiendo en el mapa' : 'Seguir vehículo';
            }

            updateFocusModeUi();
        }

        // Calcula que tan "fresca" es la ultima lectura (1 = recien
        // llegada, 0 = pasaron 60s o mas desde la ultima actualizacion)
        // y la aplica como variable CSS al anillo. Pasados los 60s, el
        // vehiculo ya se considera offline en otro lado de la app
        // (isOnline), asi que el anillo simplemente se queda gris.
        function updateFreshnessRing(ringEl, timestamp) {
            if (!ringEl) return;
            if (!timestamp) {
                ringEl.classList.add('stale');
                ringEl.style.setProperty('--freshness', '0');
                return;
            }
            const secsAgo = (Date.now() - timestamp) / 1000;
            const freshness = Math.max(0, Math.min(1, 1 - (secsAgo / 60)));
            ringEl.classList.toggle('stale', freshness <= 0);
            ringEl.style.setProperty('--freshness', freshness.toFixed(2));
        }

        function closeVehiclePanel() {
            document.getElementById('vehiclePanel').classList.remove('show');
            window._openPanel = null;
            setPanelBackdrop(false);
        }

        // ==================== AVISO "PASAJERO ESPERANDO" (Parte 26) ====================
        // Enfriamiento global de 60s entre avisos, para evitar que un toque
        // accidental repetido sature al conductor con el mismo aviso.
        let lastWaitingSignalAt = 0;

        function signalWaiting() {
            if (!window._openPanel) return;
            if (!window.firebaseReady) {
                showToast('Sin conexión, intenta de nuevo en un momento', 'error');
                return;
            }
            const now = Date.now();
            if (now - lastWaitingSignalAt < 60000) {
                showToast('Ya avisaste a este conductor, espera un momento', 'info');
                return;
            }
            const { companyId, vehicleId } = window._openPanel;
            const waitRef = window.fbRef(window.fbDb, `esperando/${companyId}/${vehicleId}`);
            window.fbPush(waitRef, { timestamp: now }).then(() => {
                lastWaitingSignalAt = now;
                showToast('Aviso enviado al conductor 🙋', 'success');
                const btn = document.getElementById('waitSignalBtn');
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('active');
                    btn.textContent = '✓ Aviso enviado';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.classList.remove('active');
                        btn.textContent = '🙋 Estoy esperando este bus';
                    }, 60000);
                }
            }).catch(err => {
                showToast('No se pudo enviar el aviso', 'error');
                console.error('Error enviando aviso de espera:', err);
            });
        }

        function formatTimeAgo(timestamp) {
            if (!timestamp) return '—';
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 5) return 'Hace instantes';
            if (seconds < 60) return `Hace ${seconds}s`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `Hace ${minutes}min`;
            const hours = Math.floor(minutes / 60);
            return `Hace ${hours}h`;
        }

        // ==================== PASSENGER VIEW ====================
        function renderCompanyList() {
            const list = document.getElementById('companyList');
            if (!list) return;
            list.innerHTML = '';

            const orderedIds = Object.keys(companies).sort((a, b) => {
                const favA = favoriteCompanyIds[a] ? 1 : 0;
                const favB = favoriteCompanyIds[b] ? 1 : 0;
                return favB - favA;
            });

            orderedIds.forEach(companyId => {
                const company = companies[companyId];
                const vehicles = company.vehicles || {};
                const onlineCount = Object.keys(vehicles).filter(vid =>
                    isOnline((liveVehicles[companyId] || {})[vid])
                ).length;
                const isFav = !!favoriteCompanyIds[companyId];

                const card = document.createElement('div');
                card.className = `company-card ${selectedCompanyId === companyId ? 'selected' : ''}`;
                card.dataset.companyId = companyId;
                card.onclick = () => selectCompany(companyId);
                const initial = escapeHtml((company.name || '?').trim().charAt(0).toUpperCase());
                const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(company.color || '') ? company.color : '#2563eb';
                card.innerHTML = `
                    <div class="company-card-header">
                        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                            <div class="company-logo-placeholder" style="background:${safeColor};">${initial}</div>
                            <span class="company-name">${escapeHtml(company.name)}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${company.verified ? `
                            <span class="verified-badge">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <path d="M9 12l2 2 4-4"/>
                                    <circle cx="12" cy="12" r="10"/>
                                </svg>
                                Verificada
                            </span>` : ''}
                            <button class="fav-star-btn ${isFav ? 'active' : ''}" data-company-id="${companyId}" title="Marcar como favorita">
                                ${appIcon('star', 18, '', isFav)}
                            </button>
                        </div>
                    </div>
                    <div class="company-meta">
                        <span class="company-online-count">${appIcon('bus', 13)} <span class="count-text">${onlineCount}/${Object.keys(vehicles).length}</span> en ruta</span>
                        <span>${appIcon('building', 13)} RUC: ${escapeHtml(company.ruc) || '—'}</span>
                    </div>
                    ${company.schedule ? `
                    <div class="company-schedule">
                        <span>${appIcon('clock', 13)} ${escapeHtml(company.schedule)}</span>
                    </div>` : ''}
                    <div class="company-route">
                        <span>${escapeHtml(company.route) || ''}</span>
                    </div>
                    ${(company.destinos && company.destinos.length) ? `
                    <div class="company-destinos-row">
                        ${company.destinos.slice(0, 4).map(d => `<span class="company-destino-chip">📍 ${escapeHtml(d)}</span>`).join('')}
                        ${company.destinos.length > 4 ? `<span class="company-destino-chip">+${company.destinos.length - 4}</span>` : ''}
                    </div>` : ''}
                `;
                const starBtn = card.querySelector('.fav-star-btn');
                starBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleFavorite(companyId);
                };
                list.appendChild(card);
            });
        }

        // Actualiza solo el texto "X/Y en ruta" de cada tarjeta ya existente,
        // sin recrear el DOM. Esto se llama cada segundo; renderCompanyList()
        // (la reconstruccion completa) solo se llama cuando cambian los datos
        // reales (nueva empresa, favorito marcado, etc.), no por el paso del tiempo.
        function updateCompanyListCounts() {
            const list = document.getElementById('companyList');
            if (!list) return;
            Object.keys(companies).forEach(companyId => {
                const card = list.querySelector(`[data-company-id="${companyId}"]`);
                if (!card) return;
                const company = companies[companyId];
                const vehicles = company.vehicles || {};
                const onlineCount = Object.keys(vehicles).filter(vid =>
                    isOnline((liveVehicles[companyId] || {})[vid])
                ).length;
                const countEl = card.querySelector('.count-text');
                if (countEl) countEl.textContent = `${onlineCount}/${Object.keys(vehicles).length}`;
            });
        }

        function selectCompany(companyId) {
            selectedCompanyId = companyId;
            const company = companies[companyId];
            if (!company) return;

            document.getElementById('passengerHomeScreen').style.display = 'none';
            document.getElementById('passengerListScreen').style.display = 'none';
            document.getElementById('passengerMapScreen').style.display = 'block';
            document.body.classList.add('map-fullscreen');
            document.getElementById('activeCompanyName').textContent = company.name;
            document.getElementById('activeCompanyBadge').style.display = company.verified ? 'inline-flex' : 'none';
            document.getElementById('favoriteToggleBtn').classList.toggle('active', !!favoriteCompanyIds[companyId]);

            setTimeout(() => {
                if (!map) initMap();
                map.invalidateSize();
                Object.keys(companies).forEach(cid => showRoute(cid, companies[cid]));
                const bounds = getRouteBoundsForCompany(companyId);
                if (bounds) {
                    map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.1, easeLinearity: 0.25 });
                }
                updateMapFromLiveData();
                renderStopsList(cachedFavoriteStops);
            }, 50);

            renderFleetSummary(companyId);
            listenIncidents(companyId);
        }

        function backToCompanyList() {
            document.getElementById('passengerMapScreen').style.display = 'none';
            document.getElementById('passengerListScreen').style.display = 'block';
            document.body.classList.remove('map-fullscreen');
            selectedCompanyId = null;
            // C2-fix: limpiar followingVehicle al salir del mapa para que
            // no siga rastreando el bus anterior cuando se abre otra empresa.
            followingVehicle = null;
            closeVehiclePanel();
            closeIncidentPanel();
            stopListenIncidents();
        }

        // ==================== INICIO / DASHBOARD DEL PASAJERO (Parte 31) ====================
        function showCompanyListFromHome() {
            document.getElementById('passengerHomeScreen').style.display = 'none';
            document.getElementById('passengerListScreen').style.display = 'block';
            setTimeout(() => document.getElementById('searchInput').focus(), 50);
        }

        function backToPassengerHome() {
            document.getElementById('passengerListScreen').style.display = 'none';
            document.getElementById('passengerHomeScreen').style.display = 'block';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) { searchInput.value = ''; filterCompanies(); }
        }

        // Saludo, stats y favoritos rapidos: todo con datos que ya estan en
        // memoria (companies/liveVehicles/favoriteCompanyIds), sin pedir
        // nada nuevo a Firebase. Se llama cada vez que esos datos cambian.
        function renderPassengerHome() {
            const greetingEl = document.getElementById('phGreetingText');
            if (greetingEl) {
                const hour = new Date().getHours();
                const greeting = hour < 12 ? 'Buenos días' : (hour < 19 ? 'Buenas tardes' : 'Buenas noches');
                greetingEl.textContent = `${greeting} 👋`;
            }

            const companyIds = Object.keys(companies || {});
            let onlineCount = 0;
            companyIds.forEach(cid => {
                const live = liveVehicles[cid] || {};
                Object.values(live).forEach(v => { if (isOnline(v)) onlineCount++; });
            });

            const statCompaniesEl = document.getElementById('phStatCompanies');
            const statOnlineEl = document.getElementById('phStatOnline');
            if (statCompaniesEl) statCompaniesEl.textContent = companyIds.length;
            if (statOnlineEl) statOnlineEl.textContent = onlineCount;

            const favSection = document.getElementById('phFavoritesSection');
            const favRow = document.getElementById('phFavoritesRow');
            if (!favSection || !favRow) return;
            const favIds = Object.keys(favoriteCompanyIds || {}).filter(id => companies[id]);
            if (!favIds.length) {
                favSection.style.display = 'none';
                return;
            }
            favSection.style.display = 'block';
            favRow.innerHTML = favIds.map(id => {
                const company = companies[id];
                const live = liveVehicles[id] || {};
                const online = Object.values(live).filter(v => isOnline(v)).length;
                const safeId = encodeURIComponent(id);
                // Parte 48: el punto de color debe reflejar si hay buses
                // activos. Antes siempre se mostraba 🟢 aunque el conteo
                // fuera 0, lo cual es contradictorio (verde = activo, pero
                // "0 en línea" dice que no hay nada).
                const statusDot = online > 0 ? '🟢' : '<span class="ph-fav-chip-dot-off"></span>';
                return `
                    <div class="ph-fav-chip" onclick="selectCompany(decodeURIComponent('${safeId}'))">
                        <div class="ph-fav-chip-name">${escapeHtml(company.name || id)}</div>
                        <div class="ph-fav-chip-meta">${statusDot} ${online} en línea</div>
                    </div>
                `;
            }).join('');
        }

        window.showCompanyListFromHome = showCompanyListFromHome;
        window.backToPassengerHome = backToPassengerHome;

        window.filterCompanies = filterCompanies;
        window.closeVehiclePanel = closeVehiclePanel;
        window.toggleFollowVehicle = toggleFollowVehicle;
        window.toggleFocusMode = toggleFocusMode;
        window.deactivateFocusMode = deactivateFocusMode;
        window.signalWaiting = signalWaiting;

        // ==================== REPORTAR INCIDENTE (Parte 28) ====================
        // Catalogo de tipos de incidente: icono + etiqueta para mostrar tanto
        // en los chips de seleccion como en el banner de incidentes activos.
        const INCIDENT_TYPES = {
            trafico:    { icon: '🚦', label: 'Tráfico' },
            desvio:     { icon: '↪️', label: 'Desvío' },
            paro:       { icon: '✊', label: 'Paro' },
            accidente:  { icon: '🚨', label: 'Accidente' },
            otro:       { icon: 'ℹ️', label: 'Otro' }
        };

        let selectedIncidentType = null;
        let lastIncidentReportAt = 0;
        let incidentListenerUnsub = null;

        function openIncidentPanel() {
            if (!selectedCompanyId) return;
            selectedIncidentType = null;
            document.querySelectorAll('.incident-type-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('incidentComment').value = '';
            document.getElementById('incidentPanel').classList.add('show');
            setPanelBackdrop(true);
        }

        function closeIncidentPanel() {
            document.getElementById('incidentPanel').classList.remove('show');
            setPanelBackdrop(false);
        }

        function selectIncidentType(type) {
            selectedIncidentType = type;
            document.querySelectorAll('.incident-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === type);
            });
        }

        function submitIncidentReport() {
            if (!selectedCompanyId) return;
            if (!selectedIncidentType) {
                showToast('Elige un tipo de incidente', 'info');
                return;
            }
            if (!window.firebaseReady) {
                showToast('Sin conexión, intenta de nuevo en un momento', 'error');
                return;
            }
            const now = Date.now();
            // Enfriamiento de 2 min entre reportes, para evitar que alguien
            // sature el banner con el mismo incidente repetido sin querer.
            if (now - lastIncidentReportAt < 2 * 60000) {
                showToast('Ya enviaste un reporte hace poco, espera un momento', 'info');
                return;
            }

            const comment = document.getElementById('incidentComment').value.trim().slice(0, 80);
            const incidentsRef = window.fbRef(window.fbDb, `incidentes/${selectedCompanyId}`);
            window.fbPush(incidentsRef, {
                type: selectedIncidentType,
                comment,
                timestamp: now
            }).then(() => {
                lastIncidentReportAt = now;
                showToast('Reporte enviado, gracias por avisar 🙌', 'success');
                closeIncidentPanel();
            }).catch(err => {
                showToast('No se pudo enviar el reporte', 'error');
                console.error('Error enviando reporte de incidente:', err);
            });
        }

        // Escucha los incidentes de la empresa que el pasajero esta viendo
        // y los pinta en el banner sobre el mapa. Se activa al entrar a una
        // empresa (selectCompany) y se apaga al salir (backToCompanyList).
        function listenIncidents(companyId) {
            stopListenIncidents();
            if (!window.firebaseReady) return;
            const incidentsRef = window.fbRef(window.fbDb, `incidentes/${companyId}`);
            incidentListenerUnsub = window.fbOnValue(incidentsRef, (snap) => {
                const data = snap.val() || {};
                const now = Date.now();
                const active = [];
                Object.keys(data).forEach(id => {
                    const entry = data[id];
                    const ageMs = now - (entry && entry.timestamp || 0);
                    // Un incidente reportado hace mas de 3 horas ya no es
                    // util para nadie; lo borramos para no acumular basura.
                    if (ageMs > 3 * 60 * 60 * 1000) {
                        window.fbSet(window.fbRef(window.fbDb, `incidentes/${companyId}/${id}`), null);
                        return;
                    }
                    active.push({ id, ...entry });
                });
                active.sort((a, b) => b.timestamp - a.timestamp);
                renderIncidentBanner(active.slice(0, 5));
            });
        }

        function stopListenIncidents() {
            if (incidentListenerUnsub) {
                incidentListenerUnsub();
                incidentListenerUnsub = null;
            }
            renderIncidentBanner([]);
        }

        function renderIncidentBanner(incidents) {
            const banner = document.getElementById('incidentBanner');
            if (!banner) return;
            if (!incidents.length) {
                banner.style.display = 'none';
                banner.innerHTML = '';
                return;
            }
            banner.innerHTML = incidents.map(inc => {
                const meta = INCIDENT_TYPES[inc.type] || INCIDENT_TYPES.otro;
                return `
                    <div class="incident-banner-item">
                        <span class="incident-banner-type">${meta.icon} ${escapeHtml(meta.label)}</span>
                        ${inc.comment ? `<span class="incident-banner-comment">${escapeHtml(inc.comment)}</span>` : ''}
                        <span class="incident-banner-time">${formatTimeAgo(inc.timestamp)}</span>
                    </div>
                `;
            }).join('');
            banner.style.display = 'flex';
        }

        window.openIncidentPanel = openIncidentPanel;
        window.closeIncidentPanel = closeIncidentPanel;
        window.selectIncidentType = selectIncidentType;
        window.submitIncidentReport = submitIncidentReport;

        // ==================== COMPARTIR VIAJE (Parte 35) ====================
        // Genera un enlace con la empresa+vehiculo actual (?empresa=X&vehiculo=Y)
        // para que quien lo reciba caiga directo en ese bus, no en la
        // pantalla de inicio. Usa la Web Share API nativa del celular; si el
        // navegador no la soporta (tipico en desktop), copia el texto al
        // portapapeles como respaldo. Cero APIs externas, cero costo.
        function shareVehicleTrip() {
            if (!window._openPanel) return;
            const { companyId, vehicleId } = window._openPanel;
            const company = companies[companyId];
            if (!company) return;
            const vehicle = (company.vehicles || {})[vehicleId] || {};
            const live = (liveVehicles[companyId] || {})[vehicleId];
            const eta = live ? estimateEtaMinutes(company, live) : null;
            const plate = vehicle.plate || vehicleId;

            const url = `${location.origin}${location.pathname}?empresa=${encodeURIComponent(companyId)}&vehiculo=${encodeURIComponent(vehicleId)}`;
            const text = `Estoy siguiendo el bus ${plate} de ${company.name} en Vura${eta ? `, llega en ~${eta} min` : ''}. Mira su ubicación en vivo aquí:`;

            if (navigator.share) {
                navigator.share({ title: 'Vura — Sigue mi viaje', text, url }).catch(() => {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                    showToast('Enlace copiado, pégalo donde quieras compartirlo', 'success');
                }).catch(() => {
                    showToast('No se pudo copiar el enlace', 'error');
                });
            } else {
                showToast('Tu navegador no permite compartir directamente', 'error');
            }
        }

        window.shareVehicleTrip = shareVehicleTrip;

        // ==================== PARADEROS FAVORITOS (Parte 36) ====================
        // Mismo patron que favoritos de empresa (un nodo en Firebase por
        // usuario), pero guardando un punto del mapa en vez de un id de
        // empresa. En vez de pedir permiso de GPS, se guarda el CENTRO del
        // mapa que el pasajero ya tiene abierto: asi puede marcar cualquier
        // punto de la ruta (su parada de siempre), no solo donde esta
        // parado en ese momento.
        let stopsListenerUnsub = null;
        let cachedFavoriteStops = {};
        let stopMarkers = {};

        function openStopsPanel() {
            document.getElementById('stopsPanel').classList.add('show');
            setPanelBackdrop(true);
        }

        function closeStopsPanel() {
            document.getElementById('stopsPanel').classList.remove('show');
            setPanelBackdrop(false);
        }

        function saveCurrentMapCenterAsStop() {
            if (!currentUserId) {
                showToast('Inicia sesión o entra como invitado para guardar paraderos', 'info');
                return;
            }
            if (!map) return;
            const name = prompt('¿Cómo quieres llamar a este paradero? (ej: Casa, Trabajo)');
            if (!name || !name.trim()) return;
            const center = map.getCenter();
            const stopsRef = window.fbRef(window.fbDb, `paraderos_favoritos/${currentUserId}`);
            window.fbPush(stopsRef, {
                name: name.trim().slice(0, 40),
                lat: center.lat,
                lng: center.lng,
                createdAt: Date.now()
            }).then(() => showToast('Paradero guardado 📍', 'success'))
              .catch(() => showToast('No se pudo guardar el paradero', 'error'));
        }

        function listenFavoriteStops(uid) {
            if (stopsListenerUnsub) { stopsListenerUnsub(); stopsListenerUnsub = null; }
            if (!uid) {
                cachedFavoriteStops = {};
                renderStopsList({});
                return;
            }
            const stopsRef = window.fbRef(window.fbDb, `paraderos_favoritos/${uid}`);
            stopsListenerUnsub = window.fbOnValue(stopsRef, (snap) => {
                cachedFavoriteStops = snap.val() || {};
                renderStopsList(cachedFavoriteStops);
            });
        }

        function renderStopsList(stops) {
            const list = document.getElementById('stopsList');
            if (list) {
                const ids = Object.keys(stops);
                list.innerHTML = ids.length
                    ? ids.map(id => `
                        <div class="stop-row">
                            <div class="stop-row-name" onclick="focusFavoriteStop('${id}')">📍 ${escapeHtml(stops[id].name)}</div>
                            <button class="stop-row-delete" onclick="deleteFavoriteStop('${id}')">${appIcon('trash', 16)}</button>
                        </div>
                    `).join('')
                    : '<p class="fleet-empty">Todavía no guardaste ningún paradero.</p>';
            }

            // Pines en el mapa para que se vean siempre, no solo dentro del
            // panel. Si el mapa todavia no existe (aun no se entro a una
            // empresa), selectCompany() los vuelve a pintar mas adelante
            // usando cachedFavoriteStops.
            if (!map) return;
            Object.values(stopMarkers).forEach(m => map.removeLayer(m));
            stopMarkers = {};
            Object.keys(stops).forEach(id => {
                const s = stops[id];
                const marker = L.marker([s.lat, s.lng], {
                    icon: L.divIcon({ className: 'stop-marker-icon', html: '📍', iconSize: [24, 24], iconAnchor: [12, 22] })
                }).addTo(map).bindPopup(`
                    <div class="popup-title">📍 ${escapeHtml(s.name)}</div>
                    <div class="popup-info">Tu paradero favorito</div>
                `);
                stopMarkers[id] = marker;
            });
        }

        function focusFavoriteStop(id) {
            const marker = stopMarkers[id];
            if (marker && map) {
                map.flyTo(marker.getLatLng(), 16, { duration: 1, easeLinearity: 0.25 });
                setTimeout(() => marker.openPopup(), 350);
            }
            closeStopsPanel();
        }

        function deleteFavoriteStop(id) {
            if (!currentUserId) return;
            window.fbSet(window.fbRef(window.fbDb, `paraderos_favoritos/${currentUserId}/${id}`), null);
        }

        window.openStopsPanel = openStopsPanel;
        window.closeStopsPanel = closeStopsPanel;
        window.saveCurrentMapCenterAsStop = saveCurrentMapCenterAsStop;
        window.focusFavoriteStop = focusFavoriteStop;
        window.deleteFavoriteStop = deleteFavoriteStop;

        // ==================== CLIMA (Parte 38) ====================
        // Open-Meteo: API publica gratuita, sin API key ni cuenta. Se
        // consulta una sola vez por sesion (cacheada en localStorage por
        // 30 minutos) para no golpear la API en cada apertura de la app.
        const WEATHER_CACHE_KEY = 'vura_weather_cache';
        const WEATHER_CACHE_MS = 30 * 60 * 1000;

        function weatherIconFor(code) {
            if (code === 0) return '☀️';
            if (code === 1 || code === 2) return '🌤';
            if (code === 3) return '☁️';
            if (code === 45 || code === 48) return '🌫';
            if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧';
            if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
            if (code === 95 || code === 96 || code === 99) return '⛈';
            return '🌡';
        }

        function renderWeatherChip(temp, code) {
            const chip = document.getElementById('phWeatherChip');
            if (chip) chip.textContent = `· ${weatherIconFor(code)} ${Math.round(temp)}°C`;
        }

        function fetchLimaWeather() {
            try {
                const cached = localStorage.getItem(WEATHER_CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.fetchedAt < WEATHER_CACHE_MS) {
                        renderWeatherChip(parsed.temp, parsed.code);
                        return;
                    }
                }
            } catch (e) { /* cache corrupta, simplemente se vuelve a pedir */ }

            fetch('https://api.open-meteo.com/v1/forecast?latitude=-12.0464&longitude=-77.0428&current_weather=true')
                .then(res => res.json())
                .then(data => {
                    const cw = data && data.current_weather;
                    if (!cw) return;
                    renderWeatherChip(cw.temperature, cw.weathercode);
                    try {
                        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
                            temp: cw.temperature, code: cw.weathercode, fetchedAt: Date.now()
                        }));
                    } catch (e) {}
                })
                .catch(err => console.warn('No se pudo obtener el clima:', err));
        }

        fetchLimaWeather();

        // ==================== BACKDROP COMPARTIDO (Parte 43) ====================
        // Un solo telon de fondo para los tres paneles deslizables
        // (vehiculo, incidente, paraderos). Tocar fuera del panel lo
        // cierra — closeAnyOpenPanel() detecta cual está abierto y llama
        // a su función de cierre correspondiente.
        function setPanelBackdrop(show) {
            const backdrop = document.getElementById('panelBackdrop');
            if (backdrop) backdrop.classList.toggle('show', show);
        }

        // ==================== RADAR VURA (Parte 50) ====================
        // Los 5 buses en linea mas cercanos a la ubicacion del pasajero,
        // sin importar la empresa. liveVehicles ya trae TODOS los vehiculos
        // de TODAS las empresas (listenLiveVehicles escucha el nodo
        // completo 'vehiculos_live'), asi que no hace falta pedir nada
        // adicional a Firebase para esto — solo geolocalizar al pasajero
        // una sola vez (no watchPosition, para no gastar bateria de mas) y
        // comparar distancias con haversine() (ya definida en utils.js).
        let radarWatchActive = false;

        function openRadarPanel() {
            document.getElementById('radarPanel').classList.add('show');
            setPanelBackdrop(true);
            locateAndRunRadar();
        }

        function closeRadarPanel() {
            document.getElementById('radarPanel').classList.remove('show');
            setPanelBackdrop(false);
            radarWatchActive = false;
        }

        function locateAndRunRadar() {
            const listEl = document.getElementById('radarList');
            if (!listEl) return;
            if (!navigator.geolocation) {
                listEl.innerHTML = '<p class="fleet-empty">Tu navegador no permite ubicarte automáticamente.</p>';
                return;
            }
            listEl.innerHTML = '<p class="fleet-empty">Buscando tu ubicación...</p>';
            radarWatchActive = true;
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (!radarWatchActive) return; // el panel se cerró mientras esperábamos el GPS
                    renderRadarResults(pos.coords.latitude, pos.coords.longitude);
                },
                (err) => {
                    listEl.innerHTML = '<p class="fleet-empty">No se pudo obtener tu ubicación. Revisa el permiso de GPS y vuelve a intentar.</p>';
                    console.warn('Error de geolocalización en Radar Vura:', err);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
        }

        function renderRadarResults(userLat, userLng) {
            const listEl = document.getElementById('radarList');
            if (!listEl) return;

            const results = [];
            Object.keys(liveVehicles).forEach(companyId => {
                const company = companies[companyId];
                if (!company) return;
                const companyLive = liveVehicles[companyId] || {};
                Object.keys(companyLive).forEach(vehicleId => {
                    const live = companyLive[vehicleId];
                    if (!isOnline(live)) return;
                    const distM = haversine(userLat, userLng, live.lat, live.lng);
                    const vehicle = (company.vehicles || {})[vehicleId] || {};
                    results.push({ companyId, vehicleId, company, vehicle, live, distM });
                });
            });

            if (!results.length) {
                listEl.innerHTML = '<p class="fleet-empty">No hay buses en línea cerca de ti en este momento.</p>';
                return;
            }

            results.sort((a, b) => a.distM - b.distM);
            const top5 = results.slice(0, 5);

            listEl.innerHTML = top5.map((r, i) => {
                const distLabel = r.distM < 1000
                    ? `${Math.round(r.distM)} m`
                    : `${(r.distM / 1000).toFixed(1)} km`;
                const plate = r.vehicle.plate || r.vehicleId;
                const moving = (r.live.speed || 0) >= 3;
                const speedTxt = moving ? `${Math.round(r.live.speed || 0)} km/h` : 'Detenido';
                return `
                    <div class="radar-result-row" onclick="goToRadarResult(decodeURIComponent('${encodeURIComponent(r.companyId)}'),decodeURIComponent('${encodeURIComponent(r.vehicleId)}'))">
                        <div class="radar-result-rank">${i + 1}</div>
                        <div class="radar-result-body">
                            <div class="radar-result-plate">${escapeHtml(plate)} · ${escapeHtml(r.company.name)}</div>
                            <div class="radar-result-meta">${speedTxt} · actualizado ${formatTimeAgo(r.live.timestamp)}</div>
                        </div>
                        <div class="radar-result-distance">
                            <div class="radar-result-distance-value">${distLabel}</div>
                            <div class="radar-result-distance-label">distancia</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Al tocar un resultado del radar: cierra el panel, entra a la
        // empresa correspondiente (aunque el pasajero nunca la haya
        // explorado antes) y abre el panel de detalle de ese vehiculo —
        // mismo patron que ya usa el enlace compartido por WhatsApp.
        function goToRadarResult(companyId, vehicleId) {
            closeRadarPanel();
            selectCompany(companyId);
            setTimeout(() => showVehiclePanel(companyId, vehicleId), 700);
        }

        window.openRadarPanel = openRadarPanel;
        window.closeRadarPanel = closeRadarPanel;
        window.goToRadarResult = goToRadarResult;

        function closeAnyOpenPanel() {
            if (document.getElementById('vehiclePanel').classList.contains('show')) closeVehiclePanel();
            if (document.getElementById('incidentPanel').classList.contains('show')) closeIncidentPanel();
            if (document.getElementById('stopsPanel').classList.contains('show')) closeStopsPanel();
            if (document.getElementById('notificationPanel').classList.contains('show')) closeNotificationPanel();
            if (document.getElementById('accessibilityPanel').classList.contains('show')) closeAccessibilityPanel();
            if (document.getElementById('radarPanel').classList.contains('show')) closeRadarPanel();
        }

        window.closeAnyOpenPanel = closeAnyOpenPanel;
        window.selectCompany = selectCompany;
        window.backToCompanyList = backToCompanyList;
