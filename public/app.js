// Initialize the map
const map = L.map('map').setView([13.73, 100.52], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Reusable Leaflet icon factory
function createColoredIcon(color) {
    return L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

const HASH_PREFIX = 'file:';
const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

// Format GPX filename into display name
function formatRouteName(filename) {
    return filename.replace('.gpx', '').replace(/-/g, ' ');
}

// Variables for user location
let userLocationMarker = null;
let userLocationCircle = null;
let isTrackingLocation = false;
let watchId = null;

// Variables for map layers
let routePolyline = null;
let startMarker = null;
let endMarker = null;
let waypointMarkers = [];
let currentLoadId = 0; // Guard against stale fetch responses

// Function to clear existing route from map
function clearRoute() {
    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];

    // Reset info panel
    document.getElementById('waypointCount').textContent = '-';
    document.getElementById('routePointCount').textContent = '-';
    document.getElementById('distance').textContent = 'Calculating...';
}

// Function to parse GPX XML (supports wpt, rtept, and trkpt formats)
function parseGPX(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Get metadata name
    const metadataName = xmlDoc.querySelector('metadata > name')?.textContent || '';

    // Get waypoints (<wpt>)
    const waypoints = Array.from(xmlDoc.getElementsByTagName('wpt')).map(wpt => ({
        lat: parseFloat(wpt.getAttribute('lat')),
        lon: parseFloat(wpt.getAttribute('lon')),
        ele: parseFloat(wpt.querySelector('ele')?.textContent || 0),
        name: wpt.querySelector('name')?.textContent || '',
        type: wpt.querySelector('type')?.textContent || ''
    }));

    // Get route points (<rtept>)
    const routePoints = Array.from(xmlDoc.getElementsByTagName('rtept')).map(rtept => ({
        lat: parseFloat(rtept.getAttribute('lat')),
        lon: parseFloat(rtept.getAttribute('lon')),
        ele: parseFloat(rtept.querySelector('ele')?.textContent || 0)
    }));

    // Get track points (<trk> -> <trkseg> -> <trkpt>)
    const tracks = [];
    const trkElements = xmlDoc.getElementsByTagName('trk');
    for (const trk of trkElements) {
        const trackName = trk.querySelector('name')?.textContent || '';
        const segments = [];
        const trksegElements = trk.getElementsByTagName('trkseg');
        for (const trkseg of trksegElements) {
            const points = Array.from(trkseg.getElementsByTagName('trkpt')).map(trkpt => ({
                lat: parseFloat(trkpt.getAttribute('lat')),
                lon: parseFloat(trkpt.getAttribute('lon')),
                ele: parseFloat(trkpt.querySelector('ele')?.textContent || 0)
            }));
            segments.push(points);
        }
        tracks.push({ name: trackName, segments });
    }

    // Flatten all track points into a single array for distance/display
    const trackPoints = tracks.flatMap(t => t.segments.flat());

    return { metadataName, waypoints, routePoints, tracks, trackPoints };
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(p1, p2) {
    const R = 6371; // Earth's radius in km
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate total distance
function getTotalDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += calculateDistance(points[i - 1], points[i]);
    }
    return total;
}

// Function to load and display GPX data
function loadGPXFile(filename) {
    if (!filename) return;

    // Increment load ID and clear previous route immediately
    const loadId = ++currentLoadId;
    clearRoute();

    // Update route name in header
    document.getElementById('routeName').textContent = formatRouteName(filename);

    // Fetch and display GPX data
    fetch(`/api/gpx/${filename}`)
        .then(response => response.text())
        .then(gpxData => {
            // Discard stale response if user already switched to another route
            if (loadId !== currentLoadId) return;
            const { metadataName, waypoints, routePoints, tracks, trackPoints } = parseGPX(gpxData);

            // Use metadata name or track name for display
            if (metadataName) {
                document.getElementById('routeName').textContent = metadataName;
            } else if (tracks.length > 0 && tracks[0].name) {
                document.getElementById('routeName').textContent = tracks[0].name;
            }

            // Determine which points to use for the route line
            // Priority: routePoints (rtept) > trackPoints (trkpt)
            const displayPoints = routePoints.length > 0 ? routePoints : trackPoints;

            // Update info
            document.getElementById('waypointCount').textContent = waypoints.length;
            document.getElementById('routePointCount').textContent = displayPoints.length;

            // Draw route/track line
            if (displayPoints.length > 0) {
                const routeCoords = displayPoints.map(p => [p.lat, p.lon]);
                routePolyline = L.polyline(routeCoords, {
                    color: '#e74c3c',
                    weight: 4,
                    opacity: 0.7
                }).addTo(map);

                // Calculate and display distance
                const distance = getTotalDistance(displayPoints);
                document.getElementById('distance').textContent = distance.toFixed(2) + ' km';

                // Update route name with distance
                const currentRouteName = document.getElementById('routeName').textContent;
                document.getElementById('routeName').textContent = `${currentRouteName} (${distance.toFixed(2)} km)`;

                // Fit map to route bounds
                map.fitBounds(routePolyline.getBounds());
            }

            // Determine start/end points from waypoints or track/route points
            const startEndPoints = waypoints.length > 0 ? waypoints : displayPoints;

            // Add start marker (green)
            if (startEndPoints.length > 0) {
                const startPoint = startEndPoints[0];
                startMarker = L.marker([startPoint.lat, startPoint.lon], {
                    icon: createColoredIcon('green')
                })
                    .bindPopup(`<b>Start: ${startPoint.name || 'Begin'}</b>`)
                    .addTo(map);
            }

            // Add end marker (red)
            if (startEndPoints.length > 1) {
                const endPoint = startEndPoints[startEndPoints.length - 1];
                endMarker = L.marker([endPoint.lat, endPoint.lon], {
                    icon: createColoredIcon('red')
                })
                    .bindPopup(`<b>End: ${endPoint.name || 'End'}</b>`)
                    .addTo(map);
            }

            // Add waypoint markers with names (blue)
            waypoints.filter(wp => wp.name && wp.name.startsWith('Waypoint')).forEach(wp => {
                const marker = L.circleMarker([wp.lat, wp.lon], {
                    radius: 5,
                    fillColor: '#3498db',
                    color: '#2980b9',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                })
                    .bindPopup(`<b>${wp.name}</b><br>Type: ${wp.type}`)
                    .addTo(map);
                waypointMarkers.push(marker);
            });

        })
        .catch(error => {
            console.error('Error loading GPX data:', error);
            alert('Failed to load GPX file: ' + filename);
        });
}

// Get filename from URL hash
function getFileFromHash() {
    const hash = window.location.hash.substring(1); // Remove #
    if (hash.startsWith(HASH_PREFIX)) {
        return hash.substring(HASH_PREFIX.length);
    }
    return null;
}

// Update URL hash when file is loaded
function updateHash(filename) {
    if (filename) {
        window.location.hash = HASH_PREFIX + filename;
    }
}

// Load available GPX files and populate selector
fetch('/api/gpx/list')
    .then(response => response.json())
    .then(files => {
        const selector = document.getElementById('fileSelector');
        selector.innerHTML = '';

        if (files.length === 0) {
            selector.innerHTML = '<option value="">No GPX files found</option>';
            return;
        }

        // Add options for each file
        files.forEach((file, index) => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = formatRouteName(file);
            selector.appendChild(option);
        });

        // Check if there's a file specified in the URL hash
        const fileFromHash = getFileFromHash();
        let fileToLoad = fileFromHash || files[0];

        // Verify the file exists in the list
        if (!files.includes(fileToLoad)) {
            fileToLoad = files[0];
        }

        // Load the selected file
        selector.value = fileToLoad;
        loadGPXFile(fileToLoad);
        updateHash(fileToLoad);
    })
    .catch(error => {
        console.error('Error loading file list:', error);
        alert('Failed to load GPX file list');
    });

