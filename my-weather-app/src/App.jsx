import React, { useState, useEffect, useMemo } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Droplets, MapPin, Menu, Search, X, Thermometer, Loader2 } from 'lucide-react';

// --- Configuration ---

const CITIES = {
  "Hyderabad": {
    country: "India",
    lat: 17.3850,
    lng: 78.4867,
    theme: {
      ground: "#e6d5b8",
      buildings: ["#ffecd1", "#e3d0b1", "#d4b483"],
      accent: "#c1a57b",
      sky: "#fff8f0"
    },
    layout: "dense_low",
    landmarkType: "charminar"
  },
  "San Francisco": {
    country: "USA",
    lat: 37.7749,
    lng: -122.4194,
    theme: {
      ground: "#e0e7ea",
      buildings: ["#f7f9fa", "#d1dce3", "#a8b5bd"],
      accent: "#ff6b6b",
      sky: "#f0f4f8"
    },
    layout: "hilly",
    landmarkType: "bridge_towers"
  },
  "Bangalore": {
    country: "India",
    lat: 12.9716,
    lng: 77.5946,
    theme: {
      ground: "#dcedc1",
      buildings: ["#ffffff", "#e8f5e9", "#c8e6c9"],
      accent: "#81c784",
      sky: "#e8f5e9"
    },
    layout: "garden",
    landmarkType: "tech_park"
  },
  "Delhi": {
    country: "India",
    lat: 28.6139,
    lng: 77.2090,
    theme: {
      ground: "#f3e5ab",
      buildings: ["#fff8e1", "#ffe0b2", "#ffcc80"],
      accent: "#fb8c00",
      sky: "#fffde7"
    },
    layout: "spread",
    landmarkType: "gate"
  },
  "Seattle": {
    country: "USA",
    lat: 47.6062,
    lng: -122.3321,
    theme: {
      ground: "#cfd8dc",
      buildings: ["#eceff1", "#b0bec5", "#78909c"],
      accent: "#546e7a",
      sky: "#eceff1"
    },
    layout: "high_rise",
    landmarkType: "needle"
  },
  "New York": {
    country: "USA",
    lat: 40.7128,
    lng: -74.0060,
    theme: {
      ground: "#dfe6e9",
      buildings: ["#f5f6fa", "#dcdde1", "#7f8fa6"],
      accent: "#2f3640",
      sky: "#f5f6fa"
    },
    layout: "skyscraper",
    landmarkType: "empire"
  },
  "San Diego": {
    country: "USA",
    lat: 32.7157,
    lng: -117.1611,
    theme: {
      ground: "#eaddcf",
      buildings: ["#fff", "#fdf6e3", "#eee8d5"],
      accent: "#268bd2",
      sky: "#e0f7fa"
    },
    layout: "coastal",
    landmarkType: "mission"
  },
  "Sydney": {
    country: "Australia",
    lat: -33.8688,
    lng: 151.2093,
    theme: {
      ground: "#006994",
      buildings: ["#ffffff", "#f0f0f0", "#e0e0e0"],
      accent: "#ffffff",
      sky: "#e1f5fe"
    },
    layout: "harbor",
    landmarkType: "sails"
  },
  "Paris": {
    country: "France",
    lat: 48.8566,
    lng: 2.3522,
    theme: {
      ground: "#dcdde1",
      buildings: ["#f5f6fa", "#dcdde1", "#bdc3c7"],
      accent: "#8e44ad",
      sky: "#dcdde1"
    },
    layout: "spread",
    landmarkType: "eiffel"
  },
  "London": {
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    theme: {
      ground: "#7f8c8d",
      buildings: ["#95a5a6", "#7f8c8d", "#34495e"],
      accent: "#c0392b",
      sky: "#ecf0f1"
    },
    layout: "dense_low",
    landmarkType: "bigben"
  }
};

// --- Helpers ---

