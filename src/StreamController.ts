import EventGroup from './EventGroup';
import Async from './Async';
import Settings from './Settings';
import Stream from './Stream';
import MetricSet from './MetricSet';
import Utilities from './Utilities';
import {
  DashlingError,
  DashlingEvent,
  DashlingRequestState,
  DashlingSessionState
} from './DashlingEnums';
import IRange from './IRange';

// When we calculate how much buffer is remaining, we permit a small blank gap between segments.
const PERMITTED_GAP_SECONDS_BETWEEN_RANGES = 0.06;

// When we try to calculate which fragment a "currentTime" value aligns on, we subtract this value from currentTime first.
const SEEK_TIME_BUFFER_SECONDS = 0.5;

enum MediaSourceReadyState {
  // The string values are used by IE instead of the numeric values.
  closed = 0,
  open = 1,
  ended = 2
}

export default class StreamController {
  public streams: Stream[];
  public stalls: number;

  private _isDisposed: boolean;
  private _events: EventGroup;
  private _async: Async;
  private _mediaSource: MediaSource;
  private _settings: Settings;
  private _bufferRate: MetricSet;
  private _appendedSeconds: number;
  private _requestTimerIds: number[];
  private _appendIndex: number;
  private _nextStreamIndex: number;
  private _audioDownloadIndex: number;
  private _videoDownloadIndex: number;
  private _simultaneousDownloadsPerStream: number;
  private _maxSegmentsAhead: number;
  private _nextRequestTimerId: number;
  private _seekingTimerId: number;
  private _lastCurrentTime: number;
  private _lastTimeBeforeSeek: number;
  private _startTime: number;
  private _videoElement: HTMLVideoElement;
  private _playbackMonitorId: number;
  private _canPlay: boolean;
  private _timeAtStall: number;

  constructor(videoElement: HTMLVideoElement, mediaSource: MediaSource, settings: any) {
    this._events = new EventGroup(this);
    this._async = new Async(this);
    this._mediaSource = mediaSource;
    this._settings = settings;
    this._bufferRate = new MetricSet(3);
    this._appendedSeconds = 0;
    this._requestTimerIds = [0, 0];
    this.streams = [];
    this._appendIndex = 0;
    this._nextStreamIndex = 0;
    this._appendIndex = 0;
    this._audioDownloadIndex = 0;
    this._videoDownloadIndex = 0;
    this._simultaneousDownloadsPerStream = 2;
    this._maxSegmentsAhead = 2;
    this._nextRequestTimerId = 0;
    this._seekingTimerId = 0;
    this.stalls = 0;
    this._lastCurrentTime = 0;
    this._lastTimeBeforeSeek = 0;
    this._startTime = 0;
    this._videoElement = videoElement;
    this._playbackMonitorId = 0;
    this._canPlay = true;
    this._timeAtStall = 0;

    this._intializeVideoElement();
    this._initializeStreams(videoElement, mediaSource, settings);

    // If we have streams and a start time defined in settings, try to initialize the appendIndex correctly.
    if (this.streams.length && settings && settings.startTime) {
      let stream = this.streams[0];
      let firstFragmentDuration = stream.fragments[0].time.lengthSeconds;

      this._appendIndex = Math.max(0, Math.min(stream.fragments.length - 1, (Math.floor((settings.startTime - SEEK_TIME_BUFFER_SECONDS) / firstFragmentDuration))));
    }
  }

  public dispose() {
    let _this = this;

    if (!_this._isDisposed) {
      _this._isDisposed = true;
      _this._adjustPlaybackMonitor(false);
      _this._events.dispose();
      _this._async.dispose();

      for (let i = 0; _this.streams && i < _this.streams.length; i++) {
        _this.streams[i].dispose();
      }

      _this._videoElement = null;
      _this._mediaSource = null;
    }
  }

  public start() {
    this._startTime = new Date().getTime();
    this._setCanPlay(false);
    this._loadNextFragment();
    this._adjustPlaybackMonitor(true);
  }

