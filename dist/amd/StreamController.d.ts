import Stream from './Stream';
export default class StreamController {
    streams: Stream[];
    stalls: number;
    private _isDisposed;
    private _events;
    private _async;
    private _mediaSource;
    private _settings;
    private _bufferRate;
    private _appendedSeconds;
    private _requestTimerIds;
    private _appendIndex;
    private _nextStreamIndex;
    private _audioDownloadIndex;
    private _videoDownloadIndex;
    private _simultaneousDownloadsPerStream;
    private _maxSegmentsAhead;
    private _nextRequestTimerId;
    private _seekingTimerId;
    private _lastCurrentTime;
    private _lastTimeBeforeSeek;
    private _startTime;
    private _videoElement;
    private _playbackMonitorId;
    private _canPlay;
    private _timeAtStall;
    constructor(videoElement: HTMLVideoElement, mediaSource: MediaSource, settings: any);
    dispose(): void;
    start(): void;
    /** Gets the current playing fragment's quality for the given stream type. */
    getPlayingQuality(streamType: string): number;
    /** Gets the current default current quality for the given stream type. */
    getBufferingQuality(streamType: string): number;
    getBufferRate(): number;
    getRemainingBuffer(offsetFromCurrentTime?: number): number;
    getTimeUntilUnderrun(offsetFromCurrentTime?: number): number;
    reset(abortPendingRequests: boolean, clearBuffers: boolean): void;
    private _intializeVideoElement();
    private _initializeStreams(videoElement, mediaSource, settings);
    private _loadNextFragment();
    private _appendNextFragment();
    private _adjustPlaybackMonitor(isEnabled);
    private _checkCanPlay();
    private _allStreamsAppended(streams, fragmentIndex);
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
    private _getDownloadCandidates();
    /**
     * Gets the current fragment range, starting at video currentTime and ending at
     * video end, or time+maxBufferSeconds if it's sooner, and returns as an
     * object: { start: 0, stop: 0 }
     */
    private _getCurrentFragmentRange();
    /** Assess quality level for ABR and check for missing fragments. */
    private _ensureStreamsUpdated(range);
    /** Gets the first missing fragment index in all streams. */
    private _getMissingFragmentIndex(range);
    /**
     * Builds up an array of indexes of download candidates for the stream, taking into consideration
     * the range given, the lead count defined in settings, and the max concurrency for the stream.
     */
    private _getDownloadableIndexes(stream, range);
    private _setCanPlay(isAllowed);
    private _onVideoSeeking();
    private _onThrottledSeek(forceReset?);
    private _onVideoError();
    private _onPauseStateChange();
    private _onVideoEnded();
    private _onVideoRateChange();
}