// Map WMO weather codes to our simplified conditions
function getWeatherCondition(code) {
  if (code === 0) return "Sunny";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Sunny";
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

// --- 3D Components ---

const Building = ({ x, y, z = 0, width, depth, height, color, delay, opacity = 1 }) => {
  // Simplified and corrected CSS Logic to fix "exploded" view
  const style = {
    '--x': x,
    '--y': y,
    '--z': z,
    '--w': width,
    '--d': depth,
    '--h': height,
    '--color': color,
    '--color-side': adjustColor(color, -30),
    '--color-front': adjustColor(color, -15),
    '--delay': `${delay}ms`,
    '--opacity': opacity
  };

  return (
    <div className="building-wrapper" style={style}>
      {/* Top */}
      <div className="face top"></div>
      {/* Side (Right) */}
      <div className="face side"></div>
      {/* Front (South) */}
      <div className="face front"></div>
    </div>
  );
};

const CityScene = ({ cityData }) => {
  const { theme, layout, landmarkType } = cityData;

  const buildings = useMemo(() => {
    const b = [];
    const landmarks = [];
    let seed = 123;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    const cx = 35, cy = 35;
    const baseColor = theme.accent;

    // LANDMARK LOGIC
    if (landmarkType === 'charminar') {
      [[-10, -10], [10, -10], [10, 10], [-10, 10]].forEach((offset, i) => {
        landmarks.push({ id: `l-tow-${i}`, x: cx + offset[0], y: cy + offset[1], w: 6, d: 6, h: 80, z: 0, color: baseColor });
      });
      landmarks.push({ id: 'l-base', x: cx - 10, y: cy - 10, w: 26, d: 26, h: 40, z: 0, color: adjustColor(baseColor, 20) });
    }
    else if (landmarkType === 'bridge_towers') {
      landmarks.push({ id: 'l1', x: cx - 15, y: cy, w: 6, d: 6, h: 110, z: 0, color: '#ff6b6b' });
      landmarks.push({ id: 'l2', x: cx + 15, y: cy, w: 6, d: 6, h: 110, z: 0, color: '#ff6b6b' });
      landmarks.push({ id: 'l3', x: cx - 30, y: cy + 1, w: 70, d: 4, h: 4, z: 45, color: '#555' });
    }
    else if (landmarkType === 'needle') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 4, d: 4, h: 90, z: 0, color: '#ecf0f1' });
      landmarks.push({ id: 'l2', x: cx - 8, y: cy - 8, w: 20, d: 20, h: 4, z: 75, color: theme.accent });
      landmarks.push({ id: 'l3', x: cx + 1, y: cy + 1, w: 2, d: 2, h: 25, z: 80, color: '#bdc3c7' });
    }
    else if (landmarkType === 'gate') {
      landmarks.push({ id: 'l1', x: cx - 12, y: cy, w: 8, d: 12, h: 55, z: 0, color: '#e6cba5' });
      landmarks.push({ id: 'l2', x: cx + 12, y: cy, w: 8, d: 12, h: 55, z: 0, color: '#e6cba5' });
      landmarks.push({ id: 'l3', x: cx - 12, y: cy + 2, w: 32, d: 8, h: 6, z: 50, color: '#d4b483' });
      landmarks.push({ id: 'l4', x: cx - 2, y: cy + 4, w: 12, d: 8, h: 4, z: 58, color: '#d4a373' });
    }
    else if (landmarkType === 'empire') {
      landmarks.push({ id: 'l1', x: cx - 12, y: cy - 12, w: 24, d: 24, h: 60, z: 0, color: theme.accent });
      landmarks.push({ id: 'l2', x: cx - 8, y: cy - 8, w: 16, d: 16, h: 30, z: 60, color: adjustColor(theme.accent, 15) });
      landmarks.push({ id: 'l3', x: cx - 4, y: cy - 4, w: 8, d: 8, h: 40, z: 90, color: adjustColor(theme.accent, 25) });
    }
    else if (landmarkType === 'tech_park') {
      landmarks.push({ id: 'l1', x: cx - 15, y: cy - 10, w: 15, d: 20, h: 65, z: 0, color: '#a8dadc' });
      landmarks.push({ id: 'l2', x: cx + 5, y: cy - 5, w: 15, d: 20, h: 85, z: 0, color: '#457b9d' });
      landmarks.push({ id: 'l3', x: cx - 5, y: cy + 15, w: 20, d: 10, h: 50, z: 0, color: '#1d3557' });
    }
    else if (landmarkType === 'mission') {
      landmarks.push({ id: 'l1', x: cx - 15, y: cy - 5, w: 30, d: 15, h: 25, z: 0, color: '#fdf6e3' });
      landmarks.push({ id: 'l2', x: cx + 15, y: cy - 5, w: 8, d: 8, h: 45, z: 0, color: '#fdf6e3' });
      landmarks.push({ id: 'l3', x: cx + 16, y: cy - 4, w: 6, d: 6, h: 5, z: 45, color: '#a0522d' });
    }
    else if (landmarkType === 'sails') {
      landmarks.push({ id: 'l1', x: cx - 10, y: cy - 10, w: 15, d: 25, h: 40, z: 0, color: '#fff' });
      landmarks.push({ id: 'l2', x: cx + 5, y: cy - 5, w: 12, d: 20, h: 30, z: 0, color: '#f0f0f0' });
      landmarks.push({ id: 'l3', x: cx + 15, y: cy, w: 8, d: 15, h: 20, z: 0, color: '#e0e0e0' });
      landmarks.push({ id: 'l4', x: cx - 15, y: cy - 15, w: 40, d: 40, h: 5, z: 0, color: '#d4a373' });
    }
    else if (landmarkType === 'eiffel') {
      landmarks.push({ id: 'l1', x: cx - 12, y: cy - 12, w: 24, d: 24, h: 30, z: 0, color: '#595046' });
      landmarks.push({ id: 'l2', x: cx - 8, y: cy - 8, w: 16, d: 16, h: 40, z: 30, color: '#6d6256' });
      landmarks.push({ id: 'l3', x: cx - 4, y: cy - 4, w: 8, d: 8, h: 60, z: 70, color: '#807366' });
    }
    else if (landmarkType === 'bigben') {
      landmarks.push({ id: 'l1', x: cx, y: cy, w: 10, d: 10, h: 100, z: 0, color: '#d4a373' });
      landmarks.push({ id: 'l2', x: cx - 1, y: cy - 1, w: 12, d: 12, h: 10, z: 80, color: '#333' });
      landmarks.push({ id: 'l3', x: cx + 1, y: cy + 1, w: 8, d: 8, h: 15, z: 90, color: '#bdc3c7' });
      landmarks.push({ id: 'l4', x: cx - 20, y: cy, w: 20, d: 15, h: 40, z: 0, color: '#e6cba5' });
    }

    // BACKGROUND CITY
    for (let i = 0; i < 30; i++) {
      let x = Math.floor(random() * 9) * 10;
      let y = Math.floor(random() * 9) * 10;

      if (x >= 20 && x <= 60 && y >= 20 && y <= 60) continue;

      let h = 10 + random() * 25;
      let w = 8 + random() * 4;
      let d = 8 + random() * 4;
      let color = theme.buildings[Math.floor(random() * theme.buildings.length)];

      if (layout === 'skyscraper') h += 40;
      if (layout === 'hilly') h += (x / 3 + y / 3);
      if (layout === 'high_rise' && i % 3 === 0) { h = 90; w = 6; d = 6; }
      if (layout === 'coastal') h = 10 + random() * 15;

      b.push({ id: `bg-${i}`, x, y, w, d, h, z: 0, color, delay: i * 30 });
    }

    const all = [...b, ...landmarks.map((l, i) => ({ ...l, delay: 600 + i * 50 }))];
    return all.sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));
  }, [layout, theme, landmarkType]);

  return (
    <div className="scene-container">
      <div className="isometric-platform" style={{ backgroundColor: theme.ground }}>
        {buildings.map(b => (
          <Building
            key={b.id}
            {...b}
            width={b.w} depth={b.d} height={b.h}
          />
        ))}
        <div className="ground-grid"></div>
      </div>
    </div>
  );
};

