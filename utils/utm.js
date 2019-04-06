function isUTM (projection) {
  const projstr = projection.toString();
  return projstr.startsWith('326') || projstr.startsWith('327');
}

function getHemisphere (projection) {
  const projstr = projection.toString();
  if (projstr.startsWith('326')) {
    return 'N';
  } else if (projstr.startsWith('327')) {
    return 'S';
  }
}

// assuming UTM EPSG number
function getZone (projection) {
  return projection.toString().substring(3);
}

function getProj4String (projection) {
  const zone = getZone(projection);
  const hemisphere = getHemisphere(projection);
  return `+proj=utm +zone=${zone}${hemisphere === 'S' ? ' +south ' : ' '}+ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
}

module.exports = { isUTM, getHemisphere, getProj4String };