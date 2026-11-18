// config.js — tuning constants, the car catalogue and the Coral Bay palette.

// World geometry: a grid of city blocks separated by two-lane roads.
export const BLOCK_PITCH = 430;          // distance between road centrelines
export const ROAD_W = 104;               // asphalt width
export const BLOCKS = 8;                 // 8 x 8 blocks
export const CITY_SIZE = BLOCKS * BLOCK_PITCH + ROAD_W; // roads on both outer edges
export const BEACH_W = 560;              // sand + shallows east of the last road
export const WORLD_W = CITY_SIZE + BEACH_W;
export const WORLD_H = CITY_SIZE;

// Player / camera
export const PLAYER_RADIUS = 13;
export const WALK_SPEED = 175;
export const SPRINT_SPEED = 275;
export const ENTER_RANGE = 64;           // how close to a car door E works

// Wanted system: heat 0..500, one star per 100.
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;

// The car catalogue. topSpeed in px/s, accel in px/s^2, hp = body health.
// kind: 'car' everyday traffic, 'cab' taxi, 'cop' the CBPD Interceptor.
export const CAR_TYPES = {
  pico:      { name: 'Pico',          topSpeed: 335, accel: 235, hp: 80,  len: 46, wid: 24, kind: 'car' },
  marlin:    { name: 'Marlin Sedan',  topSpeed: 395, accel: 265, hp: 110, len: 54, wid: 26, kind: 'car' },
  ventana:   { name: 'Ventana Coupe', topSpeed: 485, accel: 330, hp: 95,  len: 52, wid: 25, kind: 'car' },
  tortuga:   { name: 'Tortuga Van',   topSpeed: 305, accel: 195, hp: 160, len: 60, wid: 29, kind: 'car' },
  brisa:     { name: 'Brisa Compact', topSpeed: 360, accel: 250, hp: 85,  len: 44, wid: 23, kind: 'car' },
  solcab:    { name: 'Sol Cab',       topSpeed: 380, accel: 255, hp: 105, len: 54, wid: 26, kind: 'cab' },
  interceptor: { name: 'CBPD Interceptor', topSpeed: 470, accel: 320, hp: 150, len: 55, wid: 27, kind: 'cop' },
};
export const TRAFFIC_TYPES = ['pico', 'marlin', 'ventana', 'tortuga', 'brisa', 'solcab'];
export const CAR_COLORS = ['#e74c3c', '#f39c12', '#f7f3e8', '#39c2d7', '#2e6fd8', '#8e6cc8', '#43b581', '#e77fb0', '#95a5a6', '#34495e', '#ffb347', '#7ed491'];

// Sun-soaked pastel palette for the procedurally painted city.
export const BUILDING_COLORS = ['#ffd9a0', '#ffb59e', '#f9e79f', '#a8e6cf', '#9fd8ef', '#f5b7d0', '#ffe8c9', '#c3f0ca', '#fbc2a0', '#b5d8f7', '#f6d5e8', '#e8e3b0'];
export const ROOF_COLORS = ['#e07a5f', '#d1603d', '#c96f4a', '#a85751', '#8d6e63', '#b5654d'];
export const PALETTE = {
  grass: '#79c26f', grassDark: '#6ab25f', sand: '#f6e3ae', water: '#1f9db4', waterDeep: '#1789a3',
  asphalt: '#4a4f57', asphaltEdge: '#3c4046', lane: '#f7d774', sidewalk: '#cfc8bb', sidewalkEdge: '#b8b1a1',
  plaza: '#e8dcc3', pier: '#b08954', pierDark: '#96703f',
};
