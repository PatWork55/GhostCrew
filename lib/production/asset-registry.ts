import "server-only";

type ProductionAssetRecord = {
  path: string;
  mimeType: string;
  fileName: string;
};

declare global {
  var __ghostcrewProductionAssetRegistry__:
    | Map<string, Map<string, ProductionAssetRecord>>
    | undefined;
}

const registry =
  globalThis.__ghostcrewProductionAssetRegistry__ ??
  (globalThis.__ghostcrewProductionAssetRegistry__ = new Map());

export function registerProductionAsset(
  projectId: string,
  assetId: string,
  record: ProductionAssetRecord
) {
  const projectAssets = registry.get(projectId) ?? new Map<string, ProductionAssetRecord>();
  projectAssets.set(assetId, record);
  registry.set(projectId, projectAssets);
}

export function getProductionAsset(projectId: string, assetId: string) {
  return registry.get(projectId)?.get(assetId) ?? null;
}
