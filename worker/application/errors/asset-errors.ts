export class AssetNotFoundError extends Error {
  constructor(readonly path: string) {
    super('Asset not found');
    this.name = 'AssetNotFoundError';
  }
}

export class AssetAlreadyExistsError extends Error {
  constructor(readonly path: string) {
    super('Asset already exists');
    this.name = 'AssetAlreadyExistsError';
  }
}
