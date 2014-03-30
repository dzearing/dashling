var DashlingEvent = {
  sessionStateChange: "sessionstatechange",
  download: "download"
};

var DashlingError = {
  manifestDownload: "manifestDownload",
  manifestParse: "manifestParse",
  mediaSourceInit: "mediaSourceInit",
  mediaSourceAppend: "mediaSourceAppend",
  initSegmentDownload: "initSegmentDownload",
  mediaSegmentDownload: "mediaSegmentDownload",
  append: "append"
};

var DashlingSessionState = {
  error: -1,
  idle: 0,
  initializing: 1,
  buffering: 2,
  playing: 4,
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