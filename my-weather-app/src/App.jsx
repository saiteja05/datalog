import React, { useState, useEffect, useMemo } from 'react';
import { Cloud, Sun, Moon, CloudRain, CloudSnow, Wind, CloudLightning, MapPin, Thermometer, Loader2, X } from 'lucide-react';

// --- Configuration ---
const CITIES = {
  "Hyderabad": {
    country: "India",
    lat: 17.3850,
    lng: 78.4867,
    theme: { ground: "#fff7ed", accent: "#d97706", sky: "#fff7ed" }, // Warmer cream for better contrast
    layout: "dense_low",
    landmarkType: "charminar"
  },
  "San Francisco": {
    country: "USA",
    lat: 37.7749,
    lng: -122.4194,
    theme: { ground: "#e0e7ea", accent: "#ef4444", sky: "#f1f5f9" },
    layout: "hilly",
    landmarkType: "bridge_towers"
  },
  "Bangalore": {
    country: "India",
    lat: 12.9716,
    lng: 77.5946,
    theme: { ground: "#ecfccb", accent: "#65a30d", sky: "#f7fee7" },
    layout: "garden",
    landmarkType: "tech_park"
  },
  "Delhi": {
    country: "India",
    lat: 28.6139,
    lng: 77.2090,
    theme: { ground: "#fef3c7", accent: "#d97706", sky: "#fffbeb" },
    layout: "spread",
    landmarkType: "gate"
  },
  "Seattle": {
    country: "USA",
    lat: 47.6062,
    lng: -122.3321,
    theme: { ground: "#cbd5e1", accent: "#475569", sky: "#e2e8f0" },
    layout: "high_rise",
    landmarkType: "needle"
  },
  "New York": {
    country: "USA",
    lat: 40.7128,
    lng: -74.0060,
    theme: { ground: "#e2e8f0", accent: "#334155", sky: "#f8fafc" },
    layout: "skyscraper",
    landmarkType: "empire"
  },
  "San Diego": {
    country: "USA",
    lat: 32.7157,
    lng: -117.1611,
    theme: { ground: "#ffedd5", accent: "#0ea5e9", sky: "#ecfeff" },
    layout: "coastal",
    landmarkType: "mission"
  },
  "Sydney": {
    country: "Australia",
    lat: -33.8688,
    lng: 151.2093,
    theme: { ground: "#0284c7", accent: "#ffffff", sky: "#e0f2fe" },
    layout: "harbor",
    landmarkType: "sails"
  },
  "Paris": {
    country: "France",
    lat: 48.8566,
    lng: 2.3522,
    theme: { ground: "#e5e7eb", accent: "#9333ea", sky: "#f3f4f6" },
    layout: "spread",
    landmarkType: "eiffel"
  },
  "London": {
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    theme: { ground: "#94a3b8", accent: "#dc2626", sky: "#f1f5f9" },
    layout: "dense_low",
    landmarkType: "bigben"
  }
};

// --- Helper Functions ---

function getContrastYIQ(hexcolor) {
  if (!hexcolor) return '#1e293b';
  hexcolor = hexcolor.replace("#", "");
  var r = parseInt(hexcolor.substr(0, 2), 16);
  var g = parseInt(hexcolor.substr(2, 2), 16);
  var b = parseInt(hexcolor.substr(4, 2), 16);
  var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#1e293b' : '#f8fafc';
}

function getWeatherCondition(code, isDay) {
  if (code === 0) return isDay ? "Sunny" : "Clear";
  if ([1, 2, 3].includes(code)) return isDay ? "Partly Cloudy" : "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return isDay ? "Sunny" : "Clear";
}

