// passenger.js
// Vista del pasajero: lista de empresas (con favoritos), seleccion de
// empresa, resumen de flota con ETA, panel de detalle de un vehiculo,
// formato de "hace X tiempo". Depende de variables globales del script
// principal (companies, liveVehicles, favoriteCompanyIds, selectedCompanyId,
// map) y de funciones de map.js (initMap, showRoute, getRouteBoundsForCompany,
// updateMapFromLiveData, isOnline, estimateEtaMinutes, estimateDistanceKm,
// getActiveRoutePoints) y de auth.js (toggleFavorite). Debe cargarse antes
// del script principal, igual que map.js.

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
                const sentidoColor = live.sentido === 'retorno' ? '#dc2626' : '#2563eb';
                const chip = document.createElement('div');
                chip.className = 'fleet-chip';
                chip.onclick = () => showVehiclePanel(companyId, vid);
                chip.innerHTML = `
                    <div class="fleet-chip-top">
                        <span class="fleet-chip-name">
                            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sentidoColor};margin-right:4px;"></span>
                            ${appIcon('bus', 13)} ${escapeHtml(vehicle.plate || vid)}
                        </span>
                    </div>
                    <div class="fleet-chip-eta">${appIcon('clock', 12)} ${eta ? `~${eta} min` : 'Calculando...'}</div>
                    <div class="fleet-chip-speed">${Math.round(live.speed || 0)} km/h</div>
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
            window._openPanel = { companyId, vehicleId };
            refreshOpenPanel();
            document.getElementById('vehiclePanel').classList.add('show');
        }

        function refreshOpenPanel() {
            if (!window._openPanel) return;
            const { companyId, vehicleId } = window._openPanel;
            const company = companies[companyId];
            const vehicle = company && company.vehicles && company.vehicles[vehicleId];
            const live = (liveVehicles[companyId] || {})[vehicleId];
            if (!company || !vehicle) return;

            document.getElementById('vehiclePanelTitle').textContent = `Vehículo ${vehicle.plate || vehicleId}`;
            document.getElementById('vpCompany').textContent = company.name;
            document.getElementById('vpPlate').textContent = vehicle.plate || vehicleId;

            const speed = live ? Math.round(live.speed || 0) : 0;
            document.getElementById('vpSpeed').textContent = `${speed} km/h`;

            const sentidoEl = document.getElementById('vpSentido');
            if (live && live.sentido === 'retorno') {
                sentidoEl.textContent = '🔴 Retorno';
                sentidoEl.style.color = '#dc2626';
            } else if (live) {
                sentidoEl.textContent = '🔵 Ida';
                sentidoEl.style.color = '#2563eb';
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

            document.getElementById('vpUpdate').textContent = live ? formatTimeAgo(live.timestamp) : '—';

            const accuracyEl = document.getElementById('vpAccuracy');
            const acc = live ? Math.round(live.accuracy || 0) : null;
            accuracyEl.textContent = acc ? `±${acc} m` : '—';
            accuracyEl.className = !acc ? '' : acc < 20 ? 'accuracy-good' : acc < 100 ? 'accuracy-medium' : 'accuracy-bad';
        }

        function closeVehiclePanel() {
            document.getElementById('vehiclePanel').classList.remove('show');
            window._openPanel = null;
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

            document.getElementById('passengerListScreen').style.display = 'none';
            document.getElementById('passengerMapScreen').style.display = 'block';
            document.getElementById('activeCompanyName').textContent = company.name;
            document.getElementById('activeCompanyBadge').style.display = company.verified ? 'inline-flex' : 'none';
            document.getElementById('favoriteToggleBtn').classList.toggle('active', !!favoriteCompanyIds[companyId]);

            setTimeout(() => {
                if (!map) initMap();
                map.invalidateSize();
                Object.keys(companies).forEach(cid => showRoute(cid, companies[cid]));
                const bounds = getRouteBoundsForCompany(companyId);
                if (bounds) {
                    map.fitBounds(bounds, { padding: [40, 40] });
                }
                updateMapFromLiveData();
            }, 50);

            renderFleetSummary(companyId);
        }

        function backToCompanyList() {
            document.getElementById('passengerMapScreen').style.display = 'none';
            document.getElementById('passengerListScreen').style.display = 'block';
            selectedCompanyId = null;
            closeVehiclePanel();
        }

        window.filterCompanies = filterCompanies;
        window.closeVehiclePanel = closeVehiclePanel;
        window.selectCompany = selectCompany;
        window.backToCompanyList = backToCompanyList;
