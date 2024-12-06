# Repository for Demo Online Voice Transcription

## Dependencies

For the frontend folder which supplies the web pages,
1. It was developed using Bootstrap 5, jQuery 3 and a certain audio spectrum visualization library called audioMotion-analyzer, located at https://github.com/hvianna/audioMotion-analyzer (can see https://audiomotion.app/ for their demo application).
2. Running the client-side of the application requires the following variables to be set in an env.js file inside the js folder, after generating a copy of it from the env.example.js file
    - API_BASE_URL - the base url (without a path or an ending slash) of the server application which will transcribe the audio recording generated on the client.
3. Due to security reasons (specifically microphone access and CORS), even without Javasript build tools involved one still has to run the client-side of the application from a webserver.
E.g. if Python software is installed, one can run `python -m http.server`, `python3 -m http.server` or `python -m http.server 8001`, and then can visit http://localhost:8000 (the default) or http://localhost:8001 to see the application.

For the backend folder which hosts the server, 
1. It was developed using PHP 8.3, Composer 2.8 and Laravel 11
2. Running the server-side of the application requires the following variables to be set in a .env file at the root folder, after generating a copy of it from the .env.example file
    - OPENAI_API_KEY - set to the API key required for using the Open AI Whisper's API (can see https://platform.openai.com/docs/api-reference/introduction and https://platform.openai.com/docs/api-reference/audio/createTranscription)
    - DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD - ensure a MySQL database exists by creating one if necessary (e.g. 'laravel'),
    and then set these variables with DB_ prefix appropriately to enable the application connect to a database.
    Or if one wants to postpone setting up a networked database, then set the DB_CONNECTIoN variable to 'sqlite' instead of 'mysql'. And also
    create an empty file called database.sqlite in the database folder, and set its absolute path to the DB_DATABASE environment variable.

    - SERVER_PORT - this is actually optional since a default port of 8000 will be used; however if the default port is inconvenient to use, then set this SERVER_PORT in .env to something else, like 8001
3. Running the application locally requires running `composer install` for the first time, and then `php artisan serve` to run at http://localhost:8000 or http://localhost:8001
