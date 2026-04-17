import React, { useState, useEffect, useMemo } from 'react';
import { Cloud, Sun, Moon, CloudRain, CloudSnow, Wind, CloudLightning, MapPin, Thermometer, Loader2, X } from 'lucide-react';

// --- Configuration ---
const CITIES = {
  "Hyderabad": {
    country: "India",
    lat: 17.3850,
    lng: 78.4867,
    theme: { ground: "#fff7ed", accent: "#d97706", sky: "#fff7ed" },
    layout: "historic",
    landmarkType: "charminar",
    style: "classic"
  },
  "San Francisco": {
    country: "USA",
    lat: 37.7749,
    lng: -122.4194,
    theme: { ground: "#e0e7ea", accent: "#ef4444", sky: "#f1f5f9" },
    layout: "hilly",
    landmarkType: "bridge_towers",
    style: "mix"
  },
  "Bangalore": {
    country: "India",
    lat: 12.9716,
    lng: 77.5946,
    theme: { ground: "#f0fdf4", accent: "#15803d", sky: "#f0fdf4" },
    layout: "garden",
    landmarkType: "tech_park",
    style: "modern"
  },
  "Delhi": {
    country: "India",
    lat: 28.6139,
    lng: 77.2090,
    theme: { ground: "#fffbeb", accent: "#b45309", sky: "#fff7ed" },
    layout: "spread",
    landmarkType: "gate",
    style: "classic"
  },
  "Seattle": {
    country: "USA",
    lat: 47.6062,
    lng: -122.3321,
    theme: { ground: "#e2e8f0", accent: "#334155", sky: "#f1f5f9" },
    layout: "high_rise",
    landmarkType: "needle",
    style: "modern"
  },
  "New York": {
    country: "USA",
    lat: 40.7128,
    lng: -74.0060,
    theme: { ground: "#e5e7eb", accent: "#1e293b", sky: "#f8fafc" },
    layout: "skyscraper",
    landmarkType: "empire",
    style: "modern"
  },
  "San Diego": {
    country: "USA",
    lat: 32.7157,
    lng: -117.1611,
    theme: { ground: "#ffedd5", accent: "#0ea5e9", sky: "#ecfeff" },
    layout: "coastal",
    landmarkType: "mission",
    style: "classic"
  },
  "Sydney": {
    country: "Australia",
    lat: -33.8688,
    lng: 151.2093,
    theme: {
      ground: "#ecfeff",
      buildings: ["#ffffff", "#f1f5f9", "#cbd5e1"],
      accent: "#0284c7",
      sky: "#f0f9ff"
    },
    layout: "harbor",
    landmarkType: "sails",
    style: "modern"
  },
  "Paris": {
    country: "France",
    lat: 48.8566,
    lng: 2.3522,
    theme: {
      ground: "#e7e5e4",
      buildings: ["#f5f5f4", "#e7e5e4", "#d6d3d1"],
      accent: "#475569",
      sky: "#fafaf9"
    },
    layout: "historic",
    landmarkType: "eiffel",
    style: "classic"
  },
  "London": {
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    theme: { ground: "#cbd5e1", accent: "#b91c1c", sky: "#f1f5f9" },
    layout: "dense_low",
    landmarkType: "bigben",
    style: "classic"
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

const IsometricBlock = ({ x, y, z = 0, width, height, depth, color, delay, type = 'building', isDay = true }) => {
  const style = {
    '--x': `${x}px`,
    '--y': `${y}px`,
    '--z': `${z}px`,
    '--w': `${width}px`,
    '--h': `${height}px`,
    '--d': `${depth}px`,
    '--color': color,
    '--color-dark': adjustColor(color, -30),
    '--color-darker': adjustColor(color, -60),
    '--delay': `${delay}ms`,
    '--win-color': isDay ? 'rgba(255,255,255,0.2)' : 'rgba(255, 220, 100, 0.8)',
    '--win-bg': isDay ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.5)',
  };

  // Procedural Detail Generation (Only for buildings)
  const details = useMemo(() => {
    if (['building', 'modern', 'classic', 'industrial'].includes(type) === false) return [];

    const d = [];
    const seed = Math.abs(x * y + width);

    if (seed % 3 === 0 && width > 20) d.push(<div key="ac" className="roof-ac" />);
    if (seed % 7 === 0 && height > 60) d.push(<div key="ant" className="roof-antenna" />);
    if (seed % 11 === 0 && width > 35) d.push(<div key="heli" className="roof-helipad">H</div>);

    return d;
  }, [x, y, width, height, type]);

  return (
    <div className={`iso-building ${type} ${!isDay ? 'night' : ''}`} style={style}>
      <div className="face top">
        {details}
      </div>
      <div className="face side"></div>
      <div className="face front">
        {z === 0 && height > 20 && ['building', 'modern', 'classic', 'industrial'].includes(type) && <div className="entrance" />}
      </div>
    </div>
  );
};

const IsoProp = ({ x, y, type, delay, isDay }) => {
  const style = {
    '--x': `${x}px`,
    '--y': `${y}px`,
    '--delay': `${delay}ms`
  };
  return (
    <div className={`iso-prop ${type}`} style={style}>
      {type === 'lamp' && !isDay && <div className="lamp-light" />}
    </div>
  );
};

const CityScene = ({ cityData, isDay }) => {
  const { theme, layout, landmarkType, style: cityStyle } = cityData;

  const { buildings, props } = useMemo(() => {
    const blocks = [];
    const streetProps = [];
    let seed = 5678;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    const cx = 0, cy = 0;
    const baseColor = theme.accent;

    // --- Architecture Helpers ---
    const addBlock = (x, y, z, w, d, h, col, type) => {
      blocks.push({ x, y, z, w, d, h, color: col, styleType: type });
    };

    // --- Landmark Generation ---
    if (landmarkType === 'charminar') {
      [[-20, -20], [20, -20], [20, 20], [-20, 20]].forEach((offset) => {
        addBlock(cx + offset[0], cy + offset[1], 0, 12, 12, 120, baseColor, 'classic');
        addBlock(cx + offset[0], cy + offset[1], 120, 14, 14, 10, adjustColor(baseColor, 20), 'plain');
      });
      addBlock(cx, cy, 0, 50, 50, 60, adjustColor(baseColor, 20), 'classic');
      addBlock(cx, cy, 60, 30, 30, 20, baseColor, 'plain');
    }
    else if (landmarkType === 'bridge_towers') {
      addBlock(cx - 30, cy, 0, 15, 15, 160, '#ef4444', 'industrial');
      addBlock(cx + 30, cy, 0, 15, 15, 160, '#ef4444', 'industrial');
      addBlock(cx, cy, 120, 120, 10, 10, '#555', 'plain');
    }
    else if (landmarkType === 'needle') {
      addBlock(cx, cy, 0, 8, 8, 140, '#ecf0f1', 'plain');
      addBlock(cx, cy, 110, 45, 45, 8, theme.accent, 'plain');
      addBlock(cx, cy, 118, 4, 4, 40, '#bdc3c7', 'plain');
    }
    else if (landmarkType === 'empire') {
      addBlock(cx, cy, 0, 45, 45, 80, theme.accent, 'modern');
      addBlock(cx, cy, 80, 30, 30, 60, adjustColor(theme.accent, 10), 'modern');
      addBlock(cx, cy, 140, 15, 15, 40, adjustColor(theme.accent, 20), 'plain');
      addBlock(cx, cy, 180, 5, 5, 30, '#ccc', 'plain');
    }
    else {
      addBlock(cx, cy, 0, 30, 30, 100, theme.accent, 'modern');
    }

    // --- TERRAIN & CITY GENERATION ---
    const gridSize = 60;
    const mapSize = 4;

    for (let gx = -mapSize; gx <= mapSize; gx++) {
      for (let gy = -mapSize; gy <= mapSize; gy++) {
        if (Math.abs(gx) < 2 && Math.abs(gy) < 2) continue;

        const x = gx * gridSize;
        const y = gy * gridSize;
        const dist = Math.sqrt(gx * gx + gy * gy);

        const isWater = (layout === 'harbor' && gx > 2) || (layout === 'coastal' && gy > 2) || (layout === 'river' && Math.abs(gx) < 1);
        const isMountain = (layout === 'hilly' && dist > 3);
        const isPark = !isWater && !isMountain && random() > 0.8;

        if (isWater) {
          addBlock(x, y, -10, 50, 50, 10, '#3b82f6', 'water');
          continue;
        }

        if (isMountain) {
          const h = 40 + random() * 80;
          addBlock(x, y, 0, 50, 50, h * 0.4, '#57534e', 'terrain');
          addBlock(x, y, h * 0.4, 35, 35, h * 0.4, '#78716c', 'terrain');
          addBlock(x, y, h * 0.8, 20, 20, h * 0.2, '#a8a29e', 'terrain');
          continue;
        }

        if (isPark) {
          addBlock(x, y, 0, 50, 50, 2, '#4ade80', 'terrain');
          streetProps.push({ x: x, y: y, type: 'tree' });
          streetProps.push({ x: x + 15, y: y + 15, type: 'tree' });
          streetProps.push({ x: x - 15, y: y - 15, type: 'tree' });
          continue;
        }

        let h = 30 + random() * 60;
        const w = 20 + random() * 15;
        const d = 20 + random() * 15;

        const palette = theme.buildings || ['#cccccc'];
        let color = palette[Math.floor(random() * palette.length)];

        let type = 'modern';
        if (cityStyle === 'classic') type = Math.random() > 0.7 ? 'modern' : 'classic';
        if (cityStyle === 'mix') type = Math.random() > 0.5 ? 'modern' : 'classic';

        if (layout === 'skyscraper' && (gx + gy) % 2 === 0) {
          h += 80;
          addBlock(x, y, 0, w, d, h * 0.6, color, type);
          addBlock(x, y, h * 0.6, w * 0.7, d * 0.7, h * 0.4, adjustColor(color, 10), type);
        } else {
          addBlock(x, y, 0, w, d, h, color, type);
        }

        if (random() > 0.6) streetProps.push({ x: x + w / 2 + 15, y: y - 15, type: 'tree' });
        if (random() > 0.7) streetProps.push({ x: x - 20, y: y + 20, type: 'lamp' });
      }
    }

    const finalBlocks = blocks.map((b, i) => ({
      ...b, id: i, delay: 600 + (Math.abs(b.x) + Math.abs(b.y)) * 2
    }));

    const finalProps = streetProps.map((p, i) => ({
      ...p, id: `prop-${i}`, delay: 800 + i * 20
    }));

    return {
      buildings: finalBlocks.sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z)),
      props: finalProps.sort((a, b) => (a.x + a.y) - (b.x + b.y))
    };
  }, [cityData]);

  return (
    <div className="iso-container">
      <div className="iso-plane">
        <div className="ground-grid" style={{ backgroundColor: theme.ground }}></div>
        {/* Terrain/Buildings */}
        {buildings.map(b => (
          <IsometricBlock key={b.id} {...b} width={b.w} depth={b.d} height={b.h} isDay={isDay} />
        ))}
        {/* Props */}
        {props.map(p => (
          <IsoProp key={p.id} x={p.x} y={p.y} type={p.type} delay={p.delay} isDay={isDay} />
        ))}
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
  if (!isDay) return <Moon className="weather-icon text-slate-200 drop-shadow-lg" size={size} />;
  return <Sun className="weather-icon text-yellow-400 drop-shadow-lg animate-spin-slow" size={size} />;
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
          time: new Date().toLocaleTimeString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: data.timezone })
        });
      } catch (error) {
        setWeather({ temp: 25, condition: "Sunny", isDay: true, time: "Loading..." });
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, [selectedCity]);

  const displayTemp = weather ? Math.round(unit === 'C' ? weather.temp : (weather.temp * 9 / 5) + 32) : '--';
  const isDay = weather?.isDay ?? true;
  const bgColor = isDay ? cityData.theme.sky : '#0f172a';
  const textColor = getContrastYIQ(bgColor);

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center font-sans transition-colors duration-1000"
      style={{ backgroundColor: bgColor, color: textColor }}>

      <div className={`z-30 absolute top-6 md:top-10 flex flex-col items-center text-center w-full px-4 pointer-events-none`}>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-2 uppercase drop-shadow-lg">{selectedCity}</h1>
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

      <div className="z-10 w-full h-full flex items-center justify-center scale-[0.45] md:scale-75 translate-y-24 transition-transform duration-700 ease-out opacity-90">
        <CityScene cityData={cityData} isDay={isDay} />
      </div>

      <div className="z-40 absolute bottom-8 left-0 right-0 flex justify-center gap-4 px-4">
        <button onClick={() => setIsMenuOpen(true)} className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl hover:scale-105 transition-all active:scale-95 text-slate-800 font-bold flex items-center gap-2 pointer-events-auto">
          <MapPin className="w-5 h-5" /> Change City
        </button>
        <button onClick={() => setUnit(unit === 'F' ? 'C' : 'F')} className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl hover:scale-105 transition-all active:scale-95 text-slate-800 font-bold flex items-center gap-2 pointer-events-auto">
          <Thermometer className="w-5 h-5" /> {unit}
        </button>
      </div>

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

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-pop-in { animation: popIn 0.2s ease-out; }
        
        .iso-container { perspective: 1000px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .iso-plane {
            width: 0; height: 0; position: relative;
            transform-style: preserve-3d;
            transform: rotateX(60deg) rotateZ(45deg);
        }
        
        .ground-grid {
            width: 800px; height: 800px; 
            position: absolute; left: -400px; top: -400px;
            background-image: 
                url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E"),
                linear-gradient(rgba(0,0,0,0.1) 2px, transparent 2px), 
                linear-gradient(90deg, rgba(0,0,0,0.1) 2px, transparent 2px);
            background-size: 200px 200px, 60px 60px, 60px 60px;
            border-radius: 40px;
            transform: translateZ(-2px);
            box-shadow: 0 0 80px rgba(0,0,0,0.15);
        }

        .iso-building, .iso-block {
            position: absolute; transform-style: preserve-3d;
            left: 0; top: 0;
            width: var(--w); height: var(--d);
            transform: translate3d(var(--x), var(--y), var(--z));
            transition: transform 0.5s;
            will-change: transform;
        }
        .iso-building .face, .iso-block .face { position: absolute; transform-origin: 0 0; }
        
        .face.top {
            width: var(--w); height: var(--d);
            background: var(--color);
            transform: translateZ(var(--h));
            box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2);
        }
        .face.front {
            width: var(--w); height: var(--h);
            background: var(--color-darker);
            transform: rotateX(90deg) translateZ(calc(var(--d) * -1));
            top: var(--d);
            /* Lit Windows Logic */
            background-image: 
                linear-gradient(var(--win-color) 2px, transparent 2px),
                linear-gradient(90deg, var(--win-color) 1px, transparent 1px);
            background-size: 6px 10px;
            background-color: var(--win-bg);
        }
        .face.side {
            width: var(--d); height: var(--h);
            background: var(--color-dark);
            transform: rotateX(90deg) rotateY(90deg);
            left: var(--w);
            background-image: 
                linear-gradient(var(--win-color) 2px, transparent 2px),
                linear-gradient(90deg, var(--win-color) 1px, transparent 1px);
            background-size: 6px 10px;
        }

        /* Styles */
        .iso-block.water .face.top { 
            background: #3b82f6; opacity: 0.8; 
            box-shadow: inset 0 0 20px rgba(255,255,255,0.2);
            animation: pulse-water 3s infinite alternate;
        }
        @keyframes pulse-water { from { opacity: 0.7; } to { opacity: 0.9; } }

        .iso-block.terrain .face.top { 
            background-image: radial-gradient(rgba(0,0,0,0.1) 20%, transparent 20%);
            background-size: 5px 5px;
        }

        /* Building Texture: Modern */
        .iso-building.modern .face.front, .iso-building.modern .face.side {
            background-image: 
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
            background-size: 5px 8px;
        }
        
        /* Roof Details */
        .roof-ac {
            position: absolute; width: 30%; height: 30%; background: #888; left: 20%; top: 20%;
            transform: translateZ(4px); box-shadow: 1px 1px 3px rgba(0,0,0,0.3);
        }
        .roof-antenna {
            position: absolute; width: 2px; height: 2px; background: #333; right: 20%; bottom: 20%;
            transform: translateZ(20px) scaleZ(10); box-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        .roof-helipad {
            position: absolute; width: 80%; height: 80%; top: 10%; left: 10%;
            border: 2px dashed #fff; color: #fff; display: flex; align-items: center; justify-content: center;
            font-size: 10px; font-weight: bold; transform: translateZ(1px);
        }

        /* Entrance */
        .entrance {
            position: absolute; bottom: 0; left: 30%; width: 40%; height: 12px;
            background: rgba(0,0,0,0.5);
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.8);
        }

        /* Props */
        .iso-prop.tree {
            position: absolute; transform-style: preserve-3d;
            width: 10px; height: 10px;
            transform: translate3d(var(--x), var(--y), 0);
        }
        .iso-prop.tree::before {
            content: ''; position: absolute;
            width: 100%; height: 18px;
            background: #22c55e; border-radius: 50% 50% 2px 2px;
            transform: rotateX(-90deg) translateY(-18px);
            transform-origin: bottom;
        }
        
        .iso-prop.lamp {
            position: absolute; transform-style: preserve-3d;
            width: 2px; height: 2px; background: #333;
            transform: translate3d(var(--x), var(--y), 0);
        }
        .iso-prop.lamp::after {
            content: ''; position: absolute;
            width: 100%; height: 15px; background: #777;
            transform: rotateX(-90deg) translateY(-15px); transform-origin: bottom;
        }
        .lamp-light {
            position: absolute; width: 4px; height: 4px; background: #fbbf24;
            border-radius: 50%;
            transform: rotateX(-90deg) translateY(-16px) translateX(-1px);
            box-shadow: 0 0 8px #fbbf24;
        }
      `}</style>
    </div>
  );
}