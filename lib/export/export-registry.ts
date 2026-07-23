import "server-only";

type ExportRegistryEntry = {
  videoPath: string;
  reportPath: string;
  fileName: string;
};

declare global {
  var __ghostcrewExportRegistry__: Map<string, ExportRegistryEntry> | undefined;
}

const registry =
  globalThis.__ghostcrewExportRegistry__ ??
  (globalThis.__ghostcrewExportRegistry__ = new Map<string, ExportRegistryEntry>());

export function registerTutorialExport(exportId: string, entry: ExportRegistryEntry) {
  registry.set(exportId, entry);
}

export function getTutorialExport(exportId: string) {
  return registry.get(exportId) ?? null;
}
