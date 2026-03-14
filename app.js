// Map Initialization
const map = L.map('map', {
    zoomControl: false,
    zoomAnimation: true
}).setView([51.505, -0.09], 13); // Default London, will attempt to geolocate

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Dark styled OpenStreetMap tiles filter applied via CSS
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap Paranoid Edition'
}).addTo(map);

// System State
let state = {
    start: null,
    end: null,
    isParanoid: true,
    trustLevel: 0,
    maxTrust: 5,
    tapTimestamps: [],
    routeLayer: null,
    startMarker: null,
    endMarker: null,
    paranoidWaypoints: []
};

// UI Elements
const uiCoordsStart = document.getElementById('start-coords');
const uiCoordsEnd = document.getElementById('end-coords');
const btnNavigate = document.getElementById('btn-navigate');
const btnClear = document.getElementById('btn-clear');
const modeIndicator = document.getElementById('mode-indicator');
const trustBar = document.getElementById('trust-bar');
const routeInfo = document.getElementById('route-info');
const routeDist = document.getElementById('route-dist');
const routeTime = document.getElementById('route-time');
const paranoidWarn = document.getElementById('paranoid-warning');

const psyModal = document.getElementById('psy-modal');
const trustModal = document.getElementById('trust-modal');
const btnBreathe = document.getElementById('btn-breathe');
const tapDots = document.querySelectorAll('.tap-dot');
const modalFeedback = document.getElementById('modal-feedback');

const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');
const searchResults = document.getElementById('search-results');

// Custom Icons
const createIcon = (color) => L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 15px ${color}, inset 0 0 5px rgba(255,255,255,0.8); border: 2px solid rgba(255,255,255,0.2);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const startIcon = createIcon('#4facf7');
const endIcon = createIcon('#f74f4f');

// Try Geolocation for Start location
map.locate({setView: true, maxZoom: 12});
map.on('locationfound', function(e) {
    if (!state.start) {
        state.start = e.latlng;
        state.startMarker = L.marker(state.start, {icon: startIcon}).addTo(map);
        uiCoordsStart.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    }
});
map.on('locationerror', function(e) {
    uiCoordsStart.textContent = "Geoloc Failed - Click Map";
});

// Search Feature
let searchDebounce;

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value;
    if (query.length < 3) {
        searchResults.classList.add('hidden');
        return;
    }
    searchDebounce = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                searchResults.innerHTML = '';
                if (data.length > 0) {
                    searchResults.classList.remove('hidden');
                    data.slice(0, 5).forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item.display_name;
                        li.addEventListener('click', () => {
                            selectDestination(item.lat, item.lon, item.display_name);
                        });
                        searchResults.appendChild(li);
                    });
                } else {
                    searchResults.classList.add('hidden');
                }
            }).catch(err => console.error("Search Error", err));
    }, 500);
});

btnSearch.addEventListener('click', () => {
    searchInput.dispatchEvent(new Event('input'));
});

// Used to store the selected destination if interrupted by the popup
let pendingDestination = null;

function selectDestination(lat, lng, name) {
    searchResults.classList.add('hidden');
    searchInput.value = name;
    
    pendingDestination = { lat, lng, name };
    
    if (state.trustLevel < 4) {
        // Trigger popup instead of placing marker immediately
        startPsyCheck("DESTINATION PROTOCOL");
    } else {
        finalizeDestination();
    }
}

function finalizeDestination() {
    if (!pendingDestination) return;
    
    const latlng = L.latLng(pendingDestination.lat, pendingDestination.lng);
    state.end = latlng;
    if (state.endMarker) map.removeLayer(state.endMarker);
    state.endMarker = L.marker(state.end, {icon: endIcon}).addTo(map);
    uiCoordsEnd.textContent = `${parseFloat(pendingDestination.lat).toFixed(4)}, ${parseFloat(pendingDestination.lng).toFixed(4)}`;
    
    // Fit map to show both markers
    if (state.start) {
        map.fitBounds(L.latLngBounds(state.start, state.end), { padding: [50, 50] });
    } else {
        map.setView(state.end, 13);
    }
    
    btnNavigate.disabled = false;
    pendingDestination = null;
    
    // Auto-start route calculation
    setTimeout(() => {
        btnNavigate.click();
    }, 600);
}

