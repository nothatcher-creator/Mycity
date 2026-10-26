import { LOT_STYLES, defaultLotStyle } from "./lot-styles.js";

/**
 * The building that stands on a project's lot: its original exterior when it
 * has one, otherwise its reviewed local style. `high` prefers the detailed model.
 */
export function cityBuildingSource(project, high = false) {
  if (!project) return null;
  if (high && project.exterior?.highModel) return project.exterior.highModel;
  if (project.exterior?.model) return project.exterior.model;
  const style = LOT_STYLES.find((entry) => entry.id === project.lotStyle)
    || LOT_STYLES.find((entry) => entry.id === defaultLotStyle(project.district));
  return style?.model || null;
}
