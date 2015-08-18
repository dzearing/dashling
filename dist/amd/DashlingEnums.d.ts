export declare var DashlingEvent: {
    sessionStateChange: string;
    download: string;
};
export declare var DashlingError: {
    mediaSourceInit: string;
    manifestDownload: string;
    initSegmentDownload: string;
    mediaSegmentDownload: string;
    manifestParse: string;
    videoElementError: string;
    sourceBufferInit: string;
    sourceBufferAppendException: string;
    sourceBufferAppendMissing: string;
};
export declare enum DashlingSessionState {
    error = -1,
    idle = 0,
    initializing = 1,
    buffering = 2,
    playing = 4,
    paused = 5,
}
export declare enum DashlingRequestState {
    error = -1,
    idle = 0,
    downloading = 1,
    downloaded = 2,
    appending = 3,
    appended = 4,
    aborted = 5,
}
