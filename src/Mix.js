function mix(dest, source) {
    for (var i in source) {
        if (source.hasOwnProperty(i)) {
            dest[i] = source[i];
        }
    }
}
