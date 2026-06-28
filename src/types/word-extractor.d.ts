declare module "word-extractor" {
  type ExtractedWordDocument = {
    getBody(): string;
    getHeaders(): string;
    getFootnotes(): string;
    getEndnotes(): string;
  };

  export default class WordExtractor {
    extract(input: string | Buffer): Promise<ExtractedWordDocument>;
  }
}
