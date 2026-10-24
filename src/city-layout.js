export function validateCity(city) {
  if (!city || !Array.isArray(city.districts) || !city.districts.length)
    throw new Error("Invalid city configuration");
  const seen = new Set();
  for (const d of city.districts) {
    if (
      !d ||
      typeof d.id !== "string" ||
      !/^[a-z]+$/.test(d.id) ||
      seen.has(d.id) ||
      typeof d.name !== "string" ||
      !d.name.trim() ||
      !Array.isArray(d.center) ||
      d.center.length !== 2 ||
      !d.center.every(Number.isFinite) ||
      !Number.isInteger(d.columns) ||
      d.columns < 1 ||
      d.columns > 16 ||
      !Number.isInteger(d.slotCount) ||
      d.slotCount < 1 ||
      d.slotCount > 128 ||
      !Number.isFinite(d.spacing) ||
      d.spacing < 15 ||
      d.spacing > 50 ||
      !/^#[0-9a-f]{6}$/i.test(d.color || "") ||
      !/^[A-Z]$/.test(d.prefix || "")
    ) {
      throw new Error("Invalid or duplicate city district");
    }
    seen.add(d.id);
  }
  return city;
}

export function buildCityLots(projects, city) {
  validateCity(city);
  const slots = new Map();
  for (const district of city.districts) {
    const rows = Math.ceil(district.slotCount / district.columns);
    for (let index = 0; index < district.slotCount; index++) {
      const number = String(index + 1).padStart(2, "0");
      const slotId = `${district.id}-${number}`;
      const position = {
        x:
          district.center[0] +
          ((index % district.columns) - (district.columns - 1) / 2) *
            district.spacing,
        y: 0,
        z:
          district.center[1] +
          (Math.floor(index / district.columns) - (rows - 1) / 2) *
            district.spacing,
      };
      slots.set(slotId, {
        id: slotId,
        slotId,
        district: district.id,
        position,
        project: null,
        title: "Open lot",
        displayNumber: `${district.prefix}${number}`,
        color: district.color,
      });
    }
  }
  const ids = new Set();
  for (const project of projects) {
    const lot = slots.get(project.slot);
    if (!lot || lot.district !== project.district)
      throw new Error(`Unknown or mismatched city slot: ${project.slot}`);
    if (lot.project || ids.has(project.id))
      throw new Error(`Duplicate or occupied city slot: ${project.slot}`);
    ids.add(project.id);
    Object.assign(lot, {
      id: project.id,
      project,
      title: project.title,
      displayNumber: project.originalLot
        ? String(project.originalLot)
        : String(project.plot).padStart(3, "0"),
    });
  }
  const positions = new Set();
  for (const lot of slots.values()) {
    const key = `${lot.position.x},${lot.position.z}`;
    if (positions.has(key)) throw new Error("Overlapping city district slots");
    positions.add(key);
  }
  return [...slots.values()];
}

export function getDistrictAtPosition(position, city) {
  for (const d of city.districts) {
    const halfWidth = (d.columns * d.spacing) / 2 + 8;
    const halfDepth = (Math.ceil(d.slotCount / d.columns) * d.spacing) / 2 + 8;
    if (
      Math.abs(position.x - d.center[0]) <= halfWidth &&
      Math.abs(position.z - d.center[1]) <= halfDepth
    )
      return d.id;
  }
  return Math.hypot(position.x, position.z) < 42 ? "center" : "streets";
}