// Add event listener for file selector
document.getElementById('fileSelector').addEventListener('change', (e) => {
    loadGPXFile(e.target.value);
    updateHash(e.target.value);
});

// Function to update user location on map
function updateUserLocation(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    const latlng = [lat, lon];

    if (userLocationCircle) {
        userLocationCircle.setLatLng(latlng).setRadius(accuracy);
    } else {
        userLocationCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.15,
            weight: 1
        }).addTo(map);
    }

    if (userLocationMarker) {
        userLocationMarker.setLatLng(latlng)
            .setPopupContent(`<b>Your Location</b><br>Accuracy: ±${accuracy.toFixed(0)}m`);
    } else {
        userLocationMarker = L.marker(latlng, {
            icon: createColoredIcon('blue')
        })
            .bindPopup(`<b>Your Location</b><br>Accuracy: ±${accuracy.toFixed(0)}m`)
            .addTo(map);
    }

    // Center map on user location
    map.setView(latlng, 15);
}

// Function to handle location error
function handleLocationError(error) {
    let message = 'Unable to get your location';
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            break;
        case error.TIMEOUT:
            message = 'Location request timed out';
            break;
    }
    alert(message);
    console.error('Location error:', error);

    // Reset button state
    const btn = document.getElementById('locationBtn');
    btn.classList.remove('active');
    isTrackingLocation = false;
}

// Toggle location tracking
function toggleLocationTracking() {
    const btn = document.getElementById('locationBtn');

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    if (isTrackingLocation) {
        // Stop tracking
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
            userLocationMarker = null;
        }
        if (userLocationCircle) {
            map.removeLayer(userLocationCircle);
            userLocationCircle = null;
        }
        btn.classList.remove('active');
        isTrackingLocation = false;
    } else {
        // Start tracking (watchPosition fires immediately with current position)
        btn.classList.add('active');
        isTrackingLocation = true;

        watchId = navigator.geolocation.watchPosition(
            updateUserLocation,
            handleLocationError,
            GEO_OPTIONS
        );
    }
}

// Add click event to location button
document.getElementById('locationBtn').addEventListener('click', toggleLocationTracking);

// Download current GPX file
document.getElementById('downloadBtn').addEventListener('click', () => {
    const filename = document.getElementById('fileSelector').value;
    if (!filename) {
        alert('No route selected');
        return;
    }
    const link = document.createElement('a');
    link.href = `/api/gpx/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Handle URL hash changes
window.addEventListener('hashchange', () => {
    const fileFromHash = getFileFromHash();
    if (fileFromHash) {
        const selector = document.getElementById('fileSelector');
        const availableFiles = Array.from(selector.options).map(option => option.value);

        if (availableFiles.includes(fileFromHash)) {
            selector.value = fileFromHash;
            loadGPXFile(fileFromHash);
        }
    }
});
