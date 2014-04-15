if (window.MediaSource) {
  asyncTest("Dashling loads and plays a video successfully", function() {
    var videoElement = document.createElement("video");

    document.body.appendChild(videoElement);

    var dashling = new Dashling();
    var expectedStateTransitions = [
      Dashling.SessionState.initializing,
      Dashling.SessionState.buffering,
      Dashling.SessionState.paused,
      Dashling.SessionState.playing,
      Dashling.SessionState.paused
    ];

    var currentEventIndex = 0;

    expect(expectedStateTransitions.length + 1);

    dashling.settings.baseUrlOverride = "../examples/fifa/";
    dashling.addEventListener(Dashling.Event.sessionStateChange, function(state, error, message) {
      var expectedState = _findInEnum(expectedStateTransitions[currentEventIndex++], Dashling.SessionState);

      console.log("Transition: " + _findInEnum(state, Dashling.SessionState));
      state = _findInEnum(state, Dashling.SessionState);

      if (state == "error") {
        state += " error=" + error + " message=" + message;
      }

      equal(state, expectedState, "Session transitioned to " + expectedState);

      if (currentEventIndex == 3) {
        videoElement.play();
      }

      if (state != expectedState || currentEventIndex == expectedStateTransitions.length) {
        dashling.dispose();
        document.body.removeChild(videoElement);
        start();
      }

    });

    equal(dashling.state, Dashling.SessionState.idle, "Session starts at idle");

    dashling.load(videoElement, '../examples/fifa/manifest.xml');
  });
}

function _findInEnum(val, en) {
  for (var i in en) {
    if (en[i] == val) {
      return i;
    }
  }
  return "";
}