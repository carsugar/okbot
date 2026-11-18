// Card pictures can be sent with a message as attachments, so Discord already has them when the
// message appears instead of fetching them from the Worker. These helpers find our pictures in a
// message and point it at the attachments. Pure.
import { parseCards } from './cardImage.js';

const OURS = /\/mp\/(board|hidden|hand|shared)\/([A-Za-z0-9]+)\.png$/;
const urlOf = (c) => c.items[0].media.url;
const isGallery = (c) => c.type === 12 && c.items?.[0]?.media?.url;

// Every one of our card pictures in the message, once each.
export function imageRefs(components) {
  const seen = new Map();
  for (const c of components) {
    const m = isGallery(c) && OURS.exec(urlOf(c));
    const cards = m && parseCards(m[2]);
    if (cards && !seen.has(`${m[1]}-${m[2]}.png`)) seen.set(`${m[1]}-${m[2]}.png`, { kind: m[1], cards, filename: `${m[1]}-${m[2]}.png` });
  }
  return [...seen.values()];
}

const filenameOf = (url) => {
  const m = OURS.exec(url);
  return m && `${m[1]}-${m[2]}.png`;
};

// The message with each picture whose file is attached pointing at that attachment.
export const withAttachmentUrls = (components, filenames) =>
  components.map((c) => {
    const name = isGallery(c) && filenameOf(urlOf(c));
    return name && filenames.has(name) ? { ...c, items: [{ ...c.items[0], media: { ...c.items[0].media, url: `attachment://${name}` } }] } : c;
  });
