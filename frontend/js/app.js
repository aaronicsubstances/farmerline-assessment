$(function () {
    let startRecordingResult;
    let conversationId;
    let conversationOwner;
    let hashChangeApproved;
    let enableRecordReplay;
    let discardEmptyTranscription;
    let discardFailedTranscription;

    const MAX_TRANSCRIPTIONS_TO_KEEP = 100;

    function transcribeAudioBlob(blob) {
        return blobToBase64Async(blob, true)
            .then(base64data => {
                return fetch(`${window.API_BASE_URL || ''}/api/speechToText`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        audio: base64data,
                        conversationId: conversationId,
                        conversationOwner: conversationOwner,
                        discardEmptyTranscription: discardEmptyTranscription
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

    function generateConversationId() {
        return fetch(`${window.API_BASE_URL || ''}/api/generateUuid`, {
            method: "POST"
        })
        .then(response => response.json())
        .then(response => response.text);
    }

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
        return generateConversationId()
            .then(res => {
                conversationId = res
            })
            .then(() => grabMicrophoneAsync())
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
                    micStream,
                    liveVoiceRecorder,
                };
            });
    }

    function stopRecording() {
        try {
            if (!startRecordingResult) {
                return;
            }

            const {
                audioMotion,
                micStream,
                liveVoiceRecorder,
            } = startRecordingResult;

            liveVoiceRecorder.stop();
            audioMotion.destroy();
            micStream.getTracks().forEach((track) => track.stop());

            startRecordingResult = null;
        }
        catch (err) {
            appDebugLog(err)
            showFlashMessageToUser(`Could not stop microphone recording: ${err.message}`)
        }
    }

    // Render recorded audio
    function showRecordingToUser(blob) {
        const recordedUrl = URL.createObjectURL(blob)

        let container = document.querySelector('#transcriptions')

        // cater for existence of Transcriptions title
        // and place holder elements

        $(".empty", container).text("")

        const existingTranscriptLength = $(".transcript").length;

        // impose maximum limit on recordings
        if (existingTranscriptLength >= MAX_TRANSCRIPTIONS_TO_KEEP) {
            $(container.children[container.childElementCount - 1]).remove()
        }

        let wrapper = document.createElement("div")
        wrapper.className = "transcript"

        if (existingTranscriptLength < 2) {
            container.appendChild(wrapper)
        }
        else {
            container.insertBefore(wrapper, container.children[2])
        }
        container = wrapper

        const timestamp = new Date()

        const timestampElement = container.appendChild(document.createElement("p"))
        timestampElement.className = "date"
        timestampElement.textContent = getFormattedTimestamp(timestamp);

        const transcriptionElement = container.appendChild(document.createElement("div"))
        transcriptionElement.className = "text"

        if (enableRecordReplay) {
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
        }

        return container;
    }

    function getFormattedTimestamp(date) {
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const formattedDate = `${monthNames[date.getMonth()].substring(0, 3)} ${date.getDate()}, ${date.getFullYear()}`;
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
            const transriptionOutputEl = $(showRecordingToUser(blob))
            $(".date", transriptionOutputEl).addClass("d-none")
            $('.text', transriptionOutputEl).html(`<div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
                </div>`)
            transriptionOutputEl.addClass("text-center")
            transcribeAudioBlob(blob).then(text => {
                if (text.trim()) {
                    $(".text", transriptionOutputEl).text(text)
                }
                else {
                    showFlashMessageToUser('Transcription service returned empty data')
                    if (discardEmptyTranscription) {
                        transriptionOutputEl.remove()
                        if (!$(".transcript").length) {
                            insertEmptyTranscriptPlaceholder();
                        }
                    }
                    else {
                        $(".text", transriptionOutputEl).addClass("empty-text").text("(empty)")
                    }
                }
            }).finally(() => {
                transriptionOutputEl.removeClass("text-center")
                $(".date", transriptionOutputEl).removeClass("d-none")
            }).catch(err => {
                appDebugLog(err)

                showFlashMessageToUser("Transcription error: " + err.message)
                if (discardFailedTranscription) {
                    transriptionOutputEl.remove()
                    if (!$(".transcript").length) {
                        insertEmptyTranscriptPlaceholder();
                    }
                }
                else {
                    $(".text", transriptionOutputEl).addClass("error").text(err.message)
                }
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
                    showFlashMessageToUser('Transcription skipped due to detection of silence')
                }
            }
            catch (err) {
                appDebugLog(err)
                showFlashMessageToUser(`Could not resume microphone recording: ${err.message}`)
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

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showFlashMessageToUser(msg) {
        const newFlashMsg = $(`<div class="toast align-items-center" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body">
              ${escapeHtml(msg)}
            </div>
            <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>`)
        newFlashMsg.prependTo("#flash-messages");
        new bootstrap.Toast(newFlashMsg).show()
    }

    function insertEmptyTranscriptPlaceholder() {
        $("#transcriptions .empty").text('Transcripts of microphone recordings will appear here.')
    }

    function appDebugLog() {
        try {
            console.log.apply(null, arguments)
        }
        catch (ignore) {}
    }

    // ensure start page has no hash by reloading
    if (location.hash) {
        window.location = location.pathname;
    }

    window.onhashchange = (event) => {
        if (!location.hash) {
            stopRecording();
            $("#no-recording").removeClass("d-none")
            $("#recording-in-progress").addClass("d-none")
        }
        else if (!hashChangeApproved) {
            // reload to cancel unwanted forward history navigation
            window.location = location.pathname;
        }
        hashChangeApproved = false;
    };

    $("#profileLink, #signOutLink").click(function(e) {
        e.preventDefault();
    });

    $("#start").click(function () {
        $("#start").attr('disabled', 'disabled');
        $(".loading", $("#start")).html(`<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`)
        $('.transcript').remove()
        $("#flash-messages").text('')

        enableRecordReplay = $("#enable-record-replay").is(":checked")
        discardEmptyTranscription = $("#discard-empty-transcription").is(":checked")
        discardFailedTranscription = $("#discard-failed-transcription").is(":checked")
        conversationOwner = $("#conversation-owner").val().trim();

        startRecordingAsync($('#spectrum')[0], audioBlobReceiver)
            .then(res => {
                startRecordingResult = res
                $("#recording-in-progress").removeClass("d-none")
                $("#no-recording").addClass("d-none")
                insertEmptyTranscriptPlaceholder()
                hashChangeApproved = true
                window.location.href = location.pathname + "#1";
            })
            .catch(err => {
                appDebugLog(err)
                showFlashMessageToUser(`Could not start microphone recording: ${err.message}`);
            })
            .finally(() => {
                $("#start").removeAttr('disabled');
                $(".loading", $("#start")).text('')
            })
    })

    $("#stop").click(function () {
        stopRecording();
    })
});