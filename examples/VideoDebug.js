var c_videoElementEvents = [
  "loadstart",
  "emptied",
  "canplaythrough",
  "ended",
  "ratechange",
  "progress",
  "stalled",
  "playing",
  "durationchange",
  "resize",
  "suspend",
  "loadedmetadata",
  "waiting",
  "timeupdate",
  "volumechange",
  "abort",
  "loadeddata",
  "seeking",
  "play",
  "error",
  "canplay",
  "seeked",
  "pause"
];

window.VideoDebug = {
  logToConsole: false,

  get: function() {
    return document.querySelector("video");
  },

  getBuffered: function(videoElement) {
    var ranges = "";

    videoElement = videoElement || document.querySelector("video");

    for (var rangeIndex = 0; videoElement && rangeIndex < videoElement.buffered.length; rangeIndex++) {
      ranges += "[" + videoElement.buffered.start(rangeIndex) + "-" + videoElement.buffered.end(rangeIndex) + "] ";
    }

    return ranges;
  },

  getError: function(videoElement) {
    var error = "";

    videoElement = videoElement || document.querySelector("video");

    if (videoElement && videoElement.error) {
      var code = error = videoElement.error.code;

      for (var i in videoElement.error) {
        if (i != "code" && videoElement.error[i] == code) {
          error = i;
          break;
        }
      }
    }

    return error;
  },

  observe: function(videoElement) {
    var timeAtLoaded = 0;

    videoElement = videoElement || document.querySelector("video");

    if (videoElement) {
      for (var i = 0; i < c_videoElementEvents.length; i++) {
        var eventName = c_videoElementEvents[i];

        videoElement.addEventListener(eventName, function(ev) {
          var message = "Video event: " + ev.type;

          message += ", fromLoad: " + parseFloat(((new Date().getTime() - timeAtLoaded) / 1000).toFixed(2)) + "s";

          switch (ev.type) {
            case "ratechange":
              message += ": " + videoElement.playbackRate;
              break;

            case "loadstart":
              timeAtLoaded = new Date().getTime();
              break;

            case "stalled":
            case "timeupdate":
            case "seeking":
              message += ", currentTime: " + parseFloat(videoElement.currentTime.toFixed(2)) + "s";
              break;

            case "progress":
            case "loadeddata":
              message += ", ranges: " + VideoDebug.getBuffered(videoElement);
              break;

            case "error":
              message += ", error: " + VideoDebug.getError(videoElement);
              break;

            case "durationchange":
              message += ": " + videoElement.duration;
              break;
          }

          if (VideoDebug.logToConsole) {
            console.log(message);
          }

        }, false);
      }
    }
  }


};