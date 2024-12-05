export function blobToBase64Async(blob, encodeAsDataURI = false) {
    return new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    let encodedData = reader.result;
                    if (!encodeAsDataURI) {
                        encodedData = encodedData.split(",")[1];
                    }
                    resolve(encodedData);
                }
                catch (e) {
                    reject(e)
                }
            };
            reader.readAsDataURL(blob);
        }
        catch (e) {
            reject(e)
        }
    })
}

export function base64ToBlob(encodedData, mimeType = null) {
    // NB: encodedData may be a data URI
    const BASE64_MARKER = ';base64,';
    const base64Index = encodedData.indexOf(BASE64_MARKER);
    if (base64Index !== -1) {
        if (!mimeType) {
            if (!encodedData.startsWith("data:")) {
                throw new Error(`invalid data URI argument: ${encodedData}`)
            }
            mimeType = encodedData.substring("data:".length, base64Index);
        }
        encodedData = encodedData.substring(base64Index + BASE64_MARKER.length);
    }
    const raw = window.atob(encodedData);
    const rawLength = raw.length;
    const arr = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; i++) {
        arr[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([arr], {
        type: mimeType
    });
    return blob;
}

// https://easings.net/#easeOutExpo
export function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function transcribeAudioBlob(blob) {
    return blobToBase64Async(blob, true)
        .then(base64data => {
            return fetch("http://localhost:3000/api/speechToText", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    audio: base64data
                }),
            });
        })
        .then(response => response.json())
        .then(response => response.text);
}