function _mix(dest, source) {
  for (var i in source) {
    if (source.hasOwnProperty(i)) {
      dest[i] = source[i];
    }
  }

  return dest;
}

function _bind(obj, func) {
  return function() {
    return func.apply(obj, arguments);
  };
}

function _log(message, settings) {
  if (!settings || settings.logToConsole) {
    console.log(message);
  }
}

function _getXmlNodeValue(xmlDoc, elementName, defaultValue) {
  var element = xmlDoc.getElementsByTagName(elementName)[0];
  var elementText = element ? element.childNodes[0] : null;

  return elementText ? elementText.nodeValue : defaultValue;
}

function _fromISOToSeconds(isoString) {
  // "PT0H0M29.367S";
  var seconds = 0;
  var tempString = isoString.substring("2"); // Remove PT
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

function _addMetric(array, val, max) {
  var average = array.average || 0;

  array.average = average + ((val - average) / (array.length + 1));
  array.push(val);

  while (array.length > max) {
    _removeFirstMetric(array);
  }
}

function _removeFirstMetric(array) {
  var val = array.shift();
  var average = array.average;

  array.average = average + ((average - val) / array.length);
}