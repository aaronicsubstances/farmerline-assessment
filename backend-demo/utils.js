exports.base64ToBufferAndContentType = function(encodedData) {
    // NB: encodedData may be a data URI
    const BASE64_MARKER = ';base64,';
    const base64Index = encodedData.indexOf(BASE64_MARKER);
    let mimeType;
    if (base64Index !== -1) {
        if (!encodedData.startsWith("data:")) {
            throw new Error(`invalid data URI argument: ${encodedData}`)
        }
        mimeType = encodedData.substring("data:".length, base64Index);
        encodedData = encodedData.substring(base64Index + BASE64_MARKER.length);
    }
    const raw = Buffer.from(encodedData, 'base64');
    return [raw, mimeType]
}