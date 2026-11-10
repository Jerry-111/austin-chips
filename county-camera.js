// The map moves out from the flight's last street view. Both the photography
// and the county line use this pose, including after a resize or reverse scroll.
export const streetLanding = {span: 1760, x: 10065, y: 13645, bank: -.8 * Math.PI / 180};
export const flightLens = .91;
const bounds = {west: -47854, east: 41584, south: -31378, north: 46622};

export function countyProgress(healthProgress) {
  return Math.min(1, Math.max(0, healthProgress / .218));
}

export function countyCamera(progress, width, height) {
  if (progress <= 0) return streetLanding;
  const portrait = width <= 760 || width / height < .8;
  const fit = Math.min(
    width * (portrait ? .84 : .54) / (bounds.east - bounds.west),
    height * (portrait ? .43 : .69) / (bounds.north - bounds.south)
  );
  const finalSpan = Math.max(width, height) / fit;
  const t = Math.min(1, progress / .73);
  const travel = t * t * (3 - 2 * t);
  const span = streetLanding.span * Math.pow(finalSpan / streetLanding.span, travel);
  // Interpolate the centre relative to the field width so the roofs remain
  // in frame as the city and then the county enter the shot.
  const blend = (span - streetLanding.span) / (finalSpan - streetLanding.span);
  const farX = (bounds.west + bounds.east) / 2 - (portrait ? 0 : .143) * width / fit;
  const farY = (bounds.south + bounds.north) / 2 - (portrait ? .15 : .013) * height / fit;
  return {
    span,
    x: streetLanding.x + (farX - streetLanding.x) * blend,
    y: streetLanding.y + (farY - streetLanding.y) * blend,
    bank: streetLanding.bank * (1 - travel)
  };
}