// Map Click Fallback Handler for Start/End (If geolocation fails or user prefers clicking)
map.on('click', function(e) {
    if (!state.start) {
        state.start = e.latlng;
        state.startMarker = L.marker(state.start, {icon: startIcon}).addTo(map);
        uiCoordsStart.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    } else if (!state.end) {
        // Fallback setting end via click
        selectDestination(e.latlng.lat, e.latlng.lng, "Manual Map Selection");
    }
});

btnClear.addEventListener('click', clearMap);

function clearMap() {
    if (state.startMarker) map.removeLayer(state.startMarker);
    if (state.endMarker) map.removeLayer(state.endMarker);
    if (state.routeLayer) map.removeLayer(state.routeLayer);
    
    state.start = null;
    state.end = null;
    state.routeLayer = null;
    
    uiCoordsStart.textContent = 'Awaiting Input...';
    uiCoordsEnd.textContent = 'Awaiting Input...';
    btnNavigate.disabled = true;
    routeInfo.classList.add('hidden');
    
    // Reactivate paranoid mode on clear
    setParanoidMode(true);
}

function setParanoidMode(isParanoid) {
    state.isParanoid = isParanoid;
    if (isParanoid) {
        modeIndicator.textContent = 'PARANOID';
        modeIndicator.className = 'mode-paranoid';
        paranoidWarn.style.display = 'block';
        // Trust drops slightly if paranoid reactivates
        updateTrust(-1);
    } else {
        modeIndicator.textContent = 'NORMAL OPTIMAL';
        modeIndicator.className = 'mode-normal';
        paranoidWarn.style.display = 'none';
    }
}

function updateTrust(delta) {
    state.trustLevel = Math.max(0, Math.min(state.maxTrust, state.trustLevel + delta));
    trustBar.style.width = `${(state.trustLevel / state.maxTrust) * 100}%`;
}

// Navigation Initiation
btnNavigate.addEventListener('click', () => {
    // Proceed directly to routing since the verification happened at destination selection
    setParanoidMode(false);
    calculateRoute();
});

// Psychological Check Logic
function startPsyCheck(context = "NAVIGATION") {
    state.tapTimestamps = [];
    updateTapUI();
    modalFeedback.textContent = 'Awaiting synchronization...';
    modalFeedback.className = 'feedback';
    psyModal.classList.remove('hidden');
}

btnBreathe.addEventListener('click', () => {
    const now = Date.now();
    
    if (state.tapTimestamps.length > 0) {
        const lastTap = state.tapTimestamps[state.tapTimestamps.length - 1];
        const diff = now - lastTap;
        
        // Critical rhythm check
        if (diff < 1500) {
            failPsyCheck("SYNC FAILED: Heart rate elevated. Tapping too quickly. The GPS refuses to navigate stressed survivors.");
            return;
        } else if (diff > 4500) {
            failPsyCheck("SYNC FAILED: Focus lost. Rhythm too slow.");
            return;
        }
    }
    
    state.tapTimestamps.push(now);
    updateTapUI();
    
    // Pulse effect
    btnBreathe.style.transform = 'scale(0.85)';
    setTimeout(() => btnBreathe.style.transform = 'scale(1)', 150);
    
    if (state.tapTimestamps.length === 3) {
        successPsyCheck();
    }
});

