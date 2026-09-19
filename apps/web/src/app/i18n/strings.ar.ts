/**
 * Arabic dictionary — assembled from three small parts so each file stays
 * reviewable. `StringDict` is derived from `strings.en.ts`, so a key that is
 * missing (or misspelled) here is a COMPILE-TIME error, not a runtime blank.
 */
import type { StringDict } from './strings.en';
import { AR_PART1 } from './strings.ar.part1';
import { AR_PART2 } from './strings.ar.part2';
import { AR_PART3 } from './strings.ar.part3';

export const AR: StringDict = {
  ...AR_PART1,
  ...AR_PART2,
  ...AR_PART3,
};
