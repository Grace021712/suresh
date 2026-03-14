// State variables
let map;
let routingControl = null;
let currentStart = null;
let currentDestination = null;

let trustLevel = 0;
let isParanoidMode = true;
let paranoiaTimer = null;

// Friend Tracking variables
let trackedFriends = []; // Array of { id, marker, latlng, interval }

// Psych Check variables
let tapCount = 0;
let lastTapTime = 0;
let pendingAction = null; // Function to call on psych success

// DOM Elements
const psychModal = document.getElementById('psych-modal');
const breathingIcon = document.getElementById('breathing-icon');
const tapDots = document.querySelectorAll('.tap-dot');
const psychMessage = document.getElementById('psych-message');
const stabilizeBtn = document.getElementById('stabilize-btn');
const trustLevelText = document.getElementById('trust-level-text');
const trustFill = document.getElementById('trust-fill');
const trustStatus = document.getElementById('trust-status');
const toastContainer = document.getElementById('toast-container');
const friendNameInput = document.getElementById('friend-name-input');
const trackFriendBtn = document.getElementById('track-friend-btn');
const trackedFriendsList = document.getElementById('tracked-friends-list');

const startInput = document.getElementById('start-input');
const destInput = document.getElementById('dest-input');
const setRouteBtn = document.getElementById('set-route-btn');

// Initialize Map
function initMap() {
    // Default to a generic location, e.g., somewhere in the wilderness or a destroyed city
    // Coordinates for Pripyat, Chernobyl for maximum apocalyptic feel
    map = L.map('map').setView([51.4045, 30.0542], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | Paranoid OS v1.0',
        maxZoom: 19
    }).addTo(map);

    // Get user location if available, otherwise stick to default
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentStart = L.latLng(pos.coords.latitude, pos.coords.longitude);
                map.setView(currentStart, 13);
                L.marker(currentStart).addTo(map).bindPopup("Current Position. Stay Safe.").openPopup();
                showToast("GPS Signal Acquired.", "success");
            },
            (err) => {
                currentStart = L.latLng(51.4045, 30.0542);
                L.marker(currentStart).addTo(map).bindPopup("Last Known Position.").openPopup();
                showToast("GPS Signal Lost. Using Last Known Position.", "warning");
            }
        );
    } else {
        currentStart = L.latLng(51.4045, 30.0542);
        L.marker(currentStart).addTo(map).bindPopup("Last Known Position.").openPopup();
    }

    // Map click sets destination
    map.on('click', function (e) {
        currentDestination = e.latlng;
        // Optionally update the input field text
        destInput.value = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        routeToDestination();
    });

    // Breathing Icon click listener
    breathingIcon.addEventListener('click', handlePsychTap);

    // Set Route Button (Nominatim Geocoding)
    setRouteBtn.addEventListener('click', async () => {
        const startText = startInput.value.trim();
        const destText = destInput.value.trim();

        if (!destText) {
            showToast("A destination is required to navigate.", "warning");
            return;
        }

        setRouteBtn.textContent = "LOCATING...";
        setRouteBtn.disabled = true;

        try {
            // If start text is provided, fetch its coordinates. Otherwise, use currentStart.
            if (startText) {
                const startCoords = await geocodeTarget(startText);
                if (startCoords) {
                    currentStart = startCoords;
                    map.setView(currentStart, 13);
                    // Clear previous start markers if needed, or just let routing machine handle it
                } else {
                    showToast(`Could not locate origin: ${startText}`, "warning");
                    throw new Error("Geocode origin failed");
                }
            }

            // Fetch destination coordinates
            const destCoords = await geocodeTarget(destText);
            if (destCoords) {
                currentDestination = destCoords;
                routeToDestination();
            } else {
                showToast(`Could not locate destination: ${destText}`, "warning");
                throw new Error("Geocode dest failed");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setRouteBtn.textContent = "CALCULATE ROUTE";
            setRouteBtn.disabled = false;
        }
    });

    // Track Friend Button listener
    trackFriendBtn.addEventListener('click', () => {
        const friendId = friendNameInput.value.trim();
        if (friendId) {
            initiateFriendTracking(friendId);
            friendNameInput.value = '';
        }
    });

    // Stabilize button listener
    stabilizeBtn.addEventListener('click', () => {
        // Rhythmic challenge to stabilize
        startPsychCheck(() => {
            showToast("GPS Stabilized. Normal routing restored temporarily.", "success");
            isParanoidMode = false;
            updateStatusUI();
            calculateRoute(currentStart, currentDestination, false);
            stabilizeBtn.classList.add('hidden');

            // Timer to revert back to paranoid
            clearTimeout(paranoiaTimer);
            paranoiaTimer = setTimeout(() => {
                reactivateParanoia();
            }, 30000); // 30 seconds
        });
    });
}

