    function _average(numbers) {
        var total = 0;

        for (var i = 0; numbers && i < numbers.length; i++) {
            total += numbers[i];
        }

        return total / (numbers.length || 1);
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
