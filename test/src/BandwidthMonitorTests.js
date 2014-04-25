test("Bitrate estimation", function() {
  var history = {};
  var defaultBitsPerSecond = 4000000;
  var fileSize = defaultBitsPerSecond / 8;
  var bandwidthMonitor = new Dashling.BandwidthMonitor(defaultBitsPerSecond, 5);

  equal(bandwidthMonitor.getEstimatedMilliseconds(fileSize), 1000, "No history uses default bandwidth and results in a 1s estimate");
  equal(bandwidthMonitor.getEstimateMultiplier(), 1, "Starts with a multiplier of 1");
  equal(bandwidthMonitor.getBitsPerSecond(), defaultBitsPerSecond, "Starts with default bandwidth");

  // report that it took 1.2s, 20% longer than what we estimated.
  bandwidthMonitor.report(fileSize, 1000, 1200);

  equal(bandwidthMonitor.getEstimatedMilliseconds(fileSize), 1200, "1 entry should return the actual latency for the same filesize");
  equal(bandwidthMonitor.getEstimateMultiplier(), 1.2, "Multiplier moves up");

  // report that it took 1s, 80% of the estimate (go down.)
  bandwidthMonitor.report(fileSize, 1200, 1000);


  equal(bandwidthMonitor.getEstimatedMilliseconds(fileSize), 1100, "Average latency between 2 entries");
});