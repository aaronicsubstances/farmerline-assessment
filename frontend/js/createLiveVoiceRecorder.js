/**
 * Job of this function is to create an object
 * which wraps a microphone available to a web browser,
 * to emit chunks of recording periodically based on
 * detected speech pauses.
 */
const createLiveVoiceRecorder = (
    audioCtx, micStream, preferredMimeType, minDecibels, chunkListenerCb) => {

    // will have at most one item.
    // used to transfer speech pause detection info
    // from analyzer to current media recorder in onstop event.
    const mediaRecorderQueue = [];
    let speechPauseDetector;
    let stopped = false;

    const onSpeechChange = (isSpeaking, forceSpeechChange) => {
        if (isSpeaking && !forceSpeechChange) {
            return;
        }

        const head = mediaRecorderQueue.shift();
        if (!head) {
            throw new Error("mediaRecorderQueue is unexpectedly empty");
        }

        head.isSpeaking = isSpeaking;
        head.forceSpeechChange = forceSpeechChange;
        head.instance.stop();

        if (forceSpeechChange) {
            speechPauseDetector.pause();
        }
        else if (!isSpeaking) {
            mediaRecorderQueue.push(createAndStartMediaRecorder());
        }
    };

    const createAndStartMediaRecorder = () => {
        const chunks = [];
        const mediaRecorder = new MediaRecorder(micStream, {
            mimeType: preferredMimeType
        });
        const mediaRecorderState = {
            instance: mediaRecorder,
            isSpeaking: false,
            forceSpeechChange: false
        };
        mediaRecorder.onstart = (ev) => {
        };
        mediaRecorder.onstop = (ev) => {
            if (stopped) return;

            const { isSpeaking, forceSpeechChange } = mediaRecorderState;

            const audioBlobIsSilence = forceSpeechChange && !isSpeaking;
            const audioBlob = audioBlobIsSilence ? null : new Blob(chunks,
                { type: mediaRecorder.mimeType });
            chunkListenerCb(audioBlob, forceSpeechChange);
        };
        mediaRecorder.ondataavailable = (ev) => {
            chunks.push(ev.data);
        };
        mediaRecorder.start()
        return mediaRecorderState;
    };

    const restart = () => {
        if (stopped) {
            throw new Error("Live voice recorder instance has been stopped");
        }
        if (!mediaRecorderQueue.length) {
            mediaRecorderQueue.push(createAndStartMediaRecorder());
            speechPauseDetector.restart();
        }
    };

    const stop = () => {
        if (stopped) {
            return;
        }
        stopped = true;
        speechPauseDetector.stop();
        if (mediaRecorderQueue.length) {
            mediaRecorderQueue.shift().instance.stop();
        }
    };

    speechPauseDetector = createSpeechPauseDetector(
        audioCtx, micStream, minDecibels, onSpeechChange);

    return {
        restart,
        stop
    };
};

// from https://stackoverflow.com/questions/46543341/how-can-i-extract-the-preceding-audio-from-microphone-as-a-buffer-when-silence/46781986#46781986
const createSpeechPauseDetector = (audioCtx, stream, minDecibels, callback) => {
    const fftSize = 8192; //  from https://github.com/hvianna/audioMotion-analyzer?tab=readme-ov-file#fftsize-number
    const maxWaitMillisForSilence = 15000;
    const minChangeDetectMillis = 500;
    const maxSilenceDelayMillis = 3000;

    const streamNode = audioCtx.createMediaStreamSource(stream);
    const analyzer = audioCtx.createAnalyser();
    analyzer.minDecibels = minDecibels;
    analyzer.fftSize = fftSize;
    streamNode.connect(analyzer);

    const audioFreqData = new Uint8Array(analyzer.frequencyBinCount);

    let stopped = false;
    let someoneIsSpeaking = false;
    let lastSoundTime, lastNonSoundTime;
    let beginSpeechChangeTime = 0;

    let scheduledLoopJob;

    const restart = () => {
        if (stopped) {
            throw new Error("Live voice recorder instance has been stopped");
        }
        someoneIsSpeaking = false;
        lastSoundTime = 0;
        lastNonSoundTime = 0;
        beginSpeechChangeTime = performance.now();
        scheduledLoopJob = setInterval(loop, minChangeDetectMillis);
    };

    const pause = () => {
        clearInterval(scheduledLoopJob)
    };

    const stop = () => {
        if (stopped) {
            return;
        }
        stopped = true;
        clearInterval(scheduledLoopJob)
        streamNode.disconnect(analyzer);
    };

    const easeOutExpo = (x) => {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    };

    const loop = () => {
        const currentTime = performance.now();
        let invokeCallback = false, forceInvokeCallback = false;

        analyzer.getByteFrequencyData(audioFreqData);

        const soundDetected = audioFreqData.some(v => v) // if there is data above the given db limit

        if (soundDetected) {
            if (!someoneIsSpeaking && (currentTime - lastNonSoundTime) > minChangeDetectMillis) {
                someoneIsSpeaking = true;
                invokeCallback = true;
                beginSpeechChangeTime = currentTime;
            }
            lastSoundTime = currentTime;
        }
        else {
            let silenceDelayMillis = minChangeDetectMillis;
            const nonChangeDuration = currentTime - beginSpeechChangeTime;
            const silenceDelayMillisRange = maxSilenceDelayMillis - minChangeDetectMillis;
            if (nonChangeDuration < silenceDelayMillisRange) {
                silenceDelayMillis = maxSilenceDelayMillis - silenceDelayMillisRange *
                    easeOutExpo((silenceDelayMillisRange - nonChangeDuration) / silenceDelayMillisRange);
            }
            if (someoneIsSpeaking && (currentTime - lastSoundTime) > silenceDelayMillis) {
                someoneIsSpeaking = false;
                invokeCallback = true;
                beginSpeechChangeTime = currentTime;
            }
            lastNonSoundTime = currentTime;
        }

        if (!invokeCallback) {
            const maxNonChangeDuration = someoneIsSpeaking ?
                maxWaitMillisForSilence :
                maxSilenceDelayMillis;
            if ((currentTime - beginSpeechChangeTime) > maxNonChangeDuration) {
                invokeCallback = true;
                forceInvokeCallback = true;
            }
        }

        if (invokeCallback) {
            callback(someoneIsSpeaking, forceInvokeCallback);
        }
    };

    return {
        pause,
        restart,
        stop
    };
};