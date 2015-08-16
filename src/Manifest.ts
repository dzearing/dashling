import Utilities from './Utilities';
import Settings from './Settings';
import Request from './Request';

export interface IQuality {
  id: string;
  bandwidth: string;
  width: number;
  height: number;
}

export interface ITimelineEntry {
  start: number;
  startSeconds: number;
  length: number;
  lengthSeconds: number;
}

export interface IStream {
  streamType: string;
  mimeType: string;
  codecs: string;
  initUrlFormat: string;
  fragUrlFormat: string;
  qualities: IQuality[];
  timeline: ITimelineEntry[];
}

export default class Manifest {
  public baseUrl: string;
  public mediaDuration: number;
  public streams: { [ key: string ]: IStream };
  public request: Request;

  private _settings: Settings;

  constructor(settings: Settings) {
    this._settings = settings;
  }

  parseFromRequest(request: Request) {
    this.request = request;
    this.parse(request.data);
  }

  parse(manifestText: string) {
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(manifestText, "text/xml");
    let i;

    this.baseUrl = this._settings.baseUrlOverride || Utilities.getXmlNodeValue(xmlDoc, "BaseURL", "");
    this.mediaDuration = Utilities.fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
    this.streams = {};

    let adaptationSets = xmlDoc.querySelectorAll("AdaptationSet");

    for (let adaptIndex = 0; adaptIndex < adaptationSets.length; adaptIndex++) {
      let adaptationElement = <HTMLElement>adaptationSets[adaptIndex];

      if (adaptationElement) {
        let contentType = adaptationElement.getAttribute("contentType");
        let representationElements = adaptationElement.querySelectorAll("Representation");
        let segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
        let timelineElements = adaptationElement.querySelectorAll("S");
        let stream = this.streams[contentType] = {
          streamType: contentType,
          mimeType: adaptationElement.getAttribute("mimeType"),
          codecs: adaptationElement.getAttribute("codecs"),
          initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
          fragUrlFormat: segmentTemplateElement.getAttribute("media"),
          qualities: [],
          timeline: []
        };

        let timeScale = Number(segmentTemplateElement.getAttribute("timescale"));

        if (!timelineElements || !timelineElements.length) {
          throw "Missing timeline";
        }

        for (let repIndex = 0; repIndex < representationElements.length; repIndex++) {
          let repElement = <HTMLElement>representationElements[repIndex];
          let quality = {
            id: repElement.getAttribute("id"),
            bandwidth: repElement.getAttribute("bandwidth"),
            width: 0,
            height: 0
          };

          if (repElement.getAttribute("height")) {
            quality.width = Number(repElement.getAttribute("width"));
            quality.height = Number(repElement.getAttribute("height"));
          }

          stream.qualities.push(quality);
        }

        let startTime = 0;

        for (let timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
          let timelineElement = <HTMLElement>timelineElements[timelineIndex];
          let repeatCount = Number(timelineElement.getAttribute("r")) || 0;
          let duration = Number(timelineElement.getAttribute("d"));

          for (i = 0; i <= repeatCount; i++) {
            stream.timeline.push({
              start: startTime,
              startSeconds: startTime / timeScale,
              length: duration,
              lengthSeconds: duration / timeScale
            });

            startTime += duration;
          }
        }
      }
    }
  }

}