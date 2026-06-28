declare module 'pdf-parse' {
  interface PDFParseData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PDFParseData>;
  export default pdfParse;
}
