// The picture library: every subject Muse Image draws ahead of time, in the house style.
// Animals face right (the app mirrors them to face left). `aliases` are words a board might use.

export const STYLE =
  'polished educational illustration halfway between flat vector art and a soft 3D render: clean simple rounded shapes, ' +
  'smooth soft gradient shading that gives gentle volume, soft rim light, natural true-to-life colours, harmonious palette, ' +
  'no outlines, no fine texture, no text, no labels';

const OBJECT = `isolated on a plain pure white background, centered, whole subject visible with margin around it, no shadow, no ground, ${STYLE}`;
// Physics props are real objects on a real table, so they keep their materials rather than the animals' soft look.
const REAL =
  'photorealistic studio product photograph of a real physical object, true materials and fine surface detail, ' +
  'soft even studio light, no text, no labels';
const REAL_OBJECT = `isolated on a plain pure white background, centered, whole subject visible with margin around it, no shadow, no ground, ${REAL}`;
const SIDE_RIGHT = 'seen from the side, facing right';

// Where each subject lives and the band of the scene it keeps to. A subject has one habitat
// (small-fish stays in the kelp forest); props and the sun have none; backgrounds have no zone.
const TAGS = {
  kelp: ['kelp-forest', 'floor'], 'sea-urchin': ['kelp-forest', 'floor'], 'sea-star': ['kelp-forest', 'floor'], crab: ['kelp-forest', 'floor'],
  phytoplankton: ['kelp-forest', 'water'], krill: ['kelp-forest', 'water'], 'small-fish': ['kelp-forest', 'water'], shark: ['kelp-forest', 'water'],
  'sea-otter': ['kelp-forest', 'surface'], seal: ['kelp-forest', 'surface'],
  grass: ['grassland', 'floor'], wildflower: ['grassland', 'floor'], rabbit: ['grassland', 'floor'], fox: ['grassland', 'floor'],
  mouse: ['grassland', 'floor'], snake: ['grassland', 'floor'], grasshopper: ['grassland', 'floor'], hawk: ['grassland', 'sky'],
  'oak-tree': ['woodland', 'floor'], acorn: ['woodland', 'floor'], caterpillar: ['woodland', 'floor'], deer: ['woodland', 'floor'],
  wolf: ['woodland', 'floor'], squirrel: ['woodland', 'floor'], bear: ['woodland', 'floor'], fungi: ['woodland', 'floor'],
  songbird: ['woodland', 'sky'], owl: ['woodland', 'sky'],
  algae: ['pond', 'surface'], 'water-flea': ['pond', 'water'], tadpole: ['pond', 'water'], frog: ['pond', 'floor'],
  'dragonfly-larva': ['pond', 'floor'], cattails: ['pond', 'floor'], snail: ['pond', 'floor'], dragonfly: ['pond', 'sky'],
  duck: ['pond', 'surface'], heron: ['pond', 'floor'],
  sun: [null, 'sky'],
};

const tagsFor = (id, group) => {
  if (group === 'background') return { habitat: id.replace(/^bg-/, ''), zone: null };
  const [habitat, zone] = TAGS[id] ?? [null, null];
  return { habitat, zone };
};

const animal = (id, aliases, look, poses, holes = false) =>
  Object.entries(poses).map(([pose, action]) => ({
    id: `${id}-${pose}`,
    subject: id,
    pose,
    group: 'organism',
    aliases,
    ...tagsFor(id, 'organism'),
    holes,
    size: '1024x1024',
    prompt: `A single ${look}, ${action}, ${SIDE_RIGHT}, ${OBJECT}`,
  }));

const still = (id, aliases, look, group = 'organism', size = '1024x1024', holes = false) => ({
  id,
  holes,
  subject: id,
  pose: 'still',
  group,
  aliases,
  ...tagsFor(id, group),
  size,
  prompt: `${look}, ${OBJECT}`,
});

const prop = (id, aliases, look, size = '1024x1024', holes = false) => ({
  ...still(id, aliases, look, 'prop', size, holes),
  prompt: `${look}, ${REAL_OBJECT}`,
});

const backdrop = (id, aliases, look) => ({
  id,
  subject: id,
  pose: 'still',
  group: 'background',
  aliases,
  ...tagsFor(id, 'background'),
  size: '1536x1024',
  prompt: `${look}, seen straight from the side, wide open empty space in the middle, no animals, no people, no objects in the middle, ${STYLE}`,
});

const RESTING_SWIMMING = { rest: 'resting calmly', move: 'swimming' };
const STANDING_RUNNING = { rest: 'standing calmly', move: 'running mid-stride' };
const PERCHED_FLYING = { rest: 'perched calmly', move: 'flying with wings spread' };

