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
/*
test("Stream ABR quality shifting", function() {
  var stream = new Dashling.Stream("video", null, null, {});

  equal(stream.qualityIndex, 2, "Defaults to the right quality");

  equal(stream.qualityIndex, 0, "Quality downshift occurs immediately once we have bandwidth information");

  equal(stream.qualityIndex, 0, "Quality upshift occurs immediately once we have bandwidth information");

  equal(stream.qualityIndex, 0, "Quality doesn't upshift if we just switched qualities");

  equal(stream.qualityIndex, 0, "Quality upshifts after min number of fragments have played the current quality");

  equal(stream.qualityIndex, 0, "Quality can downshift even if buffer is insufficient");

  equal(stream.qualityIndex, 0, "Increase in bandwidth can downshift even if buffer is insufficient");

equal(stream.qualityIndex, 0, "")

});
*/