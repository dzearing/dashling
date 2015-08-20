import Dashling from './Dashling';
import { DashlingSessionState } from './DashlingEnums';

let _instance = 0;

let RequestStates = {
  pending: "pending",
  downloading: "downloading",
  downloaded: "downloaded",
  appended: "appended",
  error: "error"
};

interface IMonitorMetric {
  title: string;
  value: string;
}

interface IMonitorContext {
  state: DashlingSessionState;
  metrics: IMonitorMetric[];
  streams: { [key: string]: any };
  duration: number;
}

export default class DashlingMonitor {
  public id: string;
  public isActive: boolean;
  public isVisible: boolean;
  public element: HTMLElement;
  public qualityContainer: any;

  public subElements: {
    metrics: HTMLElement,
    audioElement: HTMLElement,
    audioMetrics: HTMLElement,
    audioQualities: HTMLElement,
    audioSeekBar: HTMLElement,
    videoElement: HTMLElement,
    videoMetrics: HTMLElement,
    videoQualities: HTMLElement,
    videoSeekBar: HTMLElement,
    key: HTMLElement
  };

  private _dataContext: IMonitorContext;
  private _rowElements: { [key: string]: HTMLElement };
  private _metricCount: number;
  private _video: any;
  private _interval: number;
  private _videoElement: HTMLVideoElement;
  private _dashling: Dashling;

  constructor() {
    this.id = "DashMonitorView-" + _instance++;
    this._rowElements = {};

    // TODO: remove
    this._updateSeekBar = _bind(this, this._updateSeekBar);
    this._onSessionChanged = _bind(this, this._onSessionChanged);

    this.isActive = false;
    this.isVisible = true;
    this._dataContext = null;
    this.element = null;
    this.qualityContainer = null;
    this._metricCount = 0;
    this._videoElement = null;

    this.reset();
  }

  public dispose() {
    let _this = this;

    if (_this._interval) {
      clearInterval(_this._interval);
      _this._interval = null;
    }

    if (_this._videoElement) {
      _this._videoElement.removeEventListener("timeupdate", _this._updateSeekBar);
      _this._videoElement.removeEventListener("seeking", _this._updateSeekBar);
      _this._videoElement = null;
    }

    if (_this._dashling) {
      _this._dashling.removeEventListener(_this._dashling.Event.sessionStateChange, _this._onSessionChanged);
      _this._dashling = null;
    }
  }

  public attachTo(element: HTMLElement) {
    let div = _ce("div");

    div.innerHTML = this.renderHtml();

    if (this.element) {
      element.replaceChild(div.firstChild, this.element);
    } else {
      element.appendChild(div.firstChild);
    }

    this.activate();
  }

  public observe(dashling: Dashling, videoElement: HTMLVideoElement) {
    let _this = this;

    // Clear any existing observing stuff.
    _this.dispose();

    if (videoElement) {
      _this._videoElement = videoElement;
      videoElement.addEventListener("timeupdate", _this._updateSeekBar);
      videoElement.addEventListener("seeking", _this._updateSeekBar);
    }

    if (dashling) {
      _this._dashling = dashling;
      dashling.addEventListener(dashling.Event.sessionStateChange, _this._onSessionChanged);
      _this._onSessionChanged();
    }
  }

  private _onSessionChanged() {
    let _this = this;
    let dashling = _this._dashling;
    let state = dashling.state;

    if (state == DashlingSessionState.error || state == DashlingSessionState.idle) {
      clearInterval(_this._interval);
      _this._interval = 0;
      _this.setDataContext(_this._getStats(dashling));
    } else if (dashling.state > DashlingSessionState.idle && !_this._interval) {
      _this._interval = setInterval(function() {
        if (_this.isVisible) {
          _this.setDataContext(_this._getStats(dashling));
        }
      }, 100);
    }
  }

  public reset() {
    this._dataContext = this._createContext();

    if (this.element) {
      this.attachTo(this.element.parentElement);
    }
  }

  public setVisibility(isVisible: boolean) {
    if (isVisible != this.isVisible) {
      this.isVisible = isVisible;
      if (this.isActive) {
        this._update();
      }
    }
  }

  public setDataContext(dataContext: any) {
    this._dataContext = dataContext;

    this._update();
  }