function adjustColor(color, amount) {
  if (!color) return '#000000';
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// --- Components ---

const IsometricBuilding = ({ x, y, width, height, depth, color, delay }) => {
  const style = {
    '--x': `${x}px`,
    '--y': `${y}px`,
    '--w': `${width}px`,
    '--h': `${height}px`,
    '--d': `${depth}px`,
    '--color': color,
    '--color-dark': adjustColor(color, -20), // Side
    '--color-darker': adjustColor(color, -40), // Front
    '--delay': `${delay}ms`,
  };

  return (
    <div className="iso-building" style={style}>
      <div className="face top"></div>
      <div className="face side"></div>
      <div className="face front"></div>
    </div>
  );
};

const CityScene = ({ cityData }) => {
  const { theme, layout, landmarkType } = cityData;

  const buildings = useMemo(() => {
    const b = [];
    const landmarks = [];
    let seed = 1234;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    const cx = 0, cy = 0;
    const baseColor = theme.accent;

    // --- Landmark Generation ---
    if (landmarkType === 'charminar') {
      [[-20, -20], [20, -20], [20, 20], [-20, 20]].forEach((offset, i) => {
        landmarks.push({ id: `l-tow-${i}`, x: cx + offset[0], y: cy + offset[1], w: 12, d: 12, h: 120, color: baseColor });
      });
      landmarks.push({ id: 'l-base', x: cx, y: cy, w: 50, d: 50, h: 60, color: adjustColor(baseColor, 20) });
    }
    else if (landmarkType === 'bridge_towers') {
      landmarks.push({ id: 'l1', x: cx - 30, y: cy, w: 15, d: 15, h: 160, color: '#ff6b6b' });
      landmarks.push({ id: 'l2', x: cx + 30, y: cy, w: 15, d: 15, h: 160, color: '#ff6b6b' });
      landmarks.push({ id: 'l3', x: cx, y: cy, w: 120, d: 10, h: 10, color: '#555' });
    }
    else if (landmarkType === 'needle') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 8, d: 8, h: 140, color: '#ecf0f1' });
      landmarks.push({ id: 'l2', x: cx, y: cy, w: 40, d: 40, h: 10, color: theme.accent });
    }
    else if (landmarkType === 'gate') {
      landmarks.push({ id: 'l1', x: cx - 20, y: cy, w: 15, d: 20, h: 80, color: '#e6cba5' });
      landmarks.push({ id: 'l2', x: cx + 20, y: cy, w: 15, d: 20, h: 80, color: '#e6cba5' });
      landmarks.push({ id: 'l3', x: cx, y: cy, w: 60, d: 20, h: 15, color: '#e6cba5' });
    }
    else if (landmarkType === 'empire') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 40, d: 40, h: 80, color: theme.accent });
      landmarks.push({ id: 'l2', x: cx, y: cy, w: 25, d: 25, h: 120, color: adjustColor(theme.accent, 15) });
      landmarks.push({ id: 'l3', x: cx, y: cy, w: 10, d: 10, h: 160, color: '#bdc3c7' });
    }
    else if (landmarkType === 'tech_park') {
      landmarks.push({ id: 'l1', x: cx - 25, y: cy - 10, w: 25, d: 30, h: 90, color: '#a8dadc' });
      landmarks.push({ id: 'l2', x: cx + 15, y: cy - 10, w: 25, d: 30, h: 110, color: '#457b9d' });
    }
    else if (landmarkType === 'mission') {
      landmarks.push({ id: 'l1', x: cx - 20, y: cy, w: 40, d: 20, h: 40, color: '#fdf6e3' });
      landmarks.push({ id: 'l2', x: cx + 25, y: cy, w: 15, d: 15, h: 70, color: '#fdf6e3' });
    }
    else if (landmarkType === 'sails') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 20, d: 40, h: 60, color: '#fff' });
      landmarks.push({ id: 'l2', x: cx + 25, y: cy, w: 15, d: 30, h: 40, color: '#f0f0f0' });
      landmarks.push({ id: 'l3', x: cx, y: cy, w: 60, d: 60, h: 5, color: '#d4a373' });
    }
    else if (landmarkType === 'eiffel') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 40, d: 40, h: 40, color: '#595046' });
      landmarks.push({ id: 'l2', x: cx, y: cy, w: 25, d: 25, h: 80, color: '#6d6256' });
      landmarks.push({ id: 'l3', x: cx, y: cy, w: 10, d: 10, h: 140, color: '#807366' });
    }
    else if (landmarkType === 'bigben') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 15, d: 15, h: 150, color: '#d4a373' });
      landmarks.push({ id: 'l4', x: cx - 40, y: cy, w: 60, d: 20, h: 50, color: '#e6cba5' });
    }

    // --- Background Buildings ---
    const gridSize = 40;
    const range = 3;

    for (let i = 0; i < 30; i++) {
      const gx = Math.floor(random() * (range * 2)) - range;
      const gy = Math.floor(random() * (range * 2)) - range;

      if (Math.abs(gx) < 2 && Math.abs(gy) < 2) continue;

      let w = 15 + random() * 15;
      let d = 15 + random() * 15;
      let h = 20 + random() * 50;

      const palette = theme.buildings || ['#cccccc'];
      let color = palette[Math.floor(random() * palette.length)];

      if (layout === 'skyscraper') h += 60; // Reduced height to avoid text overlap
      if (layout === 'hilly') h += Math.abs(gx * 15);
      if (layout === 'high_rise' && i % 3 === 0) { h = 120; w = 10; d = 10; }
      if (layout === 'coastal') h = 15 + random() * 20;

      b.push({
        id: `bg-${i}`,
        x: gx * gridSize,
        y: gy * gridSize,
        w, d, h,
        color,
        delay: i * 30
      });
    }

    const all = [...b, ...landmarks.map((l, i) => ({ ...l, delay: 600 + i * 50 }))];
    return all.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  }, [cityData]);

  return (
    <div className="iso-container">
      <div className="iso-plane">
        {buildings.map(b => (
          <IsometricBuilding
            key={b.id}
            x={b.x} y={b.y}
            width={b.w} depth={b.d} height={b.h}
            color={b.color}
            delay={b.delay}
          />
        ))}
        <div className="ground-grid" style={{ backgroundColor: theme.ground }}></div>
      </div>
    </div>
  );
};

