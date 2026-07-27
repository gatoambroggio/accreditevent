import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { MapPin, Loader2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [-34.6037, -58.3816]; // Buenos Aires

function MapController({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, 16);
    }
  }, [position?.[0], position?.[1], map]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function AddressInput({ value, onChange, lat, lng, onCoordinatesChange, placeholder, required, disabled }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  const hasCoords = lat != null && lng != null;
  const markerPosition = hasCoords ? [Number(lat), Number(lng)] : null;

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=ar`
        );
        const data = await res.json();
        setSuggestions(data);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const reverseGeocode = async (latVal, lngVal) => {
    setReverseLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latVal}&lon=${lngVal}`
      );
      const data = await res.json();
      if (data.display_name) {
        setQuery(data.display_name);
        onChange(data.display_name);
      }
    } catch {} finally {
      setReverseLoading(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    if (onCoordinatesChange) onCoordinatesChange(null, null);
    search(val);
  };

  const selectSuggestion = (s) => {
    setQuery(s.display_name);
    onChange(s.display_name);
    setShowDropdown(false);
    if (s.lat && s.lon && onCoordinatesChange) {
      onCoordinatesChange(parseFloat(s.lat), parseFloat(s.lon));
    }
  };

  const handleMapClick = (latlng) => {
    if (onCoordinatesChange) {
      onCoordinatesChange(latlng.lat, latlng.lng);
    }
    reverseGeocode(latlng.lat, latlng.lng);
  };

  const handleMarkerDragEnd = (e) => {
    const pos = e.target.getLatLng();
    if (onCoordinatesChange) {
      onCoordinatesChange(pos.lat, pos.lng);
    }
    reverseGeocode(pos.lat, pos.lng);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder || 'Buscar dirección…'}
          required={required}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        {(loading || reverseLoading) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-emerald-600" />
        )}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-[1100] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectSuggestion(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{s.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-[250px] w-full overflow-hidden rounded-lg border border-slate-200">
        <MapContainer
          center={markerPosition || DEFAULT_CENTER}
          zoom={hasCoords ? 16 : 12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {markerPosition && (
            <Marker
              position={markerPosition}
              draggable
              eventHandlers={{ dragend: handleMarkerDragEnd }}
            />
          )}
          <MapClickHandler onMapClick={handleMapClick} />
          <MapController position={markerPosition} />
        </MapContainer>
      </div>
      <p className="text-xs text-slate-400">
        Buscá la dirección o hacé clic en el mapa para marcar el punto de retiro. Podés arrastrar el marcador para ajustarlo.
      </p>
    </div>
  );
}