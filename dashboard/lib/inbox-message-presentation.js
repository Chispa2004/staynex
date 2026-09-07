const languageCode = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const code = Intl.getCanonicalLocales(value.trim())[0]?.split('-')[0];
    return code && !['und', 'mul', 'zxx'].includes(code) ? code : null;
  } catch {
    return null;
  }
};

// Presentation only: an inferred language must never establish a match.
export const shouldCompactOriginalMessage = ({
  sourceLanguage,
  readingLanguage,
  hasTranslation = false,
  isTranslating = false
} = {}) => {
  const source = languageCode(sourceLanguage);
  const target = languageCode(readingLanguage);
  return Boolean(source && target && source === target && !hasTranslation && !isTranslating);
};