// Friend Tracking Logic
function initiateFriendTracking(friendId) {
    if (trackedFriends.find(f => f.id === friendId)) {
        showToast("Survivor already being tracked.", "warning");
        return;
    }

    showToast(`Scanning for Survivor ${friendId}...`, "success");

    // Generate a random starting position somewhat near the current start (or map center)
    const baseLat = currentStart ? currentStart.lat : 51.4045;
    const baseLng = currentStart ? currentStart.lng : 30.0542;
    
    // Offset by roughly 2-5km randomly
    const randomLatOffset = (Math.random() - 0.5) * 0.08;
    const randomLngOffset = (Math.random() - 0.5) * 0.08;
    
    let friendPos = L.latLng(baseLat + randomLatOffset, baseLng + randomLngOffset);

    // Create a custom marker icon for friends
    const friendIcon = L.divIcon({
        className: 'friend-marker',
        html: `<div style="background:var(--text-primary); width:15px; height:15px; border-radius:50%; box-shadow: 0 0 10px var(--text-primary);"></div>`,
        iconSize: [15, 15]
    });

    // Add marker to map
    const marker = L.marker(friendPos, {icon: friendIcon}).addTo(map);
    marker.bindPopup(`<b>Survivor:</b> ${friendId}<br>Status: Moving...`);

    // Allow user to click the marker to route to the friend
    marker.on('click', () => {
        currentDestination = friendPos;
        routeToDestination(); // Re-use our routing psych logic
    });

    // Simulate friend movement every 5 seconds
    const intervalId = setInterval(() => {
        // Move them slightly
        const moveLat = (Math.random() - 0.5) * 0.005;
        const moveLng = (Math.random() - 0.5) * 0.005;
        friendPos = L.latLng(friendPos.lat + moveLat, friendPos.lng + moveLng);
        marker.setLatLng(friendPos);
    }, 5000);

    const friendData = { id: friendId, marker, latlng: friendPos, interval: intervalId };
    trackedFriends.push(friendData);

    updateFriendListUI();
}

function updateFriendListUI() {
    trackedFriendsList.innerHTML = '';
    trackedFriends.forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `<div>${friend.id}</div><div class="status">Signal Active</div>`;
        
        // Clicking the friend item pans map to them and sets them as destination
        item.addEventListener('click', () => {
            map.panTo(friend.marker.getLatLng());
            currentDestination = friend.marker.getLatLng();
            routeToDestination();
        });
        
        trackedFriendsList.appendChild(item);
    });
}

// Wrapper for routing request
function routeToDestination() {
    if (!currentStart || !currentDestination) return;
    
    if (trustLevel > 80 && isParanoidMode) {
        showToast("GPS recognizes previous calm behavior. Navigation permitted.", "success");
        calculateRoute(currentStart, currentDestination, true);
    } else {
        startPsychCheck(() => {
            increaseTrust(20);
            calculateRoute(currentStart, currentDestination, true);
        });
    }
}

// Helper: Geocode text using Nominatim (OSM)
async function geocodeTarget(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            return L.latLng(data[0].lat, data[0].lon);
        }
    } catch (e) {
        console.error("Geocoding error", e);
    }
    return null;
}

// Psych Check Logic
function startPsychCheck(onSuccessCallback) {
    psychModal.classList.remove('hidden');
    tapCount = 0;
    lastTapTime = 0;
    pendingAction = onSuccessCallback;
    psychMessage.textContent = "Awaiting verification...";
    psychMessage.style.color = "var(--text-primary)";

    tapDots.forEach(dot => {
        dot.classList.remove('filled');
        dot.classList.remove('failed');
    });
}

