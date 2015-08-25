import Settings from './Settings';
import StreamController from './StreamController';
import { DashlingSessionState, DashlingRequestState } from './DashlingEnums';
export default class Dashling {
    /** Exported enums for simplifying access externally. */
    Event: {
        sessionStateChange: string;
        download: string;
    };
    SessionState: typeof DashlingSessionState;
    RequestState: typeof DashlingRequestState;
    state: DashlingSessionState;
    lastError: string;
    lastErrorType: string;
    lastErrorMessage: string;
    startTime: number;
    isDisposed: boolean;
    timeAtFirstCanPlay: number;
    settings: Settings;
    streamController: StreamController;
    videoElement: HTMLVideoElement;
    private _events;
    private _parser;
    private _sessionIndex;
    private _mediaSource;
    constructor(settings?: Settings);
    /** Disposes dashling. */
    dispose(): void;
    /** Add/remove eventlistener stubs for backwards compatibility. */
    addEventListener(eventName: string, callback: (...args: any[]) => any): void;
    removeEventListener(eventName: string, callback: (...args: any[]) => any): void;
    /** Loads a given video. */
    load(videoElement: HTMLVideoElement, url: string): void;
    /** Resets the dashling state. */
    reset(): void;
    /** Abort all downloads and clear all buffers, useful if you want to reset and re-download */
    resetStreams(): void;
    getRemainingBuffer(): number;
    getBufferRate(): number;
    getPlayingQuality(streamType: string): number;
    getBufferingQuality(streamType: string): number;
    getMaxQuality(streamType: string): number;
    private _setState(state, errorType?, errorMessage?);
    private _initializeMediaSource(videoElement);
    private _initializeManifest(url);
    private _tryStart();
}
