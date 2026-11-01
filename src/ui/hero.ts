import { webSampleUrl } from '../ecosystem/samples';
import { figureSampleUrl } from '../geometry/samples';
import { sampleUrl } from '../samples/scenes';
import type { Subject } from '../subjects';

export type Hero = { board: string; title: string; scene: string };

export const HEROES: Record<Subject, Hero> = {
  physics: { board: sampleUrl('passenger'), title: 'The cart stops; the passenger flies', scene: '/hero/physics.webp' },
  ecosystem: { board: webSampleUrl('ocean'), title: 'Kelp forest', scene: '/hero/ecosystem.webp' },
  geometry: { board: figureSampleUrl('triangle'), title: 'Angles in a triangle', scene: '/hero/geometry.webp' },
};
