import type { PriceCatalogProvider, PriceCatalogSnapshot } from './calculation-types.js';

export class StaticPriceCatalogProvider implements PriceCatalogProvider {
  constructor(private readonly snapshot: PriceCatalogSnapshot) {}

  async getPriceCatalog(): Promise<PriceCatalogSnapshot> {
    return {
      version: this.snapshot.version,
      prices: this.snapshot.prices,
    };
  }
}