  /** Gets the current playing fragment's quality for the given stream type. */
  public getPlayingQuality(streamType: string) {
    let qualityIndex = 0;

    if (!this._isDisposed) {
      for (let streamIndex = 0; streamIndex < this.streams.length; streamIndex++) {
        let stream = this.streams[streamIndex];

        if (stream.streamType == streamType) {
          let currentTime = this._videoElement.currentTime;
          let fragmentIndex = Math.min(stream.fragments.length - 1, Math.floor(currentTime / stream.fragments[0].time.lengthSeconds));

          qualityIndex = stream.fragments[fragmentIndex].qualityIndex;
          qualityIndex = qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
          break;
        }
      }

    }
    return qualityIndex;
  }

  /** Gets the current default current quality for the given stream type. */
  public getBufferingQuality(streamType: string): number {
    let qualityIndex = 0;

    if (!this._isDisposed) {
      for (let stream of this.streams) {
        if (stream.streamType == streamType) {
          qualityIndex = stream.qualityIndex;
          break;
        }
      }
    }

    return qualityIndex;
  }

  public getBufferRate(): number {
    return this._bufferRate.average;
  }

  public getRemainingBuffer(offsetFromCurrentTime?: number): number {
    let _this = this;
    let remainingBuffer = 0;

    if (!_this._isDisposed) {
      let currentTime = (_this._settings.startTime || _this._videoElement.currentTime) + (offsetFromCurrentTime || 0);
      let bufferRanges = _this._videoElement.buffered;

      // Workaround: if the currentTime is 0 and the first range start is less than 1s, default currentTime to start time.
      if (!currentTime && bufferRanges.length > 0 && bufferRanges.start(0) < 1) {
        currentTime = bufferRanges.start(0);
      }

      for (let i = 0; i < bufferRanges.length; i++) {
        if (currentTime >= bufferRanges.start(i) && currentTime <= bufferRanges.end(i)) {
          // We've found the range containing currentTime. Now find the buffered end, ignore small gaps in between ranges.
          let end = bufferRanges.end(i);

          while (++i < bufferRanges.length && (bufferRanges.start(i) - end) < PERMITTED_GAP_SECONDS_BETWEEN_RANGES) {
            end = bufferRanges.end(i);
          }

          remainingBuffer = end - currentTime;
          break;
        }
      }
    }

    return remainingBuffer;
  }

  public getTimeUntilUnderrun(offsetFromCurrentTime?: number): number {
    let timeUntilUnderrun = Number.MAX_VALUE;
    let _this = this;

    if (!_this._isDisposed) {
      let currentTime = (_this._settings.startTime || Math.max(0.5, _this._videoElement.currentTime));
      let remainingDuration = _this._settings.manifest.mediaDuration - currentTime - 0.5;
      let remainingBuffer = this.getRemainingBuffer(offsetFromCurrentTime);
      let bufferRate = this.getBufferRate();

      let confidence = (remainingBuffer / this._settings.safeBufferSeconds);

      confidence = Math.min(1, Math.max(0, confidence));

      if (remainingDuration > remainingBuffer) {

        let estimatedAdditionalBuffer = remainingBuffer * bufferRate;

        timeUntilUnderrun = remainingBuffer + (confidence * estimatedAdditionalBuffer);

        // if we're 50% of the way to max or beyond duration.
        if (timeUntilUnderrun > remainingDuration || (timeUntilUnderrun > (_this._settings.maxBufferSeconds * 0.5))) {
          timeUntilUnderrun = Number.MAX_VALUE;
        }
      }
    }

    return timeUntilUnderrun;
  }

  public reset(abortPendingRequests: boolean, clearBuffers: boolean) {
      this._onThrottledSeek(true);
  }

  private _intializeVideoElement() {
    let _this = this;
    let videoElement = this._videoElement;

    if (videoElement) {
      this._events.onAll(
        videoElement,
        {
          'seeking': _this._onVideoSeeking,
          'error': _this._onVideoError,
          'play': _this._onPauseStateChange,
          'pause': _this._onPauseStateChange,
          'ended': _this._onVideoEnded,
          'ratechange': _this._onVideoRateChange
        }
      );
    }
  }

