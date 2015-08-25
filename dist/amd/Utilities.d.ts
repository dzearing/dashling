import Settings from './Settings';
export default class Utilities {
    static bind(obj: any, func: () => any): () => any;
    static log(message: string, settings?: Settings): void;
    static getXmlNodeValue(xmlDoc: any, elementName: string, defaultValue: string): any;
    static getVideoBufferString(videoElement?: HTMLVideoElement): string;
    static fromISOToSeconds(isoString: string): number;
    static getVideoError(videoElement: HTMLVideoElement): string;
}
