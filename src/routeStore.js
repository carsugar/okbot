import { DurableObject } from 'cloudflare:workers';
import { newSlug } from './legStartCard.js';

// One shared instance holds every saved Route Info card. A card's key (server and leg)
// keeps the same slug when it is saved again, so links already pasted into tags stay valid.
export class RouteStore extends DurableObject {
  async save(key, data) {
    const slug = (await this.ctx.storage.get(`key:${key}`)) ?? newSlug(crypto.getRandomValues(new Uint8Array(9)));
    await this.ctx.storage.put({ [`key:${key}`]: slug, [`slug:${slug}`]: data });
    return slug;
  }

  async getByKey(key) {
    const slug = await this.ctx.storage.get(`key:${key}`);
    return slug ? ((await this.ctx.storage.get(`slug:${slug}`)) ?? null) : null;
  }

  // Unsaved editor panels, keyed by the command interaction that opened them.
  async saveDraft(id, draft) {
    await this.ctx.storage.put(`draft:${id}`, draft);
  }

  async getDraft(id) {
    return (await this.ctx.storage.get(`draft:${id}`)) ?? null;
  }

  async get(slug) {
    return (await this.ctx.storage.get(`slug:${slug}`)) ?? null;
  }
}

export const routeStore = (env) => env.ROUTE_STORE.get(env.ROUTE_STORE.idFromName('routes'));