  public renderHtml() {
    let html = '<div id="' + this.id + '" class="c-DashMonitor">' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="audio streamData">' +
      '<span class="streamTitle">Audio</span>' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="traffic">' +
      '<div class="qualities"></div>' +
      '<div class="seekContainer"><div class="seekBar"></div></div>' +
      '</div>' +
      '</div>' +
      '<div class="video streamData">' +
      '<span class="streamTitle">Video</span>' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="traffic">' +
      '<div class="qualities"></div>' +
      '<div class="seekContainer"><div class="seekBar"></div></div>' +
      '</div>' +
      '</div>' +
      "<div class=\"key\">" +
      "<div class=\"keyItem\"><div class=\"keyBox waiting\"></div><span>Waiting for response</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox downloading\"></div><span>Receiving bytes</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox downloaded\"></div><span>Downloaded</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox appending\"></div><span>Appending</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox appended\"></div><span>Appended</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox error\"></div><span>Error</span></div>" +
      "</div>";

    return html;
  }

  public activate() {
    let element = this.element = _qs("#" + this.id);

    this.subElements = {
      metrics: _qs(".streamMetrics", element),
      audioElement: _qs(".audio"),
      audioMetrics: _qs(".audio .streamMetrics", element),
      audioQualities: _qs(".audio .qualities", element),
      audioSeekBar: _qs(".audio .seekBar", element),
      videoElement: _qs(".video"),
      videoMetrics: _qs(".video .streamMetrics", element),
      videoQualities: _qs(".video .qualities", element),
      videoSeekBar: _qs(".video .seekBar", element),
      key: _qs(".key")
    };

    this.isActive = true;

    this._update();
  }

  public deactivate() {
    this.subElements = null;
    this.isActive = false;
  }

  private _updateSeekBar() {
    let _this = this;
    let video = _this._videoElement;

    if (video) {
      let percentage = (100 * video.currentTime / video.duration) + "%";

      _this.subElements.audioSeekBar.style.left = percentage;
      _this.subElements.videoSeekBar.style.left = percentage;
    }
  }

  private _update() {
    let dataContext = this._dataContext;
    let isStarted = dataContext.state !== undefined && this._dashling && dataContext.state !== DashlingSessionState.idle;

    if (this.isActive) {
      let subElements = this.subElements;

      _toggleClass(this.element, "isVisible", isStarted && this.isVisible);

      this._updateMetrics(subElements.metrics, dataContext.metrics);

      let audio = (dataContext && dataContext.streams && dataContext.streams['audio']) || {};
      let video = (dataContext && dataContext.streams && dataContext.streams['video']) || {};

      _toggleClass(subElements.audioElement, "isVisible", !! (audio.metrics || audio.qualities));
      _toggleClass(subElements.videoElement, "isVisible", !! (video.metrics || video.qualities));
      _toggleClass(subElements.key, "isVisible", !! (audio.qualities || video.qualities));

      this._updateMetrics(subElements.audioMetrics,  audio.metrics);
      this._updateQualities(subElements.audioQualities, audio.qualities);

      this._updateMetrics(subElements.videoMetrics, video.metrics);
      this._updateQualities(subElements.videoQualities, video.qualities);
    }
  }

  private _updateMetrics(metricListElement: any, metrics: any) {
    _toggleClass(metricListElement, "isVisible", !! metrics);

    if (metrics) {
      let metricLookup = metricListElement._metricLookup = metricListElement._metricLookup || {};

      for (let i = 0; i < metrics.length; i++) {
        let metric = metrics[i];
        let metricElement = metricLookup[metric.title];

        if (!metricElement) {
          metricElement = _ce("li");
          metricElement.innerHTML = '<span class="metricTitle">' + metric.title + '</span><span class="metricValue"></span>';

          _qs(".metricTitle", metricElement).textContent = metric.title;
          metricListElement.appendChild(metricElement);
          metricElement = metricLookup[metric.title] = _qs(".metricValue", metricElement);
        }

        metricElement.parentNode.className = (metric.value !== undefined && metric.value !== null && metric.value !== "") ? "hasValue" : "";
        metricElement.textContent = metric.value;
      }
    } else {}
  }

