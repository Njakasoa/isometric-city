export const GAME_BRAND = {
  name: 'Tana Builder',
  shortName: 'Tana',
  defaultCityName: 'Tana Vaovao',
  coopCityName: 'Tana Co-op',
  tagline: 'Construis une ville isometrique vivante, quartier par quartier.',
  description:
    'Un city-builder isometrique a customiser autour des transports, des services publics, de la croissance urbaine et de la gestion des quartiers.',
  defaultSeedPath: '/example-states/antananarivo_osm_state.json',
  forkRepoUrl: 'https://github.com/Njakasoa/isometric-city',
  upstreamRepoUrl: 'https://github.com/amilich/isometric-city',
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://tana-builder.pages.dev';
