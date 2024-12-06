<?php

use App\Http\Controllers\TranscriptionController;

Route::post('/speechToText', [TranscriptionController::class, 'speechToText']);