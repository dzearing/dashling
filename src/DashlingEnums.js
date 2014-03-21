var DashlingEvent = {
  sessionStateChange: "sessionstatechange"
};

var DashlingError = {
  manifestDownload: "manifestDownload",
  manifestParse: "manifestParse",
  mediaSourceInit: "mediaSourceInit",
  mediaSourceAppend: "mediaSourceAppend",
  initSegmentDownload: "initSegmentDownload",
  mediaSegmentDownload: "fragmentDownload",
  append: "append"
};

var DashlingSessionState = {
  error: -1,
  idle: 0,
  initializing: 1,
  loading: 2,
  playbackInProgress: 4,
  paused: 5
};

var DashlingFragmentState = {
  error: -1,
  idle: 0,
  downloading: 1,
  downloaded: 2,
  appending: 3,
  appended: 4
};