$(function () {
    let startRecordingResult;
    const MAX_TRANSCRIPTIONS_TO_KEEP = 50

    function grabMicrophoneAsync() {
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
    }

    function startRecordingAsync(waveAnimationCanvasParent, chunkListener) {
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

                const liveVoiceRecorder = createLiveVoiceRecorder(
                    audioCtx, micStream, preferredMimeType, minDecibels, chunkListener
                );
                liveVoiceRecorder.restart();

                return {
                    audioMotion,
                    liveVoiceRecorder,
                };
            });
    }

    function stopRecording() {
        if (!startRecordingResult) {
            return;
        }

        const {
            audioMotion,
            liveVoiceRecorder,
        } = startRecordingResult;

        liveVoiceRecorder.stop();
        audioMotion.destroy();

        startRecordingResult = null;
    }

    // Render recorded audio
    function showRecordingToUser(blob) {
        const recordedUrl = URL.createObjectURL(blob)

        let container = document.querySelector('#transcriptions')

        // cater for existence of Transcriptions title
        // and place holder elements
        $("#transcriptions .empty").remove()

        const existingTranscriptLength = $(".transcript").length;

        // impose maximum limit on recordings
        if (existingTranscriptLength >= MAX_TRANSCRIPTIONS_TO_KEEP) {
            $(container.children[container.childElementCount - 1]).remove()
        }

        let wrapper = document.createElement("div")
        wrapper.className = "transcript"

        if (!existingTranscriptLength) {
            container.appendChild(wrapper)
        }
        else {
            container.insertBefore(wrapper, container.children[1])
        }
        container = wrapper

        const timestamp = new Date()

        const timestampElement = container.appendChild(document.createElement("p"))
        timestampElement.className = "date"
        timestampElement.textContent = getFormattedTimestamp(timestamp);

        const transcriptionElement = container.appendChild(document.createElement("p"))
        transcriptionElement.className = "text"
        transcriptionElement.textContent = "Waiting...";

        const recordingElement = container.appendChild(document.createElement("div"))
        recordingElement.className = "recording"

        const audioEl = recordingElement.appendChild(document.createElement("audio"));
        audioEl.src = recordedUrl;
        audioEl.controls = true;

        // Download link
        const link = recordingElement.appendChild(document.createElement('a'))
        Object.assign(link, {
            href: recordedUrl,
            download: `recording-${timestamp.getTime()}` + blob.type.split(';')[0].split('/')[1] || 'webm',
            textContent: 'Download recording',
        })

        return transcriptionElement;
    }

    function getFormattedTimestamp(date) {
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const formattedDate = `${monthNames[date.getMonth()].substring(0, 3)} ${date.getDay()}, ${date.getFullYear()}`;
        let am = "am"
        let hour = date.getHours()
        if (hour >= 12) {
            am = "pm"
            hour -= 12;
            if (!hour) {
                hour = 12;
            }
        }
        else if (!hour) {
            hour = 12;
        }
        let minute = date.getMinutes()
        if (minute < 10) {
            minute = `0${minute}`
        }
        const formattedTime = `${hour}:${minute} ${am}`
        return `${formattedDate} ${formattedTime}`
    }

    function audioBlobReceiver(blob, forceSpeechChange) {
        if (blob) {
            const transriptionOutputEl = showRecordingToUser(blob)
            transcribeAudioBlob(blob).then(text => {
                if (text.trim()) {
                    $(transriptionOutputEl).text(text)
                }
                else {
                    $(transriptionOutputEl).text("..............")
                }
            }).catch(err => {
                console.log(err)

                $(transriptionOutputEl).addClass("error").text(err.message)
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
    }

    function resumeRecording(transcriptionTriggered) {
        if (startRecordingResult) {
            try {
                startRecordingResult.liveVoiceRecorder.restart()
                startRecordingResult.audioMotion.start();
                if (!transcriptionTriggered) {
                    $('#resumeState').text('Transcription skipped due to detection of silence')
                }
            }
            catch (err) {
                console.log(err)
                alert(`Could not resume microphone recording: ${err.message}`)
            }
        }
    }

    function blobToBase64Async(blob, encodeAsDataURI = false) {
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

    function transcribeAudioBlob(blob) {
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
            .then(response => {
                if (!response.error) {
                    return response.text
                }
                throw new Error("Error response from server: " +
                    response.error.message);
             });
    }

    $("#start").click(function () {
        $("#start").attr('disabled', 'disabled');
        $('.transcript').remove()
        startRecordingAsync($('#spectrum')[0], audioBlobReceiver)
            .then(res => {
                startRecordingResult = res
                $("#recording-in-progress").removeClass("d-none")
                $("#no-recording").addClass("d-none")
                $("#transcriptions").append($("<p class='empty'>Transcripts of microphone recordings will appear here.</p>"))
            })
            .catch(err => {
                console.log(err)
                alert(`Could not start microphone recording: ${err.message}`);
            })
            .finally(() => {
                $("#start").removeAttr('disabled');
            })
    })

    $("#stop").click(function () {
        try {
            stopRecording()
            $("#no-recording").removeClass("d-none")
            $("#recording-in-progress").addClass("d-none")
        }
        catch (err) {
            console.log(err)
            alert(`Could not stop microphone recording: ${err.message}`)
        }
    })
});