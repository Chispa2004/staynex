const cleanName = (value) => typeof value === 'string' ? value.trim() : '';

// Presentation only: profile metadata never determines roles or permissions.
export const getUserDisplayName = (user) => {
  if (!user?.id) return null;
  const profile = user.user_metadata || {};
  return [profile.full_name, profile.display_name, profile.name, profile.first_name,
    cleanName(user.email).split('@')[0]].map(cleanName).find(Boolean) || null;
};

export const getHotelGreeting = (timezone, now = new Date()) => {
  try {
    const hour = Number(new Intl.DateTimeFormat('en', {
      timeZone: timezone || 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23'
    }).format(now));
    if (hour < 6 || hour >= 20) return 'Buenas noches';
    return hour < 12 ? 'Buenos días' : 'Buenas tardes';
  } catch {
    return 'Bienvenido';
  }
};
