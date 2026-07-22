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

export class File {
  uri: string;
  constructor(pathOrDir: string, fileName?: string) {
    this.uri = fileName ? `${pathOrDir}/${fileName}` : pathOrDir;
    constructedFiles.push(this);
  }
  copy = jest.fn(() => {
    if (copyShouldThrowOnce) {
      copyShouldThrowOnce = false;
      throw new Error("permission revoked");
    }
  });
}

export const Paths = {
  cache: "file:///mock-cache-dir",
};