  private _updateQualities(qualityListElement: any, qualities: any) {
    _toggleClass(qualityListElement, "isVisible", !! qualities);

    if (qualities) {
      let qualityRowLookup: any = qualityListElement._qualityRowLookup = qualityListElement._qualityRowLookup || {};

      for (let qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
        let quality = qualities[qualityIndex];

        if (quality) {
          let qualityRow = qualityRowLookup[qualityIndex];

          if (!qualityRow) {
            qualityRow = qualityRowLookup[qualityIndex] = _ce("div", "row");
            _ce("div", "rowHeader", quality.title, qualityRow);
            _ce("div", "rowFragments", null, qualityRow);

            qualityRow.qualityIndex = quality.index;

            for (let i = 0; i < qualityListElement.childNodes.length; i++) {
              if (quality.index > Number(qualityListElement.childNodes[i]['qualityIndex'])) {
                qualityListElement.insertBefore(qualityRow, qualityListElement.childNodes[i]);
                break;
              }
            }

            if (!qualityRow.parentNode) {
              qualityListElement.appendChild(qualityRow);
            }
          }

          this._updateFragments(_qs(".rowFragments", qualityRow), quality.fragments);

        }
      }
    }
  }

  private _updateFragments(fragmentListElement: any, fragments: any) {
    _toggleClass(fragmentListElement, "isVisible", !! fragments);

    if (fragments) {
      let fragmentListLookup = fragmentListElement._fragmentListLookup = fragmentListElement._fragmentListLookup || {};
      let newFragmentListLookup: { [key: number]: HTMLElement } = {};
      let videoDuration = this._dataContext.duration;

      for (let fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex++) {
        let fragment = fragments[fragmentIndex];
        let fragmentElement = fragmentListLookup[fragment.index];

        if (!fragmentElement) {
          fragmentElement = _ce("div", "rowRequest", null, fragmentListElement);
          fragmentElement.style.left = (100 * fragment.start / videoDuration) + "%";
          fragmentElement.style.width = (100 * fragment.length / videoDuration) + "%";
        } else {
          delete fragmentListLookup[fragment.index];
        }

        newFragmentListLookup[fragment.index] = fragmentElement;

        fragmentElement.className = "rowRequest " + fragment.state;
      }

      fragmentListElement._fragmentListLookup = newFragmentListLookup;

      for (let i in fragmentListLookup) {
        fragmentListElement.removeChild(fragmentListLookup[i]);
      }
    }
  }

  private _createContext(): IMonitorContext {
    return {
      state: DashlingSessionState.idle,
      metrics: [],
      streams: {
        audio: null,
        video: null
      },
      duration: 0
    };
  }

