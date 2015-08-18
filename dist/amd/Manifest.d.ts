import Settings from './Settings';
import Request from './Request';
export interface IQuality {
    id: string;
    bandwidth: string;
    width: number;
    height: number;
}
export interface ITimelineEntry {
    start: number;
    startSeconds: number;
    length: number;
    lengthSeconds: number;
}
export interface IStream {
    streamType: string;
    mimeType: string;
    codecs: string;
    initUrlFormat: string;
    fragUrlFormat: string;
    qualities: IQuality[];
    timeline: ITimelineEntry[];
}
export default class Manifest {
    baseUrl: string;
    mediaDuration: number;
    streams: {
        [key: string]: IStream;
    };
    request: Request;
    private _settings;
    constructor(settings: Settings);
    parseFromRequest(request: Request): void;
    parse(manifestText: string): void;
}
