#!/usr/bin/env node
/**
 * Generate a playable IsoCity state from OpenStreetMap data for central
 * Antananarivo. The output is intentionally semi-real: roads and landmark
 * positions come from OSM, while dense building footprints are sampled into
 * one-tile game buildings so the result stays playable.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'public', 'example-states', 'antananarivo_osm_state.json');
const DEFAULT_CACHE_DIR = path.join(ROOT_DIR, '.osm-cache');

const DEFAULT_BBOX = {
  south: -18.928,
  west: 47.500,
  north: -18.890,
  east: 47.540,
};

const GRID_SIZE = 96;
const BUILDING_LIMIT = 6500;
const CITY_ID = 'antananarivo-osm-core';
const ROAD_HIGHWAYS = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
  'service',
]);

const ENDPOINTS = [
  process.env.OVERPASS_ENDPOINT,
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
].filter(Boolean);

const BUILDING_STATS = {
  house_small: { maxPop: 6, maxJobs: 0, landValue: 10 },
  house_medium: { maxPop: 14, maxJobs: 0, landValue: 22 },
  apartment_low: { maxPop: 120, maxJobs: 0, landValue: 40 },
  apartment_high: { maxPop: 260, maxJobs: 0, landValue: 55 },
  shop_small: { maxPop: 0, maxJobs: 10, landValue: 16 },
  shop_medium: { maxPop: 0, maxJobs: 28, landValue: 26 },
  office_low: { maxPop: 0, maxJobs: 90, landValue: 40 },
  office_high: { maxPop: 0, maxJobs: 210, landValue: 55 },
  mall: { maxPop: 0, maxJobs: 260, landValue: 70 },
  factory_small: { maxPop: 0, maxJobs: 40, landValue: -5 },
  factory_medium: { maxPop: 0, maxJobs: 90, landValue: -10 },
  warehouse: { maxPop: 0, maxJobs: 60, landValue: -6 },
  police_station: { maxPop: 0, maxJobs: 20, landValue: 15 },
  fire_station: { maxPop: 0, maxJobs: 20, landValue: 10 },
  hospital: { maxPop: 0, maxJobs: 80, landValue: 25 },
  school: { maxPop: 0, maxJobs: 25, landValue: 15 },
  university: { maxPop: 0, maxJobs: 100, landValue: 35 },
  park: { maxPop: 0, maxJobs: 2, landValue: 20 },
  park_large: { maxPop: 0, maxJobs: 6, landValue: 50 },
  power_plant: { maxPop: 0, maxJobs: 30, landValue: -20 },
  water_tower: { maxPop: 0, maxJobs: 5, landValue: 5 },
  subway_station: { maxPop: 0, maxJobs: 15, landValue: 25 },
  rail_station: { maxPop: 0, maxJobs: 25, landValue: 20 },
  stadium: { maxPop: 0, maxJobs: 50, landValue: 40 },
  museum: { maxPop: 0, maxJobs: 40, landValue: 45 },
  city_hall: { maxPop: 0, maxJobs: 60, landValue: 50 },
  tree: { maxPop: 0, maxJobs: 0, landValue: 2 },
  road: { maxPop: 0, maxJobs: 0, landValue: 0 },
  rail: { maxPop: 0, maxJobs: 0, landValue: -2 },
  water: { maxPop: 0, maxJobs: 0, landValue: 5 },
  grass: { maxPop: 0, maxJobs: 0, landValue: 0 },
};

const LANDMARKS = [
  { name: 'Hotel de Ville', lat: -18.9085, lon: 47.5251, type: 'city_hall' },
  { name: 'Gare de Soarano', lat: -18.9024, lon: 47.5227, type: 'rail_station' },
  { name: 'Lac Anosy', lat: -18.9144, lon: 47.5211, type: 'water' },
  { name: 'Mahamasina', lat: -18.9194, lon: 47.5213, type: 'stadium' },
  { name: 'Rova', lat: -18.9237, lon: 47.5323, type: 'museum' },
  { name: 'Hopital central', lat: -18.9124, lon: 47.5266, type: 'hospital' },
  { name: 'Ankatso', lat: -18.9045, lon: 47.5390, type: 'university' },
  { name: 'Poste police centre', lat: -18.9097, lon: 47.5224, type: 'police_station' },
  { name: 'Caserne centre', lat: -18.9140, lon: 47.5168, type: 'fire_station' },
  { name: 'Reserve energie', lat: -18.9240, lon: 47.5065, type: 'power_plant' },
  { name: 'Chateau eau', lat: -18.8965, lon: 47.5350, type: 'water_tower' },
];

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function stableHash(input) {
  const value = String(input);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeBuilding(type, seed = type) {
  const stats = BUILDING_STATS[type] || { maxPop: 0, maxJobs: 0, landValue: 0 };
  const level = ['grass', 'water', 'road', 'rail', 'tree'].includes(type)
    ? 0
    : 1 + (stableHash(seed) % 3);
  const occupancy = 0.35 + ((stableHash(`${seed}:occ`) % 35) / 100);

  return {
    type,
    level,
    population: Math.floor(stats.maxPop * level * occupancy),
    jobs: Math.floor(stats.maxJobs * level * occupancy),
    powered: !['grass', 'water', 'tree'].includes(type),
    watered: !['grass', 'water', 'tree'].includes(type),
    onFire: false,
    fireProgress: 0,
    age: 40 + (stableHash(`${seed}:age`) % 120),
    constructionProgress: 100,
    abandoned: false,
    cityId: CITY_ID,
  };
}

function makeTile(x, y, type = 'grass') {
  const stats = BUILDING_STATS[type] || { landValue: 0 };
  return {
    x,
    y,
    zone: 'none',
    building: makeBuilding(type, `${x}:${y}:${type}`),
    landValue: 50 + stats.landValue,
    pollution: type === 'road' ? 8 : type === 'rail' ? 4 : 0,
    crime: 0,
    traffic: 0,
    hasSubway: false,
  };
}

function createGrid(size) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push(makeTile(x, y));
    }
    grid.push(row);
  }
  return grid;
}

function createGridOf(size, value) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

function toGrid(lat, lon, bbox = DEFAULT_BBOX) {
  const col = Math.round(((lon - bbox.west) / (bbox.east - bbox.west)) * (GRID_SIZE - 1));
  const row = Math.round(((bbox.north - lat) / (bbox.north - bbox.south)) * (GRID_SIZE - 1));
  return {
    x: Math.max(0, Math.min(GRID_SIZE - 1, col)),
    y: Math.max(0, Math.min(GRID_SIZE - 1, row)),
  };
}

function fromGrid(x, y, bbox = DEFAULT_BBOX) {
  return {
    lon: bbox.west + (x / (GRID_SIZE - 1)) * (bbox.east - bbox.west),
    lat: bbox.north - (y / (GRID_SIZE - 1)) * (bbox.north - bbox.south),
  };
}

function lineTiles(a, b) {
  const tiles = [];
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const steps = Math.max(dx, dy, 1);
  for (let i = 0; i <= steps; i++) {
    tiles.push({
      x: Math.round(a.x + ((b.x - a.x) * i) / steps),
      y: Math.round(a.y + ((b.y - a.y) * i) / steps),
    });
  }
  return tiles;
}

function paintTile(grid, x, y, type, options = {}) {
  const tile = grid[y]?.[x];
  if (!tile) return false;
  if (options.preserveWater && tile.building.type === 'water') return false;
  if (options.preserveTransport && ['road', 'rail'].includes(tile.building.type)) return false;
  if (options.onlyEmpty && !['grass', 'tree'].includes(tile.building.type)) return false;

  tile.building = makeBuilding(type, `${x}:${y}:${type}`);
  tile.zone = options.zone ?? tile.zone;
  tile.landValue = Math.max(10, 50 + (BUILDING_STATS[type]?.landValue ?? 0));
  return true;
}

function paintLine(grid, points, type, width = 0) {
  for (let i = 1; i < points.length; i++) {
    for (const tile of lineTiles(points[i - 1], points[i])) {
      for (let oy = -width; oy <= width; oy++) {
        for (let ox = -width; ox <= width; ox++) {
          paintTile(grid, tile.x + ox, tile.y + oy, type, { preserveWater: type !== 'water' });
        }
      }
    }
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(grid, polygon, callback) {
  if (polygon.length < 3) return;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(...ys)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) {
        callback(x, y);
      }
    }
  }
}

function centroidFromGeometry(geometry) {
  if (!geometry?.length) return null;
  const sum = geometry.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }),
    { lat: 0, lon: 0 },
  );
  return {
    lat: sum.lat / geometry.length,
    lon: sum.lon / geometry.length,
  };
}

function classifyBuilding(element, tile) {
  const tags = element.tags || {};
  const signature = `${element.id}:${tags.building || ''}:${tags.amenity || ''}`;
  const roll = stableHash(signature) % 100;

  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
  if (tags.amenity === 'school' || tags.building === 'school') return 'school';
  if (tags.amenity === 'university' || tags.building === 'university') return 'university';
  if (tags.amenity === 'police') return 'police_station';
  if (tags.amenity === 'fire_station') return 'fire_station';
  if (tags.amenity === 'townhall') return 'city_hall';

  if (tags.building === 'industrial' || tags.building === 'warehouse' || tile.zone === 'industrial') {
    return roll < 35 ? 'warehouse' : roll < 80 ? 'factory_small' : 'factory_medium';
  }

  if (tags.building === 'commercial' || tags.building === 'retail' || tags.shop || tags.office || tile.zone === 'commercial') {
    return roll < 45 ? 'shop_small' : roll < 72 ? 'shop_medium' : roll < 92 ? 'office_low' : 'office_high';
  }

  if (tags.building === 'apartments') return roll < 72 ? 'apartment_low' : 'apartment_high';
  if (tags.building === 'hotel') return 'shop_medium';

  return roll < 58 ? 'house_small' : roll < 84 ? 'house_medium' : 'apartment_low';
}

function findPlacement(grid, x, y, radius = 2) {
  for (let r = 0; r <= radius; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const tile = grid[y + oy]?.[x + ox];
        if (!tile) continue;
        if (['grass', 'tree'].includes(tile.building.type)) return { x: x + ox, y: y + oy };
      }
    }
  }
  return null;
}

function applyLanduse(grid, element) {
  if (!element.geometry?.length) return;
  const tags = element.tags || {};
  const polygon = element.geometry.map((point) => toGrid(point.lat, point.lon));

  if (tags.natural === 'water' || tags.water || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
    fillPolygon(grid, polygon, (x, y) => paintTile(grid, x, y, 'water'));
    return;
  }

  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'playground' || tags.landuse === 'grass') {
    fillPolygon(grid, polygon, (x, y) => {
      const roll = stableHash(`${element.id}:${x}:${y}`) % 100;
      paintTile(grid, x, y, roll < 15 ? 'park' : roll < 45 ? 'tree' : 'grass', { preserveTransport: true });
    });
    return;
  }

  if (tags.landuse === 'forest' || tags.natural === 'wood') {
    fillPolygon(grid, polygon, (x, y) => {
      if (stableHash(`${element.id}:${x}:${y}`) % 100 < 70) {
        paintTile(grid, x, y, 'tree', { preserveTransport: true });
      }
    });
    return;
  }

  const zone =
    tags.landuse === 'industrial'
      ? 'industrial'
      : tags.landuse === 'commercial' || tags.landuse === 'retail'
        ? 'commercial'
        : tags.landuse === 'residential'
          ? 'residential'
          : null;

  if (zone) {
    fillPolygon(grid, polygon, (x, y) => {
      const tile = grid[y]?.[x];
      if (tile && !['water', 'road', 'rail'].includes(tile.building.type)) {
        tile.zone = zone;
      }
    });
  }
}

function applyContext(grid, elements) {
  for (const element of elements) {
    const tags = element.tags || {};
    if (tags.landuse || tags.leisure || tags.natural === 'water' || tags.water) {
      applyLanduse(grid, element);
    }
  }

  for (const element of elements) {
    const tags = element.tags || {};
    if (!element.geometry?.length) continue;
    const points = element.geometry.map((point) => toGrid(point.lat, point.lon));

    if (tags.waterway) {
      paintLine(grid, points, 'water', tags.waterway === 'river' ? 1 : 0);
    } else if (tags.railway) {
      paintLine(grid, points, 'rail');
    } else if (tags.highway) {
      if (!ROAD_HIGHWAYS.has(tags.highway)) continue;
      if (tags.highway === 'service' && stableHash(element.id) % 100 > 35) continue;
      paintLine(grid, points, 'road');
    }
  }

  for (const element of elements) {
    const tags = element.tags || {};
    if (!tags.amenity && !tags.leisure) continue;
    const center = centroidFromGeometry(element.geometry);
    if (!center) continue;
    const { x, y } = toGrid(center.lat, center.lon);
    const type =
      tags.amenity === 'hospital' || tags.amenity === 'clinic'
        ? 'hospital'
        : tags.amenity === 'school'
          ? 'school'
          : tags.amenity === 'university'
            ? 'university'
            : tags.amenity === 'police'
              ? 'police_station'
              : tags.amenity === 'fire_station'
                ? 'fire_station'
                : tags.amenity === 'townhall'
                  ? 'city_hall'
                  : tags.leisure === 'stadium'
                    ? 'stadium'
                    : tags.leisure === 'park' || tags.leisure === 'garden'
                      ? 'park'
                      : null;
    if (type) placeBuilding(grid, x, y, type, 'none', element.id);
  }
}

function applyManualLake(grid) {
  const center = toGrid(-18.9144, 47.5211);
  for (let y = center.y - 5; y <= center.y + 5; y++) {
    for (let x = center.x - 7; x <= center.x + 7; x++) {
      const dx = (x - center.x) / 7;
      const dy = (y - center.y) / 5;
      if (dx * dx + dy * dy <= 1) {
        paintTile(grid, x, y, 'water');
      }
    }
  }
}

function placeBuilding(grid, x, y, type, zone = 'none', seed = `${x}:${y}:${type}`) {
  const placement = findPlacement(grid, x, y, type === 'water' ? 0 : 2);
  if (!placement && type !== 'water') return false;
  const target = type === 'water' ? { x, y } : placement;
  if (!target) return false;
  const tile = grid[target.y]?.[target.x];
  if (!tile) return false;
  if (type !== 'water' && ['water', 'road', 'rail'].includes(tile.building.type)) return false;

  tile.building = makeBuilding(type, seed);
  tile.zone = zone;
  tile.landValue = Math.max(10, 50 + (BUILDING_STATS[type]?.landValue ?? 0));
  return true;
}

function applyBuildings(grid, elements) {
  let placed = 0;
  for (const element of elements) {
    const center = element.center;
    if (!center) continue;
    const { x, y } = toGrid(center.lat, center.lon);
    const tile = grid[y]?.[x];
    if (!tile || ['water', 'road', 'rail'].includes(tile.building.type)) continue;
    const type = classifyBuilding(element, tile);
    const zone = ['house_small', 'house_medium', 'apartment_low', 'apartment_high'].includes(type)
      ? 'residential'
      : ['shop_small', 'shop_medium', 'office_low', 'office_high', 'mall'].includes(type)
        ? 'commercial'
        : ['factory_small', 'factory_medium', 'warehouse'].includes(type)
          ? 'industrial'
          : 'none';
    if (placeBuilding(grid, x, y, type, zone, element.id)) placed++;
  }
  return placed;
}

function applyLandmarks(grid) {
  applyManualLake(grid);
  for (const landmark of LANDMARKS) {
    if (landmark.type === 'water') continue;
    const { x, y } = toGrid(landmark.lat, landmark.lon);
    placeBuilding(grid, x, y, landmark.type, 'none', landmark.name);
  }
}

function buildWaterBodies(grid) {
  const seen = new Set();
  const bodies = [];
  const lacAnosy = toGrid(-18.9144, 47.5211);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const key = `${x}:${y}`;
      if (seen.has(key) || grid[y][x].building.type !== 'water') continue;

      const queue = [{ x, y }];
      const tiles = [];
      seen.add(key);

      while (queue.length > 0) {
        const current = queue.shift();
        tiles.push(current);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          const nextKey = `${nx}:${ny}`;
          if (seen.has(nextKey)) continue;
          if (grid[ny]?.[nx]?.building.type !== 'water') continue;
          seen.add(nextKey);
          queue.push({ x: nx, y: ny });
        }
      }

      if (tiles.length < 4) continue;
      const centerX = Math.round(tiles.reduce((sum, tile) => sum + tile.x, 0) / tiles.length);
      const centerY = Math.round(tiles.reduce((sum, tile) => sum + tile.y, 0) / tiles.length);
      const nearAnosy = Math.hypot(centerX - lacAnosy.x, centerY - lacAnosy.y) < 8;
      bodies.push({
        id: `antananarivo-water-${bodies.length}`,
        name: nearAnosy ? 'Lac Anosy' : bodies.length === 0 ? 'Canaux de Tana' : 'Eaux urbaines',
        type: 'lake',
        tiles,
        centerX,
        centerY,
      });
    }
  }

  return bodies.slice(0, 6);
}

function computeStats(grid) {
  let population = 0;
  let jobs = 0;
  let roadTiles = 0;
  let waterTiles = 0;
  let trees = 0;

  for (const row of grid) {
    for (const tile of row) {
      population += tile.building.population || 0;
      jobs += tile.building.jobs || 0;
      if (tile.building.type === 'road') roadTiles++;
      if (tile.building.type === 'water') waterTiles++;
      if (tile.building.type === 'tree') trees++;
    }
  }

  return {
    population,
    jobs,
    money: 185000,
    income: Math.round(jobs * 4.2),
    expenses: Math.round(roadTiles * 8 + population * 0.18),
    happiness: 61,
    health: 57,
    education: 54,
    safety: 52,
    environment: Math.max(35, Math.min(82, 62 + Math.floor(trees / 18) - Math.floor(waterTiles / 30))),
    demand: {
      residential: 36,
      commercial: 24,
      industrial: 18,
    },
  };
}

function buildState(grid, sourceMeta, placedBuildings) {
  const stats = computeStats(grid);
  const waterBodies = buildWaterBodies(grid);

  return {
    id: 'tana-builder-antananarivo-osm',
    grid,
    gridSize: GRID_SIZE,
    cityName: 'Antananarivo',
    year: 2026,
    month: 6,
    day: 26,
    hour: 12,
    tick: 0,
    speed: 1,
    selectedTool: 'select',
    taxRate: 9,
    effectiveTaxRate: 9,
    stats,
    budget: {
      police: { name: 'Police', funding: 100, cost: 0 },
      fire: { name: 'Fire', funding: 100, cost: 0 },
      health: { name: 'Health', funding: 100, cost: 0 },
      education: { name: 'Education', funding: 100, cost: 0 },
      transportation: { name: 'Transportation', funding: 100, cost: 0 },
      parks: { name: 'Parks', funding: 100, cost: 0 },
      power: { name: 'Power', funding: 100, cost: 0 },
      water: { name: 'Water', funding: 100, cost: 0 },
    },
    services: {
      police: createGridOf(GRID_SIZE, 0),
      fire: createGridOf(GRID_SIZE, 0),
      health: createGridOf(GRID_SIZE, 0),
      education: createGridOf(GRID_SIZE, 0),
      power: createGridOf(GRID_SIZE, false),
      water: createGridOf(GRID_SIZE, false),
    },
    notifications: [
      {
        id: 'welcome-antananarivo-osm',
        title: 'Antananarivo semi-reel',
        description: 'Routes, eau et densite urbaine viennent de donnees OpenStreetMap simplifiees pour le jeu.',
        icon: 'map',
        timestamp: Date.now(),
      },
    ],
    advisorMessages: [],
    history: [],
    activePanel: 'none',
    disastersEnabled: true,
    adjacentCities: [
      { id: 'ivato', name: 'Ivato', direction: 'north', connected: false, discovered: true },
      { id: 'ambohimangakely', name: 'Ambohimangakely', direction: 'east', connected: false, discovered: true },
      { id: 'ankadimbahoaka', name: 'Ankadimbahoaka', direction: 'south', connected: false, discovered: true },
      { id: 'itaosy', name: 'Itaosy', direction: 'west', connected: false, discovered: true },
    ],
    waterBodies,
    gameVersion: 0,
    cities: [
      {
        id: CITY_ID,
        name: 'Antananarivo',
        bounds: { minX: 0, minY: 0, maxX: GRID_SIZE - 1, maxY: GRID_SIZE - 1 },
        economy: {
          population: stats.population,
          jobs: stats.jobs,
          income: stats.income,
          expenses: stats.expenses,
          happiness: stats.happiness,
          lastCalculated: 0,
        },
        color: '#d94632',
      },
    ],
    osmSource: {
      attribution: '(c) OpenStreetMap contributors',
      license: 'ODbL',
      bbox: DEFAULT_BBOX,
      generatedAt: new Date().toISOString(),
      placedBuildings,
      ...sourceMeta,
    },
  };
}

function contextQuery() {
  const { south, west, north, east } = DEFAULT_BBOX;
  const bbox = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:60];(
way[highway]${bbox};
way[railway]${bbox};
way[natural=water]${bbox};
way[waterway]${bbox};
way[leisure]${bbox};
way[landuse]${bbox};
way[amenity]${bbox};
);out tags geom;`;
}

function buildingsQuery() {
  const { south, west, north, east } = DEFAULT_BBOX;
  const bbox = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:90];way[building]${bbox};out tags center qt ${BUILDING_LIMIT};`;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function fetchOverpass(query, label) {
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const body = new URLSearchParams({ data: query });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'tana-builder-osm-seed-generator/1.0',
        },
        body,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 180)}`);
      }
      if (!text.trim().startsWith('{')) {
        throw new Error(text.replace(/\s+/g, ' ').slice(0, 260));
      }
      const json = JSON.parse(text);
      console.log(`${label}: fetched ${json.elements?.length ?? 0} elements from ${endpoint}`);
      return json;
    } catch (error) {
      lastError = error;
      console.warn(`${label}: ${endpoint} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function loadLayer({ label, query, cacheFile, inputFile, refresh }) {
  if (inputFile) {
    console.log(`${label}: reading ${inputFile}`);
    return readJson(inputFile);
  }

  if (!refresh && existsSync(cacheFile)) {
    console.log(`${label}: using cache ${cacheFile}`);
    return readJson(cacheFile);
  }

  const data = await fetchOverpass(query, label);
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  const output = getArg('--output', DEFAULT_OUTPUT);
  const contextFile = getArg('--context-file', null);
  const buildingsFile = getArg('--buildings-file', null);
  const cacheDir = getArg('--cache-dir', DEFAULT_CACHE_DIR);
  const refresh = hasFlag('--refresh');

  const context = await loadLayer({
    label: 'context',
    query: contextQuery(),
    inputFile: contextFile,
    cacheFile: path.join(cacheDir, 'antananarivo-context.json'),
    refresh,
  });
  const buildings = await loadLayer({
    label: 'buildings',
    query: buildingsQuery(),
    inputFile: buildingsFile,
    cacheFile: path.join(cacheDir, 'antananarivo-buildings.json'),
    refresh,
  });

  const grid = createGrid(GRID_SIZE);
  applyContext(grid, context.elements || []);
  const placedBuildings = applyBuildings(grid, buildings.elements || []);
  applyLandmarks(grid);

  const sourceMeta = {
    contextTimestamp: context.osm3s?.timestamp_osm_base,
    buildingsTimestamp: buildings.osm3s?.timestamp_osm_base,
    contextElements: context.elements?.length ?? 0,
    buildingElements: buildings.elements?.length ?? 0,
  };

  const state = buildState(grid, sourceMeta, placedBuildings);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(state)}\n`);

  console.log(`Wrote ${output}`);
  console.log(`Grid ${GRID_SIZE}x${GRID_SIZE}, placed ${placedBuildings} sampled buildings`);
  console.log(`Population ${state.stats.population}, jobs ${state.stats.jobs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
