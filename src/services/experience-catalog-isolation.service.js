const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getExperienceScopeId = (experience = {}) => (
  experience.hotel_id
  || experience.hotelId
  || experience.metadata?.hotel_scope_id
  || experience.metadata?.created_for_hotel_id
  || experience.metadata?.hotel_id
  || experience.metadata?.hotelId
  || null
);

const getProviderAssignmentHotelId = (experience = {}) => (
  experience.provider_assignment_hotel_id
  || experience.metadata?.provider_assignment_hotel_id
  || null
);

const isProviderExperience = (experience = {}) => Boolean(
  experience.metadata?.experience_provider
  || experience.provider_source
  || experience.provider_id
  || experience.provider_experience_id
);

const demoSeedMatchesHotel = ({ hotel = {}, experience = {} }) => {
  if (!experience.metadata?.demo_seed) {
    return true;
  }

  const tenantDemo = experience.metadata?.tenant_demo;
  const hotelText = normalize([
    hotel.id,
    hotel.name,
    hotel.brand_name,
    hotel.slug,
    hotel.workspace_slug,
    hotel.description,
    hotel.address
  ].filter(Boolean).join(' '));

  if (tenantDemo) {
    return hotelText.includes(normalize(tenantDemo));
  }

  return ['staynex-demo', 'hotel-riu-mallorca', 'riu-mallorca']
    .some((slug) => hotelText.includes(slug));
};

const allowExperienceForHotel = ({ hotel = {}, experience = {}, source }) => {
  const hotelId = hotel?.id;

  if (!hotelId) {
    return {
      allowed: false,
      reason: 'missing_hotel_id'
    };
  }

  const scopeId = getExperienceScopeId(experience);
  if (scopeId && scopeId !== hotelId) {
    return {
      allowed: false,
      reason: 'scope_hotel_mismatch'
    };
  }

  if (source === 'provider') {
    const assignmentHotelId = getProviderAssignmentHotelId(experience);
    if (assignmentHotelId && assignmentHotelId !== hotelId) {
      return {
        allowed: false,
        reason: 'provider_assignment_hotel_mismatch'
      };
    }

    if (!isProviderExperience(experience)) {
      return {
        allowed: false,
        reason: 'not_provider_experience'
      };
    }
  }

  if (source === 'hotel' && experience.hotel_id && experience.hotel_id !== hotelId) {
    return {
      allowed: false,
      reason: 'hotel_experience_hotel_mismatch'
    };
  }

  if (!demoSeedMatchesHotel({ hotel, experience })) {
    return {
      allowed: false,
      reason: 'demo_seed_tenant_mismatch'
    };
  }

  return {
    allowed: true,
    reason: 'allowed'
  };
};

const dedupeExperienceCatalog = (experiences = []) => {
  const seen = new Set();

  return (experiences || []).filter((experience) => {
    const titleKey = normalize(experience?.title || '');
    const providerKey = experience?.provider_experience_id
      ? `provider:${experience.provider_experience_id}`
      : null;
    const key = providerKey || experience?.id || titleKey;

    if (!key || seen.has(key) || (titleKey && seen.has(`title:${titleKey}`))) {
      return false;
    }

    seen.add(key);
    if (titleKey) {
      seen.add(`title:${titleKey}`);
    }

    return true;
  });
};

export const buildStrictHotelExperienceCatalog = ({
  hotel,
  providerExperiences = [],
  hotelExperiences = []
} = {}) => {
  const blockedExperiences = [];
  const safeProviderExperiences = (providerExperiences || [])
    .filter((experience) => {
      const result = allowExperienceForHotel({
        hotel,
        experience,
        source: 'provider'
      });

      if (!result.allowed) {
        blockedExperiences.push({
          id: experience?.id || null,
          title: experience?.title || null,
          source: 'provider',
          provider: experience?.provider_source || experience?.provider_slug || null,
          reason: result.reason
        });
      }

      return result.allowed;
    });
  const safeHotelExperiences = (hotelExperiences || [])
    .filter((experience) => {
      const result = allowExperienceForHotel({
        hotel,
        experience,
        source: 'hotel'
      });

      if (!result.allowed) {
        blockedExperiences.push({
          id: experience?.id || null,
          title: experience?.title || null,
          source: 'hotel',
          provider: experience?.partner_name || null,
          reason: result.reason
        });
      }

      return result.allowed;
    });
  const experienceCatalog = dedupeExperienceCatalog([
    ...safeProviderExperiences,
    ...safeHotelExperiences
  ]);
  const providerNames = [...new Set(safeProviderExperiences
    .map((experience) => experience.provider_source || experience.metadata?.provider_name)
    .filter(Boolean))];

  return {
    providerExperiences: safeProviderExperiences,
    hotelExperiences: safeHotelExperiences,
    experienceCatalog,
    blockedExperiences,
    blockedCrossTenantExperiences: blockedExperiences.length > 0,
    providerNames,
    finalExperienceSource: safeProviderExperiences.length
      ? 'provider_experiences'
      : safeHotelExperiences.length
        ? 'hotel_experiences'
        : 'empty_catalog'
  };
};