function updateTapUI() {
    tapDots.forEach((dot, index) => {
        if (index < state.tapTimestamps.length) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function failPsyCheck(msg) {
    state.tapTimestamps = [];
    setTimeout(updateTapUI, 500); // slight delay so user sees failure
    modalFeedback.textContent = msg;
    modalFeedback.className = 'feedback error';
    updateTrust(-1);
    
    // Button glitch effect
    btnBreathe.style.borderColor = 'var(--accent-paranoid)';
    btnBreathe.style.color = 'var(--accent-paranoid)';
    setTimeout(() => {
        btnBreathe.style.borderColor = 'var(--accent-normal)';
        btnBreathe.style.color = 'var(--accent-normal)';
    }, 1000);
}

function successPsyCheck() {
    modalFeedback.textContent = "GPS STABILIZED. Breathing rhythm accepted. Confidence restored.";
    modalFeedback.className = 'feedback success';
    updateTrust(1);
    
    setTimeout(() => {
        psyModal.classList.add('hidden');
        
        // Resume placing the destination and triggering the route automatically
        if (pendingDestination) {
            finalizeDestination();
        } else {
            setParanoidMode(false); // Switch to normal mode (Correct Route)
            calculateRoute();
        }
    }, 2500);
}

// Route Calculation
async function calculateRoute() {
    if (state.routeLayer) map.removeLayer(state.routeLayer);
    
    let waypoints = [];
    
    if (state.isParanoid) {
        // Generate paranoid waypoints (create a massive zigzag pattern)
        const latDiff = state.end.lat - state.start.lat;
        const lngDiff = state.end.lng - state.start.lng;
        
        // Perpendicular vector
        const perpLat = -lngDiff;
        const perpLng = latDiff;
        
        const dist = Math.sqrt(latDiff*latDiff + lngDiff*lngDiff);
        // Extremely high scaler to make it 5-10x longer
        const scale = Math.max(0.1, (dist * 4) / Math.sqrt(perpLat*perpLat + perpLng*perpLng)); 
        
        const dir1 = Math.random() > 0.5 ? 1 : -1;
        const dir2 = -dir1; // Opposite zigzag
        
        const wp1 = [
            state.start.lng + (lngDiff * 0.3) + (perpLng * scale * dir1),
            state.start.lat + (latDiff * 0.3) + (perpLat * scale * dir1)
        ];
        
        const wp2 = [
            state.start.lng + (lngDiff * 0.7) + (perpLng * scale * dir2),
            state.start.lat + (latDiff * 0.7) + (perpLat * scale * dir2)
        ];
        
        waypoints = [
            `${state.start.lng},${state.start.lat}`,
            `${wp1[0]},${wp1[1]}`,
            `${wp2[0]},${wp2[1]}`,
            `${state.end.lng},${state.end.lat}`
        ];
    } else {
        // Normal optimal route
        waypoints = [
            `${state.start.lng},${state.start.lat}`,
            `${state.end.lng},${state.end.lat}`
        ];
    }
    
    const coordString = waypoints.join(';');
    // Use OSRM for routing
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
    
    try {
        btnNavigate.textContent = "CALCULATING SECURE PATH...";
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok') {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            
            state.routeLayer = L.polyline(coordinates, {
                color: state.isParanoid ? '#ff3333' : '#00ffcc',
                weight: state.isParanoid ? 3 : 5,
                opacity: 0.8,
                dashArray: state.isParanoid ? '10, 15' : '',
                className: state.isParanoid ? 'route-path paranoid' : 'route-path optimal'
            }).addTo(map);
            
            map.fitBounds(state.routeLayer.getBounds(), { padding: [60, 60] });
            
            // Update Info Panel
            const distKm = (route.distance / 1000).toFixed(2);
            const timeMin = Math.round(route.duration / 60);
            
            routeDist.textContent = `${distKm} km`;
            routeTime.textContent = `${timeMin} min`;
            routeDist.style.color = state.isParanoid ? 'var(--accent-paranoid)' : 'var(--accent-normal)';
            routeTime.style.color = state.isParanoid ? 'var(--accent-paranoid)' : 'var(--accent-normal)';
            
            routeInfo.classList.remove('hidden');
        } else {
            throw new Error('OSRM No route found');
        }
    } catch (err) {
        console.error("Routing error:", err);
        // Fallback simple line if OSRM is down or fails to connect points
        // Create an artificial zigzag line
        const coords = state.isParanoid ? 
            [[state.start.lat, state.start.lng], 
             [state.start.lat + (state.end.lat - state.start.lat)/2 + 0.05, state.start.lng - 0.05], 
             [state.start.lat + (state.end.lat - state.start.lat)*0.75 - 0.05, state.end.lng + 0.05], 
             [state.end.lat, state.end.lng]] : 
            [[state.start.lat, state.start.lng], [state.end.lat, state.end.lng]];
            
        state.routeLayer = L.polyline(coords, {
            color: state.isParanoid ? '#ff3333' : '#00ffcc',
            weight: state.isParanoid ? 3 : 5,
            opacity: 0.8,
            dashArray: state.isParanoid ? '10, 15' : ''
        }).addTo(map);
        
        map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });
        routeInfo.classList.remove('hidden');
        routeDist.textContent = "DATA CORRUPTED";
        routeTime.textContent = "--";
        routeDist.style.color = 'var(--text-main)';
        routeTime.style.color = 'var(--text-main)';
    } finally {
        btnNavigate.textContent = "RECALCULATE ROUTE";
    }
}
