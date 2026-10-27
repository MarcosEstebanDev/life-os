export interface TextExtractor {
  /** Extensión con punto y en minúsculas: ".pdf". */
  supports(ext: string): boolean;
  extract(path: string): Promise<string>;
}
