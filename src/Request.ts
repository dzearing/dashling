import Settings from './Settings';
import { DashlingRequestState } from './DashlingEnums';
import EventGroup from './EventGroup';

export interface IProgressEntry {
  timeFromStart: number;
  bytesLoaded: number;
}

export interface IRequestOptions {
  url: string;
  onSuccess: (request: Request) => void;
  onError: (request: Request) => void;
  isArrayBuffer?: boolean;

  requestType?: string;
  fragmentIndex?: number;
  qualityIndex?: number;
  qualityId?: number;
  clearDataAfterAppend?: boolean;
}

export default class Request {
  public static BandwidthUpdateEvent = 'bandwidthupdate';
  public static CompleteEvent = 'complete';

  public state: DashlingRequestState;
  public isAborted: boolean;
  public data: any;
  public statusCode: string;
  public bytesLoaded: number;
  public progressEvents: IProgressEntry[];
  public startTime: number;
  public timeAtFirstByte: number;
  public timeAtLastByte: number;
  public bytesPerMillisecond: number;

  // Metadata needed by Stream
  public requestType: string;
  public fragmentIndex: number;
  public qualityIndex: number;
  public qualityId: number;
  public clearDataAfterAppend: boolean;
  public timeAtAppended: number;

  private _isDisposed: boolean;
  private _events: EventGroup;
  private _options: IRequestOptions;
  private _settings: Settings;

  private _onSuccess: (request: Request) => void;
  private _onError: () => void;
  private _requestAttempt: number;
  private _retryTimeoutId: number;

  private _xhrType: new () => XMLHttpRequest;
  private _xhr: XMLHttpRequest;

  constructor(options: IRequestOptions, settings: Settings) {
    this._options = options;
    this._settings = settings;

    this.state = DashlingRequestState.idle;
    this.data = null;
    this.timeAtFirstByte = -1;
    this.timeAtLastByte = -1;
    this.statusCode = '';
    this.progressEvents = [];
    this.bytesLoaded = 0;
    this.bytesPerMillisecond = 0;

    // Copy Stream metadata for stream.
    this.requestType = options.requestType;
    this.fragmentIndex = options.fragmentIndex;
    this.qualityIndex = options.qualityIndex;
    this.qualityId = options.qualityId;
    this.clearDataAfterAppend = options.clearDataAfterAppend;

    this._events = new EventGroup(this);
    this.isAborted = false;
    this._requestAttempt = 0;
    this._xhrType = XMLHttpRequest;
  }

  public dispose() {
    if (!this._isDisposed) {
      this._isDisposed = true;

      if (this._xhr) {
        if (this.state === DashlingRequestState.downloading) {
          this.state = DashlingRequestState.aborted;
          this.isAborted = true;
          this._xhr.abort();
          this._events.raise(Request.CompleteEvent, this);
        }
        this._xhr = null;
      }

      if (this._retryTimeoutId) {
        clearTimeout(this._retryTimeoutId);
        this._retryTimeoutId = null;
      }

      this._events.dispose();
      this._events = null;
    }
  }

  public start() {
    let { url, isArrayBuffer } = this._options;
    let xhr = this._xhr = new this._xhrType();
    let startTime = this.startTime = new Date().getTime();

    this._requestAttempt++;

    xhr.open("GET", url, true);

    if (isArrayBuffer) {
      xhr.responseType = "arraybuffer";
    }

    xhr.timeout = this._settings.requestTimeout;

    // When readystate updates, update timeAtFirstByte.
    xhr.onreadystatechange = () => {
      if (!this._isDisposed && xhr.readyState > 0 && this.timeAtFirstByte < 0) {
        this.timeAtFirstByte = (new Date().getTime() - startTime);
      }
    }

    // When progress is reported, push an event to progress events.
    xhr.onprogress = (ev: ProgressEvent) => {
      if (!this._isDisposed) {
        this.progressEvents.push({
          timeFromStart: new Date().getTime() - startTime,
          bytesLoaded: ev.lengthComputable ? ev.loaded : -1
        });

        this._postProgress();
      }
    };

    // When the request has ended, parse the response and determine what to do next.
    xhr.onloadend = () => {
      if (!this._isDisposed) {
        this._processResult();
      }
    };

    this.state = DashlingRequestState.downloading;
    xhr.send();
  }

  private _processResult() {
    let xhr = this._xhr;
    let progressEvents = this.progressEvents;
    let isArrayBuffer = this._options.isArrayBuffer;
    let isComplete = false;

    this._xhr = null;
    this.timeAtLastByte = new Date().getTime() - this.startTime;


    if (xhr.status >= 200 && xhr.status <= 299) {
      this.bytesLoaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText ? xhr.responseText.length : 0;

      // Ensure we've recorded first byte time.
      xhr.onreadystatechange(null);

      // Update progress.
      this._postProgress(true);

      if (progressEvents.length > 2) {
        let lastEvent = progressEvents[progressEvents.length - 1];
        let firstEvent = progressEvents[0];
        let timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
        let bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

        this.bytesPerMillisecond = bytesLoaded / timeDifference;
        this.timeAtFirstByte = this.timeAtLastByte - (this.bytesLoaded / this.bytesPerMillisecond);
      }

      this.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
      this.statusCode = String(xhr.status);
      this.state = DashlingRequestState.downloaded;

      this._events.raise(Request.CompleteEvent, this);

      if (this._options.onSuccess) {
        this._options.onSuccess(this);
      }
    } else {
      // This can cause an error state event which will dispose this object.
      this._processError(xhr);
    }
  }

  private _processError(xhr: XMLHttpRequest) {
    let isTimedOut = (xhr.status === 0 && this.timeAtLastByte >= this._settings.requestTimeout);
    let isRetriable = !this.isAborted && xhr.status !== 404 && this._requestAttempt < this._settings.maxRetries;
    let delaysBetweenRetries = this._settings.delaysBetweenRetries;

    if (isRetriable) {
      let timeToWait = delaysBetweenRetries[this._requestAttempt - 1] || delaysBetweenRetries[delaysBetweenRetries.length - 1];

      this._retryTimeoutId = setTimeout(() => {
         this.start();
      }, timeToWait);
    } else {
      this.state = DashlingRequestState.error;
      this.statusCode = this.isAborted ? 'aborted' : isTimedOut ? 'timeout' : String(xhr.status);
      //this.hasError = true;

      this._events.raise(Request.CompleteEvent, this);

      if (this._options.onError) {
        this._options.onError(this);
      }
    }
  }

  private _postProgress(isComplete?: boolean) {
    var progressEvents = this.progressEvents;

    if (progressEvents.length > 2) {
      var lastEvent = progressEvents[progressEvents.length - 1];
      var firstEvent = progressEvents[0];
      var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

      if (bytesLoaded > 10000) {
        var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;

        if (timeDifference > 5) { // && (isComplete || this._bytesPerSeconds.length < 5)) {
          this._events.raise(Request.BandwidthUpdateEvent, (bytesLoaded * 1000) / timeDifference);
        }
      }

    }
  }


}