  private _initializeStreams(videoElement: HTMLVideoElement, mediaSource: MediaSource, settings: Settings) {
    // Initializes streams based on manifest content.

    let _this = this;
    let manifestStreams = (settings && settings.manifest && settings.manifest.streams) ? settings.manifest.streams : null;

    _this.streams = [];

    if (manifestStreams) {
      if (manifestStreams['audio']) {
        _this.streams.push(new Stream("audio", mediaSource, videoElement, settings));
      }
      if (manifestStreams['video']) {
        _this.streams.push(new Stream("video", mediaSource, videoElement, settings));
      }
    }

    for (let stream of _this.streams) {
      _this._events.on(stream, DashlingEvent.download, _forwardDownloadEvent);
      _this._events.on(stream, DashlingEvent.sessionStateChange, _forwardSessionStateChange);

      stream.initialize();
    }

    function _forwardDownloadEvent(ev: any) {
      _this._events.raise(DashlingEvent.download, ev);
    }

    function _forwardSessionStateChange(args: any) {
      _this._events.raise(DashlingEvent.sessionStateChange, args);
    }
  }

  private _loadNextFragment() {
    let _this = this;

    if (!_this._isDisposed) {
      let candidates = _this._getDownloadCandidates();

      for (let streamIndex = 0; streamIndex < candidates.downloads.length; streamIndex++) {
        let streamDownloads = candidates.downloads[streamIndex];
        let stream = _this.streams[streamIndex];

        for (let downloadIndex = 0; downloadIndex < streamDownloads.length; downloadIndex++) {
          let fragmentIndex = streamDownloads[downloadIndex];

          let fragment = stream.fragments[fragmentIndex];
          let previousFragment = stream.fragments[fragmentIndex - 1];
          let previousRequest = previousFragment && previousFragment.activeRequest && previousFragment.activeRequest.state == DashlingRequestState.downloading ? previousFragment.activeRequest : null;
          let minDelay = stream.getRequestStaggerTime();
          let timeSincePreviousFragment = previousRequest ? new Date().getTime() - previousRequest.startTime : 0;

          if (!previousRequest || timeSincePreviousFragment >= minDelay) {
            stream.load(fragmentIndex, function() {
              _this._appendNextFragment();
            });
          } else {
            _enqueueNextLoad(streamIndex, minDelay - timeSincePreviousFragment);
            break;
          }
        }
      }

      // If we are at the end of our limit, poll every 300ms for more downloadable content.
      if (candidates.isAtMax) {
        _enqueueNextLoad(0, 300);
      }
    }

    function _enqueueNextLoad(index: number, delay: number) {
      if (!_this._isDisposed) {
        if (_this._requestTimerIds[index]) {
          _this._async.clearTimeout(_this._requestTimerIds[index]);
        }

        _this._requestTimerIds[index] = _this._async.setTimeout(function() {
          _this._requestTimerIds[index] = 0;
          _this._loadNextFragment();
        }, delay);
      }
    }
  }

