import { webSampleUrl } from '../ecosystem/samples';
import { figureSampleUrl } from '../geometry/samples';
import type { Subject } from '../subjects';

export type Hero = { board: string; title: string; scene: string };

export const HEROES: Record<Subject, Hero> = {
  physics: { board: '/samples/ramp-ball-dominoes.png', title: 'Ball down a ramp into dominoes', scene: '/hero/physics.webp' },
  ecosystem: { board: webSampleUrl('grassland'), title: 'Grassland', scene: '/hero/ecosystem.webp' },
  geometry: { board: figureSampleUrl('triangle'), title: 'Angles in a triangle', scene: '/hero/geometry.webp' },
};
