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

        function showToast(message, type = 'success') {
            toastQueue.push({ message, type });
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
