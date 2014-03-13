window.DashlingEvent = {
    sessionStateChange: "sessionstatechange"
};

window.DashlingSessionState = {
    error: -1,
    idle: 0,
    intializing: 1,
    loading: 2,
    playbackInProgress: 4,
    paused: 5
};

window.DashlingError = {
    manifestDownload: "manifestDownload",
    manifestParse: "manifestParse",
    mediaSourceInit: "mediaSourceInit",
    mediaSourceAppend: "mediaSourceAppend",
    initSegmentDownload: "initSegmentDownload",
    mediaSegmentDownload: "fragmentDownload"
};

window.DashlingFragmentState = {
    error: -1,
    idle: 0,
    downloading: 1,
    downloaded: 2,
    appending: 3,
    appended: 4
};

window.DashlingFragmentError = {
    download: "download",
    append: "append"
};