export const SUBJECTS = [
  // Kelp forest
  still('kelp', ['giant kelp', 'seaweed'], 'A single tall upright stalk of giant kelp, olive-brown and golden-green, with long wavy leaf blades and small round air bladders, standing straight from a small holdfast at its base', 'organism', '1024x1024', true),
  still('sea-urchin', ['urchin', 'urchins', 'purple urchin'], 'A single round purple sea urchin covered in long even spines'),
  ...animal('sea-otter', ['otter', 'otters', 'sea otters'], 'brown sea otter with a pale cream face', { rest: 'floating on its back at the surface, belly up, head raised on the right', move: 'swimming belly down' }),
  still('phytoplankton', ['plankton', 'algae cells', 'diatoms'], 'A small loose cluster of tiny green and golden phytoplankton cells and diatoms of different round and star shapes', 'organism', '1024x1024', true),
  still('krill', ['zooplankton', 'shrimp'], 'A single small translucent pink krill, seen from the side, facing right'),
  ...animal('small-fish', ['fish', 'sardine', 'minnow', 'minnows', 'small fish'], 'small silver-blue fish like a sardine', RESTING_SWIMMING),
  ...animal('seal', ['seals', 'harbor seal'], 'grey spotted harbor seal', { rest: 'lying on its belly calmly', move: 'swimming' }),
  ...animal('shark', ['sharks'], 'grey shark', { rest: 'gliding slowly', move: 'swimming fast' }),
  ...animal('crab', ['crabs'], 'red-orange crab', { rest: 'standing still, seen from the front', move: 'walking sideways, seen from the front' }),
  still('sea-star', ['starfish', 'sea stars'], 'A single orange five-armed sea star seen from above'),

  // Grassland
  still('grass', ['grasses', 'grass tuft'], 'A single wide clump of green meadow grass with a few seed heads', 'organism', '1024x1024', true),
  still('wildflower', ['flower', 'flowers', 'clover'], 'A small clump of wildflowers with green stems and a few white and yellow daisy blooms'),
  ...animal('rabbit', ['rabbits', 'bunny', 'hare', 'rabit'], 'brown wild rabbit', { rest: 'sitting calmly', move: 'hopping mid-leap' }),
  ...animal('fox', ['foxes', 'red fox', 'foxs'], 'red fox with a white-tipped bushy tail', STANDING_RUNNING),
  ...animal('hawk', ['hawks', 'eagle', 'falcon'], 'brown red-tailed hawk', PERCHED_FLYING),
  ...animal('mouse', ['mice', 'field mouse'], 'small brown field mouse', STANDING_RUNNING),
  ...animal('snake', ['snakes'], 'green-brown garter snake', { rest: 'coiled calmly', move: 'slithering in an S curve' }, true),
  ...animal('grasshopper', ['grasshoppers', 'cricket', 'insect', 'insects'], 'green grasshopper', { rest: 'standing still', move: 'leaping' }),

  // Woodland
  still('oak-tree', ['oak', 'tree', 'trees', 'oak tree'], 'A single full oak tree with a rounded green canopy and a sturdy brown trunk', 'organism', '1024x1024', true),
  still('acorn', ['acorns', 'nuts', 'seeds'], 'Three brown acorns with caps lying together'),
  ...animal('caterpillar', ['caterpillars', 'larva'], 'plump green caterpillar', { rest: 'resting', move: 'crawling with its body arched' }),
  ...animal('songbird', ['bird', 'birds', 'songbirds', 'robin', 'sparrow'], 'small robin with an orange breast', PERCHED_FLYING),
  ...animal('deer', ['deers', 'white-tailed deer'], 'brown white-tailed deer', STANDING_RUNNING),
  ...animal('wolf', ['wolves', 'grey wolf'], 'grey wolf', STANDING_RUNNING),
  ...animal('owl', ['owls'], 'brown barn owl', { rest: 'perched calmly', move: 'flying toward the right with wings spread, head on the right' }),
  ...animal('squirrel', ['squirrels'], 'grey squirrel with a bushy tail', { rest: 'sitting upright', move: 'running' }),
  ...animal('bear', ['bears', 'black bear'], 'black bear', { rest: 'standing on all fours calmly', move: 'walking' }),
  still('fungi', ['mushroom', 'mushrooms', 'fungus', 'decomposers', 'decomposer'], 'A small cluster of tan and brown mushrooms growing together'),

  // Pond
  still('algae', ['pond algae', 'green algae', 'pond scum'], 'A small floating mat of bright green pond algae with fine threads', 'organism', '1024x1024', true),
  still('water-flea', ['flea', 'daphnia', 'water fleas'], 'A single tiny translucent water flea (daphnia), seen from the side, its head and eye on the right side of the picture'),
  ...animal('tadpole', ['tadpoles'], 'dark brown tadpole with its round head on the right and tail on the left', RESTING_SWIMMING),
  ...animal('frog', ['frogs'], 'green frog', { rest: 'sitting calmly', move: 'leaping with legs stretched' }),
  still('dragonfly-larva', ['dragonfly larvae', 'nymph', 'larvae'], 'A single brown dragonfly nymph, seen from the side, facing right'),
  ...animal('dragonfly', ['dragonflies'], 'blue dragonfly with clear wings', { rest: 'resting with wings flat', move: 'flying' }),
  ...animal('duck', ['ducks', 'mallard'], 'mallard duck', { rest: 'floating calmly', move: 'flying with wings spread' }),
  ...animal('heron', ['herons', 'great blue heron'], 'great blue heron', { rest: 'standing tall on long legs', move: 'flying with wings spread' }),
  still('cattails', ['reeds', 'cattail', 'pond plants'], 'A small clump of tall green cattail reeds with brown seed heads', 'organism', '1024x1024', true),
  ...animal('snail', ['snails'], 'pond snail with a spiral brown shell', { rest: 'resting', move: 'gliding forward' }),
  still('sun', ['sunlight', 'the sun', 'energy'], 'A warm glowing yellow-orange sun with soft rays'),

  // Physics props
  prop('steel-ball', ['ball', 'marble', 'metal ball'], 'A single polished chrome steel ball bearing with realistic reflections'),
  prop('rubber-ball', ['bouncy ball'], 'A single glossy red rubber ball'),
  prop('wooden-block', ['block', 'box', 'crate', 'brick'], 'A single solid oak cube with visible wood grain, one square face seen straight on, flat, no perspective'),
  prop('domino', ['dominoes', 'dominos'], 'A single tall thin deep blue lacquered wooden domino standing upright, one flat rectangular face seen straight on, no perspective, no dots, no markings'),
  prop('plank', ['ramp', 'board', 'lever', 'seesaw'], 'A single long straight pine plank with visible wood grain, seen exactly side-on and perfectly horizontal, a flat rectangle with no perspective', '1536x1024'),
  prop('brick-wall', ['wall'], 'A flat section of real red clay brick wall, exactly five courses of bricks with grey mortar lines, seen straight from the front, no perspective'),
  prop('cart', ['carts', 'trolley', 'car'], 'The body of a physics lab dynamics cart: a flat red anodised aluminium chassis with small bolts, no wheels at all, nothing on top, seen exactly from the side, a flat rectangle with no perspective', '1536x1024'),
  prop('cart-wheel', ['wheel'], 'A single small black rubber wheel with a silver spoked metal hub, seen straight on, perfectly circular'),
  prop('peg-figure', ['passenger', 'rider'], 'A single wooden peg doll: a tall narrow turned-wood figure of a person with a round head and a simple painted face and painted blue shirt, standing upright, seen from the front'),
  prop('pulley', ['pulley wheel'], 'A single machined steel pulley wheel with a grooved rim and a small mounting bracket, seen straight from the front', '1024x1024', true),
  prop('weight', ['mass', 'masses', 'kilogram', 'weight'], 'A single dark cast iron laboratory hooked mass with a hook on top, seen from the front'),
  prop('fulcrum', ['pivot', 'wedge'], 'A single solid filled block of oak cut into an equal-sided triangle with its point at the top, one solid piece of wood with no hole and no opening, standing on its flat base, seen exactly from the side, no perspective'),
  prop('pendulum-bob', ['bob', 'pendulum'], 'A single polished brass pendulum bob, a round weight with a small loop on top'),

  // Backgrounds
  backdrop('bg-kelp-forest', ['ocean', 'sea', 'kelp forest', 'marine'], 'An empty underwater scene: sunlit blue water with light rays from the surface along the top edge, a flat sandy sea floor along the bottom fifth, no plants, no rocks'),
  backdrop('bg-grassland', ['grassland', 'meadow', 'prairie', 'field'], 'An empty grassland meadow: a flat green grassy ground along the bottom fifth, soft rolling hills far away, a clear pale blue sky'),
  backdrop('bg-woodland', ['forest', 'woodland', 'woods'], 'An empty woodland clearing: a flat mossy forest floor along the bottom fifth, tree trunks only at the far left and right edges, soft dappled light'),
  backdrop('bg-pond', ['pond', 'lake', 'wetland', 'freshwater'], 'An empty pond cut-away view: the top third shows sky and a grassy bank, the middle shows clear green-blue pond water seen through the side, a muddy pond bottom along the bottom fifth'),
  backdrop('bg-desert', ['desert'], 'An empty desert: flat sandy ground along the bottom fifth, distant red rock mesas, a clear warm sky'),
  {
    ...backdrop('bg-tabletop', ['table', 'tabletop', 'room', 'physics'], ''),
    prompt:
      'Photograph of an empty classroom seen straight on: a flat warm oak table with visible grain filling exactly the bottom seventh of the picture, ' +
      'and behind it, softly out of focus, a clean green chalkboard in a wooden frame on a pale painted wall, soft daylight from the left, ' +
      'wide open empty space in the middle, nothing on the table, no writing, no people, no text, no labels',
  },
  backdrop('bg-lab', ['lab', 'laboratory', 'classroom'], 'An empty science lab bench: a flat light grey bench top along the bottom fifth, a soft blue-grey wall behind with a faint window glow'),
];
