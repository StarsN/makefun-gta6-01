// Coral Bay Heat — shared constants: city layout numbers, vehicle models, palette.
// Everything in the game reads its tuning from here so the world stays consistent.

// City grid: square blocks of BLOCK px separated by roads of ROAD_W px, PITCH apart.
// East of the grid lies a sand strip and then the sea.
export const CITY = {
  pitch: 400,
  roadW: 96,
  block: 304,
  cols: 8,
  rows: 8,
  grid: 3296, // 8 * 400 + 96: the built-up square
  sandX: 3296, // beach sand starts here
  waterX: 3472, // the sea starts here (land things stop at this line)
  width: 3952,
  height: 3296,
  lane: 23, // lane offset from a road centre line, right-hand traffic
};

export const PLAYER = {
  radius: 11,
  walkSpeed: 138,
  sprintSpeed: 224,
  maxHp: 100,
  enterRange: 56,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayPerSecond: 5, // heat lost while no officer is watching
  unseenGrace: 2.5, // seconds out of sight before decay starts
  bustSeconds: 2.1, // time pinned down before an arrest
};

// Vehicle models, all invented for Coral Bay. len/wid are the body size in px,
// topSpeed/accel in px/s and px/s^2, hp is the damage the body takes before it burns.
export const CAR_MODELS = {
  pico: { name: 'Pico Hatch', len: 40, wid: 21, topSpeed: 238, accel: 195, hp: 70, cruise: 150 },
  marlin: { name: 'Marlin Sedan', len: 48, wid: 23, topSpeed: 268, accel: 205, hp: 90, cruise: 168 },
  ventana: { name: 'Ventana Coupe', len: 47, wid: 23, topSpeed: 344, accel: 305, hp: 80, cruise: 185 },
  tortuga: { name: 'Tortuga Van', len: 53, wid: 25, topSpeed: 226, accel: 160, hp: 135, cruise: 140 },
  brisa: { name: 'Brisa Pickup', len: 50, wid: 24, topSpeed: 252, accel: 212, hp: 112, cruise: 158 },
  taxi: { name: 'Sol Cab', len: 48, wid: 23, topSpeed: 262, accel: 200, hp: 95, cruise: 165 },
  interceptor: { name: 'CBPD Interceptor', len: 49, wid: 24, topSpeed: 336, accel: 292, hp: 125, cruise: 200 },
};

export const TRAFFIC_MODELS = ['pico', 'marlin', 'marlin', 'ventana', 'tortuga', 'brisa', 'taxi'];
export const PARKED_MODELS = ['pico', 'marlin', 'ventana', 'tortuga', 'brisa'];

export const CAR_COLORS = [
  '#e74c3c', '#f39c12', '#f7e463', '#2ecc71', '#1abc9c', '#3498db',
  '#9b59b6', '#ecf0f1', '#95a5a6', '#e67e22', '#fd79a8', '#74b9ff',
];

export const PED_COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43',
  '#54a0ff', '#5f27cd', '#c8d6e5', '#10ac84', '#ee5253', '#2e86de',
];

export const BUILDING_COLORS = [
  '#f2c094', '#e8907c', '#f7e3ac', '#a8d5ba', '#9fc6e8', '#e6b8d7',
  '#f4f1de', '#ffb26b', '#cdeac0', '#ffd6a5', '#bdb2ff', '#ffc6ff',
];

export const COLORS = {
  ground: '#c9bd9f',
  sidewalk: '#ded5bd',
  sidewalkEdge: '#b8ab8d',
  road: '#45454e',
  roadEdge: '#33333b',
  roadLine: '#e9e2c8',
  crosswalk: '#d8d8d8',
  park: '#7fae56',
  sand: '#eed9a0',
  sandWet: '#e3c98d',
  water: '#25a3ba',
  waterDeep: '#177e96',
  foam: '#eafcff',
  shadow: 'rgba(43, 32, 20, 0.20)',
};