  private _getStats(player: Dashling) {
    let context = this._createContext();
    let controller = player.streamController;
    let manifest = player.settings.manifest;

    context.state = player.state;

    context.metrics.push({
      title: "State",
      value: DashlingSessionState[player.state]
    });

    context.metrics.push({
      title: "Last error",
      value: player.lastError
    });

    context.metrics.push({
      title: "Load",
      value: (player.timeAtFirstCanPlay ? player.timeAtFirstCanPlay : (new Date().getTime() - player.startTime)) + " ms"
    });

    if (manifest && controller) {
      let fragmentList: any[] = [];

      for (let streamIndex = 0; streamIndex < controller.streams.length; streamIndex++) {
        fragmentList.push(controller.streams[streamIndex].fragments);
      }

      let qualityDictionary = {};

      context.duration = manifest.mediaDuration;

      context.metrics.push({
        title: "Manifest",
        value: player.settings.manifest && player.settings.manifest.request && player.settings.manifest.request.timeAtLastByte ? player.settings.manifest.request.timeAtLastByte + " ms" : ""
      });

      context.metrics.push({
        title: "Stalls",
        value: String(controller.stalls) || ''
      });

      context.metrics.push({
        title: "Recovery time",
        value: ""
      });

      context.metrics.push({
        title: "Stall chance",
        value: ""
      });

      context.metrics.push({
        title: "Buffer rate",
        value: _round(player.getBufferRate(), 2, 2) + " s/s"
      });

      context.metrics.push({
        title: "Buffer left",
        value: _round(player.getRemainingBuffer(), 2, 2) + " s"
      });

      let timeUntilStall = controller ? controller.getTimeUntilUnderrun() : 0;

      context.metrics.push({
        title: "Time until stall",
        value: timeUntilStall < Number.MAX_VALUE ? _round(timeUntilStall, 2, 2) + " s" : ""
      });

      for (let streamIndex = 0; streamIndex < controller.streams.length; streamIndex++) {
        let stream = controller.streams[streamIndex];
        let contextStream: { metrics: IMonitorMetric[], qualities: any[] } = {
          metrics: [],
          qualities: []
        };

        context.streams[stream.streamType] = contextStream;

        contextStream.metrics.push({
          title: "Quality",
          value: String(stream.qualityIndex)
        });

        let val = stream.requestManager.getAverageWait();

        contextStream.metrics.push({
          title: "Avg wait",
          value: val ? _round(val, 2) + " ms" : null
        });

        val = stream.requestManager.getAverageReceive();
        contextStream.metrics.push({
          title: "Avg receive",
          value: val ? _round(val, 2) + " ms" : null
        });

        val = stream.requestManager.getAverageBytesPerSecond();
        contextStream.metrics.push({
          title: "Avg bandwidth",
          value: val ? _formatBandwidth(val) : null
        });

        for (let fragmentIndex = 0; fragmentIndex < stream.fragments.length; fragmentIndex++) {
          let fragment = stream.fragments[fragmentIndex];

          if (fragment.activeRequest) {
            let contextQuality = contextStream.qualities[fragment.qualityIndex];

            if (!contextQuality) {
              contextQuality = contextStream.qualities[fragment.qualityIndex] = {
                title: fragment.qualityId,
                index: fragment.qualityIndex,
                fragments: []
              };
            }

            let state = _findInEnum(fragment.state, this._dashling.RequestState);

            if (fragment.state == this._dashling.RequestState.downloading && fragment.activeRequest.timeAtFirstByte == -1) {
              state = "waiting";
            }

            contextQuality.fragments.push({
              index: fragmentIndex,
              state: state,
              start: fragment.time.startSeconds,
              length: fragment.time.lengthSeconds
            });


          }
        }
      }
    }

    return context;
  }
}

// Utility functions.

function _qs(selector: string, parentElement?: HTMLElement): HTMLElement {
  parentElement = parentElement || <any>document;

  return <HTMLElement>parentElement.querySelector(selector);
}

function _ce(tag: string, className?: string, text?: string, parentEl?: HTMLElement) {
  let el = document.createElement(tag);

  className && (el.className = className);
  text && (el.textContent = text);
  parentEl && parentEl.appendChild(el);

  return el;
}

function _findInEnum(value: any, enumeration: any) {
  for (let propName in enumeration) {
    if (enumeration[propName] === value) {
      return propName;
    }
  }

  return "";
}

function _round(number: number, decimals: number, padded?: number) {
  let value = String(parseFloat(number.toFixed(decimals)));

  if (padded) {
    value = "" + value;
    if (value.indexOf(".") == -1) {
      value += ".";
    }

    while (value.indexOf(".") != (value.length - 3)) {
      value += "0";
    }
  }

  return value;
}

function _formatBandwidth(bytesPerSecond: number): string {
  let bitsPerKilobit = 1000;
  let bitsPerMegabit = bitsPerKilobit * bitsPerKilobit;
  let bitsPerSecond = bytesPerSecond * 8;

  if (bitsPerSecond < bitsPerKilobit) {
    return bitsPerSecond + " bps";
  } else if (bitsPerSecond < bitsPerMegabit) {
    return _round(bitsPerSecond / bitsPerKilobit, 2, 2) + " kbps";
  } else {
    return _round(bitsPerSecond / bitsPerMegabit, 2, 2) + " mbps";
  }
}

function _toggleClass(element: HTMLElement, className: string, isEnabled?: boolean) {
  let classes = element.className.trim().split(" ");
  let classesTable: { [key: string]: boolean } = {};
  let i: number;
  let fullName = "";

  for (i = 0; i < classes.length; i++) {
    if (classes[i]) {
      classesTable[classes[i]] = true;
    }
  }

  isEnabled = isEnabled === undefined ? (!classesTable[className]) : isEnabled;

  if (isEnabled) {
    classesTable[className] = true;
  } else {
    delete classesTable[className];
  }

  for (let className in classesTable) {
    fullName += className + " ";
  }

  element.className = fullName.trim();
}

function _bind(obj: any, func: () => void) {
  return function() {
    return func.apply(obj, arguments);
  }
}
