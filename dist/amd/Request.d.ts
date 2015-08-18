import Settings from './Settings';
import { DashlingRequestState } from './DashlingEnums';
export interface IProgressEntry {
    timeFromStart: number;
    bytesLoaded: number;
}
export interface IRequestOptions {
    url: string;
    onSuccess: (request: Request) => void;
    onError: (request: Request) => void;
    isArrayBuffer?: boolean;
    requestType?: string;
    fragmentIndex?: number;
    qualityIndex?: number;
    qualityId?: number;
    clearDataAfterAppend?: boolean;
}
export default class Request {
    static BandwidthUpdateEvent: string;
    static CompleteEvent: string;
    state: DashlingRequestState;
    isAborted: boolean;
    data: any;
    statusCode: string;
    bytesLoaded: number;
    progressEvents: IProgressEntry[];
    startTime: number;
    timeAtFirstByte: number;
    timeAtLastByte: number;
    bytesPerMillisecond: number;
    requestType: string;
    fragmentIndex: number;
    qualityIndex: number;
    qualityId: number;
    clearDataAfterAppend: boolean;
    timeAtAppended: number;
    private _isDisposed;
    private _events;
    private _options;
    private _settings;
    private _onSuccess;
    private _onError;
    private _requestAttempt;
    private _retryTimeoutId;
    private _xhrType;
    private _xhr;
    constructor(options: IRequestOptions, settings: Settings);
    dispose(): void;
    start(): void;
    private _processResult();
    private _processError(xhr);
    private _postProgress(isComplete?);
}
