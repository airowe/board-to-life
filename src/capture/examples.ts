import type { Subject } from '../subjects';

export const DESCRIPTION_EXAMPLES: Record<Subject, readonly string[]> = {
  physics: [
    'A ball rolls down a ramp and knocks over a row of five dominoes.',
    'A cart rolls down a long ramp and crashes into a wall.',
    'Two blocks hang from a rope over a pulley. The left one is twice as heavy.',
    'A ball is pushed along a high shelf, falls off the end and knocks over three dominoes on the floor.',
  ],
  ecosystem: [
    'A food web of grass, rabbits, foxes and hawks. Rabbits eat grass, foxes and hawks eat rabbits.',
    'A pond food web: algae, tadpoles, dragonfly larvae and fish. Fish eat the larvae.',
    'An ocean food web: plankton, krill, small fish and seals. The seals are removed.',
  ],
};
