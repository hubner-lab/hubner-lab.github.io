// The facts the pages share, in one place: names, links, the address, the switches.
// Plain data with no imports, so the tests can read it in Node as well as the pages in Astro.

export interface NavLink {
  href: string;
  label: string;
}

export interface Organisation {
  name: string;
  /** The name where room is short: the footer's one-line list. */
  short?: string;
  url?: string;
}

export interface SiteConfig {
  /** The lab's name: the wordmark, and the last part of every page title. */
  name: string;
  /** The title of the home page. */
  title: string;
  /** The description of a page that gives none. */
  description: string;
  /** Where the site is served. The same value is `site` in astro.config.mjs. */
  url: string;
  /** The lab's time zone: the dates the site prints are days there, not on the build machine. */
  timeZone: string;
  /** The pages in the navigation, in order. Built paths end with a slash. */
  nav: NavLink[];
  pi: {
    name: string;
    title: string;
    email: string;
    /** Google Scholar id: the value after "user=" in the profile link. */
    scholar: string;
    /** The PI's name as publication records spell it. Compared with accents folded. */
    spellings: string[];
  };
  /** The postal address, one line per entry. */
  address: string[];
  /** Town and country, where the full address would be too much. */
  city: string;
  affiliations: Organisation[];
  /** Shown beside the affiliations once the list has entries. */
  funders: Organisation[];
  /**
   * The "Join us" band on the home and contact pages (src/components/JoinUs.astro): shown when
   * `enabled` is true, with this title and this text.
   */
  joinUs: { enabled: boolean; title: string; text: string };
  /**
   * Lab members who are not on the Team page, by full name. The Publications page shows these
   * names in bold, like the people on the Team page.
   */
  labAuthors: string[];
  /**
   * The contact map: the point in its centre, its zoom as OpenStreetMap counts it, the name of
   * the place and the page that opens it on openstreetmap.org. The map is a picture in
   * src/assets/contact/: after a change of the point or the zoom, draw it again with
   * `node scripts/contact-map.mjs` (a test fails until the picture matches).
   */
  map: { lat: number; lon: number; zoom: number; label: string; osmUrl: string };
  /**
   * The colour a browser paints its own bars with: the page background of each theme.
   * The same values as `--color-paper` in src/styles/global.css (a test compares them).
   */
  themeColor: { dark: string; light: string };
  /** The image a link to the site shows when it is shared. A file in public/. */
  socialImage: { path: string; width: number; height: number; alt: string };
}

export const site: SiteConfig = {
  name: 'Hübner Lab',
  title: 'Hübner Lab | Evolutionary and landscape genomics',
  description: 'Hübner Lab — evolutionary and landscape genomics at Tel-Hai College and Migal.',
  url: 'https://hubner-lab.github.io',
  timeZone: 'Asia/Jerusalem',

  nav: [
    { href: '/research/', label: 'Research' },
    { href: '/team/', label: 'Team' },
    { href: '/publications/', label: 'Publications' },
    { href: '/news/', label: 'News' },
    { href: '/contact/', label: 'Contact' },
  ],

  pi: {
    name: 'Sariel Hübner',
    title: 'Associate Professor',
    email: 'sariel.hubner@migal.org.il',
    scholar: 'yqB4jesAAAAJ',
    spellings: ['Sariel Hübner', 'S Hübner', 'Sariel Huebner', 'S Huebner'],
  },

  address: ['Migal – Galilee Research Institute', '2 Hamaarag St.', 'Kiryat Shmona 1101600', 'Israel'],
  city: 'Kiryat Shmona, Israel',

  affiliations: [
    { name: 'Tel-Hai College', url: 'https://www.tel-hai.ac.il' },
    { name: 'Migal – Galilee Research Institute', short: 'Migal', url: 'https://www.migal.org.il' },
  ],

  funders: [],

  // The wording is the draft of the design mock-up: the PI's own text goes here before
  // `enabled` is set to true.
  joinUs: {
    enabled: false,
    title: 'Join the lab',
    text: 'We welcome enquiries from students and postdocs interested in plant genomics. Write to the PI to start a conversation.',
  },

  labAuthors: [],

  // OpenStreetMap node 4408244054, "Migal Galilee Technological Center", read on 2026-11-15.
  // Zoom 15 shows the southern industrial zone of the town between road 90 and the fields.
  map: {
    lat: 33.1957972,
    lon: 35.5757431,
    zoom: 15,
    label: 'Migal – Galilee Research Institute, Kiryat Shmona',
    osmUrl: 'https://www.openstreetmap.org/node/4408244054',
  },

  themeColor: { dark: '#221208', light: '#F7F6F1' },

  socialImage: {
    path: '/og.jpg',
    width: 1200,
    height: 630,
    alt: 'Hübner Lab: evolutionary and landscape genomics',
  },
};
