import { legStart } from './legStart.js';
import { task } from './task.js';
import { travel, touchdown } from './travel.js';
import { roadblock } from './roadblock.js';
import { detour } from './detour.js';
import { pitstop } from './pitstop.js';

export const TEMPLATES = Object.fromEntries([legStart, task, travel, touchdown, roadblock, detour, pitstop].map((t) => [t.id, t]));
export const TEMPLATE_CHOICES = Object.values(TEMPLATES).map((t) => ({ name: t.label, value: t.id }));
