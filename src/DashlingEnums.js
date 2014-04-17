var DashlingEvent = {
  sessionStateChange: "sessionstatechange",
  download: "download"
};

var DashlingError = {
  // Occurs when the manifest fails to download.
  manifestDownload: "manifestDownload",

  // Occurs when the initSegment fails to download.
  initSegmentDownload: "initSegmentDownload",

  // Occurs when the mediaSegment fails to download.
  mediaSegmentDownload: "mediaSegmentDownload",

  // Occurs when we can't parse the manifest.
  manifestParse: "manifestParse",

  // Occurs when we can't initialize a sourceBuffer from the mediaSource.
  sourceBufferInit: "sourceBufferInit",

  // Occurs when we try to append a segment but it doesn't seem to append.
  sourceBufferAppendException: "sourceBufferAppendException",

  // Occurs when we try to append a segment, and afterwards don't find it in the buffer.
  sourceBufferAppendMissing: "sourceBufferAppendMissing"

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