  private _appendNextFragment() {
    let _this = this;
    let streams = this.streams;
    let stream: Stream;
    let streamIndex: number;

    if (!_this._isDisposed) {
      let currentTime = _this._settings.startTime || _this._videoElement.currentTime;

      if (streams && streams.length && _this._mediaSource && !_this._isMediaSourceReadyState(_this._mediaSource.readyState, MediaSourceReadyState.closed)) {
        let streamsAppendable = true;

        while (_this._appendIndex < streams[0].fragments.length) {
          // Try to append the current index.
          let canAppend = true;
          let allStreamsAppended = true;

          for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
            stream = streams[streamIndex];
            canAppend = canAppend && stream.canAppend(_this._appendIndex);
            allStreamsAppended = allStreamsAppended && stream.fragments[_this._appendIndex].state === DashlingRequestState.appended && !stream.isMissing(_this._appendIndex, currentTime);
          }

          if (canAppend) {
            allStreamsAppended = false;

            for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
              stream = streams[streamIndex];

              stream.append(_this._appendIndex, function() {
                _this._appendNextFragment();
              });

              allStreamsAppended = allStreamsAppended && stream.fragments[_this._appendIndex].state === DashlingRequestState.appended;
            }
          }

          // If the append index, and assess playback
          if (allStreamsAppended) {
            // Update buffer rate.
            let fragment = _this.streams[0].fragments[_this._appendIndex];

            if (!fragment.activeRequest._hasUpdatedBufferRate) {
              fragment.activeRequest._hasUpdatedBufferRate = true;

              _this._appendedSeconds += fragment.time.lengthSeconds;
              let now = new Date().getTime();
              let duration = (now - this._startTime) / 1000;

              _this._bufferRate.addMetric(_this._appendedSeconds / (duration || 0.1));
            }

            _this._appendIndex++;

            // After we're done appending, update the video element's time to the start time if provided.
            if (_this._settings.startTime) {
              try {
                _this._videoElement.currentTime = _this._settings.startTime;
                _this._settings.startTime = 0;
              } catch (e) {}

            }

            _this._checkCanPlay();
          } else {
            break;
          }
        }

        if (_this._appendIndex == streams[0].fragments.length && _this._isMediaSourceReadyState(_this._mediaSource.readyState, MediaSourceReadyState.open)) {
          _this._mediaSource.endOfStream();
        }

        _this._loadNextFragment();
      }
    }
  }

  private _adjustPlaybackMonitor(isEnabled: boolean) {
    let _this = this;

    if (!isEnabled && _this._playbackMonitorId) {
      clearInterval(_this._playbackMonitorId);
      _this._playbackMonitorId = 0;
    } else if (isEnabled && !_this._playbackMonitorId) {
      _this._playbackMonitorId = setInterval(function() {
        _this._checkCanPlay();
      }, 200);
    }
  }

  private _checkCanPlay() {
    let _this = this;
    let timeUntilUnderrun = _this.getTimeUntilUnderrun();
    let allowedSeekAhead = 0.5;
    let canPlay = false;

    this._lastCurrentTime = _this._videoElement.currentTime;

    if (_this._canPlay && timeUntilUnderrun < 0.1 && !_this._timeAtStall) {

      _this._timeAtStall = this._lastCurrentTime;

      // We may be stalling! Check in 200ms if we haven't moved. If we have, then go into a buffering state.
      _this._async.setTimeout(function() {
        let timeAtStall = _this._timeAtStall;

        _this._timeAtStall = 0;

        if (!_this._isDisposed && _this._videoElement.currentTime == timeAtStall) {
          _this.stalls++;
          _this._setCanPlay(false);
        }
      }, 200);
    }

    if (!_this._canPlay) {
      let firstStream = _this.streams[0];
      let fragmentLength = firstStream.fragments[0].time.lengthSeconds;

      if ((timeUntilUnderrun > fragmentLength && _this.getBufferRate() > 1) || timeUntilUnderrun > _this._settings.safeBufferSeconds) {
        this._setCanPlay(true);
      } else if (_this.getTimeUntilUnderrun(allowedSeekAhead) > _this._settings.safeBufferSeconds) {
        // Wiggle ahead the current time.
        _this._videoElement.currentTime = Math.min(_this._videoElement.currentTime + allowedSeekAhead, _this._videoElement.duration);
        this._setCanPlay(true);
      }
    }

    this._events.raise(DashlingEvent.sessionStateChange, {
      state: this._canPlay ? (this._videoElement.paused ? DashlingSessionState.paused : DashlingSessionState.playing) : DashlingSessionState.buffering
    });
  }

  private _allStreamsAppended(streams: Stream[], fragmentIndex: number) {
    let allStreamsAppended = false;

    for (let stream of streams) {
      allStreamsAppended = allStreamsAppended && stream.fragments[fragmentIndex] == DashlingRequestState.appended;
    }

    return allStreamsAppended;
  }

  /**
  * This method builds up an array of arrays, one for each stream, where the contents are the fragment indexes that can
  * be downloaded.
  *
  * There are a number of criteria we need to look at to determine what the candidates are:
  *
  * 1. The fragment must be in "idle" or less state.
  * 2. The index must not start beyond the (currentTime + maxBufferSeconds) max index.
  * 3. Respect max concurrency: downloading the fragment will not result in concurrent requests than allowed in settings.
  * 4. The index must not be greater (than an amount specified in settings) than the first "non-ready"
  *    index of any other stream. (We don't want one stream to get too far ahead of another, it's a waste
  *    of bandwidth.)
  *
  * In order to find candidates that fit all of these criteria, we do this:
  *
  * 1. We start with a fragment range that's valid: fragmentAtCurrentTime to (currentTime + maxBufferTime).
  * 2. We ask the stream to ensure this range's states are correct (by scanning for fragments that report appended but are missing.)
  * 3. We need to understand what the soonest missing fragment of all streams is. We go find this minMissingIndex value.
  * 4. From there, we go through each stream and start adding missing indexes to an array, until either any of these occur:
  *      a. Our active requests + the current length is > max concurrent for the stream
  *      b. The index exceeds (startIndex + maxSegmentLeadCount)
  *
  * Once we have all stream's missing index arrays built, we return the result which is used to enqueue loading.
  */
  private _getDownloadCandidates() {
    let _this = this;
    let currentRange = _this._getCurrentFragmentRange();
    let candidates = {
      downloads: <any[]>[],
      isAtMax: false
    };
    let totalCandidates = 0;

    if (currentRange.start > -1) {
      _this._ensureStreamsUpdated(currentRange);

      let firstMissingIndex = _this._getMissingFragmentIndex(currentRange);

      if (firstMissingIndex >= 0) {
        currentRange.start = Math.max(currentRange.start, firstMissingIndex);

        for (let i = 0; i < _this.streams.length; i++) {
          let stream = _this.streams[i];

          candidates.downloads.push(_this._getDownloadableIndexes(stream, currentRange));
          totalCandidates += candidates.downloads[candidates.downloads.length - 1].length;
        }
      }
    }

    // Return a flag indicating when we're unable to return candidates because we have max buffer.
    // That way we know that we need to try to evaluate candidates again soon.
    candidates.isAtMax = !totalCandidates && currentRange.end >= 0 && (currentRange.end < (_this.streams[0].fragments.length - 1));

    return candidates;
  }

  /**
   * Gets the current fragment range, starting at video currentTime and ending at
   * video end, or time+maxBufferSeconds if it's sooner, and returns as an
   * object: { start: 0, stop: 0 }
   */
  private _getCurrentFragmentRange() : IRange {
    let _this = this;
    let videoElement = _this._videoElement;
    let duration = _this._settings.manifest.mediaDuration;
    let range: IRange = {
      start: -1,
      end: -1
    };

    if (duration > 0) {
      let currentTime = _this._settings.startTime || videoElement.currentTime;
      let isAtEnd = (currentTime + 0.005) >= duration;
      let firstStream = _this.streams[0];
      let fragmentCount = firstStream.fragments.length;
      let fragmentLength = firstStream.fragments[0].time.lengthSeconds;

      if (!isAtEnd) {
        if (currentTime > SEEK_TIME_BUFFER_SECONDS) {
          currentTime -= SEEK_TIME_BUFFER_SECONDS;
        }
        range.start = Math.max(0, Math.min(fragmentCount - 1, Math.floor(currentTime / fragmentLength)));
        range.end = Math.max(0, Math.min(fragmentCount - 1, Math.ceil((currentTime + _this._settings.maxBufferSeconds) / fragmentLength)));
      }
    }

    return range;
  }

  /** Assess quality level for ABR and check for missing fragments. */
  private _ensureStreamsUpdated(range: IRange) {
    let _this = this;

    let currentTime = _this._videoElement.currentTime;

    for (let streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
      let stream = _this.streams[streamIndex];

      stream.assessQuality();

      for (let fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
        if (stream.isMissing(fragmentIndex, currentTime)) {
          let fragment = stream.fragments[fragmentIndex];

          Utilities.log("Missing fragment reset: stream=" + stream.streamType + " index=" + fragmentIndex + " [" + fragment.time.startSeconds + "]", _this._settings);
          stream.fragments[fragmentIndex].state = DashlingRequestState.idle;
        }
      }
    }
  }

  /** Gets the first missing fragment index in all streams. */
  private _getMissingFragmentIndex(range: IRange): number {
    let _this = this;

    for (let fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
      for (let streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
        let fragment = _this.streams[streamIndex].fragments[fragmentIndex];

        if (fragment.state <= DashlingRequestState.idle) {
          return fragmentIndex;
        }
      }
    }

    return -1;
  }

  /**
   * Builds up an array of indexes of download candidates for the stream, taking into consideration
   * the range given, the lead count defined in settings, and the max concurrency for the stream.
   */
  private _getDownloadableIndexes(stream: Stream, range: IRange): number[] {


    let _this = this;
    let indexes: number[] = [];

    // Limit the range based on settings for the stream.
    let endIndex = Math.min(range.end, range.start + _this._settings.maxSegmentLeadCount[stream.streamType]);
    let maxRequests = _this._settings.maxConcurrentRequests[stream.streamType] - stream.getActiveRequestCount();

    for (let fragmentIndex = range.start; indexes.length < maxRequests && fragmentIndex <= endIndex; fragmentIndex++) {
      if (stream.fragments[fragmentIndex].state <= DashlingRequestState.idle) {
        indexes.push(fragmentIndex);
      }
    }

    return indexes;
  }

  private _setCanPlay(isAllowed: boolean) {
    if (this._canPlay !== isAllowed) {
      this._canPlay = isAllowed;
      this._onVideoRateChange();
    }
  }

  private _onVideoSeeking() {
    if (!this._lastTimeBeforeSeek) {
      this._lastTimeBeforeSeek = this._lastCurrentTime;
    }

    if (this._seekingTimerId) {
      clearTimeout(this._seekingTimerId);
    }

    this._setCanPlay(false);
    this._settings.startTime = 0;

    this._seekingTimerId = this._async.setTimeout(this._onThrottledSeek, 300);
  }

  private _onThrottledSeek(forceReset?: boolean) {
    let _this = this;

    if (!_this._isDisposed) {
      let currentTime = _this._videoElement.currentTime;
      let lastTimeBeforeSeek = this._lastTimeBeforeSeek;
      let fragmentIndex = Math.floor(Math.max(0, currentTime - SEEK_TIME_BUFFER_SECONDS) / _this.streams[0].fragments[0].time.lengthSeconds);
      let streamIndex: number;
      let isBufferAcceptable =
        _this._videoElement.buffered.length == 1 &&
        _this._videoElement.buffered.start(0) <= (Math.max(0, currentTime - 2)) &&
        _this._videoElement.buffered.end(0) > currentTime;

      Utilities.log("Throttled seek: " + _this._videoElement.currentTime, _this._settings);

      // Clear tracking seek.
      _this._seekingTimerId = 0;
      _this._lastTimeBeforeSeek = 0;
      clearTimeout(_this._nextRequestTimerId);
      _this._nextRequestTimerId = 0;

      let shouldAbortPendingRequests = forceReset || (_this._appendIndex < fragmentIndex);
      let shouldClearBuffers = forceReset || (_this._settings.manifest.mediaDuration > _this._settings.maxBufferSeconds && !isBufferAcceptable);

      _this._appendIndex = fragmentIndex;

      Utilities.log("Clearing buffer", this._settings);

      for (let stream of this.streams) {
        if (shouldAbortPendingRequests) {
          stream.abortAll();
        }

        if (shouldClearBuffers) {
          stream.clearBuffer();
        }
      }

      this._appendNextFragment();
    }
  }

  private _onVideoError() {
    this._events.raise(DashlingEvent.sessionStateChange, {
      state: DashlingSessionState.error,
      errorType: DashlingError.videoElementError,
      errorMessage: Utilities.getVideoError(this._videoElement)
    });
  }

  private _onPauseStateChange() {
    this._adjustPlaybackMonitor(!this._videoElement.paused);
    this._checkCanPlay();
  }

  private _onVideoEnded() {
    this._events.raise(DashlingEvent.sessionStateChange, {
      state: DashlingSessionState.paused
    });
  }

  private _onVideoRateChange() {
    let expectedRate = (this._canPlay ? 1 : 0);

    if (this._videoElement.playbackRate != expectedRate) {
      this._videoElement.playbackRate = this._videoElement.defaultPlaybackRate = expectedRate;
    }
  }

  private _isMediaSourceReadyState(value: string | MediaSourceReadyState, state: MediaSourceReadyState) {
    return value === state || value === MediaSourceReadyState[state];
  }
}

