define(["require", "exports"], function (require, exports) {
    exports.DashlingEvent = {
        sessionStateChange: 'sessionstatechange',
        download: 'download'
    };
    exports.DashlingError = {
        // Occurs when we can't create the media source.
        mediaSourceInit: 'mediaSourceInit',
        // Occurs when the manifest fails to download.
        manifestDownload: 'manifestDownload',
        // Occurs when the initSegment fails to download.
        initSegmentDownload: 'initSegmentDownload',
        // Occurs when the mediaSegment fails to download.
        mediaSegmentDownload: 'mediaSegmentDownload',
        // Occurs when we can't parse the manifest.
        manifestParse: 'manifestParse',
        // Occurs from within the stream controller when the video element throws an error.
        videoElementError: 'videoElementError',
        // Occurs when we can't initialize a sourceBuffer from the mediaSource.
        sourceBufferInit: 'sourceBufferInit',
        // Occurs when we try to append a segment but it doesn't seem to append.
        sourceBufferAppendException: 'sourceBufferAppendException',
        // Occurs when we try to append a segment, and afterwards don't find it in the buffer.
        sourceBufferAppendMissing: 'sourceBufferAppendMissing'
    };
    (function (DashlingSessionState) {
        DashlingSessionState[DashlingSessionState["error"] = -1] = "error";
        DashlingSessionState[DashlingSessionState["idle"] = 0] = "idle";
        DashlingSessionState[DashlingSessionState["initializing"] = 1] = "initializing";
        DashlingSessionState[DashlingSessionState["buffering"] = 2] = "buffering";
        DashlingSessionState[DashlingSessionState["playing"] = 4] = "playing";
        DashlingSessionState[DashlingSessionState["paused"] = 5] = "paused";
    })(exports.DashlingSessionState || (exports.DashlingSessionState = {}));
    var DashlingSessionState = exports.DashlingSessionState;
    ;
    (function (DashlingRequestState) {
        DashlingRequestState[DashlingRequestState["error"] = -1] = "error";
        DashlingRequestState[DashlingRequestState["idle"] = 0] = "idle";
        DashlingRequestState[DashlingRequestState["downloading"] = 1] = "downloading";
        DashlingRequestState[DashlingRequestState["downloaded"] = 2] = "downloaded";
        DashlingRequestState[DashlingRequestState["appending"] = 3] = "appending";
        DashlingRequestState[DashlingRequestState["appended"] = 4] = "appended";
        DashlingRequestState[DashlingRequestState["aborted"] = 5] = "aborted";
    })(exports.DashlingRequestState || (exports.DashlingRequestState = {}));
    var DashlingRequestState = exports.DashlingRequestState;
    ;
});
