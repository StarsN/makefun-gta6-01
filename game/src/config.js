// Coral Bay Heat — shared tuning constants.
// Everything the other modules need to agree on lives here: the street grid,
// the car catalogue, the wanted-system numbers and the colour palette.

export const PITCH = 300;          // distance between neighbouring road centrelines
export const GRID = 8;             // city blocks per side
export const ROAD_HALF = 42;       // half the width of a road
export const LANE_OFF = 21;        // lane centre offset from the road centreline
export const CITY_EDGE = GRID * PITCH; // last road centreline coordinate (2400)
export const BEACH_X = CITY_EDGE + 130;  // sand starts here
export const WORLD_W = 3180;       // total world width, water included
export const WORLD_H = CITY_EDGE + PITCH; // 2700

export const PLAYER_RADIUS = 11;
export const PLAYER_SPEED = 148;   // px/s on foot
export const PLAYER_RUN = 218;
export const PLAYER_HP = 100;

export const HEAT_MAX = 500;
export const HEAT_DECAY = 11;      // heat per second once nobody is watching
export const UNSEEN_DELAY = 3.5;   // seconds unseen before heat starts to fall
export const POLICE_WANTED = [0, 2, 3, 4, 6, 8]; // police cars per star level

export const CAR_MODELS = {
  pico:      { name: 'Pico',          w: 34, l: 56, top: 265, accel: 300, grip: 9.5, hp: 70,  price: 0 },
  marlin:    { name: 'Marlin Sedan',  w: 38, l: 66, top: 330, accel: 340, grip: 9.0, hp: 100, price: 0 },
  ventana:   { name: 'Ventana Coupe', w: 38, l: 64, top: 395, accel: 430, grip: 8.6, hp: 90,  price: 0 },
  tortuga:   { name: 'Tortuga Van',   w: 42, l: 74, top: 250, accel: 240, grip: 10.5, hp: 150, price: 0 },
  brisa:     { name: 'Brisa Roadster',w: 36, l: 60, top: 425, accel: 470, grip: 8.2, hp: 80,  price: 0 },
  solcab:    { name: 'Sol Cab',       w: 38, l: 66, top: 320, accel: 330, grip: 9.0, hp: 110, price: 0 },
  interceptor:{ name: 'CBPD Interceptor', w: 39, l: 68, top: 385, accel: 420, grip: 9.4, hp: 140, price: 0 },
};

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8b93c', '#57b06a', '#e6e6e6', '#8a5fc0', '#e07b2a', '#37b6b0', '#c0c6cc', '#705438'];

export const PALETTE = {
  water: '#2f9dc4', waterDeep: '#2786ab', sand: '#ecd9a0', sandWet: '#e0c88d',
  grass: '#79b657', grassDark: '#679c4a', asphalt: '#494e56', asphaltEdge: '#3c4046',
  lane: '#e8e4d2', sidewalk: '#b7bcc2', blockGround: '#c9cdd2', plaza: '#d8cfc0',
  roofA: '#e07856', roofB: '#5f8fd0', roofC: '#e5c15c', roofD: '#9db3c8', roofE: '#c96f9b',
  trunk: '#8a6a44', palm: '#3f9e4d', palmDark: '#34853f',
  player: '#ffb02e', playerSkin: '#c98d5f', pedShirt: ['#d95f4b', '#4b7fd9', '#59b06a', '#e0b13c', '#9b6dd6', '#e6e6e6', '#3fbfae'],
};

export const STORE_KEY = 'coral-bay-heat-save-v1';
