import Settings from './Settings';
import RequestManager from './RequestManager';
import Request from './Request';
import Manifest from './Manifest';
import EventGroup from './EventGroup';
import Utilities from './Utilities';
import Async from './Async';
import MetricSet from './MetricSet';
import {
  DashlingEvent,
  DashlingError,
  DashlingSessionState,
  DashlingRequestState
} from './DashlingEnums';

const BANDWIDTH_LOCAL_STORAGE_KEY = 'Dashling.Stream.bytesPerSecond';

export default class Stream {
  public fragments: any[];
  public streamType: string;
  public qualityIndex: number;
  public bufferRate: MetricSet;
  public requestManager: RequestManager;

  private _isDisposed: boolean;
  private _events: EventGroup;
  private _async: Async;
  private _startTime: number;
  private _appendLength: number;
  private _appendTimeoutId: number;
  private _initializedQualityIndex: number;
  private _initRequestManager: RequestManager;
  private _mediaSource: MediaSource;
  private _videoElement: HTMLVideoElement;
  private _settings: Settings;
  private _manifest: Manifest;
  private _streamInfo: any;
  private _buffer: any;
  private _hasInitializedBuffer: boolean;
  private _initSegments: any[];
  private _isAppending: boolean;

  constructor(streamType: string, mediaSource: MediaSource, videoElement: HTMLVideoElement, settings: Settings) {
    let _this = this;
    let streamInfo = settings.manifest.streams[streamType];
    let fragmentCount = streamInfo.timeline.length;

    _this._events = new EventGroup(_this);
    _this._async = new Async(_this);

    _this.fragments = [];
    _this.streamType = streamType;
    _this.qualityIndex = Math.max(0, Math.min(streamInfo.qualities.length - 1, settings.targetQuality[streamType]));
    _this.bufferRate = new MetricSet(5);

    _this._startTime = new Date().getTime();
    _this._appendLength = 0;
    _this._appendTimeoutId = 0;
    _this._initializedQualityIndex = -1;
    _this._initRequestManager = new RequestManager(settings);
    _this.requestManager = new RequestManager(settings);
    _this._mediaSource = mediaSource;
    _this._videoElement = videoElement;
    _this._settings = settings;
    _this._manifest = settings.manifest;
    _this._streamInfo = streamInfo;
    _this._buffer = null;
    _this._hasInitializedBuffer = false;
    _this._initSegments = [];

    for (let i = 0; i < fragmentCount; i++) {
      _this.fragments.push({
        state: DashlingRequestState.idle,
        qualityIndex: -1,
        qualityId: '',
        requestType: 'media',
        fragmentIndex: i,
        time: streamInfo.timeline[i],
        activeRequest: null,
        requests: []
      });
    }

    let _forwardDownloadEvent = function(request: Request) {
      _this._events.raise(DashlingEvent.download, request);
    };

    _this._events.on(_this.requestManager, DashlingEvent.download, _forwardDownloadEvent);
    _this._events.on(_this._initRequestManager, DashlingEvent.download, _forwardDownloadEvent);
  }

  public dispose() {
    if (!this._isDisposed) {
      this._isDisposed = true;

      this._events.dispose();
      this._async.dispose();
      this.requestManager.dispose();
      this._initRequestManager.dispose();
    }
  }

  public initialize() {
    let bufferType = this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs;

    if (!this._buffer) {
      try {
        Utilities.log("Creating " + bufferType + " buffer", this._settings);
        this._buffer = this._mediaSource.addSourceBuffer(bufferType);
      } catch (e) {

        this._events.raise(
          DashlingEvent.sessionStateChange,
          {
            state: DashlingSessionState.error,
            errorType: DashlingError.sourceBufferInit,
            errorMessage: "type=" + bufferType + " error=" + e
          });
      }
    }
  }

  public abortAll() {
    this._initRequestManager.abortAll();
    this.requestManager.abortAll();
  }

  public clearBuffer() {
    // Any pending async appends should be cleared/canceled before clearing the buffer.
    clearTimeout(this._appendTimeoutId);
    this._isAppending = false;
    this.abortAll();

    try {
      this._buffer.remove(0, this._videoElement.duration);
    } catch (e) {}

    for (let fragment of this.fragments) {
      if (fragment.state !== DashlingRequestState.downloaded) {
        fragment.state = DashlingRequestState.idle;
      }
    }
  }

