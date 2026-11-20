export function filterLearnerContent(items, activeClassIds) {
  const allowedClasses = new Set(activeClassIds ?? []);
  return (items ?? []).filter((item) =>
    item?.status === "published" &&
    (!item.class_id || allowedClasses.has(item.class_id))
  );
}
