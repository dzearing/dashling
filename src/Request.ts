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

  requestType?: string;
  isArrayBuffer?: boolean;
}

export default class Request {
  public static BandwidthUpdateEvent = 'bandwidthupdate';
  public static CompleteEvent = 'complete';

  public state: DashlingRequestState;
  public data: any;
  public statusCode: string;
  public bytesLoaded: number;
  public progressEvents: IProgressEntry[];
  public timeToFirstByte: number;
  public timeToLastByte: number;
  public bytesPerMillisecond: number;

  private _events: EventGroup;
  private _options: IRequestOptions;
  private _settings: Settings;

  private _onSuccess: (request: Request) => void;
  private _onError: () => void;
  private _isAborted: boolean;
  private _requestAttempt: number;
  private _retryTimeoutId: number;

  private _xhrType: new () => XMLHttpRequest;
  private _xhr: XMLHttpRequest;
  private _startTime: number;

  constructor(options: IRequestOptions, settings: Settings) {
    this._options = options;
    this._settings = settings;

    this.state = DashlingRequestState.idle;
    this.data = null;
    this.timeToFirstByte = -1;
    this.timeToLastByte = -1;
    this.statusCode = '';
    this.progressEvents = [];
    this.bytesLoaded = 0;
    this.bytesPerMillisecond = 0;

    this._events = new EventGroup(this);
    this._isAborted = false;
    this._requestAttempt = 0;
    this._xhrType = XMLHttpRequest;
  }

  dispose() {
    if (this._xhr) {
      this.state = DashlingRequestState.aborted;
      this._isAborted = true;
      this._xhr.abort();
      this._xhr = null;
    }

    if (this._retryTimeoutId) {
      clearTimeout(this._retryTimeoutId);
      this._retryTimeoutId = null;
    }

    if (this._events) {
      this._events.dispose();
      this._events = null;
    }
  }

  public start() {
    let { url, isArrayBuffer } = this._options;
    let xhr = this._xhr = new this._xhrType();
    let startTime = this._startTime = new Date().getTime();

    this._requestAttempt++;

    xhr.open("GET", url, true);

    if (isArrayBuffer) {
      xhr.responseType = "arraybuffer";
    }

    xhr.timeout = this._settings.requestTimeout;

    // When readystate updates, update timeToFirstByte.
    xhr.onreadystatechange = () => {
      if (xhr.readyState > 0 && this.timeToFirstByte < 0) {
        this.timeToFirstByte = (new Date().getTime() - startTime);
      }
    }

    // When progress is reported, push an event to progress events.
    xhr.onprogress = (ev: ProgressEvent) => {
      this.progressEvents.push({
        timeFromStart: new Date().getTime() - startTime,
        bytesLoaded: ev.lengthComputable ? ev.loaded : -1
      });

      this._postProgress();
    };

    // When the request has ended, parse the response and determine what to do next.
    xhr.onloadend = () => {
      this._processResult();
    };

    this.state = DashlingRequestState.downloading;
    xhr.send();
  }

  private _processResult() {
    let xhr = this._xhr;
    let progressEvents = this.progressEvents;
    let isArrayBuffer = this._options.isArrayBuffer;

    this._xhr = null;
    this.timeToLastByte = new Date().getTime() - this._startTime;

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
        this.timeToFirstByte = this.timeToLastByte - (this.bytesLoaded / this.bytesPerMillisecond);
      }

      this.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
      this.statusCode = String(xhr.status);
      this.state = DashlingRequestState.downloaded;

      if (this._options.onSuccess) {
        this._options.onSuccess(this);
      }
    } else {
      this._processError(xhr);
    }

    if (this.state !== DashlingRequestState.downloading) {
      this._events.raise(Request.CompleteEvent);
    }
  }

  private _processError(xhr: XMLHttpRequest) {
    let isTimedOut = (xhr.status === 0 && this.timeToLastByte >= this._settings.requestTimeout);
    let isRetriable = !this._isAborted && xhr.status !== 404 && this._requestAttempt < this._settings.maxRetries;
    let delaysBetweenRetries = this._settings.delaysBetweenRetries;

    if (isRetriable) {
      let timeToWait = delaysBetweenRetries[this._requestAttempt - 1] || delaysBetweenRetries[delaysBetweenRetries.length - 1];

      this._retryTimeoutId = setTimeout(() => { this.start(); }, timeToWait);
    } else {
      this.state = DashlingRequestState.error;
      this.statusCode = this._isAborted ? 'aborted' : isTimedOut ? 'timeout' : String(xhr.status);
      //this.hasError = true;

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