  public canAppend(fragmentIndex: number) {
    let fragment = this.fragments[fragmentIndex];
    let initSegment = fragment ? this._initSegments[fragment.qualityIndex] : null;
    let maxInitSegment = this._initSegments[this._streamInfo.qualities.length - 1];

    return fragment && fragment.state == DashlingRequestState.downloaded &&
      initSegment && initSegment.state >= DashlingRequestState.downloaded &&
      maxInitSegment && maxInitSegment.state >= DashlingRequestState.downloaded;
  }

  public append(fragmentIndex: number, onComplete: any) {
    let _this = this;
    let fragment = _this.fragments[fragmentIndex];
    let maxQualityIndex = _this._streamInfo.qualities.length - 1;
    let fragmentsToAppend: Request[] = [];
    let buffer = _this._buffer;

    if (!_this._isAppending && fragment && fragment.state === DashlingRequestState.downloaded) {
      // We only append one segment at a time.
      _this._isAppending = true;
      fragment.state = DashlingRequestState.appending;

      // On first time initialization, add the top quality init segment.
      if (!this._hasInitializedBuffer) {
        this._hasInitializedBuffer = true;

        if (maxQualityIndex > fragment.qualityIndex) {
          fragmentsToAppend.push(_this._initSegments[maxQualityIndex]);
        }
      }

      // append initsegment if changing qualities.
      //if (_this._initializedQualityIndex != fragment.qualityIndex) {
      fragmentsToAppend.push(_this._initSegments[fragment.qualityIndex]);
      //}

      fragmentsToAppend.push(fragment.activeRequest);
      _appendNextEntry();
    }

    function _appendNextEntry() {
      if (!_this._isDisposed) {

        // Gaurd against buffer clearing and appending too soon afterwards.
        if (_this._buffer.updating) {
          _this._appendTimeoutId = setTimeout(_appendNextEntry, 10);
        } else {
          let request = fragmentsToAppend[0];

          if (fragmentsToAppend.length) {
            buffer.addEventListener("update", _onAppendComplete);

            try {
              Utilities.log("Append started: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
              buffer.appendBuffer(request.data);
            } catch (e) {
              _onAppendError(DashlingError.sourceBufferAppendException, e);
            }
          } else {
            // We need to give a small slice of time because the video's buffered region doesn't update immediately after
            // append is complete.
            _this._appendTimeoutId = setTimeout(function() {
              if (!_this._isDisposed) {
                fragment.state = DashlingRequestState.appended;
                _this._isAppending = false;

                if (_this.isMissing(fragmentIndex, _this._videoElement.currentTime)) {
                  _onAppendError(DashlingError.sourceBufferAppendMissing, "Buffer missing appended fragment");
                } else {
                  let timeSinceStart = (new Date().getTime() - _this._startTime) / 1000;
                  _this._appendLength += fragment.time.lengthSeconds;
                  _this.bufferRate.addMetric(_this._appendLength / timeSinceStart);
                  onComplete(fragment);
                }
              }
            }, 30);
          }
        }
      }
    }

    function _onAppendComplete() {
      if (!_this._isDisposed) {
        let request = fragmentsToAppend[0];

        buffer.removeEventListener("update", _onAppendComplete);

        request.timeAtAppended = new Date().getTime() - request.startTime;
        request.state = DashlingRequestState.appended;

        if (request.clearDataAfterAppend) {
          request.data = null;
        }

        if (request.requestType === "init") {
          _this._initializedQualityIndex = request.qualityIndex;
        }

        Utilities.log("Append complete: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
        fragmentsToAppend.shift();

        _appendNextEntry();
      }
    }

    function _onAppendError(errorType: string, errorMessage: string) {

      errorMessage = errorMessage || "";

      let statusCode = "error=" + errorMessage + " (quality=" + fragment.qualityId + (fragment.fragmentIndex !== undefined ? " index=" + fragment.fragmentIndex : "") + ")";

      fragment.state = DashlingRequestState.error;
      _this._isAppending = false;

      Utilities.log("Append exception: " + statusCode);
      _this._events.raise(
        DashlingEvent.sessionStateChange,
        {
          state: DashlingSessionState.error,
          errorType: errorType,
          errorMessage: statusCode
        });
    }
  }

  public getBufferRate(): number {
    return this.bufferRate.average || 0;
  }

  public getActiveRequestCount() {
    return this.requestManager.getActiveRequestCount();
  }

  public getRequestStaggerTime(): number {
    // TODO Remove 1.4 magic ratio
    return Math.round(this._estimateDownloadSeconds(this.qualityIndex) * 1400);
  }

  public isMissing(fragmentIndex: number, currentTime: number): boolean {
    let fragment = this.fragments[fragmentIndex];

    return (fragment.state == DashlingRequestState.appended) && !this.isBuffered(fragmentIndex, currentTime);
  }

  public isBuffered(fragmentIndex: number, currentTime: number): boolean {
    let fragment = this.fragments[fragmentIndex];
    let isBuffered = false;

    if (fragment) {
      let bufferRanges = this._buffer.buffered;
      let fragmentTime = fragment.time;

      // Allow for up to .5 second of wiggle room at start of playback. else be more meticulous.
      let atStart = fragmentTime.startSeconds < 0.3;
      let atEnd = (fragmentTime.startSeconds + fragmentTime.lengthSeconds + 0.3) >= (this._manifest.mediaDuration);

      let safeStartTime = Math.max(currentTime, fragmentTime.startSeconds + (atStart ? 0.8 : 0.15));
      let safeEndTime = fragmentTime.startSeconds + fragmentTime.lengthSeconds - (atEnd ? 0.8 : 0.15);

      try {
        // validate that the buffered area in the video element still contains the fragment.
        for (let bufferedIndex = 0; bufferedIndex < bufferRanges.length; bufferedIndex++) {
          if ((bufferRanges.start(bufferedIndex) <= safeStartTime) && (bufferRanges.end(bufferedIndex) >= safeEndTime)) {
            isBuffered = true;
            break;
          }
        }
      } catch (e) {
        // Accessing the buffer can fail with an InvalidState error if an error has occured with the mediasource. (like a decode error)
        // TODO: Something better, for now marks as buffered so we don't spin trying to get the item.
        isBuffered = true;
      }
    }

    return isBuffered;
  }

  public canLoad(fragmentIndex: number): boolean {
    return (this.fragments[fragmentIndex].state <= DashlingRequestState.idle);
  }

  public load(fragmentIndex: number, onFragmentAvailable: () => void) {
    let _this = this;
    let fragment = this.fragments[fragmentIndex];
    let request: Request;
    let requestType = 'media';

    if (fragment && fragment.state <= DashlingRequestState.idle) {
      fragment.state = DashlingRequestState.downloading;
      fragment.qualityIndex = _this.qualityIndex;
      fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;

      _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);

      request = new Request({
        url: _this._getUrl(fragmentIndex, fragment),
        fragmentIndex: fragmentIndex,
        requestType: requestType,
        qualityIndex: fragment.qualityIndex,
        qualityId: fragment.qualityId,
        clearDataAfterAppend: true,
        isArrayBuffer: true,
        onSuccess: _onSuccess,
        onError: _onError
      }, this._settings);

      fragment.activeRequest = request;
      fragment.requests.push(request);

      Utilities.log("Download started: " + fragment.qualityId + " " + requestType + " " + "index=" + fragmentIndex + " time=" + (new Date().getTime() - _this._startTime) + "ms stagger=" + _this.getRequestStaggerTime() + "ms", _this._settings);

      _this.requestManager.start(request);
    }

    function _onSuccess(request: Request) {
      if (!_this._isDisposed) {
        fragment.state = DashlingRequestState.downloaded;

        var timeDownloading = Math.round(request.timeAtLastByte - request.timeAtFirstByte);
        var timeWaiting = request.timeAtLastByte - timeDownloading;

        Utilities.log("Download complete: " + request.qualityId + " " + request.requestType + " index: " + request.fragmentIndex + " waiting: " + timeWaiting + "ms receiving: " + timeDownloading, _this._settings);

        onFragmentAvailable();
      }
    }

    function _onError(request: Request) {
      if (!_this._isDisposed) {
        if (!request.isAborted) {
          fragment.state = DashlingRequestState.error;

          // Stop the session on a fragment download failure.
          _this._events.raise(
            DashlingEvent.sessionStateChange,
            {
              state: DashlingSessionState.error,
              errorType: DashlingError.mediaSegmentDownload,
              errorMessage: request.statusCode
            });
        } else {
          fragment.state = DashlingRequestState.idle;
          fragment.activeRequest = null;
          fragment.requests = [];
        }
      }
    }

  }

  public assessQuality() {
    var _this = this;
    var settings = _this._settings;
    var bytesPerSecond = _this.requestManager.getAverageBytesPerSecond();
    var maxQuality = _this._streamInfo.qualities.length - 1;

    if (!bytesPerSecond) {
      bytesPerSecond = parseFloat(localStorage.getItem(BANDWIDTH_LOCAL_STORAGE_KEY));
    } else if (this.streamType === "video") {
      localStorage.setItem(BANDWIDTH_LOCAL_STORAGE_KEY, String(bytesPerSecond));
    }

    if (!settings.isABREnabled || !bytesPerSecond) {
      _this.qualityIndex = Math.min(_this._streamInfo.qualities.length - 1, settings.targetQuality[_this.streamType]);
    } else if (settings.isRBREnabled) {
      _this.qualityIndex = Math.round(Math.random() * maxQuality);
    } else {
      var targetQuality = 0;
      var logEntry = "Quality check " + _this.streamType + ": bps=" + Math.round(bytesPerSecond);
      var segmentLength = _this._streamInfo.timeline[0].lengthSeconds;
      var averageWaitPerSegment = segmentLength * 0.4;

      for (var qualityIndex = 0; qualityIndex <= maxQuality; qualityIndex++) {
        var duration = _this._estimateDownloadSeconds(qualityIndex, 0);

        logEntry += " " + qualityIndex + "=" + duration.toFixed(2) + "s";

        if ((duration + averageWaitPerSegment) < segmentLength) {
          targetQuality = qualityIndex;
        }
      }

      _this._async.throttle(function() {
          Utilities.log(logEntry, _this._settings);
        }, "assess", 1000, false, false);

      _this.qualityIndex = targetQuality;
    }
  }

  private _estimateDownloadSeconds(qualityIndex: number, fragmentIndex?: number) {
    let _this = this;
    let duration = 0;
    let quality = _this._streamInfo.qualities[qualityIndex];
    let segmentLength = _this._streamInfo.timeline[fragmentIndex || 0].lengthSeconds;
    let bandwidth = quality.bandwidth / 8;
    let totalBytes = bandwidth * segmentLength;
    let bytesPerSecond = _this.requestManager.getAverageBytesPerSecond();

    if (!bytesPerSecond) {
      bytesPerSecond = parseFloat(localStorage.getItem(BANDWIDTH_LOCAL_STORAGE_KEY));
    } else if (this.streamType === "video") {
      localStorage.setItem(BANDWIDTH_LOCAL_STORAGE_KEY, String(bytesPerSecond));
    }

    let averageBytesPerSecond = bytesPerSecond || _this._settings.defaultBandwidth;

    return totalBytes / averageBytesPerSecond;
  }

  private _loadInitSegment(qualityIndex: number, onFragmentAvailable: any) {
    let _this = this;
    let maxQualityIndex = this._streamInfo.qualities.length - 1;
    let qualityId = this._streamInfo.qualities[qualityIndex].id;
    let requestType = 'init';
    let request: Request;

    // Ensure we always have the max init segment loaded.
    if (qualityIndex != maxQualityIndex) {
      _this._loadInitSegment(maxQualityIndex, onFragmentAvailable);
    }

    if (!_this._initSegments[qualityIndex]) {
      request = _this._initSegments[qualityIndex] = new Request({
        url: this._getInitUrl(qualityIndex),
        state: DashlingRequestState.downloading,
        timeAtDownloadStarted: new Date().getTime(),
        requestType: requestType,
        qualityIndex: qualityIndex,
        qualityId: qualityId,
        isArrayBuffer: true,
        onSuccess: _onSuccess,
        onError: _onError
      }, this._settings);

      Utilities.log("Download started: " + _this.streamType + ' ' + qualityId + ' ' + requestType, _this._settings);

      _this._initRequestManager.start(request);
    }

    function _onSuccess() {
      if (!_this._isDisposed) {
        request.state = DashlingRequestState.downloaded;

        Utilities.log("Download complete: " + _this.streamType + ' ' + qualityId + ' ' + requestType, _this._settings);

        onFragmentAvailable(request);
      }
    }

    function _onError() {
      if (!_this._isDisposed) {
        request.state = DashlingRequestState.error;

        // Stop the session on a fragment download failure.
        _this._events.raise(DashlingEvent.sessionStateChange, {
          state: DashlingSessionState.error,
          errorType: DashlingError.initSegmentDownload,
          errorMessage: request.statusCode
        });
      }
    }
  }

  private _getInitUrl(qualityIndex: number): string {
    var urlPart = this._streamInfo.initUrlFormat.replace("$RepresentationID$", this._streamInfo.qualities[qualityIndex].id);

    return this._manifest.baseUrl + urlPart;
  }

  private _getUrl(fragmentIndex: number, fragment: any): string {
    var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);

    return this._manifest.baseUrl + urlPart;
  }

} /** done */
