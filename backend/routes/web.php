<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    $frontendFile = public_path() . '/start.html';
    if (file_exists($frontendFile)) {
        return file_get_contents($frontendFile);
    }
    return view('welcome');
});
