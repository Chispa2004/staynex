export const buildPreviewPassResultMessage = (body = {}) => {
  const hotelName = body.hotel?.name || 'selected hotel';
  const evaluatedReservations = Number(body.evaluatedReservations || body.decisions?.evaluatedReservations || 0);
  const preview = Number(body.preview ?? body.previewGenerated ?? body.scheduled ?? body.decisions?.preview ?? 0);
  const skipped = Number(body.skipped ?? body.decisions?.skipped ?? 0);
  const duplicateCandidate = Number(body.duplicateCandidate ?? body.decisions?.duplicateCandidate ?? 0);
  const duplicateExisting = Number(body.duplicateExisting ?? body.decisions?.duplicateExisting ?? 0);
  const executionMode = body.executionMode || body.decisions?.mode || 'preview';
  const duplicates = duplicateCandidate + duplicateExisting;

  return `Preview pass completed for ${hotelName}: ${evaluatedReservations} reservations evaluated, ${preview} previews generated, ${skipped} skipped, ${duplicates} duplicates, ${executionMode} mode. No guest messages were sent.`;
};
