import Settings from './Settings';

enum VideoErrorCode {
  MEDIA_ERR_ABORTED = 1,
  MEDIA_ERR_NETWORK = 2,
  MEDIA_ERR_DECODE = 3,
  MEDIA_ERR_SRC_NOT_SUPPORTED = 4
}

export default class Utilities {

  public static bind(obj: any, func: () => any): () => any {
    return function() {
      return func.apply(obj, arguments);
    };
  }

  //TODO: dashling settings.
  public static log(message: string, settings?: Settings) {
    if (!settings || settings.logToConsole) {
      console.log(message);
    }
  }

  public static getXmlNodeValue(xmlDoc: any, elementName: string, defaultValue: string) {
    var element = xmlDoc.getElementsByTagName(elementName)[0];
    var elementText = element ? element.childNodes[0] : null;

    return elementText ? elementText.nodeValue : defaultValue;
  }

  public static getVideoBufferString(videoElement?: HTMLVideoElement) {
    let ranges = '';

    videoElement = videoElement || <HTMLVideoElement>document.querySelector('video');

    for (let rangeIndex = 0; videoElement && rangeIndex < videoElement.buffered.length; rangeIndex++) {
      ranges += '[' + videoElement.buffered.start(rangeIndex) + '-' + videoElement.buffered.end(rangeIndex) + '] ';
    }

    return ranges;
  }

  public static fromISOToSeconds(isoString: string) {
    // "PT0H0M29.367S";
    var seconds = 0;
    var tempString = isoString.substring(2); // Remove PT
    var tempIndex = tempString.indexOf("H");

    if (tempIndex > -1) {
      seconds += Number(tempString.substring(0, tempIndex)) * 60 * 60;
      tempString = tempString.substring(tempIndex + 1);
    }

    tempIndex = tempString.indexOf("M");
    if (tempIndex > -1) {
      seconds += Number(tempString.substring(0, tempIndex)) * 60;
      tempString = tempString.substring(tempIndex + 1);
    }

    tempIndex = tempString.indexOf("S");
    if (tempIndex > -1) {
      seconds += Number(tempString.substring(0, tempIndex));
    }

    return seconds;
  }

  public static getVideoError(videoElement: HTMLVideoElement): string {
    var videoError = videoElement.error;

    return videoError ? (VideoErrorCode[videoError.code] || String(videoError.code)) : null;
  }

}

