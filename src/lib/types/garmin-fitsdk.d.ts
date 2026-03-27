declare module '@garmin/fitsdk' {
  export class Encoder {
    constructor(stream: Stream);
    writeFileId(data: Record<string, unknown>): void;
    writeMessage(name: string, data: Record<string, unknown>): void;
    close(): void;
  }

  export class Stream {
    constructor();
    getBuffer(): Uint8Array;
  }
}
