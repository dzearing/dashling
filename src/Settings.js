Dashling.Settings = {
  // The manifest object to use, if you want to skip the serial call to fetch the xml.
  manifest: null,

  // Default start time for video, in seconds.
  startTime: 0,

  // If auto bitrate regulation is enabled.
  isABREnabled: true,

  // Randomize bitrate (testing purposes)
  isRBREnabled: false,

  // The quality to use if we have ABR disabled, or if default bandwidth is not available.
  targetQuality: {
    audio: 2,
    video: 2
  },

  // If we should auto play the video when enough buffer is available.
  shouldAutoPlay: true,

  // Logs debug data to console.
  logToConsole: true,

  // Number of buffered seconds in which we will start to be more aggressive on estimates.
  safeBufferSeconds: 12,

  // Number of buffered seconds before we stop buffering more.
  maxBufferSeconds: 119.5,

  // Max number of simultaneous requests per stream.
  maxConcurrentRequests: {
    audio: 4,
    video: 6
  },

  // Max number of fragments each stream can be ahead of the other stream by.
  maxSegmentLeadCount: {
    audio: 3,
    video: 5
  },

  // Default bytes per millisecond, used to determine default request staggering (480p is around 520 bytes per millisecond.)
  defaultBandwidth: 520,

  // Default request timeout
  requestTimeout: 30000,

  // Number of attempts beyond original request to try downloading something.
  maxRetries: 3,

  // Millisecond delays between retries.
  delaysBetweenRetries: [200, 1500, 3000],

  // Milliseconds that a request must be to register as a "download" that triggers the download event (used for ignoring cache responses.)
  requestCacheThreshold: 100
};