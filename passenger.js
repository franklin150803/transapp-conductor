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
                    </div>
                `;
                wrap.appendChild(chip);
            });
        }

        function filterCompanies() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const ids = Object.keys(companies);
            const cards = document.querySelectorAll('.company-card');
            ids.forEach((companyId, idx) => {
                if (cards[idx]) {
                    const company = companies[companyId];
                    const match = (company.name || '').toLowerCase().includes(query) ||
                                  (company.route || '').toLowerCase().includes(query);
                    cards[idx].style.display = match ? 'block' : 'none';
                }
            });
        }

        function showVehiclePanel(companyId, vehicleId) {
            // Si se abre el panel de OTRO vehiculo, dejamos de seguir al anterior.
            if (followingVehicle && (followingVehicle.companyId !== companyId || followingVehicle.vehicleId !== vehicleId)) {
                followingVehicle = null;
            }
            window._openPanel = { companyId, vehicleId };
            refreshOpenPanel();
            document.getElementById('vehiclePanel').classList.add('show');
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
                sentidoEl.textContent = '🔴 Retorno';
                sentidoEl.style.color = '#ff5252';
            } else if (live) {
                sentidoEl.textContent = '🔵 Ida';
                sentidoEl.style.color = '#22d3ee';
            } else {
                sentidoEl.textContent = '—';
                sentidoEl.style.color = '';
            }

            const distEl = document.getElementById('vpDistance');
            const etaEl = document.getElementById('vpEta');
            if (live && isOnline(live)) {
                const distKm = estimateDistanceKm(company, live);
                const eta = estimateEtaMinutes(company, live);
                distEl.textContent = distKm !== null ? `${distKm.toFixed(1)} km` : '—';
                etaEl.textContent = eta !== null ? `~${eta} min` : '—';
            } else {
                distEl.textContent = '—';
                etaEl.textContent = '—';
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
                const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(company.color || '') ? company.color : '#0d9488';
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
                                ${isFav ? '★' : '☆'}
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
            document.getElementById('passengerMapScreen').style.display = 'contents';
            document.getElementById('activeCompanyName').textContent = company.name;
            document.getElementById('activeCompanyBadge').style.display = company.verified ? 'inline-flex' : 'none';
            document.getElementById('favoriteToggleBtn').classList.toggle('active', !!favoriteCompanyIds[companyId]);

            setTimeout(() => {
                if (!map) initMap();
                map.invalidateSize();
                Object.keys(companies).forEach(cid => showRoute(cid, companies[cid]));
                const bounds = getRouteBoundsForCompany(companyId);
                if (bounds) {
                    map.fitBounds(bounds, { paddingTopLeft: [16, 130], paddingBottomRight: [16, 140] });
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
            selectedCompanyId = null;
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
                return `
                    <div class="ph-fav-chip" onclick="selectCompany('${id}')">
                        <div class="ph-fav-chip-name">${escapeHtml(company.name || id)}</div>
                        <div class="ph-fav-chip-meta">🟢 ${online} en línea</div>
                    </div>
                `;
            }).join('');
        }

        window.showCompanyListFromHome = showCompanyListFromHome;
        window.backToPassengerHome = backToPassengerHome;

        window.filterCompanies = filterCompanies;
        window.closeVehiclePanel = closeVehiclePanel;
        window.toggleFollowVehicle = toggleFollowVehicle;
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
        }

        function closeIncidentPanel() {
            document.getElementById('incidentPanel').classList.remove('show');
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
        }

        function closeStopsPanel() {
            document.getElementById('stopsPanel').classList.remove('show');
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
                            <button class="stop-row-delete" onclick="deleteFavoriteStop('${id}')">🗑</button>
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
                }).addTo(map).bindPopup(escapeHtml(s.name));
                stopMarkers[id] = marker;
            });
        }

        function focusFavoriteStop(id) {
            const marker = stopMarkers[id];
            if (marker && map) {
                map.setView(marker.getLatLng(), 16);
                marker.openPopup();
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
        window.selectCompany = selectCompany;
        window.backToCompanyList = backToCompanyList;