function handlePsychTap() {
    const now = Date.now();

    // Check if tap is slow enough (> 1000ms from last tap, unless it's the first tap)
    if (tapCount > 0 && (now - lastTapTime) < 1000) {
        // Failed the speed check
        psychMessage.textContent = "Calming Failed. You are tapping too fast. The GPS refuses to navigate unstable survivors.";
        psychMessage.style.color = "var(--text-critical)";

        tapDots.forEach(dot => dot.classList.add('failed'));
        decreaseTrust(10);

        // Reset after 2 seconds
        setTimeout(() => {
            tapCount = 0;
            lastTapTime = 0;
            psychMessage.textContent = "Please try again. Calmly.";
            psychMessage.style.color = "var(--text-primary)";
            tapDots.forEach(dot => {
                dot.classList.remove('filled');
                dot.classList.remove('failed');
            });
        }, 2000);
        return;
    }

    // Successful tap
    lastTapTime = now;
    tapDots[tapCount].classList.add('filled');
    tapCount++;

    if (tapCount === 3) {
        // Success completion
        psychMessage.textContent = "GPS Stabilized. Breathing rhythm accepted. Calculating route.";
        psychMessage.style.color = "var(--text-primary)";

        // Execute the pending action (which increases trust and routes) BEFORE hiding the modal
        if (pendingAction) {
            pendingAction();
            pendingAction = null;
        }

        setTimeout(() => {
            psychModal.classList.add('hidden');
        }, 1500);
    }
}

// Routing Logic
function calculateRoute(start, end, paranoid) {
    if (routingControl) {
        map.removeControl(routingControl);
    }

    let waypoints = [start];

    if (paranoid) {
        // Generate a sprawling paranoid route
        // Calculate distance between start and end roughly inside latitude/longitude bounds
        const latDiff = end.lat - start.lat;
        const lngDiff = end.lng - start.lng;

        // Add huge perpendicular offsets
        const detour1 = L.latLng(
            start.lat + latDiff * 0.5 - lngDiff * 1.5,
            start.lng + lngDiff * 0.5 + latDiff * 1.5
        );
        const detour2 = L.latLng(
            start.lat + latDiff * 0.8 + lngDiff * 1.5,
            start.lng + lngDiff * 0.8 - latDiff * 1.5
        );

        waypoints.push(detour1);
        waypoints.push(detour2);

        showToast("Generating defensive path. Avoiding main vectors.", "warning");
        stabilizeBtn.classList.remove('hidden');
    }

    waypoints.push(end);

    routingControl = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: false,
        addWaypoints: false,
        showAlternatives: false,
        lineOptions: {
            styles: [{ color: paranoid ? '#ff5500' : '#33ff33', opacity: 0.8, weight: 6 }]
        },
        createMarker: function () { return null; } // Don't show default markers for waypoints
    }).addTo(map);

    // Place explicit markers
    L.marker(end).addTo(map).bindPopup(paranoid ? "Safehouse Checkpoint" : "Destination").openPopup();
}

function reactivateParanoia() {
    if (!isParanoidMode) {
        isParanoidMode = true;
        updateStatusUI();
        decreaseTrust(20);
        showToast("System paranoia reactivated. Re-routing for defensive measures.", "warning");

        if (currentStart && currentDestination) {
            calculateRoute(currentStart, currentDestination, true);
        }
    }
}

// Trust System & UI Logic
function increaseTrust(amount) {
    trustLevel = Math.min(100, trustLevel + amount);
    updateTrustUI();
}

function decreaseTrust(amount) {
    trustLevel = Math.max(0, trustLevel - amount);
    updateTrustUI();
}

function updateTrustUI() {
    trustLevelText.textContent = trustLevel;
    trustFill.style.width = trustLevel + '%';

    // Color updates based on trust
    if (trustLevel > 80) {
        trustFill.style.backgroundColor = 'var(--text-primary)';
        trustFill.style.boxShadow = '0 0 10px var(--text-primary)';
    } else if (trustLevel > 30) {
        trustFill.style.backgroundColor = 'orange';
        trustFill.style.boxShadow = '0 0 10px orange';
    } else {
        trustFill.style.backgroundColor = 'var(--text-critical)';
        trustFill.style.boxShadow = '0 0 10px var(--text-critical)';
    }
}

function updateStatusUI() {
    if (isParanoidMode) {
        trustStatus.textContent = "PARANOID";
        trustStatus.className = "status-warning";
    } else {
        trustStatus.textContent = "STABLE";
        trustStatus.className = "status-ok";
    }
}

function showToast(message, type = "success") {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s ease-in reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Start
window.onload = initMap;
