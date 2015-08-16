export var DashlingEvent = {
  sessionStateChange: 'sessionstatechange',
  download: 'download'
};

export var DashlingError = {
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

export enum DashlingSessionState {
  error = -1,
  idle = 0,
  initializing = 1,
  buffering = 2,
  playing = 4,
  paused = 5
};

export enum DashlingRequestState {
  error = -1,
  idle = 0,
  downloading = 1,
  downloaded = 2,
  appending = 3,
  appended = 4,
  aborted = 5
};