const WeatherIcon = ({ condition, size = 120, isDay }) => {
  const cond = condition.toLowerCase();

  if (cond.includes('storm')) return <CloudLightning className="weather-icon text-purple-500" size={size} />;
  if (cond.includes('rain')) return <CloudRain className="weather-icon text-blue-400" size={size} />;
  if (cond.includes('snow')) return <CloudSnow className="weather-icon text-white" size={size} />;
  if (cond.includes('cloud') || cond.includes('fog')) return <Cloud className="weather-icon text-gray-300" size={size} />;
  if (!isDay) return <Moon className="weather-icon text-slate-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" size={size} />;
  return <Sun className="weather-icon text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.8)] animate-spin-slow" size={size} />;
};

export default function WeatherApp() {
  const [selectedCity, setSelectedCity] = useState("Hyderabad");
  const [unit, setUnit] = useState("F");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  const cityData = CITIES[selectedCity];

  useEffect(() => {
    async function fetchWeather() {
      setLoading(true);
      try {
        const { lat, lng } = cityData;
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`
        );
        const data = await response.json();
        const isDay = data.current_weather.is_day === 1;

        setWeather({
          temp: data.current_weather.temperature,
          condition: getWeatherCondition(data.current_weather.weathercode, isDay),
          isDay: isDay,
          time: new Date().toLocaleTimeString('en-US', {
            weekday: 'short', hour: 'numeric', minute: '2-digit',
            hour12: true, timeZone: data.timezone
          })
        });
      } catch (error) {
        setWeather({ temp: 25, condition: "Sunny", isDay: true, time: "Loading..." });
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, [selectedCity]);

  const displayTemp = weather
    ? Math.round(unit === 'C' ? weather.temp : (weather.temp * 9 / 5) + 32)
    : '--';

  const isDay = weather?.isDay ?? true;
  const bgColor = isDay ? cityData.theme.sky : '#0f172a';
  const textColor = getContrastYIQ(bgColor);
  // Add text shadow to ensure readability even if buildings overlap
  const textShadowClass = textColor === '#1e293b' ? 'text-shadow-light' : 'text-shadow-dark';

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center font-sans transition-colors duration-1000"
      style={{ backgroundColor: bgColor, color: textColor }}>

      {/* UI Overlay - Added drop shadows and higher z-index */}
      <div className={`z-30 absolute top-6 md:top-10 flex flex-col items-center text-center w-full px-4 pointer-events-none ${textShadowClass}`}>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-2 uppercase drop-shadow-lg">
          {selectedCity}
        </h1>
        <p className="font-bold tracking-widest text-sm mb-4 opacity-90 drop-shadow-md">{cityData.country}</p>

        <div className="relative mt-2 mb-2 filter drop-shadow-2xl animate-float">
          {loading ? <Loader2 className="w-20 h-20 animate-spin opacity-50" /> : <WeatherIcon condition={weather?.condition || "Sunny"} isDay={isDay} />}
        </div>

        <div className="font-medium text-sm md:text-base tracking-wide px-6 py-2 rounded-full shadow-lg mt-4 border border-white/20 bg-white/10 backdrop-blur-md drop-shadow-md">
          {loading ? "Updating..." : weather?.time}
        </div>

        <div className="text-6xl md:text-8xl font-black mt-4 tracking-tighter drop-shadow-xl">
          {loading ? "--" : displayTemp}°{unit}
        </div>

        <div className="text-lg font-bold uppercase tracking-widest mt-1 opacity-90 drop-shadow-md">
          {loading ? "..." : weather?.condition}
        </div>
      </div>

      {/* 3D Scene - Pushed down (translate-y-20) to avoid text overlap */}
      <div className="z-10 w-full h-full flex items-center justify-center scale-[0.6] md:scale-90 translate-y-20 transition-transform duration-700 ease-out opacity-90">
        <CityScene cityData={cityData} />
      </div>

      {/* Controls */}
      <div className="z-40 absolute bottom-8 left-0 right-0 flex justify-center gap-4 px-4">
        <button onClick={() => setIsMenuOpen(true)} className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl hover:scale-105 transition-all active:scale-95 text-slate-800 font-bold flex items-center gap-2 pointer-events-auto">
          <MapPin className="w-5 h-5" /> Change City
        </button>
        <button onClick={() => setUnit(unit === 'F' ? 'C' : 'F')} className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl hover:scale-105 transition-all active:scale-95 text-slate-800 font-bold flex items-center gap-2 pointer-events-auto">
          <Thermometer className="w-5 h-5" /> {unit}
        </button>
      </div>

      {/* Modal */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsMenuOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-pop-in text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">Select Location</h2>
              <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {Object.keys(CITIES).map(city => (
                <button key={city} onClick={() => { setSelectedCity(city); setIsMenuOpen(false); }} className="w-full text-left p-4 rounded-xl hover:bg-slate-50 transition-colors font-bold">
                  {city} <span className="font-normal opacity-50 ml-2">{CITIES[city].country}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-pop-in { animation: popIn 0.2s ease-out; }
        
        /* Smart Text Shadows for readability on any background */
        .text-shadow-light { text-shadow: 0 2px 10px rgba(255,255,255,0.8); }
        .text-shadow-dark { text-shadow: 0 2px 10px rgba(0,0,0,0.5); }

        .iso-container { perspective: 1000px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .iso-plane {
            width: 0; height: 0; position: relative;
            transform-style: preserve-3d;
            transform: rotateX(60deg) rotateZ(45deg);
        }
        .ground-grid {
            width: 600px; height: 600px; 
            position: absolute; left: -300px; top: -300px;
            background-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px);
            background-size: 40px 40px;
            border-radius: 40px;
            transform: translateZ(-2px);
            box-shadow: 0 0 50px rgba(0,0,0,0.1);
        }

        /* Solid Isometric Cube CSS */
        .iso-building {
            position: absolute; transform-style: preserve-3d;
            left: 0; top: 0;
            width: var(--w); height: var(--d);
            transform: translate3d(var(--x), var(--y), 0);
            transition: transform 0.5s;
        }
        .iso-building .face { position: absolute; transform-origin: 0 0; }
        /* Top */
        .iso-building .face.top {
            width: var(--w); height: var(--d);
            background: var(--color);
            transform: translateZ(var(--h));
        }
        /* Front (South) */
        .iso-building .face.front {
            width: var(--w); height: var(--h);
            background: var(--color-darker);
            transform: rotateX(90deg) translateZ(calc(var(--d) * -1));
            top: var(--d);
        }
        /* Side (East) */
        .iso-building .face.side {
            width: var(--d); height: var(--h);
            background: var(--color-dark);
            transform: rotateX(90deg) rotateY(90deg);
            left: var(--w);
        }
      `}</style>
    </div>
  );
}