test("Stream.constructor", function() {
  var stream = new Dashling.Stream("video", null, null, {
    targetQuality: {
      video: 5
    },
    manifest: {
      streams: {
        video: {
          timeline: [{
            start: 0,
            end: 5
          }, {
            start: 5,
            end: 10
          }],
          qualities: ["quality1", "quality2"]
        }
      }
    }
  });

  equal(stream.fragments.length, 2, "Stream has 2 fragments");
  equal(stream.qualityIndex, 1, "Stream has correct default quality");

  stream.dispose();

  ok(stream.isDisposed, "Stream was disposed");
});