// --- Weather Icons ---

const WeatherIcon = ({ condition, size = 120 }) => {
  const cond = condition.toLowerCase();
  const isRain = cond.includes('rain');
  const isSnow = cond.includes('snow');
  const isStorm = cond.includes('storm');
  const isCloudy = cond.includes('cloud') || cond.includes('fog');
  const isSunny = !isRain && !isSnow && !isCloudy && !isStorm;

  return (
    <div className="weather-icon-3d" style={{ width: size, height: size }}>
      {isSunny && <div className="sun-3d"></div>}
      {isCloudy && <div className="cloud-3d"></div>}
      {isRain && (
        <>
          <div className="cloud-3d dark"></div>
          <div className="rain-drops"><i></i><i></i><i></i></div>
        </>
      )}
      {isSnow && (
        <>
          <div className="cloud-3d white"></div>
          <div className="snow-flakes">❄ ❄ ❄</div>
        </>
      )}
      {isStorm && (
        <>
          <div className="cloud-3d dark storm"></div>
          <div className="rain-drops"><i></i><i></i></div>
        </>
      )}
    </div>
  );
};


// --- Main Application ---

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

        setWeather({
          temp: data.current_weather.temperature,
          condition: getWeatherCondition(data.current_weather.weathercode),
          time: new Date().toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            timeZone: data.timezone
          })
        });
      } catch (error) {
        console.error("Failed to fetch weather", error);
        setWeather({ temp: 25, condition: "Sunny", time: new Date().toLocaleDateString() });
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, [selectedCity, cityData]);

  const displayTemp = weather
    ? Math.round(unit === 'C' ? weather.temp : (weather.temp * 9 / 5) + 32)
    : '--';

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center font-sans text-slate-800"
      style={{ backgroundColor: cityData.theme.sky, transition: 'background-color 1s ease' }}>

      {/* UI Overlay */}
      <div className="z-20 absolute top-8 md:top-12 flex flex-col items-center text-center pointer-events-none w-full px-4 animate-fade-in-down">
        <h1 className="text-4xl md:text-6xl font-black text-slate-800 tracking-tight drop-shadow-sm mb-2 uppercase">
          {selectedCity}
        </h1>
        <p className="text-slate-500 font-bold tracking-widest text-sm mb-4">{cityData.country}</p>

        <div className="relative mt-2 mb-2 filter drop-shadow-xl animate-float">
          {loading ? <Loader2 className="w-20 h-20 animate-spin text-slate-400" /> : <WeatherIcon condition={weather?.condition || "Sunny"} />}
        </div>

        <div className="text-slate-600 font-medium text-sm md:text-base tracking-wide bg-white/40 backdrop-blur-sm px-4 py-1 rounded-full shadow-sm mt-4">
          {loading ? "Updating..." : weather?.time}
        </div>

        <div className="text-6xl md:text-8xl font-black text-slate-800 mt-2 tracking-tighter drop-shadow-md">
          {loading ? "--" : displayTemp}°{unit}
        </div>

        <div className="text-lg text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-75">
          {loading ? "..." : weather?.condition}
        </div>
      </div>

      {/* 3D Scene */}
      <div className="z-10 w-full h-full flex items-center justify-center scale-[0.6] md:scale-90 transition-transform duration-700 ease-out">
        <CityScene cityData={cityData} />
      </div>

      {/* Controls */}
      <div className="z-30 absolute bottom-8 left-0 right-0 flex justify-center gap-4 px-4">
        <button
          onClick={() => setIsMenuOpen(true)}
          className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg hover:scale-105 transition-all active:scale-95 text-slate-700 group flex items-center gap-2 pointer-events-auto border border-white/50"
        >
          <MapPin className="w-6 h-6" />
          <span className="font-bold">Change City</span>
        </button>

        <button
          onClick={() => setUnit(unit === 'F' ? 'C' : 'F')}
          className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg hover:scale-105 transition-all active:scale-95 text-slate-700 group flex items-center gap-2 pointer-events-auto border border-white/50"
        >
          <Thermometer className="w-6 h-6" />
          <span className={`font-bold ${unit === 'F' ? 'text-slate-800' : 'text-slate-400'}`}>°F</span>
          <span className="text-slate-300">|</span>
          <span className={`font-bold ${unit === 'C' ? 'text-slate-800' : 'text-slate-400'}`}>°C</span>
        </button>
      </div>

      {/* City Menu Modal */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-pop-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Select Location</h2>
              <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {Object.keys(CITIES).map(city => (
                <button
                  key={city}
                  onClick={() => { setSelectedCity(city); setIsMenuOpen(false); }}
                  className={`w-full text-left p-4 rounded-xl flex justify-between items-center transition-all ${selectedCity === city ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <span className="font-bold text-lg">{city}</span>
                  <span className="text-sm font-medium opacity-60 flex items-center gap-1">
                    {CITIES[city].country}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSS Styles */}
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes fadeInDown { 0% { opacity: 0; transform: translateY(-20px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes buildingPop { 0% { transform: scaleZ(0); opacity: 0; } 100% { transform: scaleZ(1); opacity: 1; } }
        
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-pop-in { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-fade-in-down { animation: fadeInDown 0.8s ease-out forwards; }

        .scene-container { width: 800px; height: 800px; perspective: 2000px; display: flex; align-items: center; justify-content: center; }

        .isometric-platform {
            width: 60%; height: 60%; position: relative; transform-style: preserve-3d;
            transform: rotateX(60deg) rotateZ(45deg); border-radius: 20px;
            box-shadow: 20px 20px 60px rgba(0,0,0,0.1), -5px -5px 20px rgba(255,255,255,0.5) inset;
            transition: background-color 1s ease;
        }

        /* Building Construction */
        .building-wrapper {
            position: absolute; transform-style: preserve-3d;
            left: calc(var(--x) * 1%); top: calc(var(--y) * 1%);
            width: calc(var(--w) * 1%); height: calc(var(--d) * 1%);
            transform: translateZ(calc(var(--z) * 3px)); z-index: 10;
        }
        
        .building-wrapper .face { position: absolute; backface-visibility: visible; }

        /* Top Face */
        .building-wrapper .face.top {
            width: 100%; height: 100%; background-color: var(--color);
            transform: translateZ(calc(var(--h) * 3px)); border-radius: 2px;
        }

        /* Side Face (West) - Extends Height from Left Edge */
        .building-wrapper .face.side {
            width: calc(var(--h) * 3px); height: 100%; background-color: var(--color-side);
            transform-origin: left; transform: rotateY(90deg); left: 0;
        }

        /* Front Face (South) - Extends Height from Bottom Edge */
        .building-wrapper .face.front {
            width: 100%; height: calc(var(--h) * 3px); background-color: var(--color-front);
            transform-origin: bottom; transform: rotateX(90deg); bottom: 0;
        }
        
        .ground-grid {
            position: absolute; inset: 0;
            background-image: linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
            background-size: 10% 10%; pointer-events: none; border-radius: 20px;
        }

        /* Weather Icons */
        .weather-icon-3d { position: relative; perspective: 500px; }
        .sun-3d {
            width: 80%; height: 80%; background: radial-gradient(circle at 30% 30%, #ffd700, #f59e0b);
            border-radius: 50%; position: absolute; top: 10%; left: 10%;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), inset -10px -10px 20px rgba(217, 119, 6, 0.5);
            animation: float 4s ease-in-out infinite;
        }
        .cloud-3d {
            width: 100%; height: 60%; background: linear-gradient(to bottom, #fff, #e2e8f0);
            border-radius: 50px; position: absolute; top: 20%;
            box-shadow: 0 15px 25px rgba(0,0,0,0.1), inset 0 5px 10px rgba(255,255,255,1); z-index: 2;
        }
        .cloud-3d:before, .cloud-3d:after { content: ''; position: absolute; background: inherit; border-radius: 50%; }
        .cloud-3d:before { top: -50%; left: 15%; width: 50%; height: 120%; }
        .cloud-3d:after { top: -30%; right: 15%; width: 40%; height: 100%; }
        .cloud-3d.dark { background: linear-gradient(to bottom, #94a3b8, #64748b); }
        .cloud-3d.storm { background: linear-gradient(to bottom, #475569, #1e293b); }
        
        .rain-drops i {
            position: absolute; background: #3b82f6; width: 4px; height: 15px;
            border-radius: 4px; top: 60%; animation: rainDrop 1s linear infinite;
        }
        .rain-drops i:nth-child(1) { left: 20%; animation-delay: 0s; }
        .rain-drops i:nth-child(2) { left: 50%; animation-delay: 0.3s; }
        .rain-drops i:nth-child(3) { left: 80%; animation-delay: 0.6s; }
        
        .snow-flakes {
            position: absolute; top: 70%; width: 100%; text-align: center; color: white; font-size: 24px;
            animation: float 3s ease-in-out infinite reverse;
        }

        @keyframes rainDrop { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(40px); opacity: 0; } }
      `}</style>
    </div>
  );
}