<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Transcriptions extends Model
{
    protected $table = 'transcriptions';
    protected $fillable = [
        "conversation_owner",
        "conversation_id",
        'transcription',
        'audio_data',
        "file_ext",
        "media_type"
    ];
}
