/** Final logo geometry. Do not edit these paths. */
export const LOGO_PATHS = {
  standard: {
    blades:
      "M43.4 13C41.5 42 26 68 4.6 79.5A.78 .78 0 0 0 5 81C31 84 46 58 44.8 13A.7 .7 0 0 0 43.4 13ZM52.6 13C54.5 42 70 68 91.4 79.5A.78 .78 0 0 1 91 81C65 84 50 58 51.2 13A.7 .7 0 0 1 52.6 13Z",
    dot: "M48 54.2a4.8 4.8 0 1 0 0 9.6a4.8 4.8 0 1 0 0-9.6Z",
  },
  small: {
    blades:
      "M37.5 17C36 42 20 65 2.5 76.5A3.01 3.01 0 0 0 3 82.5C32 86 43 60 43 17A2.75 2.75 0 0 0 37.5 17ZM58.5 17C60 42 76 65 93.5 76.5A3.01 3.01 0 0 1 93 82.5C64 86 53 60 53 17A2.75 2.75 0 0 1 58.5 17Z",
    dot: "M48 55a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z",
  },
} as const;

/** The small drawing is used at this size and below. */
export const SMALL_LOGO_MAX_SIZE = 32;
