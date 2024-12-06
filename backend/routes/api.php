<?php

use App\Http\Controllers\TranscriptionController;

Route::post('/generateUuid', [TranscriptionController::class, 'generateConversationId']);
Route::post('/speechToText', [TranscriptionController::class, 'speechToText']);