// passenger.js
// Vista del pasajero: lista de empresas (con favoritos), seleccion de
// empresa, resumen de flota con ETA, panel de detalle de un vehiculo,
// formato de "hace X tiempo". Depende de variables globales del script
// principal (companies, liveVehicles, favoriteCompanyIds, selectedCompanyId,
// map) y de funciones de map.js (initMap, showRoute, getRouteBoundsForCompany,
// updateMapFromLiveData, isOnline, estimateEtaMinutes, estimateDistanceKm,
// getActiveRoutePoints, isCompanyRegistered, getCompanyStatusBadge) y de
// auth.js (toggleFavorite). Debe cargarse antes del script principal.

        // Si esta activo, el mapa centra la camara en este vehiculo cada
        // vez que se actualiza su posicion (boton "Seguir vehiculo").
        let followingVehicle = null;

        // ==================== RESUMEN DE FLOTA (MODIFICADO) ====================
        // Solo muestra vehículos si la empresa está REGISTRADA
        function renderFleetSummary(companyId) {
            const company = companies[companyId];
            const wrap = document.getElementById('fleetSummary');
            
            // Usar DocumentFragment para evitar reflows
            const fragment = document.createDocumentFragment();
            wrap.innerHTML = '';

            // Si la empresa NO está registrada, mostrar mensaje informativo
            if (!company || company.registered !== true) {
                const msg = document.createElement('div');
                msg.className = 'fleet-empty';
                msg.style.cssText = 'background:rgba(37,99,235,0.1); border-color:rgba(37,99,235,0.3);';
                msg.innerHTML = `
                    <span style="font-size:1.2rem; margin-right:8px;">📋</span>
                    Esta ruta está disponible, pero la empresa aún no se ha registrado.
                    <span style="display:block; font-size:0.7rem; color:var(--text-muted); margin-top:4px;">
                        Cuando se registre, podrás ver sus vehículos en tiempo real.
                    </span>
                `;
                fragment.appendChild(msg);
                wrap.appendChild(fragment);
                return;
            }

            const vehicles = company.vehicles || {};
            const onlineIds = Object.keys(vehicles).filter(vid => isOnline((liveVehicles[companyId] || {})[vid]));

            if (onlineIds.length === 0) {
                const msg = document.createElement('div');
                msg.className = 'fleet-empty';
                msg.textContent = 'Ningún vehículo de esta empresa está en ruta ahora mismo.';
                fragment.appendChild(msg);
                wrap.appendChild(fragment);
                return;
            }

            onlineIds.forEach(vid => {
                const vehicle = vehicles[vid];
                const live = liveVehicles[companyId][vid];
                const eta = estimateEtaMinutes(company, live);
                const conf = eta !== null ? estimateEtaConfidence(live) : null;
                const sentidoColor = live.sentido === 'retorno' ? '#ef4444' : '#0ea5e9';
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
                fragment.appendChild(chip);
            });
            
            wrap.appendChild(fragment);
        }

        // ==================== FILTRAR EMPRESAS ====================
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

        // ==================== PANEL DE VEHÍCULO ====================
        function showVehiclePanel(companyId, vehicleId) {
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
                const live = (liveVehicles[followingVehicle.companyId] || {})[followingVehicle.vehicleId];
                if (live && map) map.panTo([live.lat, live.lng]);
            }
        }

        // ==================== MODO ENFOQUE ====================
        let waitingFocusVehicle = null;
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
                sentidoEl.innerHTML = '<span class="status-dot-small stopped" style="background:#ef4444;animation:none;"></span>Retorno';
                sentidoEl.style.color = '#ef4444';
            } else if (live) {
                sentidoEl.innerHTML = '<span class="status-dot-small" style="background:#0ea5e9;animation:none;"></span>Ida';
                sentidoEl.style.color = '#0ea5e9';
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
        // ==================== AVISO "PASAJERO ESPERANDO" ====================
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

        // ==================== RENDER LISTA DE EMPRESAS (MODIFICADO) ====================
        // Ahora muestra el estado de la empresa (registrada o no)
        function renderCompanyList() {
                    const list = document.getElementById('companyList');
                    if (!list) return;
                    list.innerHTML = '';
            
                    // Usar DocumentFragment para evitar reflows
                    const fragment = document.createDocumentFragment();

                    const orderedIds = Object.keys(companies).sort((a, b) => {
                        const favA = favoriteCompanyIds[a] ? 1 : 0;
                        const favB = favoriteCompanyIds[b] ? 1 : 0;
                        return favB - favA;
                    });

                    orderedIds.forEach(companyId => {
                        const company = companies[companyId];
                        const vehicles = company.vehicles || {};
                        const isRegistered = company.registered === true;
                        const onlineCount = isRegistered ? Object.keys(vehicles).filter(vid =>
                            isOnline((liveVehicles[companyId] || {})[vid])
                        ).length : 0;
                        const isFav = !!favoriteCompanyIds[companyId];

                        const card = document.createElement('div');
                        card.className = `company-card ${selectedCompanyId === companyId ? 'selected' : ''}`;
                        card.dataset.companyId = companyId;
                        card.onclick = () => selectCompany(companyId);
                        const initial = escapeHtml((company.name || '?').trim().charAt(0).toUpperCase());
                        const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(company.color || '') ? company.color : '#2563eb';

                        // Badge de estado de la empresa
                        let statusBadge = '';
                        if (isRegistered) {
                            statusBadge = `<span class="company-status-badge registered">Activa</span>`;
                        } else {
                            statusBadge = `<span class="company-status-badge unregistered">Ruta</span>`;
                        }

                        // Mostrar conteo de vehículos solo si está registrada
                        let vehicleCountHtml = '';
                        if (isRegistered) {
                            vehicleCountHtml = `<span class="company-online-count">${appIcon('bus', 12)} <span class="count-text">${onlineCount}/${Object.keys(vehicles).length}</span> en ruta</span>`;
                        }

                        const rucHtml = company.ruc ? `<span>RUC ${escapeHtml(company.ruc)}</span>` : '';

                        card.innerHTML = `
                            <div class="company-card-header">
                                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                                    <div class="company-logo-placeholder" style="background:${safeColor}15; color:${safeColor}; border: 1px solid ${safeColor}28;">${appIcon('bus', 16)}</div>
                                    <div style="min-width:0;">
                                        <div class="company-name">${escapeHtml(company.name)}</div>
                                        ${company.route ? `<div class="company-route" style="margin-top:2px;">${escapeHtml(company.route)}</div>` : ''}
                                    </div>
                                </div>
                                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                    ${statusBadge}
                                    <button class="fav-star-btn ${isFav ? 'active' : ''}" data-company-id="${companyId}" title="Marcar como favorita">
                                        ${appIcon('star', 16, '', isFav)}
                                    </button>
                                </div>
                            </div>
                            <div class="company-meta">
                                ${vehicleCountHtml}
                                ${rucHtml}
                                ${company.schedule ? `<span>${appIcon('clock', 12)} ${escapeHtml(company.schedule)}</span>` : ''}
                            </div>
                            ${(company.destinos && company.destinos.length) ? `
                            <div class="company-destinos-row">
                                ${company.destinos.slice(0, 3).map(d => `<span class="company-destino-chip">${escapeHtml(d)}</span>`).join('')}
                                ${company.destinos.length > 3 ? `<span class="company-destino-chip">+${company.destinos.length - 3} más</span>` : ''}
                            </div>` : ''}
                        `;
                        const starBtn = card.querySelector('.fav-star-btn');
                        starBtn.onclick = (e) => {
                            e.stopPropagation();
                            toggleFavorite(companyId);
                        };
                        fragment.appendChild(card);
                    });
            
                    list.appendChild(fragment);
                }

        // Actualiza solo el texto "X/Y en ruta" de cada tarjeta ya existente
        function updateCompanyListCounts() {
            const list = document.getElementById('companyList');
            if (!list) return;
            Object.keys(companies).forEach(companyId => {
                const card = list.querySelector(`[data-company-id="${companyId}"]`);
                if (!card) return;
                const company = companies[companyId];
                const isRegistered = company.registered === true;
                const vehicles = company.vehicles || {};
                const onlineCount = isRegistered ? Object.keys(vehicles).filter(vid =>
                    isOnline((liveVehicles[companyId] || {})[vid])
                ).length : 0;
                const countEl = card.querySelector('.count-text');
                if (countEl) {
                    if (isRegistered) {
                        countEl.textContent = `${onlineCount}/${Object.keys(vehicles).length}`;
                    } else {
                        countEl.textContent = 'No registrada';
                    }
                }
            });
        }

        // ==================== SELECCIONAR EMPRESA (MODIFICADO) ====================
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

            // Mostrar badge de estado de la empresa en el mapa
            const statusBadgeEl = document.getElementById('activeCompanyStatus');
            if (!statusBadgeEl) {
                const badge = document.createElement('span');
                badge.id = 'activeCompanyStatus';
                badge.className = 'company-status-badge';
                document.getElementById('activeCompanyBadge').parentNode.appendChild(badge);
            }
            const statusEl = document.getElementById('activeCompanyStatus');
            if (statusEl) {
                if (company.registered === true) {
                    statusEl.className = 'company-status-badge registered';
                    statusEl.textContent = '✅ Activa';
                } else {
                    statusEl.className = 'company-status-badge unregistered';
                    statusEl.textContent = '📋 Ruta disponible';
                }
            }

            setTimeout(() => {
                if (!map) initMap();
                map.invalidateSize();
                Object.keys(companies).forEach(cid => showRoute(cid, companies[cid]));
                const bounds = getRouteBoundsForCompany(companyId);
                if (bounds) {
                    map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.1, easeLinearity: 0.25 });
                }
                updateMapFromLiveData();
            }, 50);

            renderFleetSummary(companyId);
            listenIncidents(companyId);
        }

        function backToCompanyList() {
            document.getElementById('passengerMapScreen').style.display = 'none';
            document.getElementById('passengerListScreen').style.display = 'block';
            document.body.classList.remove('map-fullscreen');
            selectedCompanyId = null;
            followingVehicle = null;
            closeVehiclePanel();
            closeIncidentPanel();
            stopListenIncidents();
        }
        // ==================== INICIO / DASHBOARD DEL PASAJERO ====================
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
                const company = companies[cid];
                // Solo contar vehículos de empresas registradas
                if (company && company.registered === true) {
                    const live = liveVehicles[cid] || {};
                    Object.values(live).forEach(v => { if (isOnline(v)) onlineCount++; });
                }
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
                const isRegistered = company.registered === true;
                const live = liveVehicles[id] || {};
                const online = isRegistered ? Object.values(live).filter(v => isOnline(v)).length : 0;
                const safeId = encodeURIComponent(id);
                const statusDot = isRegistered 
                    ? (online > 0 ? '🟢' : '<span class="ph-fav-chip-dot-off"></span>')
                    : '📋';
                return `
                    <div class="ph-fav-chip" onclick="selectCompany(decodeURIComponent('${safeId}'))">
                        <div class="ph-fav-chip-name">${escapeHtml(company.name || id)}</div>
                        <div class="ph-fav-chip-meta">${statusDot} ${isRegistered ? online + ' en línea' : 'Ruta disponible'}</div>
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

        // ==================== REPORTAR INCIDENTE ====================
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

        // ==================== COMPARTIR VIAJE ====================
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
                showToast('Tu navegador no permite compartir directamente', 'info');
            }
        }

        window.shareVehicleTrip = shareVehicleTrip;

        window.userLocationMarker = null;
        window.centerOnUserLocation = function() {
            const fallbackToIp = () => {
                showToast("Obteniendo ubicación por IP real del proveedor...", "info");
                fetch('https://ipapi.co/json/')
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.latitude && data.longitude) {
                            const lat = data.latitude;
                            const lng = data.longitude;
                            if (map) {
                                map.setView([lat, lng], 15);
                                if (window.userLocationMarker) {
                                    window.userLocationMarker.setLatLng([lat, lng]);
                                } else {
                                    window.userLocationMarker = L.marker([lat, lng], {
                                        icon: L.divIcon({
                                            className: 'user-location-marker',
                                            html: '<div style="width:16px; height:16px; border-radius:50%; background:#2563eb; border:3px solid white; box-shadow:0 0 10px rgba(37,99,235,0.6);"></div>'
                                        })
                                    }).addTo(map);
                                }
                                showToast(`Ubicación real por IP: ${data.city}, ${data.country_name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`, "success");
                            }
                        } else {
                            showToast("No se pudo obtener la geolocalización por IP.", "error");
                        }
                    })
                    .catch(() => {
                        showToast("Error en servicio de localización por IP.", "error");
                    });
            };

            if (!navigator.geolocation) {
                fallbackToIp();
                return;
            }

            showToast("Buscando tu ubicación por GPS/Simulador...", "info");
            navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                // Si el simulador nos fuerza en Lima por defecto pero el usuario está testeando remotamente
                const isLimaMock = Math.abs(lat - (-12.0464)) < 0.005 && Math.abs(lng - (-77.0428)) < 0.005;
                if (isLimaMock) {
                    fallbackToIp();
                    return;
                }

                if (map) {
                    map.setView([lat, lng], 15);
                    if (window.userLocationMarker) {
                        window.userLocationMarker.setLatLng([lat, lng]);
                    } else {
                        window.userLocationMarker = L.marker([lat, lng], {
                            icon: L.divIcon({
                                className: 'user-location-marker',
                                html: '<div style="width:16px; height:16px; border-radius:50%; background:#2563eb; border:3px solid white; box-shadow:0 0 10px rgba(37,99,235,0.6);"></div>'
                            })
                        }).addTo(map);
                    }
                    showToast(`Ubicación por GPS encontrada: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "success");
                }
            }, (err) => {
                fallbackToIp();
            }, { enableHighAccuracy: true, timeout: 4000 });
        };
