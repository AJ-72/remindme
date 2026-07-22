export class File {
  uri: string;
  constructor(pathOrDir: string, fileName?: string) {
    this.uri = fileName ? `${pathOrDir}/${fileName}` : pathOrDir;
  }
  copy = jest.fn();
}

export const Paths = {
  cache: "file:///mock-cache-dir",
};
