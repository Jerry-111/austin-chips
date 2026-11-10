// Registered imagery in EPSG:3857. The square patches run from continental
// views to residential streets, east/north of downtown Austin in projected metres.
// Each overview already contains the same detail images, downsampled in place.
export const earthFile = 'flight13/earth.webp';

export const imagery = [
  ['western-hemisphere', 17200000, 1550000, -120000, 2304],
  ['north-america',       7600000,  450000, -100000, 2560],
  ['texas',               3700000,       0,       0, 2048],
  ['gulf-coast',          1750000,       0,       0, 2048],
  ['plains',               900000,       0,       0, 2048],
  ['central-texas',        480000,       0,       0, 2304],
  ['region',               300000,       0,       0, 1600],
  ['highland',             192000,       0,       0, 2304],
  ['hill-country',         120000,       0,       0, 2048],
  ['metro',                 64000,    1300,    1500, 2048],
  ['austin',                36000,       0,       0, 1600],
  ['austin-corridor',       27500,    5140,    6250, 2304],
  ['northeast-austin',      17200,    8200,    8500, 2304],
  ['industrial-district',    8800,   11000,   12000, 2304],
  ['samsung-overhead',       5500, 12435.50032, 13901.88756, 1800],
  ['factory-edge',           4600,   10900,   13780, 2304],
  ['samsung-campus',         2800, 11662.60909, 13686.79470, 1800],
  ['nearby-streets',         2350,   10100,   13600, 2304]
].map(([name, span, x, y, pixels]) => ({
  file: name === 'nearby-streets' ? 'nearby-streets.webp' : 'flight13/' + name + '.webp',
  span, x, y, pixels
}));
