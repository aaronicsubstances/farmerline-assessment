import AudioMotionAnalyzer from 'https://cdn.skypack.dev/audiomotion-analyzer?min';
import { createLiveVoiceRecorder } from './createLiveVoiceRecorder.js'
import { transcribeAudioBlob } from "./utils.js"

const grabMicrophoneAsync = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new Error("Microphone recording is not supported"));
    }

    const whisperMimeTypes = ["audio/webm", "audio/wav"]
    const preferredMimeType = whisperMimeTypes.find(
        x => MediaRecorder.isTypeSupported(x));
    if (!preferredMimeType) {
        return Promise.reject(new Error("OpenAI Whisper Audio API does not support the media type of this browser's microphone"));
    }

    return navigator.mediaDevices.getUserMedia({ audio: true }).
        then(micStream => ({ micStream, preferredMimeType }));
};

const startRecordingAsync = (waveAnimationCanvasParent, chunkListener) => {
    return grabMicrophoneAsync()
        .then(mic => {
            const { micStream, preferredMimeType } = mic;

            let minDecibels = -85; // from https://github.com/hvianna/audioMotion-analyzer?tab=readme-ov-file#mindecibels-number
            minDecibels = -60;

            const audioMotion = new AudioMotionAnalyzer(
                waveAnimationCanvasParent,
                {
                    minDecibels: minDecibels,
                    connectSpeakers: false,
                    gradient: 'rainbow',
                    showScaleX: false,
                    reflexRatio: 0.5,
                    reflexAlpha: 1,
                }
            );

            const audioCtx = audioMotion.audioCtx;
            // connect microphone stream to analyzer
            const streamNode = audioCtx.createMediaStreamSource(micStream);
            audioMotion.connectInput(streamNode);
            // mute output to prevent feedback loops from the speakers
            //audioMotion.volume = 0;

            const abortController = new AbortController()
            const liveVoiceRecorder = createLiveVoiceRecorder(
                audioCtx, micStream, preferredMimeType, minDecibels, abortController.signal, chunkListener
            );
            liveVoiceRecorder.restart();

            return {
                audioMotion,
                abortController,
                liveVoiceRecorder,
            };
        });
};

const stopRecording = () => {
    if (!startRecordingResult) {
        return;
    }

    const {
        audioMotion,
        abortController,
        liveVoiceRecorder,
    } = startRecordingResult;

    liveVoiceRecorder.stop();
    abortController.abort();
    audioMotion.destroy();

    startRecordingResult = null;
};

// Render recorded audio
const showRecordingToUser = (blob) => {
    const recordedUrl = URL.createObjectURL(blob)

    let container = document.querySelector('#recordings')
    let wrapper = document.createElement("p")
    container.prepend(wrapper)

    // impose maximum limit on recordings
    if (container.childElementCount > 50) {
        $(container.children[container.childElementCount-1]).remove()
    }

    container = wrapper

    const audioEl = container.appendChild(document.createElement("audio"));
    audioEl.src = recordedUrl;
    audioEl.controls = true;

    const timestamp = new Date();
    container.appendChild(document.createTextNode(` ${timestamp} `));

    // Download link
    const link = container.appendChild(document.createElement('a'))
    Object.assign(link, {
        href: recordedUrl,
        download: `recording-${timestamp.getTime()}` + blob.type.split(';')[0].split('/')[1] || 'webm',
        textContent: 'Download recording',
    })

    const transcriptionElement = container.appendChild(document.createElement("p"))
    transcriptionElement.textContent = "Waiting...";
    return transcriptionElement;
};

const audioBlobReceiver = (blob, forceSpeechChange) => {
    if (blob) {
        const transriptionOutputEl = showRecordingToUser(blob)
        transcribeAudioBlob(blob).then(text => {
            $(transriptionOutputEl).text(`Success: ${text}`)
        }).catch(err => {
            console.log(err)
            $(transriptionOutputEl).text(`Error: ${err.message}`)
        })
    }
    if (!blob || forceSpeechChange) {
        startRecordingResult.audioMotion.stop();
    }
    
    // automatic resume.
    const savedStartRecordingResult = window.startRecordingResult
    // emulate setImmediate on Nodejs
    Promise.resolve().then(
        () => {
            if (savedStartRecordingResult === window.startRecordingResult) {
                resumeRecording(!!blob)
            }
        });
};

const resumeRecording = (transcriptionTriggered) => {
    if (startRecordingResult) {
        try {
            startRecordingResult.liveVoiceRecorder.restart()
            startRecordingResult.audioMotion.start();
            resumeCount++
            if (transcriptionTriggered) {
                $('#resumeState').text(`Resume count: ${resumeCount}`);
            }
            else {
                $('#resumeState').text('Transcription skipped due to detection of silence')
            }
        }
        catch (err) {
            console.log(err)
            allert(`Could not resume microphone recording: ${err.message}`)
        }
    }
}

let startRecordingResult;
let resumeCount = 0

$('#start').click(() => {
    $("#start").attr('disabled', 'disabled');
    $('#recordings').html('')
    startRecordingAsync($('#spectrum')[0], audioBlobReceiver)
        .then(res => {
            startRecordingResult = res
            resumeCount = 0
            $('#resumeState').text(`Resume count: ${resumeCount}`);
        })
        .catch(err => {
            console.log(err)
            $("#start").removeAttr('disabled');
            alert(`Could not start microphone recording: ${err.message}`);
        });
});

$('#stop').click(() => {
    $("#start").removeAttr('disabled')
    try {
        stopRecording()
    }
    catch (err) {
        console.log(err)
        allert(`Could not stop microphone recording: ${err.message}`)
    }
})
