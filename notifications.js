// notifications.js
// Sistema de avisos: cola de mensajes "toast" (para que dos avisos no se
// pisen entre si) y deteccion de eventos que merecen notificar al
// pasajero (un vehiculo inicio su recorrido, un vehiculo esta a pocos
// minutos de llegar). Importante: esto solo funciona mientras la app
// esta abierta y visible; no es una notificacion push real.
// Depende de variables/funciones globales: currentUserId, companies,
// favoriteCompanyIds, selectedCompanyId, previousLiveVehicles,
// notifiedEtaKeys, isOnline(), estimateEtaMinutes() (de map.js).

        // ==================== TOAST ====================
        let toastQueue = [];
        let toastShowing = false;

        // ==================== CENTRO DE NOTIFICACIONES (Parte 47) ====================
        // Antes, cada toast desaparecia a los 3s y se perdia para siempre.
        // Ahora ademas se guarda en un historial corto (ultimos 30 avisos),
        // persistido en localStorage para que sobreviva a un refresh. El
        // contador de "no leidos" se resetea al abrir el panel.
        const NOTIF_HISTORY_KEY = 'vura_notif_history';
        const NOTIF_HISTORY_MAX = 30;
        let notificationHistory = [];
        let unreadNotifCount = 0;

        function loadNotificationHistory() {
            try {
                const raw = localStorage.getItem(NOTIF_HISTORY_KEY);
                notificationHistory = raw ? JSON.parse(raw) : [];
            } catch (e) {
                notificationHistory = [];
            }
        }

        function saveNotificationHistory() {
            try { localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(notificationHistory)); } catch (e) {}
        }

        function recordNotification(message, type) {
            notificationHistory.unshift({ message, type, timestamp: Date.now() });
            if (notificationHistory.length > NOTIF_HISTORY_MAX) {
                notificationHistory = notificationHistory.slice(0, NOTIF_HISTORY_MAX);
            }
            saveNotificationHistory();
            unreadNotifCount++;
            updateNotifBellBadge();
        }

        function updateNotifBellBadge() {
            const badge = document.getElementById('notifBellBadge');
            if (!badge) return;
            if (unreadNotifCount > 0) {
                badge.textContent = unreadNotifCount > 9 ? '9+' : String(unreadNotifCount);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function renderNotificationList() {
            const list = document.getElementById('notificationList');
            if (!list) return;
            if (notificationHistory.length === 0) {
                list.innerHTML = '<div class="notif-empty">Todavía no tienes notificaciones.<br>Aquí van apareciendo los avisos de tus buses favoritos.</div>';
                return;
            }
            const iconByType = { success: '✓', error: '✕', info: 'ℹ' };
            list.innerHTML = notificationHistory.map(n => `
                <div class="notif-item">
                    <span class="notif-item-icon">${iconByType[n.type] || 'ℹ'}</span>
                    <div>
                        <div class="notif-item-msg">${escapeHtml(n.message)}</div>
                        <div class="notif-item-time">${formatTimeAgo(n.timestamp)}</div>
                    </div>
                </div>
            `).join('');
        }

        function openNotificationPanel() {
            renderNotificationList();
            document.getElementById('notificationPanel').classList.add('show');
            setPanelBackdrop(true);
            unreadNotifCount = 0;
            updateNotifBellBadge();
        }

        function closeNotificationPanel() {
            document.getElementById('notificationPanel').classList.remove('show');
            setPanelBackdrop(false);
        }

        function clearNotificationHistory() {
            notificationHistory = [];
            saveNotificationHistory();
            renderNotificationList();
        }

        window.openNotificationPanel = openNotificationPanel;
        window.closeNotificationPanel = closeNotificationPanel;
        window.clearNotificationHistory = clearNotificationHistory;

        loadNotificationHistory();

        function showToast(message, type = 'success') {
            toastQueue.push({ message, type });
            recordNotification(message, type);
            processToastQueue();
        }

        function processToastQueue() {
            if (toastShowing || toastQueue.length === 0) return;
            toastShowing = true;
            const { message, type } = toastQueue.shift();

            const toast = document.getElementById('toast');
            const icon = document.getElementById('toastIcon');
            const msg = document.getElementById('toastMessage');
            icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
            icon.className = `toast-icon ${type}`;
            msg.textContent = message;
            toast.classList.add('show');

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toastShowing = false;
                    processToastQueue();
                }, 300);
            }, 3000);
        }

        // Revisa los vehiculos de la empresa que el pasajero tiene abierta (o sus
        // favoritas) y dispara un aviso visual (toast) cuando: un vehiculo recien
        // inicia su recorrido, o un vehiculo cruza el umbral de ~3 minutos de llegada.
        // Solo funciona mientras la app esta abierta (no es notificacion push real).
        function checkNotifiableEvents(newLiveVehicles) {
            if (!currentUserId) return; // sin sesion, no molestamos con avisos

            const relevantCompanyIds = selectedCompanyId
                ? [selectedCompanyId]
                : Object.keys(favoriteCompanyIds);

            relevantCompanyIds.forEach(companyId => {
                const company = companies[companyId];
                if (!company || !company.vehicles) return;

                const prevForCompany = previousLiveVehicles[companyId] || {};
                const newForCompany = newLiveVehicles[companyId] || {};

                Object.keys(company.vehicles).forEach(vehicleId => {
                    const vehicle = company.vehicles[vehicleId];
                    const prevLive = prevForCompany[vehicleId];
                    const newLive = newForCompany[vehicleId];
                    const plate = vehicle.plate || vehicleId;

                    const wasOnline = isOnline(prevLive);
                    const isNowOnline = isOnline(newLive);

                    // Evento 1: el vehiculo acaba de iniciar su recorrido.
                    if (!wasOnline && isNowOnline) {
                        showToast(`🚌 El vehículo ${plate} de ${company.name} acaba de iniciar su recorrido.`, 'info');
                    }

                    // Evento 2: el vehiculo cruzo el umbral de ~3 minutos de llegada.
                    const etaKey = companyId + '__' + vehicleId;
                    if (isNowOnline) {
                        const eta = estimateEtaMinutes(company, newLive);
                        if (eta !== null && eta <= 3 && !notifiedEtaKeys[etaKey]) {
                            notifiedEtaKeys[etaKey] = true;
                            showToast(`⏱ El vehículo ${plate} está a ${eta} min de tu zona.`, 'success');
                        } else if (eta !== null && eta > 5) {
                            // se aleja de nuevo; permitir que vuelva a notificar si se acerca otra vez
                            notifiedEtaKeys[etaKey] = false;
                        }
                    } else {
                        notifiedEtaKeys[etaKey] = false;
                    }
                });
            });
        }
