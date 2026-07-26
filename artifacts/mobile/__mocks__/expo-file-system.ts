export let constructedFiles: File[] = [];
export function resetConstructedFiles(): void {
  constructedFiles = [];
}

// Test hook: set to true to make the *next* File instance's copy() throw once,
// simulating e.g. a revoked content:// read permission.
let copyShouldThrowOnce = false;
export function makeNextCopyThrow(): void {
  copyShouldThrowOnce = true;
}

// Simulates files already present in the cache directory (by uri), e.g. left
// behind by a prior transcription attempt.
const existingUris = new Set<string>();
export function seedExistingCacheFile(uri: string): void {
  existingUris.add(uri);
}
export function resetExistingCacheFiles(): void {
  existingUris.clear();
}

export class File {
  uri: string;
  constructor(pathOrDir: string, fileName?: string) {
    this.uri = fileName ? `${pathOrDir}/${fileName}` : pathOrDir;
    constructedFiles.push(this);
  }
  get exists(): boolean {
    return existingUris.has(this.uri);
  }
  delete = jest.fn(() => {
    existingUris.delete(this.uri);
  });
  copy = jest.fn((destination: File) => {
    if (copyShouldThrowOnce) {
      copyShouldThrowOnce = false;
      throw new Error("permission revoked");
    }
    existingUris.add(destination.uri);
  });
}

export const Paths = {
  cache: "file:///mock-cache-dir",
};
